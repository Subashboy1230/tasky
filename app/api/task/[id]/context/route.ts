import { NextRequest, NextResponse } from 'next/server'
import { runCypher } from '@/lib/neo4j/client'
import { TASK_CONTEXT } from '@/lib/neo4j/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const rows = await runCypher<any>(TASK_CONTEXT, { taskId: id })
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json(rows[0])
  } catch (err: any) {
    console.error('[api/task/context] failed:', err)
    return NextResponse.json(
      { error: 'query_failed', message: err.message ?? String(err) },
      { status: 500 },
    )
  }
}
