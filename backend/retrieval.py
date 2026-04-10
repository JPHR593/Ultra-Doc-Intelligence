import os
import re
import numpy as np
from typing import List, Tuple

from openai import OpenAI
from anthropic import Anthropic
from qdrant_client import QdrantClient
from qdrant_client.models import SparseVector, SearchRequest, NamedVector, NamedSparseVector, Prefetch, FusionQuery, Fusion

from ingestion import tokenise, bm25_vector, COLLECTION_PREFIX

oai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
claude = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
qdrant = QdrantClient(host=os.environ.get("QDRANT_HOST", "localhost"), port=6333)

TOP_K = 8            # initial retrieval
RERANK_TOP = 4       # chunks sent to LLM after re ranking
CONFIDENCE_THRESHOLD = 0.25


# Embedding 

def embed_query(query: str) -> List[float]:
    resp = oai.embeddings.create(model="text-embedding-3-small", input=[query])
    return resp.data[0].embedding


# Hybrid retrieval 

def hybrid_search(collection: str, query: str, top_k: int = TOP_K):
    dense_vec = embed_query(query)

    query_tokens = list(set(tokenise(query)))
    sparse_indices = [hash(t) % 100_000 for t in query_tokens]
    sparse_values = [1.0] * len(query_tokens)
    sparse_vec = SparseVector(indices=sparse_indices, values=sparse_values)

    results = qdrant.query_points(
        collection_name=collection,
        prefetch=[
            Prefetch(
                query=dense_vec,
                using="dense",
                limit=top_k,
            ),
            Prefetch(
                query=sparse_vec,
                using="sparse",
                limit=top_k,
            ),
        ],
        query=FusionQuery(fusion=Fusion.RRF),
        limit=top_k,
        with_payload=True,
    )
    return results.points


# Cross-encoder re ranking

def cross_encoder_score(query: str, passage: str) -> float:
    resp = claude.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=10,
        system=(
            "You are a relevance scorer. Given a query and a passage, "
            "respond with ONLY a decimal number between 0.0 and 1.0. "
            "0.0 = completely irrelevant, 1.0 = perfectly answers the query."
        ),
        messages=[
            {"role": "user", "content": f"Query: {query}\n\nPassage: {passage[:800]}"}
        ],
    )
    try:
        import re
        match = re.search(r'[\d.]+', resp.content[0].text.strip())
        return float(match.group()) if match else 0.5
    except Exception:
        return 0.5


def rerank(query: str, hits) -> List[Tuple[any, float]]:
    scored = []
    for hit in hits:
        text = hit.payload.get("text", "")
        score = cross_encoder_score(query, text)
        scored.append((hit, score))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


# Coverage heuristic 

def answer_coverage(answer: str, chunks: List[str]) -> float:
    answer_tokens = set(tokenise(answer))
    if not answer_tokens:
        return 0.0
    chunk_tokens = set()
    for c in chunks:
        chunk_tokens.update(tokenise(c))
    overlap = answer_tokens & chunk_tokens
    return len(overlap) / len(answer_tokens)


# Confidence score 

def compute_confidence(
    retrieval_score: float,   # Qdrant normalised score (0-1)
    rerank_score: float,      # cross-encoder score (0-1)
    coverage: float,          # answer token coverage (0-1)
) -> float:
    return round(0.35 * retrieval_score + 0.45 * rerank_score + 0.20 * coverage, 3)


# Claude Q & A 

SYSTEM_PROMPT = """You are a logistics document assistant. Answer the user's question 
using ONLY the provided document excerpts.

Logistics terminology mappings you must know:
- "consignee" = the recipient / delivery destination = the DROP location
- "shipper" = the sender / origin = the PICKUP location  
- "carrier rate" or "agreed amount" = the payment for the carrier
- "equipment" = truck/trailer type (Flatbed, Dry Van, Reefer etc.)

Rules:
- If the answer is in the document, give a precise, factual answer.
- Always cite which excerpt supports your answer (e.g., "[Excerpt 2]").
- Use your logistics knowledge to map question terminology to document fields.
- If the information is truly not in the provided excerpts, respond with exactly: 
  "NOT_FOUND: This information is not available in the document."
- Never invent, infer, or guess facts not present in the excerpts.
- Keep answers concise and direct.
"""

def ask_claude(question: str, context_chunks: List[str], filename: str) -> str:
    context = "\n\n".join(
        f"[Excerpt {i+1}]\n{chunk}" for i, chunk in enumerate(context_chunks)
    )
    user_msg = (
        f"Document: {filename}\n\n"
        f"Excerpts:\n{context}\n\n"
        f"Question: {question}"
    )
    resp = claude.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    return resp.content[0].text.strip()


# Main entry 

def retrieve_and_answer(doc_id: str, question: str, filename: str) -> dict:
    collection = COLLECTION_PREFIX + doc_id

    # 1. Hybrid retrieval
    hits = hybrid_search(collection, question, top_k=TOP_K)
    if not hits:
        return {
            "answer": "NOT_FOUND: No relevant content found in the document.",
            "sources": [],
            "confidence": 0.0,
            "guardrail_triggered": True,
        }

    # Normalise retrieval scores to 0-1
    raw_scores = [h.score for h in hits]
    max_score = max(raw_scores) if raw_scores else 1.0
    retrieval_score = float(raw_scores[0] / max_score) if max_score > 0 else 0.0

    # 2. Cross-encoder re ranking
    reranked = rerank(question, hits)
    top_hits = reranked[:RERANK_TOP]
    rerank_score = top_hits[0][1] if top_hits else 0.0

    top_chunks = [h.payload.get("text", "") for h, _ in top_hits]
    top_chunk_indices = [h.payload.get("chunk_index", 0) for h, _ in top_hits]

    # 3. Guardrail: bail out early if retrieval quality is very low
    prelim_confidence = compute_confidence(retrieval_score, rerank_score, 0.5)
    if prelim_confidence < CONFIDENCE_THRESHOLD:
        return {
            "answer": "NOT_FOUND: The document does not appear to contain relevant information to answer this question.",
            "sources": [],
            "confidence": round(prelim_confidence, 3),
            "guardrail_triggered": True,
        }

    # 4. Ask Claude
    answer = ask_claude(question, top_chunks, filename)

    # 5. Check if Claude itself said not found
    not_found = answer.startswith("NOT_FOUND:")

    # 6. Coverage signal
    coverage = 0.0 if not_found else answer_coverage(answer, top_chunks)

    # 7. Final confidence
    confidence = 0.0 if not_found else compute_confidence(
        retrieval_score, rerank_score, coverage
    )

    sources = [] if not_found else [
        {
            "chunk_index": idx,
            "text": chunk[:400] + ("…" if len(chunk) > 400 else ""),
            "rerank_score": round(score, 3),
        }
        for (_, score), chunk, idx in zip(top_hits, top_chunks, top_chunk_indices)
    ]

    return {
        "answer": answer,
        "sources": sources,
        "confidence": confidence,
        "confidence_breakdown": {
            "retrieval_similarity": round(retrieval_score, 3),
            "rerank_score": round(rerank_score, 3),
            "answer_coverage": round(coverage, 3),
        },
        "guardrail_triggered": not_found,
    }
