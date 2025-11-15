from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os
import google.generativeai as genai
from datetime import datetime
from pymongo import MongoClient
import json

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB")

if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set")

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel(MODEL)

app = Flask(__name__)

SYSTEM_PROMPT = """You are NeuroLink's calm, supportive AI companion.
Keep answers short, warm, and helpful. If giving steps, keep them concise.
Avoid medical advice. Use simple language."""

mongo_client = None
users_col = None
if MONGODB_URI:
    try:
        mongo_client = MongoClient(MONGODB_URI)
        if MONGODB_DB:
            db = mongo_client[MONGODB_DB]
        else:
            # Try to infer default DB from URI; if not available, fallback to 'neurolink'
            try:
                db = mongo_client.get_default_database()
            except Exception:
                db = mongo_client['neurolink']
        users_col = db['users']
    except Exception as e:
        # If DB connection fails, keep running without profile context
        mongo_client = None
        users_col = None

def trim_list(lst, max_items):
    if not isinstance(lst, list):
        return lst
    if max_items is None or len(lst) <= max_items:
        return lst
    return lst[-max_items:]

def serialize_user(user):
    if not user:
        return None
    # Make a JSON-safe summary with sensible caps to avoid token blowups
    summary = {
        "userId": user.get("userId"),
        "name": user.get("name"),
        "email": user.get("email"),
        "lastLoginAt": str(user.get("lastLoginAt")) if user.get("lastLoginAt") else None,
        "journals": trim_list(user.get("journals", []), 100),
        "meditationSessions": trim_list(user.get("meditationSessions", []), 100),
        "quizScores": trim_list(user.get("quizScores", []), 100),
        "reminders": trim_list(user.get("reminders", []), 200),
        # For chats, only include titles + recent messages to avoid massive context
        "chats": [],
    }
    chats = user.get("chats", [])
    out_chats = []
    for c in chats:
        out_chats.append({
            "chatId": c.get("chatId"),
            "title": c.get("title"),
            "createdAt": str(c.get("createdAt")) if c.get("createdAt") else None,
            "messages": trim_list(c.get("messages", []), 50)
        })
    summary["chats"] = trim_list(out_chats, 30)
    return summary

def fetch_user_profile(user_id):
    if users_col is None or not user_id:
        return None
    try:
        doc = users_col.find_one({"userId": user_id}, {"_id": 0})
        return doc
    except Exception:
        return None

def build_prompt(messages, user_name, user_profile_json):
    lines = [f"System: {SYSTEM_PROMPT}"]
    if user_name:
        try:
            lines.append(f"(The user's name is {str(user_name)[:80]})")
        except Exception:
            pass
    if user_profile_json:
        lines.append("The following JSON is the user's profile and history. Use it as context to answer:")
        # Keep as compact as possible
        lines.append(user_profile_json)
    for m in messages:
        role = (m.get("role", "user") or "user")
        raw = m.get("text", "")
        try:
            text = str(raw)
        except Exception:
            text = ""
        # cap individual message length to avoid token blowups
        text = text.strip()
        if len(text) > 800:
            text = text[:800] + "…"
        if role == "assistant":
            lines.append(f"Assistant: {text}")
        else:
            lines.append(f"User: {text}")
    lines.append("Assistant:")
    return "\n".join(lines)

@app.post("/chat")
def chat():
    data = request.get_json() or {}
    messages = data.get("messages", [])
    user_name = data.get("userName")
    user_id = data.get("userId")
    try:
        # Fetch user profile and serialize to compact JSON
        user_doc = fetch_user_profile(user_id)
        user_summary = serialize_user(user_doc) if user_doc else None
        user_json = json.dumps(user_summary, default=str, ensure_ascii=False) if user_summary else None

        prompt = build_prompt(messages, user_name, user_json)
        try:
            resp = model.generate_content(prompt)
            reply = (getattr(resp, "text", None) or "").strip()
        except Exception as ge:
            # Graceful fallback reply so mobile UI still receives a response
            fallback = "I’m having trouble responding right now. Please try again in a moment."
            title = None
            for m in messages:
                if m.get("role") == "user":
                    first = str(m.get("text", "")).strip()
                    if first:
                        title = (first[:40] + ("…" if len(first) > 40 else ""))
                        break
            return jsonify({ "reply": fallback, "title": title, "note": "fallback", "error": str(ge) })
        # Title heuristic: first user message trimmed to 40 chars
        title = None
        for m in messages:
            if m.get("role") == "user":
                first = str(m.get("text","")).strip()
                if first:
                    title = (first[:40] + ("…" if len(first) > 40 else ""))
                    break
        return jsonify({ "reply": reply, "title": title })
    except Exception as e:
        return jsonify({ "error": str(e) }), 500

@app.get("/")
def health():
    return jsonify({ "ok": True, "ts": datetime.utcnow().isoformat() })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5004, debug=True)


