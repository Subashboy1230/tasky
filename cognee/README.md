# Cognee sidecar for tasky

[Cognee](https://github.com/topoteretes/cognee) is an OSS AI memory
layer — you feed it text or documents, it extracts entities and
relationships, embeds everything, and lets any agent query it across
sessions.

We run Cognee as a small Python FastAPI service alongside tasky. The
Next.js app calls it over HTTP for capture (`/api/cognee/add`) and
retrieval (`/api/cognee/search`), and the `/brain` page is the user
surface.

## Why the sidecar

tasky is a Next.js app on Vercel. Cognee is Python-first with no
first-class JS SDK. Wrapping it in FastAPI keeps deployment sane:

- Cognee owns its own venv, embedding cache, and vector store
- The Next.js app treats it like any external service
- Local dev is `docker compose up -d` once and forget

## The killer trick — shared Neo4j

Cognee supports Neo4j as its graph backend. We point it at the SAME
Neo4j Aura instance tasky writes to. Result: Cognee's `DocumentChunk`
and `Entity` nodes live alongside tasky's `Task`, `Person`, `Project`
in one graph. Cross-graph queries become trivial — you can ask
questions like "which of my open tasks reference the same entities
that appear in this uploaded due-diligence doc?" and answer with a
single Cypher query.

## Files

```
cognee/
├── README.md             ← this file
├── main.py               ← FastAPI wrapper (POST /add, /search, /reset, GET /health)
├── requirements.txt      ← cognee + fastapi + uvicorn
├── Dockerfile
└── docker-compose.yml    ← reads ../.env.local, points Cognee at tasky's Neo4j
```

## Run it

Prereqs:

- Docker + docker compose
- `.env.local` at the repo root with `NEO4J_URI`, `NEO4J_USER`,
  `NEO4J_PASSWORD` (already required for tasky itself)
- An LLM API key — either `OPENAI_API_KEY` (Cognee's default) or
  `LLM_PROVIDER=anthropic` + `LLM_API_KEY=<your key>`

Start:

```bash
cd cognee
docker compose up -d
docker compose logs -f cognee    # watch it come up
```

The sidecar listens on `http://localhost:8080`.

Sanity check:

```bash
curl http://localhost:8080/health
# { "ok": true, "cognee_version": "...", "graph_backend": "neo4j", ... }
```

From the tasky side:

```bash
curl -X POST http://localhost:3000/api/debug/cognee
# should return { ok: true, sidecar: { ok: true, ... } }
```

## Ingest something

```bash
# Text
curl -X POST http://localhost:8080/add \
  -H 'content-type: application/json' \
  -d '{"text": "Anna Choi runs partnerships at Nummo. She and Kartik met at ASU+GSV 2026 to discuss the Q3 pilot expansion."}'

# File
curl -X POST http://localhost:8080/add \
  -F 'file=@./some-doc.pdf'
```

Or use the `/brain` page in the tasky UI.

## Query

```bash
curl -X POST http://localhost:8080/search \
  -H 'content-type: application/json' \
  -d '{"query": "who runs partnerships at Nummo?", "top_k": 3}'
```

## Reset before a demo

```bash
curl -X POST http://localhost:8080/reset
```

This wipes Cognee's document store + embeddings. It does NOT wipe
tasky's Task/Person/Project nodes in Neo4j (those live under different
labels), but Cognee's `Entity` nodes and any labels it created ARE
removed.

## Follow-up ideas

- Wire `askTheGraph` to also call Cognee's `/search` and blend results
  with the Cypher output. Right now the brain and the task graph are
  parallel; augmentation would fuse them.
- Add a per-task "Send to brain" button on the /today detail sheet that
  captures the task title + subtitle + Context Trail into Cognee.
- Cron a nightly job that dumps closed tasks (last N days) into Cognee
  so long-term context accumulates without user work.
