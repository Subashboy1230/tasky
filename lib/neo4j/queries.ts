// Named Cypher queries used across the app.
//
// Every query is a plain string constant so we can grep for it, run it
// in the Aura browser to debug, and version it in git without wrapping.
// Parameters are always named, never inlined via template literal.

// ─── Judge — find nearby tasks in the neighborhood ──────────────
//
// Given a candidate's (owner email, mentioned people, source thread,
// project name), return the top 10 OPEN tasks that share the most
// neighbors with the candidate. Sorted by graph distance (shortest = closest).
//
// This is the query that makes Neo4j load-bearing for the Judge.

export const FIND_NEARBY_TASKS = `
MATCH (owner:Person {email: $ownerEmail})
OPTIONAL MATCH (owner)<-[:OWNED_BY|MENTIONS]-(t:Task)
WHERE t.status = 'open'
  AND t.updated_at > datetime() - duration({days: 30})
WITH DISTINCT t, owner

// Score each candidate task by shared people, thread, project.
OPTIONAL MATCH (t)-[:MENTIONS]->(p:Person)
  WHERE p.email IN $mentionedEmails
WITH t, count(p) AS shared_people

OPTIONAL MATCH (t)-[:COMMITTED_IN]->(src)
  WHERE src.gmail_thread_id = $threadId OR src.granola_meeting_id = $meetingId
WITH t, shared_people, count(src) AS shared_source

OPTIONAL MATCH (t)-[:ABOUT]->(proj:Project {name: $projectName})
WITH t, shared_people, shared_source, count(proj) AS shared_project

WITH t, shared_people + shared_source * 2 + shared_project * 3 AS score

WHERE score > 0
RETURN t.id AS id,
       t.title AS title,
       t.subtitle AS subtitle,
       t.parent_context AS parent_context,
       t.source AS source,
       t.status AS status,
       score AS graph_score
ORDER BY graph_score DESC, t.updated_at DESC
LIMIT 10
`

// ─── Judge — recently cleared tasks (drop-list) ─────────────────

export const FIND_RECENTLY_CLEARED = `
MATCH (t:Task)
WHERE t.status IN ['completed', 'dismissed', 'snoozed']
  AND t.updated_at > datetime() - duration({days: 30})
RETURN t.id AS id,
       t.title AS title,
       t.status AS status,
       t.source AS source,
       toString(t.updated_at) AS cleared_at
ORDER BY t.updated_at DESC
LIMIT 100
`

// ─── Merge — upsert Task + edges from a judged item ─────────────
//
// Runs after the Judge accepts a candidate (verdict = keep or subtask).
// Handles Task node, OWNED_BY, MENTIONS, COMMITTED_IN, ABOUT, and
// (when subtask) SUBTASK_OF.

export const UPSERT_TASK = `
// Ensure the owner exists
MERGE (owner:Person {email: $ownerEmail})
  ON CREATE SET owner.name = $ownerName, owner.is_user = true

// Upsert the Task node
MERGE (t:Task {id: $taskId})
  ON CREATE SET t.first_seen_at = datetime()
SET t.title = $title,
    t.subtitle = $subtitle,
    t.status = $status,
    t.tag = $tag,
    t.due_at = CASE WHEN $dueAt IS NULL THEN NULL ELSE datetime($dueAt) END,
    t.urgent = $urgent,
    t.parent_context = $parentContext,
    t.source = $source,
    t.updated_at = datetime()

MERGE (t)-[:OWNED_BY]->(owner)

// Mentioned people
WITH t
UNWIND $mentioned AS m
  MERGE (p:Person {email: m.email})
    ON CREATE SET p.name = m.name, p.is_user = false
  MERGE (t)-[:MENTIONS]->(p)

// Optional COMMITTED_IN edge (thread or meeting)
WITH t
FOREACH (_ IN CASE WHEN $threadId IS NOT NULL THEN [1] ELSE [] END |
  MERGE (th:Thread {gmail_thread_id: $threadId})
    ON CREATE SET th.subject = $threadSubject
  MERGE (t)-[:COMMITTED_IN]->(th)
)
FOREACH (_ IN CASE WHEN $meetingId IS NOT NULL THEN [1] ELSE [] END |
  MERGE (m:Meeting {granola_meeting_id: $meetingId})
    ON CREATE SET m.title = $meetingTitle
  MERGE (t)-[:COMMITTED_IN]->(m)
)

// Projects (multiple per task). FOREACH tolerates an empty list;
// UNWIND on empty would drop the variable and kill the query.
WITH t
FOREACH (projName IN $projects |
  MERGE (proj:Project {name: projName})
  MERGE (t)-[:ABOUT]->(proj)
)

// Optional subtask nesting (when the Judge said subtask_target_id).
// Cypher disallows MATCH inside FOREACH, so we lift the parent lookup
// to an OPTIONAL MATCH at the outer level and let FOREACH create the
// SUBTASK_OF edge only when the parent actually resolved.
WITH t
OPTIONAL MATCH (parent:Task {id: $parentTaskId})
FOREACH (_ IN CASE WHEN parent IS NOT NULL THEN [1] ELSE [] END |
  MERGE (t)-[:SUBTASK_OF]->(parent)
)

RETURN t.id AS id
`

