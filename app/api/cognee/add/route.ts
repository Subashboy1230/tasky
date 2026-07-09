// POST /api/cognee/add
//
// Ingest into the brain. Accepts either:
//   • application/json { text: "...", dataset?: "..." }
//   • multipart/form-data with a `file` field (any type Cognee accepts:
//     .txt, .md, .pdf, .docx, .html, etc.)
//
// Delegates to the Python sidecar in /cognee via lib/cognee/client.ts.

import { NextRequest, NextResponse } from 'next/server'
import { addText, addFile } from '@/lib/cognee/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    const dataset = (form.get('dataset') as string) ?? 'tasky-brain'
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Missing `file` field.' },
        { status: 400 },
      )
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await addFile({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      buffer,
      dataset,
    })
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    text?: string
    dataset?: string
    metadata?: Record<string, unknown>
  }
  if (!body.text || typeof body.text !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Missing text field in JSON body.' },
      { status: 400 },
    )
  }
  const result = await addText({
    text: body.text,
    dataset: body.dataset,
    metadata: body.metadata,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
