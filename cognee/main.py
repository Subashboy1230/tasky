"""
Cognee OSS sidecar for tasky.

Wraps `cognee` (github.com/topoteretes/cognee) behind a tiny FastAPI so
the Next.js app can call it over HTTP. The key trick: we point Cognee
at the SAME Neo4j Aura instance tasky already uses, so the AI brain
and the task graph share a knowledge substrate. Cognee writes its own
node/edge labels (`DocumentChunk`, `Entity`, `is_a`, etc.) alongside
tasky's `Task`, `Person`, `Project` — cross-graph queries become
trivial.

Endpoints:
  POST /add       — accept text (JSON) or a file (multipart)
  POST /search    — { query, top_k } -> list of hits
  POST /reset     — wipe the Cognee data (useful before demos)
  GET  /health    — config summary + Cognee version

Runs on :8080 by default. See docker-compose.yml for the deploy path.
"""

import os
import io
from typing import Optional, List, Any, Dict

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import cognee


app = FastAPI(title="tasky · cognee brain")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://tasky-liard-six.vercel.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Cognee config ─────────────────────────────────────────────
#
# Cognee reads most of these from env at import time. We just
# double-check they are set and surface a helpful error if the sidecar
# is starting without a graph store or LLM.

REQUIRED_ENV = [
    # LLM — Cognee's default provider is OpenAI. Either OPENAI_API_KEY
    # OR (LLM_PROVIDER + LLM_API_KEY) must be set.
    ("OPENAI_API_KEY", "LLM_API_KEY"),
    # Graph store — we set neo4j via .env so Cognee shares the substrate.
    ("GRAPH_DATABASE_URL", "NEO4J_URI"),
    ("GRAPH_DATABASE_USERNAME", "NEO4J_USER"),
    ("GRAPH_DATABASE_PASSWORD", "NEO4J_PASSWORD"),
]


def check_config() -> Dict[str, bool]:
    """Return a dict of {env_var: is_set} for surfacing at /health."""
    seen: Dict[str, bool] = {}
    for group in REQUIRED_ENV:
        seen[group[0]] = any(os.getenv(k) for k in group)
    return seen


# ─── Models ────────────────────────────────────────────────────

class AddTextBody(BaseModel):
    text: str
    dataset: Optional[str] = "tasky-brain"
    metadata: Optional[Dict[str, Any]] = None


class SearchBody(BaseModel):
    query: str
    dataset: Optional[str] = "tasky-brain"
    top_k: Optional[int] = 5


class HealthResponse(BaseModel):
    ok: bool
    cognee_version: str
    config: Dict[str, bool]
    graph_backend: str
    vector_backend: str


# ─── Endpoints ─────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        cognee_version=getattr(cognee, "__version__", "unknown"),
        config=check_config(),
        graph_backend=os.getenv("GRAPH_DATABASE_PROVIDER", "kuzu"),
        vector_backend=os.getenv("VECTOR_DB_PROVIDER", "lancedb"),
    )


@app.post("/add")
async def add(
    body: Optional[AddTextBody] = None,
    file: Optional[UploadFile] = File(None),
    dataset: Optional[str] = Form(None),
):
    """Ingest text OR a file into the Cognee brain.

    Two paths:
      • JSON body:      POST /add  { text, dataset?, metadata? }
      • Multipart:      POST /add  file=@doc.pdf  dataset=tasky-brain
    """
    ds = (body.dataset if body else None) or dataset or "tasky-brain"

    if file is not None:
        # Cognee accepts a file path or raw bytes-like. We stream to a
        # temp file so Cognee's file-type dispatch can do its thing.
        import tempfile

        suffix = os.path.splitext(file.filename or "upload")[1] or ".txt"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            path = tmp.name

        try:
            await cognee.add(path, dataset_name=ds)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    elif body is not None:
        await cognee.add(body.text, dataset_name=ds)
    else:
        raise HTTPException(
            status_code=400,
            detail="Pass either a JSON body { text } or a multipart file.",
        )

    # `cognify` runs the knowledge-graph extraction + embedding steps.
    # This is the expensive call — expect a few seconds even for a
    # short snippet.
    await cognee.cognify(datasets=[ds])

    return {"ok": True, "dataset": ds, "message": "Ingested and cognified."}


@app.post("/search")
async def search(body: SearchBody):
    """Semantic + graph-grounded search over the brain."""
    try:
        # Cognee's search returns a list of dicts with text/score/edges.
        results: List[Any] = await cognee.search(
            query_text=body.query,
            datasets=[body.dataset or "tasky-brain"],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"cognee.search failed: {exc}")

    limited = results[: body.top_k or 5]
    return {
        "ok": True,
        "query": body.query,
        "dataset": body.dataset,
        "count": len(limited),
        "results": limited,
    }


@app.post("/reset")
async def reset():
    """Wipe all Cognee data. Fresh start for a demo."""
    try:
        await cognee.prune.prune_data()
        await cognee.prune.prune_system(metadata=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"prune failed: {exc}")
    return {"ok": True, "message": "Cognee data wiped."}
