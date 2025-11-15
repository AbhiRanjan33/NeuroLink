import os
import json
import re
import argparse
import traceback
from pathlib import Path
from datetime import datetime

import requests
from dotenv import load_dotenv
from pymongo import MongoClient
import requests as http

load_dotenv()

# Updated for the new flashcard generator API
GENERATOR_API = os.getenv("GENERATOR_API_URL", "http://127.0.0.1:5003/generate-flashcards")
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB")      # optional explicit DB name
USER_ID_ENV = os.getenv("USER_ID")        # preferred explicit userId
USER_NAME_ENV = os.getenv("USER_NAME")    # or explicit user name (case-insensitive exact)
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:5000")

def iso(dt) -> str | None:
    """Safely convert datetime to ISO string format."""
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    try:
        return dt.isoformat()
    except Exception:
        return None

def resolve_user(client: MongoClient) -> dict:
    """
    Resolve current user document STRICTLY from env to avoid ambiguity.
      - If USER_ID is set: use that userId
      - Else if USER_NAME is set: match by name (case-insensitive exact). If multiple,
        pick the one with latest lastLoginAt, otherwise the one with latest journal timestamp.
      - Else: raise error (require explicit selection to avoid wrong user).
    """
    db = None
    if MONGODB_DB:
        db = client[MONGODB_DB]
    else:
        try:
            db = client.get_default_database()
        except Exception:
            db = None
    if db is None:
        raise RuntimeError("No default database. Set MONGODB_DB or include database in MONGODB_URI.")
    users = db["users"]

    # By explicit userId
    if USER_ID_ENV:
        doc = users.find_one({"userId": USER_ID_ENV}, {"userId": 1, "name": 1, "_id": 0})
        if not doc:
            raise RuntimeError(f"USER_ID={USER_ID_ENV} not found in database.")
        return doc

    # By explicit user name (case-insensitive exact)
    if USER_NAME_ENV:
        matches = list(users.find({"name": {"$regex": f"^{USER_NAME_ENV}$", "$options": "i"}},
                                  {"userId": 1, "name": 1, "lastLoginAt": 1, "journals.timestamp": 1, "_id": 0}))
        if not matches:
            raise RuntimeError(f"USER_NAME={USER_NAME_ENV} not found in database.")
        # Prefer latest lastLoginAt among matches
        matches.sort(key=lambda d: (d.get("lastLoginAt") or datetime.min), reverse=True)
        candidate = matches[0]
        # If lastLoginAt missing across all, prefer latest journal timestamp
        if all(m.get("lastLoginAt") is None for m in matches):
            def last_ts(doc):
                ts_list = [t for t in (doc.get("journals") or []) if isinstance(t, dict)]
                # Extract timestamps
                vals = []
                for j in ts_list:
                    ts = j.get("timestamp")
                    try:
                        vals.append(datetime.fromisoformat(str(ts).replace("Z", "")))
                    except Exception:
                        pass
                return max(vals) if vals else datetime.min
            matches.sort(key=last_ts, reverse=True)
            candidate = matches[0]
        return {"userId": candidate.get("userId"), "name": candidate.get("name")}

    # As a final fallback, ask backend for current user (set by mobile login)
    try:
        r = http.get(f"{BACKEND_URL}/current-user", timeout=10)
        j = r.json()
        if j.get("success") and j.get("userId"):
            return {"userId": j.get("userId"), "name": j.get("name")}
    except Exception:
        pass

    raise RuntimeError("Set USER_ID or USER_NAME (or ensure /current-user works) to select the correct user.")


def find_backend_url() -> str:
    """
    Resolve the backend URL automatically:
      1) BACKEND_URL env if provided
      2) http://127.0.0.1:5000 (default)
      3) Parse App.tsx for const API_URL = 'http://...'
    """
    if os.getenv("BACKEND_URL"):
        return os.getenv("BACKEND_URL")

    candidate = "http://127.0.0.1:5000"
    try:
        repo_root = Path(__file__).resolve().parents[2]
        app_tsx = repo_root / "App.tsx"
        if app_tsx.exists():
            text = app_tsx.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"const\s+API_URL\s*=\s*['\"](http[^'\"]+)['\"]", text)
            if m:
                return m.group(1)
    except Exception:
        pass

    return candidate


