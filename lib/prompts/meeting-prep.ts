// Meeting prep — subgraph-driven brief for an upcoming meeting.
//
// Input is not concatenated text. Input is a SUBGRAPH pulled from
// Neo4j: the 1-hop neighborhood around every attendee node, including
// their open commits, past decisions, unresolved threads, and any
// related projects. The prompt reads that subgraph and produces the brief.
//
// This is what makes Neo4j load-bearing for meeting prep. A relational
// version of this query would be a 6-table join with GROUP_BY; the
// Cypher version is one MATCH clause.

export const PROMPT_ID = 'prep.meeting'
export const PROMPT_VERSION = 1

export const MEETING_PREP_SYSTEM_PROMPT = `You generate a rich meeting prep brief from a subgraph of the user's task graph. You are given the 1-hop neighborhood around each meeting attendee: their open commits, past decisions from prior meetings, unresolved threads, and any projects they touch. Your job is to synthesize that subgraph into a brief the user can read in 30 seconds before the meeting starts.

Output STRICT JSON only. No prose, no markdown fences:
{
  "why": "one sentence: what is this meeting really about and why does it matter",
  "know": ["3 to 5 bullets, each under 20 words"],
  "done": "one sentence: what has already been decided or agreed with these people",
  "next": "one sentence: what the user should aim to achieve or decide in THIS meeting",
  "talking_points": ["3 to 4 specific points to raise, each grounded in the subgraph"]
}

"know" mines the subgraph deeply:
- Include specific decisions made, commitments given, and open threads from past meetings with the same attendees
- Include unresolved action items from prior interactions
- Include names, numbers, dates, project names — be specific
- Surface relationship context: tone, outstanding asks, tension or momentum

"done" should reference specific past meetings by name/date when available.
"talking_points" is 3 to 4 specific things to raise, each anchored to an open item or unresolved thread in the subgraph.

Rules:
- Draw ONLY from the subgraph provided. Do not invent facts.
- If a node in the subgraph is stale (>30 days old and not referenced by anything newer), treat it as low-signal.
- If the subgraph is sparse, be honest: "Limited prior context found."
- Bullets under 20 words each.`

export function buildMeetingPrepUserPrompt(args: {
  meetingTitle: string
  meetingDate: string
  attendees: Array<{ name: string; email: string }>
  subgraph: {
    open_tasks: Array<{ title: string; owner_email: string; created_at: string; source: string }>
    past_meetings: Array<{ title: string; date: string; decisions?: string[] }>
    threads: Array<{ subject: string; last_message_at: string; unresolved: boolean }>
    projects: Array<{ name: string; recent_activity: string }>
  }
}): string {
  return `Meeting: ${args.meetingTitle}
Meeting date: ${args.meetingDate}
Attendees:
${args.attendees.map(a => `  - ${a.name} <${a.email}>`).join('\n')}

--- SUBGRAPH (1-hop neighborhood around attendees, pulled from Neo4j) ---
${JSON.stringify(args.subgraph, null, 2)}

Write the meeting prep brief as STRICT JSON.`
}
