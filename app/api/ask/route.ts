import { NextRequest, NextResponse } from 'next/server'
import { askTheGraph } from '@/lib/graph/ask-the-graph'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { question?: string; userId?: string }
    if (!body.question?.trim()) {
      return NextResponse.json({ error: 'question required' }, { status: 400 })
    }
    const result = await askTheGraph({
      question: body.question,
      userId: body.userId ?? 'default',
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/ask] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    )
  }
}
