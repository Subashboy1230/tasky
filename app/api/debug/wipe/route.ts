// POST /api/debug/wipe — nuke all Tasks and their edges. Use during
// demo prep when the DB has accumulated duplicates from many re-runs.
// Not exposed in the UI.

import { NextResponse } from 'next/server'
import { runCypher } from '@/lib/neo4j/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Count first, then delete. Neo4j won't let a single MATCH bind `t`
    // both in a count and in a subsequent DETACH.
    const [{ deleted }] = await runCypher<{ deleted: number }>(
      `MATCH (t:Task) RETURN count(t) AS deleted`,
      {},
    )
    await runCypher(`MATCH (t:Task) DETACH DELETE t`, {})
    await runCypher(`MATCH (r:Run) DETACH DELETE r`, {})
    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
