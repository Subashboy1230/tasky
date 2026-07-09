# tasky

**The graph-native Chief of Staff.**

Every task manager treats your work as a flat list. That's a lie. Every task is a knot in a web of people, projects, threads, and dependencies. Tasky is the first CoS that thinks in graphs — extraction, judgment, and synthesis all query a live property graph.

Built for [HackwithBay 3.0](https://hackwithbay.com).

## Stack

| Layer | Tool | Purpose |
|---|---|---|
| Backend + auth + storage + AI gateway + deploy | **Butterbase** | six jobs, one tool |
| Graph database | **Neo4j Aura** | the star. every decision consults the graph |
| AI pipelines (extract, judge, graph-merge, brief-synth) | **RocketRide Cloud** | managed pipeline runtime |
| Delegated OAuth (Gmail, Calendar, Slack) | **Composio v3** | one integration, 100+ SaaS apps |
| Frontend | Next.js 15 App Router + Tailwind | deployed to Butterbase |
| Optional bonus — agent sandbox | Daytona | reply drafter iterates in isolation |
| Optional bonus — AI memory | Cognee | remembers preferences over the graph |

## The pitch (3-minute demo)

1. **Live graph judgment.** An email lands. A Cypher query fires against Neo4j, the Judge decides `subtask_of: <existing_task>`, and the task nests under a parent instead of appearing as new clutter.
2. **Meeting prep as a subgraph pull.** Click a calendar event. A single Cypher query paints the 1-hop neighborhood around the attendees — open commits, past decisions, unresolved threads. That subgraph is the brief.
3. **Ask the graph.** User types "what do I owe Matthew this week and what's blocking any of it?" LLM translates to Cypher, hits Neo4j, results render as graph + list.

## Setup

```bash
# 1. install
npm install

# 2. copy env template and fill in
cp .env.example .env.local

# 3. apply Neo4j schema (run against Aura or local Neo4j)
npm run schema:init

# 4. (optional) seed the graph with sample data
npm run graph:seed

# 5. run dev
npm run dev
```

## Env vars you need

See `.env.example` for the full list. Minimum to get running:

- `BUTTERBASE_URL`, `BUTTERBASE_API_KEY` — from `dashboard.butterbase.ai`
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` — from Neo4j Aura console
- `ROCKETRIDE_API_URL`, `ROCKETRIDE_API_KEY` — from `cloud.rocketride.ai`
- `COMPOSIO_API_KEY` — from `app.composio.dev`

## Repo layout

```
tasky/
├── app/                              Next.js pages
│   ├── layout.tsx                    root layout
│   ├── page.tsx                      / — home
│   ├── today/page.tsx                /today — task view over Neo4j
│   ├── graph/page.tsx                /graph — ask-the-graph chat + viz
│   ├── connections/page.tsx          /connections — Composio-managed sources
│   └── api/                          server routes
│       ├── extract/route.ts          POST — triggers RocketRide extract pipeline
│       ├── judge/route.ts            POST — triggers RocketRide judge pipeline
│       └── ask/route.ts              POST — NL → Cypher → Neo4j
├── lib/
│   ├── prompts/                      tasky's LLM prompt IP
│   │   ├── extract-gmail.ts
│   │   ├── extract-granola.ts
│   │   ├── judge.ts
│   │   ├── brief.ts
│   │   ├── meeting-prep.ts
│   │   └── work-only-filter.ts
│   ├── neo4j/
│   │   ├── client.ts                 driver setup
│   │   ├── schema.cypher             node + edge model
│   │   └── queries.ts                named Cypher queries
│   ├── composio/client.ts            OAuth + tool registry
│   ├── butterbase/client.ts          auth + DB + storage + AI Gateway
│   ├── rocketride/client.ts          calls deployed pipeline endpoints
│   ├── extract/
│   │   ├── gmail.ts                  connector via Composio
│   │   └── granola.ts                direct Bearer API
│   ├── graph/
│   │   ├── merge-item.ts             Cypher upsert for new tasks
│   │   ├── find-parent.ts            subtask-first shortest-path
│   │   └── ask-the-graph.ts          NL → Cypher
│   └── types.ts
├── pipelines/                        RocketRide pipeline definitions
│   ├── extract.pipeline.json         local — deploy via VS Code extension
│   ├── judge.pipeline.json
│   ├── graph-merge.pipeline.json
│   └── brief-synth.pipeline.json
└── scripts/
    ├── init-schema.ts                apply schema.cypher to Neo4j
    └── seed-graph.ts                 seed the graph with sample data
```

## Submission (July 9)

Paste into your AI agent (in the tasky repo context):

```
Submit my project to the hackathon.
Submission code: ENJOY0707
Hackathon slug: HackwithBay-0707
```
