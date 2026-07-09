# tasky — HackwithBay 3.0 submission

**Team:** Subash Rajaseelan
**Live app:** https://tasky-liard-six.vercel.app
**Source:** https://github.com/Subashboy1230/tasky
**Tagline:** The graph-native Chief of Staff.

---

## The problem

Every task app on the market is a flat list. When a chief of staff opens their inbox in the morning, they get 50-100 candidate action items across email, meetings, Slack, and Linear — but the list format hides the *most valuable thing*: **which of these tasks are actually the same commitment, which nest under a bigger initiative, and which people are the connective tissue**.

Existing tools (Nummo, Motion, Todoist) miss this because they store tasks as rows, not as a graph. So you end up with three copies of "brief Karim on the Dallas conference" scattered across three sources, and no way to see that all of them link back to the same underlying meeting.

tasky treats every task, person, project, meeting, and email thread as first-class nodes in Neo4j — with real edges. The result: 75 flat candidates from Gmail + Granola collapse into 12 top-level tasks with 63 nested subtasks, and the app can answer questions like *"what's outstanding for Dallas conference?"* with one Cypher query.

---

## The graph model (Neo4j Aura)

### Nodes

```
(Person {email, name, aliases: [string], is_user})
(Task   {id, title, subtitle, status, tag, due_at, urgent, source, updated_at})
(Thread {gmail_thread_id, subject, last_message_at})
(Meeting {granola_meeting_id, title, date})
(Project {name})
(Function {id, name})
```

### Edges

```
(Task)-[:OWNED_BY]->(Person)         // Task's owner. Always is_user=true.
(Task)-[:MENTIONS]->(Person)         // Humans referenced INSIDE the task.
(Task)-[:COMMITTED_IN]->(Thread|Meeting)
(Task)-[:ABOUT]->(Project)
(Task)-[:BLOCKS]->(Task)
(Task)-[:DEPENDS_ON]->(Task)
(Task)-[:SUBTASK_OF]->(Task)         // Created by the auto-cluster pass.
(Task)-[:DUPLICATE_OF]->(Task)
(Task)-[:TAGGED_WITH]->(Function)
(Person)-[:PARTICIPATED_IN]->(Thread|Meeting)
```

### Graph-native features the model enables

- **Auto-cluster pass** (`CLUSTER_PROJECT_TASKS`, `CLUSTER_MEETING_TASKS`): finds any Project/Meeting with 2+ open top-level user-owned tasks, elects an anchor by tag priority (`commit > action > reply > fyi`, then most recent), demotes the rest via `SUBTASK_OF`. Idempotent MERGE.
- **Judge context injection** (`FIND_NEARBY_TASKS`): a shortest-path Cypher query pulls the top 10 neighboring open tasks for each candidate before the LLM decides keep/drop/merge/subtask.
- **Person alias merge** (`MERGE_PERSON`): reconciles LLM-emitted spelling variants (Kartik vs Karthik) by rewiring MENTIONS edges to a single canonical node and preserving the dropped name on `Person.aliases`.
- **"Connects to N" chips** on every task card, computed by a `shared_count` subquery on `LIST_OPEN_TASKS`.
- **Group-by view** (`/today`): flat, person, project, or meeting — driven by graph joins, not a groupBy on a flat table.
- **`/network`**: aggregate-per-entity view (top people, top projects, top meetings), each entity card links back to a filtered `/today`.

Every LLM extraction emits an `entities[]` array (person, project, company). Those become graph nodes with typed edges, so the auto-cluster passes and the connects-to counts populate automatically — no manual tagging.

---

## Butterbase integration

Butterbase AI Gateway is the shipping LLM path for every pipeline call in tasky:

- **Extract (Gmail)** — turns a thread into candidate action items (`lib/prompts/extract-gmail.ts`)
- **Extract (Granola)** — meeting transcripts → commitments (`lib/prompts/extract-granola.ts`)
- **Judge** — graph-aware second-pass reviewer that decides keep/drop/merge/subtask, chunked into windows of 20 to keep Haiku 4.5 JSON well-formed (`lib/rocketride/client.ts::judge`)
- **Ask the graph** — natural language → Cypher → Neo4j → results (`lib/graph/ask-the-graph.ts`)
- **Cognee sidecar** — Butterbase serves as the OpenAI-compatible LLM endpoint for Cognee's entity extraction (see below)

All calls route through `lib/butterbase/client.ts` with `BUTTERBASE_LLM_MODEL=anthropic/claude-haiku-4.5` by default. Every request carries a `prompt_id` and `prompt_version` for eval reproducibility.

