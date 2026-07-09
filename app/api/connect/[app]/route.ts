// GET /api/connect/[app]?userId=default
//
// Starts a Composio v3 OAuth flow for the given toolkit on a Composio
// user. The user is redirected to the app's OAuth consent screen; on
// approval Composio persists the token against the user and sends the
// browser to /connections?connected=<app>.
//
// Once this completes for gmail, the next Run digest will actually hit
// Composio's GMAIL_LIST_THREADS action.

import { NextRequest, NextResponse } from 'next/server'
import { authorizeApp } from '@/lib/composio/client'

export const runtime = 'nodejs'

const SUPPORTED = new Set(['gmail', 'googlecalendar', 'slack', 'linear', 'notion'])

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ app: string }> },
) {
  const { app: rawApp } = await params
  const app = rawApp.toLowerCase()
  if (!SUPPORTED.has(app)) {
    return NextResponse.json(
      { error: `unknown app "${rawApp}". Supported: ${Array.from(SUPPORTED).join(', ')}` },
      { status: 400 },
    )
  }

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId') ?? process.env.COMPOSIO_ENTITY_ID ?? 'default'
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? url.origin

  try {
    const connection = await authorizeApp({
      userId,
      app: app as 'gmail' | 'googlecalendar' | 'slack' | 'notion' | 'linear',
      callbackUrl: `${appOrigin}/connections?connected=${app}`,
    })

    if (connection.redirectUrl) {
      // Composio hands back the app's OAuth URL. Send the user there.
      return NextResponse.redirect(connection.redirectUrl)
    }

    // No redirect (already connected, or API-key auth) — jump back.
    return NextResponse.redirect(`${appOrigin}/connections?connected=${app}`)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[/api/connect/${app}] failed:`, err)
    const failed = new URL(`${appOrigin}/connections`)
    failed.searchParams.set('error', message.slice(0, 300))
    failed.searchParams.set('app', app)
    return NextResponse.redirect(failed.toString())
  }
}
