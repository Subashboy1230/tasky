// POST /api/debug/cluster-by-keyword?q=dallas
//
// Escape hatch for the graph-aware cluster pass. When the LLM extractor
// didn't emit Project/Meeting/Person entities, the standard cluster query
// can't see related tasks as related. This endpoint groups every open
// user-owned task whose title contains the keyword, elects an anchor by
// the same tag priority (commit > action > reply > fyi, then most
// recent), and nests the rest via SUBTASK_OF. Idempotent.

import { NextRequest, NextResponse } from 'next/server'
import { runCypher } from '@/lib/neo4j/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KEYWORD_CLUSTER = `
MATCH (t:Task {status: 'open'})
WHERE toLower(t.title) CONTAINS toLower($q)
  AND (t)-[:OWNED_BY]->(:Person {email: $userEmail, is_user: true})
  AND NOT (t)-[:SUBTASK_OF]->(:Task)
WITH collect(t) AS tasks
WHERE size(tasks) >= 2

UNWIND tasks AS t
WITH tasks, t,
     CASE t.tag
       WHEN 'commit' THEN 4
       WHEN 'action' THEN 3
       WHEN 'reply' THEN 2
       WHEN 'fyi'   THEN 1
       ELSE 0
     END AS priority
ORDER BY priority DESC, t.updated_at DESC
WITH tasks, collect(t) AS ordered_tasks
WITH ordered_tasks[0] AS anchor, ordered_tasks[1..] AS children

UNWIND children AS child
MERGE (child)-[:SUBTASK_OF]->(anchor)

RETURN anchor.id AS anchor_id,
       anchor.title AS anchor_title,
       count(child) AS nested_count
`

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) {
    return NextResponse.json(
      { error: 'Missing ?q=... keyword. Try ?q=dallas' },
      { status: 400 },
    )
  }
  const userEmail = process.env.APP_USER_EMAIL ?? 'you@example.com'
  try {
    const rows = await runCypher<{
      anchor_id: string
      anchor_title: string
      nested_count: number
    }>(KEYWORD_CLUSTER, { q, userEmail })
    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        q,
        clustered: false,
        message: 'Fewer than 2 open tasks match — nothing to nest.',
      })
    }
    return NextResponse.json({
      ok: true,
      q,
      clustered: true,
      anchor_id: rows[0].anchor_id,
      anchor_title: rows[0].anchor_title,
      nested_count: Number(rows[0].nested_count ?? 0),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