// ─── Meeting prep — pull the 1-hop subgraph around attendees ────

export const MEETING_SUBGRAPH = `
MATCH (attendee:Person)
WHERE attendee.email IN $attendeeEmails

// Open tasks that involve these attendees
OPTIONAL MATCH (attendee)<-[:MENTIONS|OWNED_BY]-(t:Task {status: 'open'})
WITH attendee, collect(DISTINCT { title: t.title, owner_email: attendee.email, created_at: toString(t.first_seen_at), source: t.source }) AS open_tasks

// Past meetings with these attendees
OPTIONAL MATCH (attendee)-[:PARTICIPATED_IN]->(m:Meeting)
  WHERE m.date > datetime() - duration({days: 60})
WITH attendee, open_tasks, collect(DISTINCT { title: m.title, date: toString(m.date) }) AS past_meetings

// Threads with these attendees
OPTIONAL MATCH (attendee)-[:PARTICIPATED_IN]->(th:Thread)
WITH attendee, open_tasks, past_meetings, collect(DISTINCT { subject: th.subject, last_message_at: toString(th.last_message_at), unresolved: true }) AS threads

// Projects the attendees touch
OPTIONAL MATCH (attendee)<-[:MENTIONS]-(:Task)-[:ABOUT]->(proj:Project)
WITH attendee, open_tasks, past_meetings, threads, collect(DISTINCT { name: proj.name, recent_activity: 'via task mentions' }) AS projects

RETURN attendee.email AS email,
       attendee.name AS name,
       open_tasks,
       past_meetings,
       threads,
       projects
`

// ─── /today — list all open top-level tasks for the user ────────

export const LIST_OPEN_TASKS = `
MATCH (t:Task {status: 'open'})
WHERE NOT (t)-[:SUBTASK_OF]->(:Task)
  AND (t)-[:OWNED_BY]->(:Person {email: $userEmail, is_user: true})
// Count neighbors: other open tasks that share a Person or Project with this one.
CALL {
  WITH t
  OPTIONAL MATCH (t)-[:MENTIONS|ABOUT]->(shared)<-[:MENTIONS|ABOUT]-(other:Task {status: 'open'})
  WHERE other.id <> t.id
  RETURN count(DISTINCT other) AS shared_count
}
OPTIONAL MATCH (t)-[:MENTIONS]->(p:Person)
OPTIONAL MATCH (t)-[:ABOUT]->(proj:Project)
OPTIONAL MATCH (sub:Task)-[:SUBTASK_OF]->(t) WHERE sub.status = 'open'
RETURN t.id AS id,
       t.title AS title,
       t.subtitle AS subtitle,
       t.tag AS tag,
       t.urgent AS urgent,
       toString(t.due_at) AS due_at,
       toString(t.updated_at) AS updated_at,
       t.source AS source,
       t.parent_context AS parent_context,
       collect(DISTINCT p.name) AS mentioned,
       collect(DISTINCT proj.name) AS projects,
       count(DISTINCT sub) AS subtask_count,
       shared_count
ORDER BY urgent DESC, due_at ASC, updated_at DESC
`

// ─── Post-judge cluster pass ─────────────────────────────────────
//
// For each Project (or Meeting) that has 3+ open top-level tasks
// owned by the user, elect an anchor (highest-tag priority commit >
// action > reply > fyi, then most recently seen) and demote the rest
// to SUBTASK_OF that anchor. This is the graph doing the roll-up the
// judge misses when related candidates land in different chunks.

