// Quick check that Butterbase AI Gateway is reachable and returning text.

import { NextResponse } from 'next/server'
import { ai } from '@/lib/butterbase/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const t0 = Date.now()
  try {
    const resp = await ai({
      system: 'You are a JSON generator.',
      user: 'Return {"ok": true, "greeting": "hello"} exactly.',
      prompt_id: 'debug',
      prompt_version: 1,
      max_tokens: 128,
    })
    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - t0,
      model: resp.model,
      text: resp.text,
      call_id: resp.call_id,
      usage: resp.usage,
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        elapsed_ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
