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

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash")


# Convert timestamp → natural-time phrase
def natural_time(ts):
    try:
        dt = datetime.fromisoformat(ts.replace("Z", ""))
    except:
        return None

    hour = dt.hour
    if hour < 6:
        return "early morning"
    elif hour < 12:
        return "later that morning"
    elif hour < 17:
        return "during the afternoon"
    elif hour < 21:
        return "towards the evening"
    else:
        return "later at night"


# Extract people from text
def detect_people(text):
    doc = nlp(text)
    return [ent.text for ent in doc.ents if ent.label_ == "PERSON"]


# Extract places
def detect_places(text):
    doc = nlp(text)
    return [ent.text for ent in doc.ents if ent.label_ in ["GPE", "LOC"]]


# Detect media
def detect_media(text):
    media_words = [
        "video", "clip", "reel", "photo", "image", "movie",
        "news", "recording", "picture", "song", "music", "film"
    ]
    return [w for w in media_words if w.lower() in text.lower()]


# Extract events (verbs)
def detect_events(text):
    doc = nlp(text)
    return [token.lemma_ for token in doc if token.pos_ == "VERB"][:3]


# MAIN: extract structured + raw details
def extract_details(journals):
    parsed = []
    raw_items = []

    for j in journals:
        text = j.get("text", "") or j.get("caption", "")
        timestamp = j.get("timestamp")

        if not text.strip():
            continue

        entry = {
            "raw_text": text,
            "timestamp": timestamp,
            "people": detect_people(text),
            "places": detect_places(text),
            "media": detect_media(text),
            "events": detect_events(text),
            "time_phrase": natural_time(timestamp) if timestamp else None
        }

        parsed.append(entry)
        raw_items.append({
            "text": text,
            "timestamp": timestamp
        })

    # maintain sequence
    parsed.sort(key=lambda x: x["timestamp"] or "")
    return parsed, raw_items


@app.route("/generate-memory-quiz", methods=["POST"])
def generate_quiz():
    body = request.get_json()

    if "journals" not in body:
        return jsonify({"error": "Missing 'journals' field"}), 400

    details, raw_items = extract_details(body["journals"])
    user_name = body.get("userName")

    if len(details) == 0:
        return jsonify({"error": "No valid journal text found"}), 400

    # ============================
    # GEMINI PROMPT
    # ============================
    prompt = f"""
You are generating a memory-support quiz for an Alzheimer's patient.

{"The patient's name is " + user_name + "." if user_name else ""}

The following information has been extracted:

======================
GENERATED STRUCTURED DETAILS:
(This includes people, places, media, events, and natural-time estimates.
These details have been GENERATED — you MUST cross-check them.)
======================
{details}

======================
RAW TEXT + TIMESTAMPS (Ground Truth):
(If there is any conflict, trust this.)
======================
{raw_items}

================================================
GLOBAL RULES
================================================
1. NEVER copy raw lines exactly. Always paraphrase.
2. Tone must be warm, gentle, friendly.
3. Use NATURAL TIME phrasing:
   - “later that morning”
   - “towards the evening”
   - “during the afternoon”
   - “earlier today”
   NEVER use exact timestamps (like 5:55 AM).
4. Incorrect options must be realistic and similar.
5. Only use details that appear in the raw entries.

================================================
QUESTION DIFFICULTY
================================================

Q1 & Q2 = EASY  
- General recall  
- No time, place, person combinations  
- No complex sequences  

Q3 = HARD  
- Combine at least 2 details:
  natural time, event, media, sequence  

Q4 = VERY HARD  
Combine as many of the following as possible,
in strict PRIORITY ORDER:

1. People
2. Event/action
3. Place
4. Natural time phrase
5. Media
6. Sequence of events

Example styles:
“Later that morning, around the time you were reading the news, what did you go on to watch next?”
“Towards the evening, after you spoke with someone, what did you spend time looking at?”

================================================
OUTPUT FORMAT
================================================

Return ONLY valid JSON:

{{
  "questions": [
    {{
      "tag": "easy" | "hard",
      "question": "",
      "options": ["", "", "", ""],
      "correct": "",
      "explanation": "A short, gentle sentence that describes what actually happened, grounded strictly in RAW TEXT."
    }}
  ]
}}
"""

    try:
        response = model.generate_content(prompt)
        raw_text = response.text

        # Extract ONLY the JSON object safely:
        json_match = re.search(r"\{(.|\n)*\}", raw_text)

        if not json_match:
            return jsonify({
                "error": "Gemini did not return JSON.",
                "raw_response": raw_text
            }), 500

        cleaned = json_match.group(0)

        final_json = json.loads(cleaned)
        return jsonify(final_json)

    except Exception as e:
        return jsonify({
            "error": f"Failed to parse Gemini response: {str(e)}",
            "raw_response": raw_text if 'raw_text' in locals() else "N/A"
        }), 500


# Run API
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