export const CLUSTER_PROJECT_TASKS = `
MATCH (p:Project)<-[:ABOUT]-(t:Task {status: 'open'})
WHERE (t)-[:OWNED_BY]->(:Person {email: $userEmail, is_user: true})
  AND NOT (t)-[:SUBTASK_OF]->(:Task)
WITH p, collect(t) AS tasks
WHERE size(tasks) >= 3

// Rank each task by (tag priority desc, updated_at desc) so the anchor
// is deterministic. commit > action > reply > fyi.
UNWIND tasks AS t
WITH p, tasks, t,
     CASE t.tag
       WHEN 'commit' THEN 4
       WHEN 'action' THEN 3
       WHEN 'reply' THEN 2
       WHEN 'fyi'   THEN 1
       ELSE 0
     END AS priority
ORDER BY priority DESC, t.updated_at DESC
WITH p, tasks, collect(t) AS ordered_tasks
WITH p, ordered_tasks[0] AS anchor, ordered_tasks[1..] AS children

// Nest each non-anchor task under the anchor.
UNWIND children AS child
MERGE (child)-[:SUBTASK_OF]->(anchor)

RETURN p.name AS project,
       anchor.id AS anchor_id,
       anchor.title AS anchor_title,
       count(child) AS nested_count
`

export const CLUSTER_MEETING_TASKS = `
MATCH (m:Meeting)<-[:COMMITTED_IN]-(t:Task {status: 'open'})
WHERE (t)-[:OWNED_BY]->(:Person {email: $userEmail, is_user: true})
  AND NOT (t)-[:SUBTASK_OF]->(:Task)
  AND NOT (t)-[:ABOUT]->(:Project)     // don't double-nest if project cluster already handled it
WITH m, collect(t) AS tasks
WHERE size(tasks) >= 3

UNWIND tasks AS t
WITH m, tasks, t,
     CASE t.tag
       WHEN 'commit' THEN 4
       WHEN 'action' THEN 3
       WHEN 'reply' THEN 2
       WHEN 'fyi'   THEN 1
       ELSE 0
     END AS priority
ORDER BY priority DESC, t.updated_at DESC
WITH m, tasks, collect(t) AS ordered_tasks
WITH m, ordered_tasks[0] AS anchor, ordered_tasks[1..] AS children

UNWIND children AS child
MERGE (child)-[:SUBTASK_OF]->(anchor)

RETURN m.title AS meeting,
       anchor.id AS anchor_id,
       anchor.title AS anchor_title,
       count(child) AS nested_count
`

// ─── /network — people and projects the user has open work with ──

export const NETWORK_PEOPLE = `
MATCH (t:Task {status: 'open'})-[:MENTIONS]->(p:Person)
WHERE (t)-[:OWNED_BY]->(:Person {email: $userEmail, is_user: true})
  AND NOT p.is_user = true
RETURN p.name AS name,
       p.email AS email,
       count(DISTINCT t) AS task_count,
       sum(CASE WHEN t.urgent = true THEN 1 ELSE 0 END) AS urgent_count,
       collect(DISTINCT { id: t.id, title: t.title, tag: t.tag, urgent: t.urgent })[..3] AS preview
ORDER BY task_count DESC, urgent_count DESC
LIMIT 40
`

export const NETWORK_PROJECTS = `
MATCH (t:Task {status: 'open'})-[:ABOUT]->(p:Project)
WHERE (t)-[:OWNED_BY]->(:Person {email: $userEmail, is_user: true})
RETURN p.name AS name,
       count(DISTINCT t) AS task_count,
       sum(CASE WHEN t.urgent = true THEN 1 ELSE 0 END) AS urgent_count,
       collect(DISTINCT { id: t.id, title: t.title, tag: t.tag, urgent: t.urgent })[..3] AS preview
ORDER BY task_count DESC, urgent_count DESC
LIMIT 40
`

export const NETWORK_MEETINGS = `
MATCH (t:Task {status: 'open'})-[:COMMITTED_IN]->(m:Meeting)
WHERE (t)-[:OWNED_BY]->(:Person {email: $userEmail, is_user: true})
RETURN m.title AS name,
       m.granola_meeting_id AS ref,
       count(DISTINCT t) AS task_count,
       sum(CASE WHEN t.urgent = true THEN 1 ELSE 0 END) AS urgent_count,
       collect(DISTINCT { id: t.id, title: t.title, tag: t.tag, urgent: t.urgent })[..3] AS preview
ORDER BY task_count DESC
LIMIT 20
`

