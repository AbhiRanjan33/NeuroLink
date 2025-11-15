from fastapi import FastAPI, UploadFile, Body, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import base64
import logging
import numpy as np
import cv2
import requests
from deepface import DeepFace
from pymongo import MongoClient

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logging.info("People-matching service starting...")
logging.info("MONGODB_URI present: %s | MONGODB_DB=%s", bool(os.getenv("MONGODB_URI")), os.getenv("MONGODB_DB"))


THRESHOLD = 0.55   # Facenet512 threshold
MONGODB_URI = "mongodb+srv://ranjanabhi2468_db_user:5IkHfpx60WlHYRQa@cluster0.xc3da1w.mongodb.net/neurolink?retryWrites=true&w=majority"
MONGODB_DB = os.getenv("MONGODB_DB")


def read_image_from_bytes(bytes_data):
    logging.debug("Decoding image from bytes size=%s", len(bytes_data) if bytes_data else 0)
    arr = np.frombuffer(bytes_data, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def read_image_from_url(url):
    logging.info("Fetching image from URL: %s", url)
    resp = requests.get(url, timeout=20)
    arr = np.frombuffer(resp.content, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def read_image_from_base64(b64_data: str):
    logging.info("Decoding base64 image, length=%s", len(b64_data) if b64_data else 0)
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]
    raw = base64.b64decode(b64_data)
    return read_image_from_bytes(raw)


def get_embedding(img):
    logging.debug("Generating embedding...")
    rep = DeepFace.represent(img_path=img, model_name="Facenet512", enforce_detection=False)
    return np.array(rep[0]["embedding"])


def cosine(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def _get_db():
    if not MONGODB_URI:
        logging.warning("MONGODB_URI not set; DB calls disabled")
        return None
    logging.debug("Connecting to MongoDB...")
    client = MongoClient(MONGODB_URI)
    if MONGODB_DB:
        logging.info("Using database: %s", MONGODB_DB)
        return client[MONGODB_DB]
    try:
        logging.info("Using default database")
        return client.get_default_database()
    except Exception:
        logging.exception("Failed to get default database")
        return None


def load_people_candidates(user_id: str):
    logging.info("Loading candidates for userId=%s", user_id)
    db = _get_db()
    if db is None:
        logging.warning("DB not available, 0 candidates")
        return []
    col = db.get_collection("people")
    docs = list(col.find(
        {"userId": user_id},
        {"personName": 1, "journalId": 1, "imageUrl": 1}
    ))
    logging.info("Loaded %s candidates", len(docs))
    out = []
    for d in docs:
        url = d.get("imageUrl")
        if not url:
            continue
        out.append({
            "personName": d.get("personName"),
            "journalId": str(d.get("journalId")),
            "imageUrl": url
        })
    return out


@app.post("/match")
async def match(payload: dict = Body(...)):
    logging.info("POST /match")
    user_id = payload.get("userId")
    image_b64 = payload.get("imageBase64")
    image_url = payload.get("imageUrl")

    if not user_id or (not image_b64 and not image_url):
        logging.warning("Invalid payload: userId or image missing")
        return {"success": False, "error": "userId and image required"}

    try:
        if image_b64:
            logging.info("Reading input as base64")
            input_img = read_image_from_base64(image_b64)
        else:
            logging.info("Reading input as URL")
            input_img = read_image_from_url(image_url)
        input_emb = get_embedding(input_img)
    except Exception as e:
        logging.exception("Failed to read/encode input image")
        return {"success": False, "error": f"failed to read/encode input image: {str(e)}"}

    candidates = load_people_candidates(user_id)
    logging.info("Comparing against %s candidates", len(candidates))
    best = None
    best_score = -1.0

    for cand in candidates:
        url = cand.get("imageUrl")
        if not url:
            continue
        try:
            img = read_image_from_url(url)
            emb = get_embedding(img)
            sim = float(cosine(input_emb, emb))
            logging.debug("Candidate %s journalId=%s sim=%.4f", cand.get("personName"), cand.get("journalId"), sim)
        except Exception:
            logging.exception("Failed to process candidate image: %s", url)
            continue
        if sim > best_score:
            best_score = sim
            best = cand

    if best and best_score >= THRESHOLD:
        logging.info("Match: person=%s journalId=%s score=%.4f", best.get("personName"), best.get("journalId"), best_score)
        return {
            "success": True,
            "match": {
                "personName": best.get("personName"),
                "journalId": best.get("journalId"),
                "imageUrl": best.get("imageUrl"),
                "confidence": best_score
            }
        }
    logging.info("No match found (best_score=%.4f, threshold=%.2f)", best_score, THRESHOLD)
    return {"success": True, "match": None}


@app.post("/identify")
async def identify(file: UploadFile = File(...)):
    logging.info("POST /identify (legacy)")
    input_img = read_image_from_bytes(await file.read())
    input_emb = get_embedding(input_img)

    best_match = None
    best_score = -1

    # Optional legacy route: compare with first N candidate images from DB (if any)
    sample_candidates = []
    db = _get_db()
    if db is not None:
        col = db.get_collection("people")
        for d in col.find({}, {"imageUrl": 1}).limit(10):
            if d.get("imageUrl"):
                sample_candidates.append(d["imageUrl"])

    for url in sample_candidates:
        img = read_image_from_url(url)
        emb = get_embedding(img)

        sim = cosine(input_emb, emb)

        if sim > best_score:
            best_score = sim
            best_match = url

        if sim > THRESHOLD:
            return {
                "status": "match",
                "matched_url": url,
                "similarity": float(sim)
            }

    return {"status": "new_person"}


if __name__ == "__main__":
    logging.info("Starting uvicorn 0.0.0.0:8000")
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
