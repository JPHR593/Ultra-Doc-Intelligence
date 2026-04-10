# Ultra Doc-Intelligence

A production-grade AI assistant for logistics documents inside a Transportation Management System (TMS). Upload a Rate Confirmation, BOL, Invoice, or Shipment Instructions - then query it with natural language, get grounded answers with source citations, extract structured shipment fields as JSON, and receive a multi-signal confidence score with every response.

---

## Live Demo

> UI: `http://localhost:5173`  
> API docs: `http://localhost:8000/docs`

---

## Architecture

```
┌──────────────┐    POST /upload     ┌─────────────────────────────────────┐
│              │ ──────────────────► │  Ingestion Pipeline                 │
│  React UI    │                     │  parse → semantic chunk → embed     │
│  (Vite)      │    POST /ask        │  → upsert into Qdrant (hybrid)      │
│              │ ──────────────────► ├─────────────────────────────────────┤
│  localhost   │                     │  RAG Engine                         │
│  :5173       │    POST /extract    │  hybrid retrieve → cross-encoder    │
│              │ ──────────────────► │  rerank → Claude Haiku Q&A          │
└──────────────┘                     ├─────────────────────────────────────┤
                                     │  Structured Extractor               │
                                     │  full-doc context → GPT-4o-mini     │
                                     │  JSON mode → typed schema           │
                                     └──────────────┬──────────────────────┘
                                                    │
                                     ┌──────────────▼──────────────────────┐
                                     │  Qdrant  (Docker)                   │
                                     │  per-doc collection                 │
                                     │  dense vectors + BM25 sparse        │
                                     └─────────────────────────────────────┘
```
> _Architecture diagram generated with the help of [Claude AI](https://www.anthropic.com/claude) based on the system design._

**Tech stack:**

| Layer | Technology | Reason |
|---|---|---|
| API | FastAPI + Uvicorn | Async, auto-OpenAPI, fast iteration |
| Embeddings | `text-embedding-3-small` | Best retrieval quality at low cost |
| Vector store | Qdrant | Native hybrid search (dense + sparse), Docker first (easy to deploy, monitor and assess) |
| Q&A LLM | Claude Haiku | Fast, cost-efficient, strong grounding and natural refusals |
| Extraction LLM | GPT-4o-mini (JSON mode) | Reliable structured output, schema adherence |
| Frontend | React 18 + Vite | Fast HMR, CSS modules, no heavy framework |

---

## Chunking Strategy

**Semantic chunking** via cosine-drop boundary detection — not naive fixed-size chunks.

1. Extract text from the document (PDF via `pdfplumber`, DOCX via `python-docx`, TXT direct).
2. Split into sentences using punctuation-aware regex.
3. Embed every sentence with `text-embedding-3-small`.
4. Compute cosine similarity between rolling windows of consecutive sentences.
5. Where similarity drops below the 25th percentile of all pairwise scores, mark a **topic boundary**.
6. Group sentences between boundaries into chunks.

**Why this works for logistics documents:** BOLs and Rate Confirmations have natural sections — rate block, pickup instructions, delivery window, special handling terms. Fixed-size chunking arbitrarily splits these. Semantic chunking keeps each section intact, which dramatically improves retrieval precision for field-specific questions like "What is the accessorial charge?"

Typical chunk count: 8–30 per document depending on length.

---

## Retrieval Method

**Hybrid search** — dense cosine similarity + BM25 sparse, fused with Reciprocal Rank Fusion (RRF).

- **Dense search:** The query is embedded with `text-embedding-3-small` and matched against stored chunk embeddings by cosine similarity. Captures semantic meaning — finds relevant chunks even when exact keywords differ.
- **Sparse BM25 search:** Query tokens are matched against stored BM25 sparse vectors. Critical for logistics — exact terms like "BOL #", "NMFC code", "accessorial", and carrier SCAC codes must match precisely.
- **RRF fusion:** Qdrant's built-in Reciprocal Rank Fusion combines both result lists. A chunk that ranks highly in both lists scores very high; one that only appears in one list gets a moderate boost.

**Cross-encoder reranking:** After retrieval, the top 8 chunks are reranked by asking Claude to score each chunk's relevance to the query (0–1). This is more expensive but far more accurate than pure embedding similarity, especially for ambiguous questions. The top 4 reranked chunks are passed to the answering LLM.

---

## Guardrails Approach

Three-layer guardrail system:

1. **Pre-answer confidence threshold:** A preliminary confidence score is computed from retrieval similarity and rerank score alone. If this falls below **0.25**, the system returns `"NOT_FOUND"` immediately without calling the answering LLM as it is balanced which can also catch genuine misses and allows answers on short / sparse docs. Saves cost and prevents low-quality responses.

2. **LLM grounding instruction:** Claude Haiku is instructed via system prompt to answer *only* from provided excerpts, cite which excerpt it used, and return the exact string `"NOT_FOUND: ..."` if the answer isn't in context. Claude's instruction-following makes this highly reliable.

3. **Answer coverage check:** After Claude answers, we measure what fraction of the answer's tokens appear in the retrieved chunks. Low coverage (< 30%) on a non-"NOT_FOUND" answer is a signal of hallucination — this feeds into the final confidence score and can push it below the display threshold.

---

## Confidence Scoring Method

Three independent signals, weighted average:

```
confidence = 0.35 x retrieval_similarity
           + 0.45 x rerank_score
           + 0.20 x answer_coverage
```

| Signal | Source | Weight | Rationale |
|---|---|---|---|
| `retrieval_similarity` | Qdrant normalised score (0-1) | 35% | Fast proxy for chunk relevance |
| `rerank_score` | Claude cross-encoder score (0-1) | 45% | Most accurate relevance signal |
| `answer_coverage` | Token overlap: answer n chunks | 20% | Detects LLM drifting from context |

Scores are returned with every `/ask` response alongside individual signal values so reviewers can understand *why* a score is high or low.

Threshold: scores below **0.25** trigger the `guardrail_triggered: true` flag and the answer is replaced with a "not found" message.

---

## Code Structure

```
ultra-doc-intelligence/
├── backend/
│   ├── main.py              # FastAPI app - /upload, /ask, /extract endpoints
│   ├── ingestion.py         # Document parsing, semantic chunking, embedding, Qdrant upsert
│   ├── retrieval.py         # Hybrid search, cross-encoder reranking, confidence scoring, Claude Q & A
│   ├── extraction.py        # Structured field extraction via GPT-4o-mini JSON mode
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile           # Backend container
├── frontend/
│   ├── index.html           # HTML entry point
│   ├── vite.config.js       # Vite + proxy config
│   ├── package.json         # Node dependencies
│   └── src/
│       ├── App.jsx           # Root layout - sidebar + workspace
│       ├── index.css         # Global CSS variables and base styles
│       ├── main.jsx          # React entry point
│       ├── lib/
│       │   └── api.js        # API client - upload, ask, extract
│       └── components/
│           ├── UploadZone.jsx         # Drag and drop document uploader
│           ├── ChatPanel.jsx          # Q&A chat interface with sources
│           ├── ConfidenceMeter.jsx    # Confidence score visualisation
│           └── ExtractionPanel.jsx    # Structured extraction UI + JSON export
├── docker-compose.yml       # Qdrant + backend orchestration
├── .env.example             # Environment variable template
└── README.md
```

## API Reference

### `POST /upload`

Upload a logistics document for ingestion.

**Request:** `multipart/form-data` with `file` field (PDF, DOCX, or TXT).

**Response:**
```json
{
  "doc_id": "uuid",
  "filename": "rate_confirmation.pdf",
  "chunks": 18,
  "pages": 2,
  "message": "Document ingested successfully"
}
```

---

### `POST /ask`

Ask a natural language question about an uploaded document.

**Request:**
```json
{
  "doc_id": "uuid",
  "question": "What is the carrier rate?"
}
```

**Response:**
```json
{
  "answer": "The carrier rate is $2,450 for the full truckload. [Excerpt 1]",
  "sources": [
    {
      "chunk_index": 4,
      "text": "Agreed rate: $2,450.00 FTL. Payment terms: Net 30...",
      "rerank_score": 0.91
    }
  ],
  "confidence": 0.847,
  "confidence_breakdown": {
    "retrieval_similarity": 0.923,
    "rerank_score": 0.910,
    "answer_coverage": 0.612
  },
  "guardrail_triggered": false
}
```

---

### `POST /extract`

Extract structured shipment fields from an uploaded document.

**Request:**
```json
{ "doc_id": "uuid" }
```

**Response:**
```json
{
  "doc_id": "uuid",
  "extraction": {
    "shipment_id": "SHP-2024-00421",
    "shipper": "Acme Manufacturing LLC",
    "consignee": "Walmart Distribution Center #42",
    "pickup_datetime": "2024-03-15T08:00:00",
    "delivery_datetime": "2024-03-17T17:00:00",
    "equipment_type": "Dry Van",
    "mode": "FTL",
    "rate": 2450.00,
    "currency": "USD",
    "weight": 42000,
    "carrier_name": "Swift Transportation"
  },
  "fields_found": 11,
  "total_fields": 11
}
```

---

## Running Locally

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Python 3.11+
- OpenAI API key
- Anthropic API key

### 1. Clone and configure

```bash
git clone https://github.com/your-org/ultra-doc-intelligence
cd ultra-doc-intelligence

cp .env.example .env
```
Open the `.env` file in any text editor and add your API keys:

```
OPENAI_API_KEY=sk-...          # From platform.openai.com/api-keys
ANTHROPIC_API_KEY=sk-ant-...   # From console.anthropic.com/settings/keys
QDRANT_HOST=localhost
```

> Both OpenAI and Anthropic accounts need a minimum of $5 credit loaded to use the API.
> - OpenAI billing: [platform.openai.com/settings/billing](https://platform.openai.com/settings/billing)
> - Anthropic billing: [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing)

### 2. Start Qdrant

```bash
docker compose up qdrant -d
```

### 3. Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### Full Docker deployment

```bash
docker compose up --build
```

---

## Known Failure Cases

| Scenario | Behaviour | Mitigation |
|---|---|---|
| Scanned PDF (image-only) | `pdfplumber` extracts no text -> ingestion error | Add OCR fallback via `pytesseract` |
| Very short document (< 5 sentences) | Semantic chunking falls back to single chunk | Single-chunk path still works; retrieval less precise |
| Heavily tabular documents | Table cells extracted as pipe-separated text; complex nested tables may lose structure | Add dedicated table parser (Camelot/pdfplumber table API) |
| Ambiguous field values ("rate" appears multiple times) | Extraction may return the first or most prominent occurrence | Add field-level confidence per extraction value |
| Non-English documents | Embeddings and LLM degrade significantly | Add language detection; use multilingual embedding model |
| Rate reranking cost | Cross-encoder calls Claude per chunk (8 calls per query) | Cache rerank scores by (doc_id, query hash); use a local cross-encoder model for speed |
| Large documents (> 50 pages) | Extraction truncates to 12,000 chars | Chunk-based extraction with field-level merging |

> _Table generated with the help of [Claude AI](https://www.anthropic.com/claude) based on the failure use cases input._
---

## Improvement Ideas

1. **Local cross-encoder reranker** - replace Claude-based reranking with `cross-encoder/ms-marco-MiniLM-L-6-v2` to reduce latency and cost by ~80% on the `/ask` path.

2. **OCR pipeline** - add `pytesseract` / `AWS Textract` for scanned PDFs, which are common in older logistics workflows.

3. **Multi-document support** - allow querying across a set of documents (e.g. "compare the rates on these three confirmations") using a shared collection with `doc_id` as a payload filter.

4. **Persistent session store** - replace the in-memory `documents` dict with Redis or PostgreSQL to survive backend restarts.

5. **Fine-tuned extraction model** - fine-tune GPT-4o-mini or a smaller model on 500+ labelled logistics documents to improve extraction accuracy and reduce cost.

6. **Evaluation harness** - build a golden dataset of (document, question, answer) triples to continuously measure retrieval precision, answer accuracy, and confidence calibration across model updates.
