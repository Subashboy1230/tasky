// POST /api/debug/cluster — run the post-judge cluster pass on demand,
// without re-firing the whole digest. Useful after prompt changes or
// when the judge left too many flat tasks on /today.

import { NextResponse } from 'next/server'
import { runCypher } from '@/lib/neo4j/client'
import {
  CLUSTER_PROJECT_TASKS,
  CLUSTER_MEETING_TASKS,
} from '@/lib/neo4j/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const userEmail = process.env.APP_USER_EMAIL ?? 'you@example.com'
  try {
    const projects = await runCypher<{
      project: string
      anchor_title: string
      nested_count: number
    }>(CLUSTER_PROJECT_TASKS, { userEmail })

    const meetings = await runCypher<{
      meeting: string
      anchor_title: string
      nested_count: number
    }>(CLUSTER_MEETING_TASKS, { userEmail })

    return NextResponse.json({
      ok: true,
      projects_clustered: projects.length,
      meetings_clustered: meetings.length,
      total_nested:
        projects.reduce((s, p) => s + Number(p.nested_count ?? 0), 0) +
        meetings.reduce((s, m) => s + Number(m.nested_count ?? 0), 0),
      projects,
      meetings,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
