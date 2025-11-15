from flask import Flask, request, jsonify
from datetime import datetime
import google.generativeai as genai
from dotenv import load_dotenv
import os
import json   # <-- IMPORTANT

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

app = Flask(__name__)

PROMPT = """
You are a high-precision reminder extraction engine.

Input text may be in Hindi or English.

Your tasks:

1. Detect if the text contains a reminder.
2. If NO reminder exists → output exactly: NO

3. If a reminder exists:
   - "date" → YYYY-MM-DD
   - "time" → HH:MM (24-hour format)
   - "message":
        * If the user writes in English → output clean professional English
        * If the user writes in Hindi → output the message in Hinglish (Latin script Hindi), NOT Devanagari

HINGLISH RULES:
- Convert Hindi meaning into readable Latin Hindi.
- Example: 
  - “दवा लेने की याद” → “dawa lene ki yaad”
  - “बाहर jana hai” → “bahar jana hai”
- Use simple and natural Hinglish.
- No Devanagari characters at all.

MESSAGE RULES:
- Keep the message short, clear, action-focused.
- Do not include filler words.
- Do not repeat date or time in the message.

4. Interpret all dates & times relative to:
CURRENT_DATETIME = {current}

Strict output format:
{{
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "message": "text"
}}
or NO only.

DO NOT:
- Use code blocks
- Output markdown
- Use Devanagari script in Hindi outputs
"""




from flask import Response

@app.post("/analyze")
def analyze():
    data = request.get_json()
    user_text = data.get("text", "")

    current_ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    query = PROMPT.format(current=current_ts) + "\n\nUSER INPUT:\n" + user_text

    response = model.generate_content(query)
    ai_text = response.text.strip()

    try:
        parsed = json.loads(ai_text)

        return Response(
            json.dumps({"result": parsed}, ensure_ascii=False),
            mimetype="application/json"
        )

    except:
        return Response(
            json.dumps({"result": ai_text}, ensure_ascii=False),
            mimetype="application/json"
        )



if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)
