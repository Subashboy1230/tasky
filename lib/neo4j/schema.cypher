// tasky graph schema
//
// Apply with: npm run schema:init
//
// The graph is where every judgment happens. Every extractor's output
// gets merged in via lib/graph/merge-item.ts, and every Judge decision
// consults it via lib/graph/find-parent.ts.

// ─── Constraints (uniqueness) ─────────────────────────────────────

CREATE CONSTRAINT task_id_unique IF NOT EXISTS
FOR (t:Task) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT person_email_unique IF NOT EXISTS
FOR (p:Person) REQUIRE p.email IS UNIQUE;

CREATE CONSTRAINT thread_id_unique IF NOT EXISTS
FOR (t:Thread) REQUIRE t.gmail_thread_id IS UNIQUE;

CREATE CONSTRAINT meeting_id_unique IF NOT EXISTS
FOR (m:Meeting) REQUIRE m.granola_meeting_id IS UNIQUE;

CREATE CONSTRAINT project_name_unique IF NOT EXISTS
FOR (p:Project) REQUIRE p.name IS UNIQUE;

CREATE CONSTRAINT function_id_unique IF NOT EXISTS
FOR (f:Function) REQUIRE f.id IS UNIQUE;

CREATE CONSTRAINT document_id_unique IF NOT EXISTS
FOR (d:Document) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT run_id_unique IF NOT EXISTS
FOR (r:Run) REQUIRE r.id IS UNIQUE;

// ─── Indexes ──────────────────────────────────────────────────────

// For status filters (open / completed / dismissed / snoozed)
CREATE INDEX task_status_index IF NOT EXISTS
FOR (t:Task) ON (t.status);

// For time-window queries in the Judge's "nearby tasks" lookup
CREATE INDEX task_updated_at_index IF NOT EXISTS
FOR (t:Task) ON (t.updated_at);

CREATE INDEX task_first_seen_index IF NOT EXISTS
FOR (t:Task) ON (t.first_seen_at);

// Full-text search on task titles for the ask-the-graph feature
CREATE FULLTEXT INDEX task_title_fulltext IF NOT EXISTS
FOR (t:Task) ON EACH [t.title, t.subtitle];

CREATE FULLTEXT INDEX person_name_fulltext IF NOT EXISTS
FOR (p:Person) ON EACH [p.name, p.email];

// ─── Node reference (not executable — for documentation) ──────────
//
// (Task) properties:
//   id              string (uuid)
//   title           string
//   subtitle        string | null
//   status          'open' | 'completed' | 'dismissed' | 'snoozed'
//   tag             'action' | 'reply' | 'commit' | 'fyi'
//   due_at          datetime | null
//   urgent          boolean
//   priority        int (derived by PageRank on BLOCKS edges)
//   first_seen_at   datetime
//   updated_at      datetime
//   parent_context  string | null   // the thread subject or meeting title
//   source          'gmail' | 'granola' | 'calendar' | 'manual'
//
// (Person) properties:
//   email           string (natural key)
//   name            string | null
//   is_user         boolean          // true for the app user
//
// (Thread) properties:
//   gmail_thread_id string (natural key)
//   subject         string
//   last_message_at datetime
//
// (Meeting) properties:
//   granola_meeting_id string (natural key)
//   title              string
//   date               datetime
//
// (Project) properties:
//   name            string (natural key)
//   description     string | null
//
// (Function) properties:
//   id              string
//   name            string
//   color           string
//
// (Document) properties:
//   id              string
//   name            string
//   url             string | null
//   mime_type       string | null
//
// ─── Edge reference (not executable — for documentation) ──────────
//
// (Task)-[:OWNED_BY]->(Person)                the user
// (Task)-[:MENTIONS]->(Person)                other people involved
// (Task)-[:COMMITTED_IN]->(Thread|Meeting)    source of the commitment
// (Task)-[:ABOUT]->(Project)                  what project this touches
// (Task)-[:BLOCKS]->(Task)                    downstream dependency
// (Task)-[:DEPENDS_ON]->(Task)                inverse of BLOCKS
// (Task)-[:SUBTASK_OF]->(Task)                nested under a parent
// (Task)-[:DUPLICATE_OF]->(Task)              deduped canonical
// (Task)-[:TAGGED_WITH]->(Function)           function membership
// (Person)-[:PARTICIPATED_IN]->(Thread|Meeting)
// (Document)-[:ATTACHED_TO]->(Task|Meeting|Thread)