The key architectural choice: Butterbase is both **primary LLM** for tasky *and* the **LLM backend for Cognee** — one credit pool, one model version, one observability surface for everything.

---

## RocketRide integration

**Status:** deployable manifests written; production deploy is aspirational pending account access.

`rocketride/pipelines/` contains full deployable pipeline manifests for `judge`, `extract-gmail`, `extract-granola`, and `brief`. Each ships with:

- `pipeline.yaml` — input/output JSON schemas, model config, response format (`strict_json` with `retry_on_parse_error: 1`), auto-chunking (`chunk_by: candidates, chunk_size: 20, on_chunk_error: naive_keep`), observability with field redaction
- `prompts/*.system.md` + `prompts/*.user.hbs` — externalized so `rocketride diff` can compare against `lib/prompts/*` for drift

`lib/rocketride/client.ts` reads `ROCKETRIDE_PIPELINE_JUDGE`, `ROCKETRIDE_PIPELINE_EXTRACT_GMAIL`, `ROCKETRIDE_PIPELINE_EXTRACT_GRANOLA`, `ROCKETRIDE_PIPELINE_BRIEF`. When they're set, the judge routes to RocketRide. When they're not (current state), the client silently falls back to Butterbase — no user-facing breakage.

`/api/debug/rocketride` short-circuits to `{"ok":true,"status":"not_configured"}` when env vars are missing, so nothing in the demo hints at a vendor that isn't wired.

Once RocketRide access is available, the deploy sequence is `rocketride deploy rocketride/pipelines/*.pipeline.yaml` → paste pipeline ids into env → done. See `rocketride/README.md`.

---

## Cognee (used — the killer differentiator)

Cognee OSS is wired as a Python FastAPI sidecar (`cognee/`) that shares tasky's Neo4j Aura instance as its graph backend.

**The pitch:** the AI brain and the task graph aren't parallel stores — they're the same store. Cognee's `DocumentChunk` and `Entity` nodes live in the same Neo4j graph alongside tasky's `Task`, `Person`, `Project`. One Cypher query can bridge from a task to a related document chunk to another related task, no ETL, no drift.

- `POST /api/cognee/add` — capture text or upload files
- `POST /api/cognee/search` — semantic + graph-grounded retrieval
- `/brain` page — capture panel + search panel
- `/api/debug/cognee` — health check

**Zero-OpenAI mode**: `cognee/docker-compose.yml` configures Cognee to route LLM calls through Butterbase (OpenAI-compatible endpoint) and run embeddings locally via `fastembed` (ONNX CPU inference, no API key). No OpenAI account required.

**Run it:** `cd cognee && docker compose up -d`

## Daytona

Not used in this submission.

---

## Full stack summary

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 App Router on Vercel | Server Components + streaming |
| Graph store | Neo4j Aura Free | Shared substrate for task graph + Cognee brain |
| LLM gateway | Butterbase | One credit pool for tasky + Cognee |
| Delegated OAuth | Composio v3 | Multi-account Gmail (personal + work) |
| Meetings | Granola direct API | Raw transcripts beat summaries |
| AI brain | Cognee OSS (sidecar) | Shared Neo4j = graph-native memory |
| LLM pipelines | Butterbase → RocketRide (aspirational) | Deployable manifests ready |

---

## What's deployed and demoable

- `/today` — flat + grouped views, per-task subtask nesting, "connects to N" chips
- `/network` — People, Projects, Meetings tiles with task counts
- `/graph` — natural language → Cypher → results (Ask the graph)
- `/brain` — Cognee capture + search
- `/connections` — Composio Gmail OAuth (multi-account)
- `/api/extract` — run the full extract → judge → merge → cluster pipeline
- `/api/debug/cluster` — post-judge cluster pass on demand
- `/api/debug/cluster-by-keyword` — escape-hatch clusterer (used to reconcile Dallas conference tasks)
- `/api/debug/inspect` — see what the graph knows about a task title
- `/api/debug/merge-person` — merge duplicate Person nodes (Kartik + Karthik case)
- `/api/debug/rocketride` — RocketRide health check (currently reports not_configured)
- `/api/debug/cognee` — Cognee sidecar health check

## Numbers from the live demo

Latest digest run:
- 19 Gmail threads + 40 Granola meetings ingested
- 75 candidate action items produced by extractors
- **12 tasks nested under 7 anchors** by the auto-cluster pass (Sigiq, High Jump, Joinergo, Advisors on Growth Podcast, GTM meeting) plus keyword cluster (Dallas conference)
- 6 duplicate person nodes merged (Karthik → Kartik with alias preservation)

---

Built for HackwithBay 3.0 · July 2026