// ─── Task detail — pull the 1-hop context around one task ──────
//
// Used by the /today detail panel to render Subtasks + Context Trail +
// Related tasks in one round-trip.

export const TASK_CONTEXT = `
MATCH (t:Task {id: $taskId})

// Subtasks
OPTIONAL MATCH (sub:Task)-[:SUBTASK_OF]->(t)
WITH t, collect(DISTINCT CASE WHEN sub IS NULL THEN NULL ELSE {
  id: sub.id, title: sub.title, status: sub.status, tag: sub.tag
} END) AS subtasks_raw

// Mentioned people
OPTIONAL MATCH (t)-[:MENTIONS]->(p:Person)
WITH t, subtasks_raw, collect(DISTINCT CASE WHEN p IS NULL THEN NULL ELSE {
  email: p.email, name: p.name
} END) AS people_raw

// Projects
OPTIONAL MATCH (t)-[:ABOUT]->(proj:Project)
WITH t, subtasks_raw, people_raw, collect(DISTINCT proj.name) AS projects_raw

// Source event (Thread or Meeting)
OPTIONAL MATCH (t)-[:COMMITTED_IN]->(src)
WITH t, subtasks_raw, people_raw, projects_raw,
  head(collect(DISTINCT CASE
    WHEN src:Thread THEN { kind: 'thread', label: src.subject, ref: src.gmail_thread_id }
    WHEN src:Meeting THEN { kind: 'meeting', label: src.title, ref: src.granola_meeting_id }
    ELSE NULL
  END)) AS source_event

// Related tasks (share ≥1 person or project with this task, excluding self)
OPTIONAL MATCH (t)-[:MENTIONS|ABOUT]->(shared)<-[:MENTIONS|ABOUT]-(rel:Task)
WHERE rel.id <> t.id AND rel.status = 'open'
WITH t, subtasks_raw, people_raw, projects_raw, source_event,
     rel, count(DISTINCT shared) AS overlap
ORDER BY overlap DESC
WITH t, subtasks_raw, people_raw, projects_raw, source_event,
     collect(DISTINCT CASE WHEN rel IS NULL THEN NULL ELSE {
       id: rel.id, title: rel.title, tag: rel.tag, overlap: overlap
     } END)[..5] AS related_raw

RETURN t.id AS id,
       t.title AS title,
       t.subtitle AS subtitle,
       t.tag AS tag,
       t.urgent AS urgent,
       t.source AS source,
       t.parent_context AS parent_context,
       toString(t.due_at) AS due_at,
       toString(t.first_seen_at) AS first_seen_at,
       [x IN subtasks_raw WHERE x IS NOT NULL] AS subtasks,
       [x IN people_raw WHERE x IS NOT NULL] AS people,
       [x IN projects_raw WHERE x IS NOT NULL AND x <> ''] AS projects,
       source_event,
       [x IN related_raw WHERE x IS NOT NULL] AS related
`

// ─── Runs — pipeline history for the /activity page ────────────

export const RECORD_RUN = `
CREATE (r:Run {
  id: $runId,
  started_at: datetime($startedAt),
  completed_at: datetime($completedAt),
  sources: $sources,
  extracted: $extracted,
  kept: $kept,
  nested_subtasks: $nestedSubtasks,
  dropped: $dropped,
  graph_context_used: $graphContextUsed,
  status: $status,
  error: $error
})
RETURN r.id AS id
`

export const LIST_RUNS = `
MATCH (r:Run)
RETURN r.id AS id,
       toString(r.started_at) AS started_at,
       toString(r.completed_at) AS completed_at,
       r.sources AS sources,
       r.extracted AS extracted,
       r.kept AS kept,
       r.nested_subtasks AS nested_subtasks,
       r.dropped AS dropped,
       r.graph_context_used AS graph_context_used,
       r.status AS status,
       r.error AS error
ORDER BY r.started_at DESC
LIMIT 30
`

// ─── Ask-the-graph — a safe read-only query executor ────────────
//
// The NL→Cypher pipeline generates a Cypher string. We execute it in a
// read-only session, capped at a reasonable row limit.

export const ASK_THE_GRAPH_WRAPPER = (userGeneratedCypher: string): string => `
CALL {
  ${userGeneratedCypher}
}
LIMIT 100
`
