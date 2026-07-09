// ask-the-graph — natural language → Cypher → results.
//
// User types "what do I owe Matthew this week and what's blocking any of it?"
// This module:
//   1. Sends the question + schema to Butterbase's AI Gateway (Opus)
//   2. Gets back a read-only Cypher query
//   3. Executes it against Neo4j (in a read tx, capped at 100 rows)
//   4. Returns the rows for the UI to render as list + graph viz

import { runCypher } from '../neo4j/client'
import { ai } from '../butterbase/client'
import { extractJsonObject } from '../utils'

const NL_TO_CYPHER_SYSTEM = `You translate natural-language questions about a user's task graph into READ-ONLY Cypher queries.

The graph schema:

Nodes:
  (Person {email, name, aliases: [string], is_user})
  (Task {id, title, subtitle, status, tag, due_at, urgent, first_seen_at, updated_at, source})
  (Thread {gmail_thread_id, subject, last_message_at})
  (Meeting {granola_meeting_id, title, date})
  (Project {name})
  (Function {id, name})

Edges:
  (Task)-[:OWNED_BY]->(Person)   // ALWAYS points to the single user (is_user=true). Never use to filter by other names.
  (Task)-[:MENTIONS]->(Person)   // The humans referenced INSIDE a task. Use for "tasks with X", "what does X owe", "waiting on X".
  (Task)-[:COMMITTED_IN]->(Thread|Meeting)
  (Task)-[:ABOUT]->(Project)
  (Task)-[:BLOCKS]->(Task)
  (Task)-[:DEPENDS_ON]->(Task)
  (Task)-[:SUBTASK_OF]->(Task)
  (Task)-[:DUPLICATE_OF]->(Task)
  (Task)-[:TAGGED_WITH]->(Function)
  (Person)-[:PARTICIPATED_IN]->(Thread|Meeting)

CRITICAL EDGE RULES (get these wrong and you'll return zero rows):
- "Tasks with/for/from/waiting on <someone>" → Task-[:MENTIONS]->Person, NOT OWNED_BY.
- "My tasks / what's on my plate" → Task-[:OWNED_BY]->Person WHERE Person.is_user = true.
- The user owns every task. OWNED_BY is only useful to scope to "the user's tasks in general", never to filter by another person's name.

NAME MATCHING RULES:
- Never use \`p.name = 'Karim'\`. LLM extractors introduce spelling variance (Kartik vs Karthik, Karim vs Kareem).
- ALWAYS match names case-insensitively and against BOTH the canonical name AND the aliases list:
    WHERE toLower(p.name) CONTAINS toLower('<name>')
       OR any(alias IN coalesce(p.aliases, []) WHERE toLower(alias) CONTAINS toLower('<name>'))
- For Project.name, Meeting.title, Thread.subject — same treatment: \`toLower(x) CONTAINS toLower('<term>')\`.

TOP-LEVEL vs NESTED:
- Unless the user asks for subtasks, filter to top-level: \`AND NOT (t)-[:SUBTASK_OF]->(:Task)\`.

Rules:
- READ-ONLY. Never emit CREATE, MERGE, DELETE, SET, DETACH, REMOVE, CALL apoc.
- Return a JSON object with { "cypher": "<query>", "explanation": "<one sentence>" }
- Filter Task.status = 'open' unless the question explicitly asks about completed/dismissed tasks.
- Include a LIMIT 100 clause.
- Prefer returning task-level fields (id, title, due_at, urgent) over raw nodes.
- If the question cannot be answered from the schema, return { "cypher": null, "explanation": "<why>" }.

Output STRICT JSON only, no prose, no markdown fences.`

const READ_ONLY_KEYWORDS = /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|CALL\s+apoc|FOREACH|LOAD)\b/i

export interface AskResult {
  cypher: string | null
  explanation: string
  rows: Record<string, unknown>[]
}

export async function askTheGraph(args: {
  question: string
  userId: string
}): Promise<AskResult> {
  const response = await ai({
    prompt_id: 'ask.the.graph',
    prompt_version: 2,
    system: NL_TO_CYPHER_SYSTEM,
    user: `Question: ${args.question}\n\nReturn the Cypher JSON.`,
    max_tokens: 800,
    user_id: args.userId,
  })

  let parsed: { cypher: string | null; explanation: string }
  try {
    parsed = JSON.parse(extractJsonObject(response.text))
  } catch {
    return { cypher: null, explanation: 'Failed to parse LLM response.', rows: [] }
  }

  if (!parsed.cypher) {
    return { cypher: null, explanation: parsed.explanation, rows: [] }
  }

  // Safety net — never let a write query through even if the LLM slipped.
  if (READ_ONLY_KEYWORDS.test(parsed.cypher)) {
    return {
      cypher: parsed.cypher,
      explanation: 'Blocked: generated query contained write operations. Nothing was executed.',
      rows: [],
    }
  }

  const rows = await runCypher<Record<string, unknown>>(parsed.cypher, {})
  return {
    cypher: parsed.cypher,
    explanation: parsed.explanation,
    rows,
  }
}
