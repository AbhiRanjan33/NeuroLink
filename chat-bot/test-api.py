import os
import sys
import json
import argparse
import requests

DEFAULT_SERVICE_URL = "http://127.0.0.1:5004/chat"

def detect_backend_url():
    # Prefer explicit BACKEND_URL, then EXPO_PUBLIC_API_URL, then localhost:5000
    for key in ("BACKEND_URL", "EXPO_PUBLIC_API_URL"):
        val = os.getenv(key)
        if val and isinstance(val, str) and val.strip():
            return val.strip().rstrip("/")
    return "http://127.0.0.1:5000"

def resolve_current_user(backend_url):
    try:
        r = requests.get(f"{backend_url}/current-user", timeout=10)
        if r.status_code == 200:
            j = r.json()
            if j.get("success") and j.get("userId"):
                return j.get("userId"), j.get("name")
    except Exception:
        pass
    # Fall back to env overrides if provided
    uid = os.getenv("USER_ID")
    uname = os.getenv("USER_NAME")
    return uid, uname

def main():
    parser = argparse.ArgumentParser(description="Test the chatbot service.")
    parser.add_argument("--json-only", action="store_true", help="Print only JSON output")
    parser.add_argument("--text", type=str, default="Tell me about my profile and suggest one helpful activity today.", help="Message to send")
    parser.add_argument("--service-url", type=str, default=DEFAULT_SERVICE_URL, help="Chatbot service URL")
    parser.add_argument("--backend-url", type=str, default=None, help="Backend URL for resolving current user")
    args = parser.parse_args()

    backend_url = (args.backend_url or detect_backend_url()).rstrip("/")
    service_url = args.service_url.rstrip("/")

    logs = []
    if not args.json_only:
        logs.append(f"[i] backend_url={backend_url}")
        logs.append(f"[i] service_url={service_url}")

    user_id, user_name = resolve_current_user(backend_url)
    if not args.json_only:
        logs.append(f"[i] resolved user_id={user_id}, user_name={user_name}")

    payload = {
        "messages": [
            {"role": "user", "text": args.text}
        ],
        "userId": user_id,
        "userName": user_name,
    }

    try:
        resp = requests.post(service_url, json=payload, timeout=60)
        ct = resp.headers.get("content-type", "")
        if "application/json" in ct:
            data = resp.json()
        else:
            data = {"error": f"Non-JSON response", "status": resp.status_code, "raw": resp.text[:500]}
    except Exception as e:
        data = {"error": str(e)}

    out = {"success": "error" not in data, "request": {"userId": user_id, "userName": user_name, "text": args.text}, "response": data}

    if args.json_only:
        print(json.dumps(out, ensure_ascii=False))
    else:
        for line in logs:
            print(line)
        print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()


