import os
import time
import threading
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from dotenv import load_dotenv
from twilio.rest import Client
from pymongo import MongoClient

load_dotenv()

app = Flask(__name__)

# Configuration
MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DB = os.getenv("MONGODB_DB")
TWILIO_SID = os.getenv("TWILIO_SID")
TWILIO_TOKEN = os.getenv("TWILIO_TOKEN")
TWILIO_PHONE = os.getenv("TWILIO_PHONE")
DEFAULT_COUNTRY_CODE = os.getenv("DEFAULT_COUNTRY_CODE", "+91")  # used to normalize if number missing '+'

# Initialize resources
mongo_client = MongoClient(MONGODB_URI) if MONGODB_URI else None
if mongo_client is not None:
	if MONGODB_DB:
		db = mongo_client[MONGODB_DB]
	else:
		try:
			db = mongo_client.get_default_database()
		except Exception:
			db = None
else:
	db = None
twilio_client = Client(TWILIO_SID, TWILIO_TOKEN) if (TWILIO_SID and TWILIO_TOKEN) else None

WINDOW_SECONDS = int(os.getenv("REMINDER_WINDOW_SECONDS", "900"))  # default 15 minutes
INTERVAL_SECONDS = int(os.getenv("REMINDER_SCAN_INTERVAL", "60"))  # default every minute


def try_parse_datetime(date_str: str, time_str: str):
	if not date_str or not time_str:
		return None
	candidates = [
		f"{date_str} {time_str}",
		f"{date_str}T{time_str}",
	]
	for s in candidates:
		try:
			dt = datetime.fromisoformat(s)
			return dt
		except Exception:
			try:
				# Fallback for common formats like DD/MM/YYYY HH:MM
				dt = datetime.strptime(s, "%d/%m/%Y %H:%M")
				return dt
			except Exception:
				continue
	return None


def call_phone(to_number: str, message: str):
	if not twilio_client or not TWILIO_PHONE:
		raise RuntimeError("Twilio not configured")
	return twilio_client.calls.create(
		twiml=f'<Response><Say voice="alice" language="hi-IN">{message}</Say></Response>',
		to=to_number,
		from_=TWILIO_PHONE,
	)


def mark_called(user_id: str, reminder):
	# Update the first matching reminder (by createdAt if present, else match by fields)
	created_at = reminder.get("createdAt")
	filter_query = {"userId": user_id}
	array_filters = None
	update_path = "reminders.$.calledAt"

	if created_at:
		filter_query["reminders.createdAt"] = created_at
	else:
		# match by value if createdAt missing
		filter_query["reminders"] = {
			"$elemMatch": {
				"date": reminder.get("date"),
				"time": reminder.get("time"),
				"message": reminder.get("message"),
				"calledAt": None,
			}
		}

	db.users.update_one(
		filter_query,
		{"$set": {update_path: datetime.now(timezone.utc)}},
	)


def normalize_e164(number: str) -> str:
	"""
	Normalize a human-entered phone number to E.164.
	- Strips spaces, dashes, parentheses.
	- If missing leading '+', prefixes DEFAULT_COUNTRY_CODE.
	"""
	if not number:
		return number
	n = str(number).strip()
	# remove common separators
	for ch in (" ", "-", "(", ")"):
		n = n.replace(ch, "")
	# if already starts with '+', assume it's E.164
	if n.startswith("+"):
		return n
	# otherwise prefix default country
	return f"{DEFAULT_COUNTRY_CODE}{n}"


def process_due_once():
	if db is None:
		print("Mongo DB not configured; skipping process.")
		return
	if not twilio_client or not TWILIO_PHONE:
		print("Twilio not configured; skipping calls.")
		return

	now = datetime.now()
	users = list(db.users.find(
		{"phoneRemindersEnabled": True, "phoneNumber": {"$ne": None, "$ne": ""}},
		{"userId": 1, "phoneNumber": 1, "reminders": 1, "_id": 0}
	))

	for u in users:
		uid = u.get("userId")
		num = u.get("phoneNumber")
		rem_list = u.get("reminders") or []
		for r in rem_list:
			if r.get("calledAt"):
				continue
			dt = try_parse_datetime(r.get("date"), r.get("time"))
			if not dt:
				continue
			diff = (now - dt).total_seconds()
			if 0 <= diff <= WINDOW_SECONDS:
				try:
					msg = f"Reminder: {r.get('message')} at {r.get('time')} on {r.get('date')}."
					to_num = normalize_e164(num)
					call_phone(to_num, msg)
					mark_called(uid, r)
				except Exception as e:
					print(f"Call failed for user {uid}: {e}")


def scheduler_loop():
	while True:
		try:
			process_due_once()
		except Exception as e:
			print("Scheduler error:", e)
		time.sleep(INTERVAL_SECONDS)


@app.get("/health")
def health():
	return jsonify({
		"ok": True,
		"mongodb": db is not None,
		"twilio": bool(twilio_client and TWILIO_PHONE),
		"windowSeconds": WINDOW_SECONDS,
		"intervalSeconds": INTERVAL_SECONDS,
	})


@app.post("/run-once")
def run_once():
	try:
		process_due_once()
		return jsonify({"success": True})
	except Exception as e:
		return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
	print("Starting call-system scheduler...")
	threading.Thread(target=scheduler_loop, daemon=True).start()
	app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5009")))