# CLAUDE.md — tasky briefing

Read this before making changes.

## What tasky is

The graph-native Chief of Staff. Tasky watches your inbox, meetings, and messages, extracts real commitments, and places them in a live property graph of people, projects, threads, and dependencies. Every task is a node. Every relationship is an edge. Every judgment consults the graph.

Built for [HackwithBay 3.0](https://hackwithbay.com) — the graph-aware agentic apps hackathon.

## The three mandatory hackathon tools (all must be load-bearing)

1. **Butterbase** — auth + DB + storage + AI Gateway + deploy. Every LLM call goes through Butterbase's AI Gateway.
2. **Neo4j** — the graph. The Judge actively Cypher-queries the graph on every candidate. Not a k/v mirror.
3. **RocketRide Cloud** — the pipelines. Every extract/judge/merge/brief flow runs on `cloud.rocketride.ai`.

**Judging criterion:** integrations that feel bolted on rather than load-bearing will be scored down. This is the single most important scoring axis. Every design decision below flows from it.

## Optional bonuses

- **Daytona** — sandbox for the reply drafter (generate → self-review → iterate → surface only what passes)
- **Cognee** — AI memory over the Neo4j graph (learns "Matthew never wants Friday meetings")

## Design decisions and why

- **Delegated OAuth via Composio v3** — one integration surface for Gmail, Calendar, Slack, and 100+ other SaaS apps. Tools-as-functions DX makes adding a new source one line.
- **Every LLM call via Butterbase AI Gateway** — no direct Anthropic/OpenAI clients anywhere in the codebase. Unified routing across Opus, GPT-5, Gemini.
- **No local pipelines** — extract/judge/merge/brief all run on RocketRide Cloud. The frontend only calls deployed pipeline endpoints.
- **Semantic dedup via graph neighborhood, not string hashes** — new candidates match existing tasks when they share people + project + verb in the graph. Cypher shortest-path replaces regex normalization.
- **Priority as graph structure** — task importance emerges from PageRank on `BLOCKS`/`DEPENDS_ON` edges, not from a manual P0/P1 field.

## Phased build plan (36 hours)

| Phase | Time | Deliverable |
|---|---|---|
| 0 — Setup | 2h | Butterbase + Neo4j Aura + RocketRide + Composio accounts. Env vars populated. `npm install` works. |
| 1 — Neo4j schema | 3h | `npm run schema:init` applies the schema. Test 5 Cypher queries in Aura browser. Seed with sample data. |
| 2 — Butterbase | 4h | Auth flow works. 3 flat tables provisioned (users, connections, feedback). AI Gateway routes to Opus. |
| 3 — RocketRide pipelines | 6h | Build 4 pipelines locally in VS Code extension. Deploy to cloud. Verify curl-able from Next.js. |
| 4 — Judge queries graph | 4h | Judge prompt gets a Cypher-generated context block before deciding keep/subtask/merge. |
| 5 — 3 demo features | 4h | (a) live graph judgment, (b) meeting prep from subgraph, (c) ask-the-graph NL→Cypher chat |
| 6 — Daytona (bonus) | 3h | Reply drafter iterates in sandbox |
| 7 — Cognee (bonus) | 2h | Preference learning over the graph |
| 8 — Ship | 4h | Demo video, submit via Butterbase MCP |

**If time gets tight:** cut Daytona (Phase 6) first, then Cognee (Phase 7). The mandatory three are non-negotiable.

## The graph model

```
Nodes:
  (Person)          real people (email addresses, meeting attendees, contact names)
  (Task)            commitment/action items
  (Thread)          email threads
  (Meeting)         calendar/meeting-recording events
  (Project)         inferred or explicit projects
  (Document)        attachments, notes, decks
  (Function)        user-defined categories (Product, GTM, Hiring, etc.)

Edges:
  (Task)-[:OWNED_BY]->(Person)                the user
  (Task)-[:MENTIONS]->(Person)                other people involved
  (Task)-[:COMMITTED_IN]->(Thread|Meeting)    source of the commitment
  (Task)-[:ABOUT]->(Project)                  what project this touches
  (Task)-[:BLOCKS]->(Task)                    downstream dependency
  (Task)-[:DEPENDS_ON]->(Task)                upstream dependency (inverse of BLOCKS)
  (Task)-[:SUBTASK_OF]->(Task)                nested under a parent task
  (Task)-[:DUPLICATE_OF]->(Task)              deduped canonical
  (Task)-[:TAGGED_WITH]->(Function)           function membership
  (Person)-[:PARTICIPATED_IN]->(Thread|Meeting)
  (Document)-[:ATTACHED_TO]->(Task|Meeting|Thread)
```

## The judge's Cypher (the load-bearing query)

Before deciding a candidate's fate, the Judge runs:

```cypher
// Find existing OPEN tasks that share the neighborhood with the candidate
MATCH (candidate_signal:Person {email: $candidate_person_email})
MATCH (candidate_signal)<-[:MENTIONS|:OWNED_BY]-(nearby:Task {status: 'open'})
WHERE nearby.updated_at > datetime() - duration('P14D')
OPTIONAL MATCH path = shortestPath((nearby)-[:ABOUT|:MENTIONS*..3]-(:Project {name: $candidate_project}))
RETURN nearby.id, nearby.title, nearby.parent_context,
       length(path) AS graph_distance
ORDER BY graph_distance ASC
LIMIT 10
```

That list of 10 nearby existing tasks is fed to the Judge prompt as the "possible parents / merge targets" block. Judge decides subtask_of / merge / new based on it. **This is the graph doing real work, not being a k/v mirror.**

## The three demo moments (spend budget here)

### 1. Live graph judgment
Split screen. Left: an email thread. Right: the Neo4j graph. Watch a candidate appear, a Cypher query fires, the Judge outputs `subtask_of: <existing_task_id>`, and the task nests under a parent.

### 2. Meeting prep as subgraph pull
Click a calendar event. A single Cypher query paints the 1-hop neighborhood around meeting attendees. The prep brief is composed from that subgraph.

### 3. "Ask the graph"
User types natural language. LLM → Cypher → graph + list.

## Pre-flight checklist (do NOW)

- [ ] Butterbase account + `ENJOY0707` promo code redeemed under Billing → Launch plan
- [ ] Neo4j Aura free tier provisioned (URI + auth saved)
- [ ] RocketRide VS Code extension installed + `cloud.rocketride.ai` account
- [ ] Composio account at `app.composio.dev` + Gmail connection tested
- [ ] (Optional) Daytona sandbox access
- [ ] (Optional) Cognee open source cloned
- [ ] Joined `#butterbase-support` Discord

## Rules for dev sessions

1. **Neo4j must be queried on every judgment.** If you ever cache the graph, you've killed the differentiation.
2. **No LLM call goes direct to a provider SDK.** All routes through Butterbase AI Gateway.
3. **No local pipelines.** Every extract/judge/merge/brief is a RocketRide Cloud invocation.
4. **Prompt versions bump on edit.** See the version constant at the top of each `lib/prompts/*.ts`.
