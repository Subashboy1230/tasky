// GET /api/debug/gmail — inspect Composio Gmail fetch without running the
// full extract → judge → merge pipeline. Returns thread count and the
// first thread's shape so we can see what the extractor is working with.

import { NextResponse } from 'next/server'
import { listGmailThreads, getGmailThread } from '@/lib/composio/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const userId = process.env.COMPOSIO_ENTITY_ID ?? 'default'
  const url = new URL(req.url)
  const days = Number(url.searchParams.get('days') ?? '14')
  const max = Number(url.searchParams.get('max') ?? '15')
  const run = url.searchParams.get('run') === 'true'
  if (run) {
    const { extractGmailThreads, lastExtractGmailErrors } = await import('@/lib/extract/gmail')
    const userEmail = process.env.APP_USER_EMAIL ?? 'you@example.com'
    const items = await extractGmailThreads({
      userEmail,
      userId,
      days,
      maxThreads: max,
    })
    return NextResponse.json({
      ok: true,
      permissive: process.env.TASKY_PERMISSIVE_EXTRACT === 'true',
      user_email: userEmail,
      item_count: items.length,
      errors: lastExtractGmailErrors,
      items: items.map(i => ({
        title: i.title,
        subtitle: i.subtitle,
        tag: i.tag,
        urgent: i.urgent,
        source_ref: i.source_ref,
        parent_context: i.parent_context,
      })),
    })
  }

  // ?trace=true → runs one real thread through the prompt and returns
  // the raw LLM output so we can see why items are empty.
  if (url.searchParams.get('trace') === 'true') {
    const { listGmailThreadsWithMessages } = await import('@/lib/composio/client')
    const { SYSTEM_PROMPT, buildUserPrompt, PROMPT_ID, PROMPT_VERSION } = await import(
      '@/lib/prompts/extract-gmail'
    )
    const { ai } = await import('@/lib/butterbase/client')
    const threads = await listGmailThreadsWithMessages({ userId, days, maxResults: max })
    // Pick the first thread whose sender doesn't look automated.
    const pick = threads.find(t => {
      const from = t.messages[0]?.from ?? ''
      return !/no-?reply|noreply|newsletter|calendar/i.test(from) && t.messages[0]?.body
    }) ?? threads[0]
    if (!pick) {
      return NextResponse.json({ ok: false, note: 'no threads' })
    }
    const transcript = pick.messages
      .map(m => `From: ${m.from}\nDate: ${m.date}\n\n${m.body}`)
      .join('\n---\n')
    const userEmail = process.env.APP_USER_EMAIL ?? 'you@example.com'
    const permissive = process.env.TASKY_PERMISSIVE_EXTRACT === 'true'
    const system = permissive
      ? SYSTEM_PROMPT
          .replace(
            /WHOSE EMAIL COUNTS[\s\S]*?A missed cold email is fine; a cluttered task list is not\./,
            'WHOSE EMAIL COUNTS (permissive):\n- Extract from any thread with a real human. Skip newsletters, automated notifications, calendar reminders.',
          )
          .replace(
            /REPLY-TAG DISCIPLINE[\s\S]*?Prefer tag="action" or tag="commit" over tag="reply"\./,
            'REPLY-TAG DISCIPLINE (permissive):\n- If a real person expects a response, tag="reply" is fine.',
          )
      : SYSTEM_PROMPT
    const resp = await ai({
      system,
      user: buildUserPrompt({
        subject: pick.subject,
        userEmail,
        latestFrom: pick.messages[pick.messages.length - 1]?.from ?? '',
        transcript,
      }),
      prompt_id: PROMPT_ID,
      prompt_version: PROMPT_VERSION,
      user_id: userId,
      max_tokens: 2048,
    })
    return NextResponse.json({
      ok: true,
      permissive,
      picked_thread: {
        subject: pick.subject,
        from: pick.messages[0]?.from,
        body_len: pick.messages[0]?.body?.length ?? 0,
      },
      llm_text: resp.text,
      call_id: resp.call_id,
      usage: resp.usage,
    })
  }
  try {
    // Import the richer helper only in the debug endpoint so we don't
    // break the extractor's public surface.
    const { listGmailThreadsWithMessages } = await import('@/lib/composio/client')
    const threads = await listGmailThreadsWithMessages({
      userId,
      days,
      maxResults: max,
    })
    return NextResponse.json({
      ok: true,
      thread_count: threads.length,
      threads: threads.map(t => ({
        id: t.threadId,
        subject: t.subject,
        from: t.messages[0]?.from ?? '',
        snippet: (t.messages[0]?.body ?? '').slice(0, 140),
        message_count: t.messages.length,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
