// POST /api/debug/cognee
//
// Health check for the Cognee sidecar. Hits /health on the Python
// service and reports the response verbatim, plus which config env
// vars are set on the tasky side.

import { NextResponse } from 'next/server'
import { health } from '@/lib/cognee/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const status = await health()
  return NextResponse.json(
    {
      ok: status.ok,
      sidecar_url: process.env.COGNEE_API_URL ?? 'http://localhost:8080',
      env: {
        COGNEE_API_URL: !!process.env.COGNEE_API_URL,
        NEO4J_URI: !!process.env.NEO4J_URI,
        NEO4J_USER: !!process.env.NEO4J_USER,
        NEO4J_PASSWORD: !!process.env.NEO4J_PASSWORD,
      },
      sidecar: status,
      message: status.ok
        ? 'Cognee brain is up. Ingest via POST /api/cognee/add, search via /api/cognee/search.'
        : 'Cognee sidecar unreachable. From the repo root: `cd cognee && docker compose up -d`',
    },
    { status: status.ok ? 200 : 503 },
  )
}
