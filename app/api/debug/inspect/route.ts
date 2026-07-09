// GET /api/debug/inspect?q=dallas
//
// Ad-hoc "what does the graph know about X" endpoint. Returns each open
// task whose title contains the query string, along with the Projects,
// Meetings, People, and parent Task it's attached to. Useful for figuring
// out why the cluster pass isn't catching something you expect to nest.

import { NextRequest, NextResponse } from 'next/server'
import { runCypher } from '@/lib/neo4j/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INSPECT = `
MATCH (t:Task {status: 'open'})
WHERE toLower(t.title) CONTAINS toLower($q)
OPTIONAL MATCH (t)-[:ABOUT]->(p:Project)
OPTIONAL MATCH (t)-[:COMMITTED_IN]->(m:Meeting)
OPTIONAL MATCH (t)-[:MENTIONS]->(person:Person)
OPTIONAL MATCH (t)-[:SUBTASK_OF]->(parent:Task)
OPTIONAL MATCH (t)-[:OWNED_BY]->(owner:Person)
RETURN t.id AS id,
       t.title AS title,
       t.tag AS tag,
       t.source AS source,
       t.updated_at AS updated_at,
       collect(DISTINCT p.name) AS projects,
       collect(DISTINCT m.title) AS meetings,
       collect(DISTINCT person.name) AS people,
       parent.title AS parent_of,
       owner.email AS owner_email
ORDER BY updated_at DESC
LIMIT 25
`

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) {
    return NextResponse.json(
      { error: 'Missing ?q=... query param' },
      { status: 400 },
    )
  }
  try {
    const rows = await runCypher<{
      id: string
      title: string
      tag: string
      source: string
      projects: string[]
      meetings: string[]
      people: string[]
      parent_of: string | null
      owner_email: string | null
    }>(INSPECT, { q })
    return NextResponse.json({ ok: true, q, count: rows.length, rows })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
