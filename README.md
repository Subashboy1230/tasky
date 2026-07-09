# tasky

**The graph-native Chief of Staff.**

Every task manager treats your work as a flat list. That's a lie. Every task is a knot in a web of people, projects, threads, and meetings. Tasky is the first CoS that thinks in graphs — extraction, dedup judgment, and meeting prep all consult a live property graph in Neo4j before touching your task list.

Built for [HackwithBay 3.0](https://hackwithbay.com).

![tasky /today](https://raw.githubusercontent.com/Subashboy1230/tasky/main/docs/screenshot-today.png)

## What tasky does

1. **Pulls from every source you already use.** Two Gmail accounts (personal + work) via Composio v3 OAuth, Granola meeting transcripts via their public API. Slack, Calendar, Linear ready as soon as their auth configs are added.
2. **Runs one prompt per source through Claude.** Butterbase's OpenAI-compatible AI Gateway routes to Claude Haiku 4.5 or Opus 4.7. Prompt is strict — no reply-by-default, no cold outreach, transcript-first for meetings.
3. **Consults the graph before writing.** Every candidate goes through a Judge that runs a Cypher `shortestPath` against a 1-hop subgraph of nearby open tasks (shared people, projects, threads). Verdicts: keep, drop, merge, or nest as a subtask. Task count is a first-class quality metric.
4. **Writes into Neo4j.** Every Task node stores an `OWNED_BY`, `MENTIONS`, `COMMITTED_IN`, and `ABOUT` edge. Re-runs update the same node via a stable `sha1(source::source_ref::title)` id — no duplicates.
5. **Renders live.** `/today` reads from Neo4j via `LIST_OPEN_TASKS`. Clicking a task fires `TASK_CONTEXT` to paint the 1-hop subgraph in the detail panel. `/graph` lets you type "what do I owe Matthew this week?" and watch NL → Cypher → results.

## The story

An extraction is only as good as its ability to say **no**. Nine of ten emails should never become tasks. The bar for creating a top-level Task node is the same as adding a row to your to-do list at 3am after a long day — most things don't clear it. The graph is what makes that bar sit high: when a candidate looks like "Follow up with Anna", the Judge queries Neo4j for existing open tasks that mention Anna. If there's already `Send Q3 OKRs to Anna`, this becomes a subtask, not clutter.

## Stack

| Layer | Tool | Role |
|---|---|---|
| Backend + AI Gateway | **Butterbase** | OpenAI-compatible `/v1/chat/completions`, Claude Haiku 4.5 by default, Opus 4.7 for the Judge |
| Graph database | **Neo4j Aura** | every extraction, every judgment, every render consults it |
| Delegated OAuth | **Composio v3** | `connectedAccounts.link` for multi-account Gmail, one integration surface |
| Meeting notes | **Granola** direct Bearer API | transcripts + summaries |
| Pipeline runtime (optional) | **RocketRide Cloud** | judge falls back to Butterbase AI when RocketRide isn't deployed |
| Frontend | Next.js 15 App Router + Tailwind + shadcn palette | dark, dense, taskbash-style |

## How it works

```
        ┌───────────────────────────────────────────────────────────────────┐
        │                    Run digest button on /today                    │
        └────────────────────────────────┬──────────────────────────────────┘
                                         │ POST /api/extract
                                         ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                              extract phase                              │
   │  ┌───────────────────┐  ┌───────────────────┐                           │
   │  │ Composio v3 Gmail │  │ Granola public API│                           │
   │  │  (n accounts,     │  │  (last N days,    │                           │
   │  │   parallelized)   │  │   parallel 4)     │                           │
   │  └────────┬──────────┘  └────────┬──────────┘                           │
   │           └────────────┬─────────┘                                       │
   │                        ▼                                                 │
   │         per-thread prompt through Butterbase AI Gateway                 │
   │             (Claude Haiku 4.5, concurrency 5)                           │
   └────────────────────────┬────────────────────────────────────────────────┘
                            ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                              judge phase                                │
   │   candidates × Cypher-derived graph_context × cleared_context           │
   │   → Butterbase AI (Opus 4.7 / Haiku 4.5) → verdicts:                    │
   │     keep · drop · merge(target_id) · subtask(target_id | parent_idx)    │
   └────────────────────────┬────────────────────────────────────────────────┘
                            ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                          graph merge phase                              │
   │   stable id = sha1(source::source_ref::normalized_title).slice(0,24)    │
   │   UPSERT_TASK creates Task + OWNED_BY + MENTIONS + COMMITTED_IN         │
   │   + ABOUT + (optional) SUBTASK_OF edges in one MERGE                    │
   └────────────────────────┬────────────────────────────────────────────────┘
                            ▼
                     Neo4j Aura ── LIST_OPEN_TASKS ──► /today
                                └─ TASK_CONTEXT ────► detail panel
                                └─ ASK_THE_GRAPH ──► /graph
```

## Setup

```bash
# 1. install
npm install

# 2. copy env template and fill in
cp .env.example .env.local

# 3. apply Neo4j schema (creates constraints + indexes on Aura)
npm run schema:init

# 4. optional — seed with sample data for a first look
npm run graph:seed

# 5. dev
npm run dev
```

## Env vars

Minimum to get running (all in `.env.local`, see `.env.example`):

```
BUTTERBASE_URL=https://api.butterbase.ai
BUTTERBASE_API_KEY=bb_sk_...
BUTTERBASE_PROJECT_ID=<org id from dashboard>
BUTTERBASE_LLM_MODEL=anthropic/claude-haiku-4.5

NEO4J_URI=neo4j+s://<instance>.databases.neo4j.io
NEO4J_USER=<from Aura>
NEO4J_PASSWORD=<from Aura>

COMPOSIO_API_KEY=ak_...
COMPOSIO_ENTITY_ID=default
COMPOSIO_GMAIL_AUTH_CONFIG=ac_...

GRANOLA_API_KEY=grn_...

APP_USER_EMAIL=you@example.com
TASKY_PERMISSIVE_EXTRACT=true

# Optional — deploy RocketRide pipelines and drop their ids here to
# route extract/judge through RocketRide instead of direct AI Gateway.
ROCKETRIDE_API_URL=https://cloud.rocketride.ai/api
ROCKETRIDE_API_KEY=rr_...
ROCKETRIDE_PIPELINE_EXTRACT=
ROCKETRIDE_PIPELINE_JUDGE=
```

## Repo layout

```
tasky/
├── app/
│   ├── layout.tsx                        sidebar-shell layout
│   ├── page.tsx                          / — home
│   ├── today/
│   │   ├── page.tsx                      Server Component, reads Neo4j
│   │   ├── today-view.tsx                Client wrapper, Run digest + filters
│   │   ├── task-card.tsx                 one row
│   │   └── task-detail-sheet.tsx         right-side slide-in, TASK_CONTEXT Cypher
│   ├── graph/page.tsx                    /graph — natural language → Cypher
│   ├── connections/                      /connections — source status
│   ├── activity/page.tsx                 /activity — every (:Run) node
│   ├── workflows/page.tsx                /workflows — pipeline catalog
│   ├── _components/sidebar.tsx           taskbash-style dark sidebar
│   └── api/
│       ├── extract/route.ts              POST — full digest orchestration
│       ├── ask/route.ts                  POST — /graph NL→Cypher
│       ├── connect/[app]/route.ts        GET — Composio OAuth kickoff
│       ├── task/[id]/context/route.ts    GET — subgraph for detail panel
│       └── debug/                        gmail | ai | wipe — smoke tests
├── lib/
│   ├── prompts/                          extraction + judge prompt IP
│   │   ├── extract-gmail.ts              reply-discipline, cold-email filter
│   │   ├── extract-granola.ts            transcript-first, aggressive minimization
│   │   ├── judge.ts                      subtask-first, cleared-item HARD rule
│   │   ├── brief.ts
│   │   ├── meeting-prep.ts
│   │   └── work-only-filter.ts
│   ├── neo4j/
│   │   ├── client.ts                     driver singleton + Integer normalizer
│   │   ├── schema.cypher                 constraints, indexes, node/edge docs
│   │   └── queries.ts                    LIST_OPEN_TASKS, UPSERT_TASK, TASK_CONTEXT,
│   │                                     FIND_NEARBY_TASKS, MEETING_SUBGRAPH,
│   │                                     RECORD_RUN, LIST_RUNS, ASK_THE_GRAPH_WRAPPER
│   ├── composio/client.ts                v3 SDK, allowMultiple, per-account execute
│   ├── butterbase/client.ts              /v1/chat/completions OpenAI-shape
│   ├── rocketride/client.ts              pipeline invoker + Butterbase AI fallback
│   ├── extract/
│   │   ├── gmail.ts                      Composio v3 + Butterbase AI, parallel 5
│   │   ├── granola.ts                    Granola API + Butterbase AI, parallel 4
│   │   └── synthesize.ts                 demo-mode fallback (no live sources)
│   ├── graph/
│   │   ├── merge-item.ts                 stable-id UPSERT
│   │   ├── find-parent.ts                subtask-first shortestPath
│   │   └── ask-the-graph.ts              NL → Cypher, READ_ONLY guard
│   └── types.ts
├── pipelines/                            RocketRide pipeline definitions
│   ├── extract.pipeline.json
│   ├── judge.pipeline.json
│   ├── graph-merge.pipeline.json
│   └── brief-synth.pipeline.json
└── scripts/
    ├── init-schema.ts
    └── seed-graph.ts
```

## Design choices worth naming

- **Graph as the source of truth.** Postgres would have been faster to ship. But the entire pitch is that the CoS thinks in graphs — extraction, dedup, meeting prep are all subgraph queries. Choosing Postgres would have been choosing to be another to-do app.
- **Subtask-first Judge.** Most extractors default to `keep`. Ours defaults to `subtask`. Anything that could plausibly nest under an existing task must nest. The failure mode of a shipped Judge is over-keeping, not over-nesting.
- **Stable id from source_ref + title.** No random UUIDs. Re-running the digest on the same email thread updates the existing node. The graph never accumulates duplicates from repeated runs.
- **Multi-account Gmail on one Composio user.** `connectedAccounts.link(userId, authConfigId, { allowMultiple: true })` + per-account `execute({ connectedAccountId })`. Enumerating connected accounts at extract time means adding a new inbox is one OAuth click, no code change.
- **RocketRide optional.** The judge and extract paths both work without a deployed RocketRide pipeline — they call Butterbase AI Gateway directly. If you deploy RocketRide, drop the pipeline IDs in env and the same functions route through RocketRide instead. No branching logic in the app.

## Submission

HackwithBay 3.0 — code `ENJOY0707`, slug `HackwithBay-0707`.

## License

MIT.
