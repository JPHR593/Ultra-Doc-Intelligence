from dotenv import load_dotenv
load_dotenv(dotenv_path="../.env")

import os
import uuid
import json
import re
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ingestion import ingest_document
from retrieval import retrieve_and_answer
from extraction import extract_structured

app = FastAPI(title="Ultra Doc-Intelligence API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

DOCS_FILE = "documents.json"

def load_documents():
    if os.path.exists(DOCS_FILE):
        with open(DOCS_FILE, "r") as f:
            return json.load(f)
    return {}

def save_documents(docs):
    with open(DOCS_FILE, "w") as f:
        json.dump(docs, f)

documents = load_documents()

class AskRequest(BaseModel):
    doc_id: str
    question: str


class ExtractRequest(BaseModel):
    doc_id: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    allowed = {".pdf", ".docx", ".txt"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: PDF, DOCX, TXT")

    doc_id = str(uuid.uuid4())
    save_path = UPLOAD_DIR / f"{doc_id}{ext}"

    content = await file.read()
    save_path.write_bytes(content)

    try:
        meta = ingest_document(doc_id, str(save_path), ext)
    except Exception as e:
        save_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Ingestion failed: {e}")

    documents[doc_id] = {
        "doc_id": doc_id,
        "filename": file.filename,
        "ext": ext,
        "path": str(save_path),
        **meta,
    }
    save_documents(documents)

    return {
        "doc_id": doc_id,
        "filename": file.filename,
        "chunks": meta["chunk_count"],
        "pages": meta.get("page_count"),
        "message": "Document ingested successfully",
    }


@app.post("/ask")
async def ask(req: AskRequest):
    if req.doc_id not in documents:
        raise HTTPException(404, "Document not found. Upload it first.")

    doc = documents[req.doc_id]

    try:
        result = retrieve_and_answer(req.doc_id, req.question, doc["filename"])
    except Exception as e:
        raise HTTPException(500, f"Retrieval failed: {e}")

    return result


@app.post("/extract")
async def extract(req: ExtractRequest):
    if req.doc_id not in documents:
        raise HTTPException(404, "Document not found. Upload it first.")

    doc = documents[req.doc_id]

    try:
        result = extract_structured(req.doc_id, doc["path"], doc["ext"])
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")

    return result


@app.get("/documents/{doc_id}")
def get_document(doc_id: str):
    if doc_id not in documents:
        raise HTTPException(404, "Document not found")
    return documents[doc_id]
