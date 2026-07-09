// POST /api/cognee/search
//
// Semantic + graph-grounded search over the brain. Body: { query, top_k? }
// Returns the sidecar's hits verbatim so the UI can render text + score
// + edges however it likes.

import { NextRequest, NextResponse } from 'next/server'
import { search } from '@/lib/cognee/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    query?: string
    dataset?: string
    top_k?: number
  }
  if (!body.query || typeof body.query !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Missing query.' },
      { status: 400 },
    )
  }
  const result = await search({
    query: body.query,
    dataset: body.dataset,
    topK: body.top_k,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
