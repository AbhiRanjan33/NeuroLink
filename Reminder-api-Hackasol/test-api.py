import requests
import json

URL = "http://127.0.0.1:5000/analyze"

data = {
    "text": "ek ghante baad bahar chalne jana hai"
}

response = requests.post(URL, json=data)

print("STATUS:", response.status_code)
print("RESPONSE:")
print(json.dumps(response.json(), indent=4))
