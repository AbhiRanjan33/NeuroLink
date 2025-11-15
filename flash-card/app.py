from flask import Flask, request, jsonify
import google.generativeai as genai
from dotenv import load_dotenv
import os
import spacy
from datetime import datetime
import json
import re

load_dotenv()
nlp = spacy.load("en_core_web_sm")

app = Flask(__name__)

# Gemini config
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash")


# Natural time converter
def natural_time(ts):
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", ""))
    except:
        return None

    h = dt.hour
    if h < 6:
        return "early in the morning"
    elif h < 12:
        return "later that morning"
    elif h < 17:
        return "during the afternoon"
    elif h < 21:
        return "towards the evening"
    else:
        return "later at night"


# Detect entities
def detect_people(text):
    doc = nlp(text)
    return [ent.text for ent in doc.ents if ent.label_ == "PERSON"]


def detect_places(text):
    doc = nlp(text)
    return [ent.text for ent in doc.ents if ent.label_ in ["GPE", "LOC"]]


def detect_media(text):
    media_words = ["video", "clip", "reel", "photo", "image", "picture",
                   "movie", "film", "song", "music"]
    return [m for m in media_words if m in text.lower()]


def detect_events(text):
    doc = nlp(text)
    return [t.lemma_ for t in doc if t.pos_ == "VERB"][:3]


# Extract details from journals
def extract_details(journals):
    parsed = []
    raw_items = []

    for j in journals:
        text = j.get("text", "") or j.get("caption", "")
        caption = j.get("caption", "")
        media_url = j.get("mediaUrl") or j.get("mediaUri")
        ts = j.get("timestamp")

        if not (text.strip() or caption.strip() or media_url):
            continue

        final_text = text if text.strip() else caption

        entry = {
            "raw_text": final_text,
            "timestamp": ts,
            "people": detect_people(final_text),
            "places": detect_places(final_text),
            "media_word_hits": detect_media(final_text),
            "events": detect_events(final_text),
            "time_phrase": natural_time(ts),
            "mediaUrl": media_url,   # keep canonical key
            "caption": caption
        }

        parsed.append(entry)

        raw_items.append({
            "text": final_text,
            "timestamp": ts,
            "mediaUrl": media_url,
            "caption": caption
        })

    parsed.sort(key=lambda x: x["timestamp"] or "")
    return parsed, raw_items


@app.route("/generate-flashcards", methods=["POST"])
def generate_flashcards():
    body = request.get_json()

    if "journals" not in body:
        return jsonify({"error": "Missing 'journals' field"}), 400

    details, raw_items = extract_details(body["journals"])

    relations = body.get("relations", {})
    user_name = body.get("userName")

    if len(details) == 0:
        return jsonify({"error": "No usable journal entries"}), 400

    # =======================
    # PROMPT
    # =======================
    prompt = f"""
You generate nostalgic memory flashcards for an Alzheimer's patient.

Patient Name: {user_name}
Family Relations:
{relations}

STRUCTURED DETAILS (verify with raw text):
{details}

RAW TEXT + MEDIA (trust these):
{raw_items}

===========================================================
FLASHCARD CREATION RULES
===========================================================

### 🔥 MEDIA PRIORITY RULE (VERY IMPORTANT)
1. **ALWAYS prioritize entries that contain mediaUri.**
2. If there are 5 or more media entries:
      → All 5 flashcards MUST come from media entries.
3. If there are fewer than 5 media entries:
      → Use ALL media entries FIRST.
      → Fill the remaining flashcards using text-only entries.
4. Media flashcards must always appear at the TOP of the list.

===========================================================
FLASHCARD CONTENT RULES
===========================================================

- Output EXACTLY 5 flashcards.
- For flashcards created from media entries:
     - The flashcard MUST include the mediaUri exactly as it is.
     - The summary must describe what happened based on caption + text.
     - Warm, nostalgic, emotionally supportive tone.

- For text-only entries:
     - mediaUri must be `null`.
     - Use timestamp → natural time phrase.
     - Mention people using family relations:
           “Arun, who is your son…”
     - Paraphrase the event, never copy exact raw lines.

- The tone should be emotional, gentle, nostalgic, and comforting.
- NO exact timestamps—they must be converted to natural-time phrases.
- NO invented people, places, or events. Only use raw data.

===========================================================
OUTPUT FORMAT (strict)
===========================================================

{{
  "flashcards": [
    {{
      "title": "",
      "summary": "",
      "mediaUri": "" | null
    }}
  ]
}}
"""

    try:
        response = model.generate_content(prompt)
        raw_text = response.text

        # Extract only JSON safely
        json_match = re.search(r"\{(.|\n)*\}", raw_text)
        if not json_match:
            return jsonify({
                "error": "Model did not return JSON",
                "raw_response": raw_text
            }), 500

        cleaned = json_match.group(0)
        parsed_json = json.loads(cleaned)

        return jsonify(parsed_json)

    except Exception as e:
        return jsonify({
            "error": f"Parsing error: {str(e)}",
            "raw_response": raw_text if 'raw_text' in locals() else None
        }), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5003, debug=True)