def fetch_user_data_from_db(user_id: str) -> dict:
    """Fetches journals and relations for a given user."""
    if not MONGODB_URI:
        raise RuntimeError("Set MONGODB_URI in environment.")
    client = MongoClient(MONGODB_URI)
    db = None
    if MONGODB_DB:
        db = client[MONGODB_DB]
    else:
        try:
            db = client.get_default_database()
        except Exception:
            db = None
    if db is None:
        client.close()
        raise RuntimeError("No default database. Set MONGODB_DB or include database in MONGODB_URI.")
    
    users = db["users"]
    # Fetch journals, name, and the new 'relations' field
    doc = users.find_one({"userId": user_id}, {"journals": 1, "relations": 1, "name": 1, "_id": 0})
    client.close()
    
    if not doc:
        return {}

    # Normalize journals for the generator's expected input
    journals = (doc or {}).get("journals", []) or []
    normalized_journals = []
    for j in journals:
        item = {
            "text": j.get("text"),
            "caption": j.get("caption"),
            "mediaUrl": j.get("mediaUrl") or j.get("mediaUri"),
            "timestamp": iso(j.get("timestamp"))
        }
        normalized_journals.append(item)
    
    # Sort ascending by timestamp
    normalized_journals.sort(key=lambda x: x.get("timestamp") or "")
    
    return {
        "journals": normalized_journals,
        "relations": doc.get("relations", {}),
        "name": doc.get("name")
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-only", action="store_true", help="Print only the JSON output (no logs)")
    args = parser.parse_args()
    json_only = args.json_only

    try:
        if not json_only:
            print("Flashcard test-api: starting...", flush=True)
        if not MONGODB_URI:
            raise RuntimeError("Set MONGODB_URI in environment. (flash-card/test-api.py)")

        backend_url = find_backend_url()
        user_identity = None
        try:
            if not json_only:
                print(f"Resolving current user from backend: {backend_url}/current-user", flush=True)
            r = http.get(f"{backend_url}/current-user", timeout=8)
            j = r.json()
            if not j.get("success"):
                raise RuntimeError("backend returned failure")
            user_identity = {"userId": j.get("userId"), "name": j.get("name")}
        except Exception:
            if not json_only:
                print("Backend current-user failed, falling back to DB resolution...", flush=True)
            client = MongoClient(MONGODB_URI)
            user_identity = resolve_user(client)
            client.close()

        user_id = user_identity.get("userId")
        user_name_id = user_identity.get("name")
        if not json_only:
            print(f"Using userId={user_id} name='{user_name_id}'", flush=True)
        
        # Fetch all necessary data: journals, relations, and name
        user_data = fetch_user_data_from_db(user_id)
        
        journals = user_data.get("journals")
        relations = user_data.get("relations")
        user_name = user_data.get("name")

        if not journals:
            if not json_only:
                print(f"No journals found for user: {user_id}", flush=True)
            print(json.dumps({"flashcards": []}))
            return

        # Construct the payload for the flashcard generator
        payload = {
            "journals": journals,
            "userName": user_name,
            "relations": relations
        }

        if not json_only:
            print(f"➡ Sending POST to flashcard generator for userId={user_id} name='{user_name}' with {len(journals)} journals...")
        
        resp = requests.post(GENERATOR_API, json=payload, timeout=120)
        
        if not json_only:
            print("⬅ STATUS:", resp.status_code)
        
        try:
            data = resp.json()
            if json_only:
                print(json.dumps(data))
            else:
                print(json.dumps(data, indent=2))
        except Exception:
            if json_only:
                print(json.dumps({"error": "non-json response", "raw": resp.text[:1000]}))
            else:
                print("Raw response (not valid JSON):\n", resp.text[:1000])

    except Exception as e:
        if json_only:
            print(json.dumps({"error": str(e)}))
        else:
            print(f"❌ ERROR: {e}", flush=True)
            traceback.print_exc()

if __name__ == "__main__":
    main()