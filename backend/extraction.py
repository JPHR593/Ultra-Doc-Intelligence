import os
import json
from pathlib import Path

from openai import OpenAI
from ingestion import extract_text

oai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

SCHEMA = {
    "shipment_id": "string or null",
    "shipper": "string or null — company/person name",
    "consignee": "string or null — recipient company/person",
    "pickup_datetime": "ISO 8601 string or null",
    "delivery_datetime": "ISO 8601 string or null",
    "equipment_type": "string or null — e.g. Dry Van, Flatbed, Reefer",
    "mode": "string or null — e.g. FTL, LTL, Intermodal",
    "rate": "number or null — numeric value only",
    "currency": "string or null — e.g. USD, CAD",
    "weight": "number or null — numeric lbs or kg value",
    "carrier_name": "string or null",
}

SYSTEM_PROMPT = f"""You are a logistics data extractor. Extract shipment information from the provided document text.

Return ONLY a valid JSON object with exactly these fields:
{json.dumps(SCHEMA, indent=2)}

Rules:
- Use null for any field not found in the document.
- For dates/times, use ISO 8601 format (e.g. "2024-03-15T14:00:00").
- For rate and weight, return only the numeric value (no units, no currency symbols).
- Do not add extra fields. Do not add commentary outside the JSON.
"""


def extract_structured(doc_id: str, path: str, ext: str) -> dict:
    text, _ = extract_text(path, ext)

    text_snippet = text[:12000]

    response = oai.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Document text:\n\n{text_snippet}"},
        ],
        temperature=0,
    )

    raw = response.choices[0].message.content
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raw = raw.strip().lstrip("```json").rstrip("```").strip()
        data = json.loads(raw)

    result = {}
    for key in SCHEMA:
        result[key] = data.get(key)

    return {
        "doc_id": doc_id,
        "extraction": result,
        "fields_found": sum(1 for v in result.values() if v is not None),
        "total_fields": len(result),
    }
