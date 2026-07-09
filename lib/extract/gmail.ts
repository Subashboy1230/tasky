// Gmail extractor — pulls threads via Composio v3 and runs the extraction
// prompt through Butterbase's AI Gateway (Claude Opus 4.7 by default).
//
// Falls back to the RocketRide extract pipeline if that env is configured,
// otherwise runs directly. The pipeline path is preferred in prod because
// it keeps prompt versioning, tracing, and cost tracking centralized;
// running direct is fine for local dev + hackathon demo.

import { listGmailThreadsWithMessages, type GmailThread } from '../composio/client'
import { ai } from '../butterbase/client'
import { SYSTEM_PROMPT, buildUserPrompt, PROMPT_ID, PROMPT_VERSION } from '../prompts/extract-gmail'
import { extract as rocketrideExtract } from '../rocketride/client'
import { extractJsonObject } from '../utils'
import type { ExtractedItem } from '../types'

interface RawItem {
  title: string
  subtitle?: string | null
  entities?: Array<{ kind: 'person' | 'project' | 'thread'; label: string; ref?: string }>
  tag: 'action' | 'reply' | 'commit' | 'fyi'
  due_at: string | null
  urgent: boolean
  draft_confidence?: 'high' | 'medium' | 'low' | 'skip'
  sub_items?: Array<{ title: string }>
}

/** Flatten a Composio-fetched Gmail thread into the transcript format the prompt expects. */
function threadToTranscript(thread: GmailThread): string {
  return thread.messages
    .map(m => {
      const header = `From: ${m.from}\nTo: ${m.to}\nDate: ${m.date}`
      return `${header}\n\n${m.body}`.trim()
    })
    .join('\n\n---\n\n')
}

async function extractOneThread(args: {
  thread: GmailThread
  userEmail: string
  userId: string
}): Promise<ExtractedItem[]> {
  const { thread, userEmail, userId } = args
  const latestFrom = thread.messages[thread.messages.length - 1]?.from ?? ''
  const transcript = threadToTranscript(thread)

  // Prefer the deployed RocketRide pipeline if configured — otherwise go
  // direct through Butterbase AI Gateway. Same prompt, same model, same
  // shape either way.
  let text: string
  if (process.env.ROCKETRIDE_PIPELINE_EXTRACT) {
    const result = await rocketrideExtract({
      source: 'gmail',
      userEmail,
      userId,
      payload: thread,
    })
    return (result.candidates ?? []) as unknown as ExtractedItem[]
  }

  // Permissive mode drops the "must have previously participated" gate and
  // the cold-outreach filter — every real human thread surfaces as a
  // task. Great for demos on a low-activity inbox.
  const permissive = process.env.TASKY_PERMISSIVE_EXTRACT === 'true'
  const system = permissive
    ? SYSTEM_PROMPT
        // Loosen relationship gate.
        .replace(
          /WHOSE EMAIL COUNTS[\s\S]*?A missed cold email is fine; a cluttered task list is not\./,
          'WHOSE EMAIL COUNTS (permissive demo mode):\n- Extract from any thread that appears to be a real human conversation.\n- Skip newsletters, automated notifications, calendar reminders, marketing.',
        )
        // Loosen reply-tag discipline.
        .replace(
          /REPLY-TAG DISCIPLINE[\s\S]*?Prefer tag="action" or tag="commit" over tag="reply"\./,
          'REPLY-TAG DISCIPLINE (permissive demo mode):\n- If a real person sent the user an email that expects a response, tag="reply" is fine.\n- Prefer tag="action" when there is a concrete task beyond just replying.',
        )
    : SYSTEM_PROMPT

  const resp = await ai({
    system,
    user: buildUserPrompt({
      subject: thread.subject,
      userEmail,
      latestFrom,
      transcript,
    }),
    prompt_id: permissive ? `${PROMPT_ID}.permissive` : PROMPT_ID,
    prompt_version: PROMPT_VERSION,
    user_id: userId,
    max_tokens: 2048,
  })

  const parsed = JSON.parse(extractJsonObject(resp.text)) as { items?: RawItem[] }
  const items: RawItem[] = parsed?.items ?? []

  return items.map<ExtractedItem>(item => ({
    source: 'gmail',
    source_ref: { gmail_thread_id: thread.threadId },
    parent_context: thread.subject,
    title: item.title,
    subtitle: item.subtitle ?? null,
    entities: item.entities,
    tag: item.tag,
    due_at: item.due_at,
    urgent: !!item.urgent,
    draft_confidence: item.draft_confidence ?? null,
    sub_items: item.sub_items,
    _llm_call_id: resp.call_id,
  }))
}

// Bag of per-thread errors surfaced by the last extract run, so the debug
// endpoint can show what actually went wrong when items = 0.
export const lastExtractGmailErrors: string[] = []

/**
 * Run an async mapper over items with a bounded concurrency. Keeps the
 * digest fast without stampeding the LLM.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await mapper(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

export async function extractGmailThreads(args: {
  userEmail: string
  userId: string
  days: number
  maxThreads?: number
}): Promise<ExtractedItem[]> {
  lastExtractGmailErrors.length = 0
  const threads = await listGmailThreadsWithMessages({
    userId: args.userId,
    days: args.days,
    maxResults: args.maxThreads ?? 20,
  })
  console.log(`[extract/gmail] fetched ${threads.length} threads`)

  let threadsProcessed = 0
  let threadsErrored = 0

  const perThread = await mapWithConcurrency(threads, 5, async thread => {
    try {
      const items = await extractOneThread({
        thread,
        userEmail: args.userEmail,
        userId: args.userId,
      })
      threadsProcessed++
      if (items.length > 0) {
        console.log(`[extract/gmail] thread ${thread.threadId} → ${items.length} items`)
      }
      return items
    } catch (err) {
      threadsErrored++
      const msg = err instanceof Error ? err.message : String(err)
      lastExtractGmailErrors.push(`${thread.subject || thread.threadId}: ${msg.slice(0, 200)}`)
      console.warn(`[extract/gmail] thread ${thread.threadId} failed:`, msg)
      return [] as ExtractedItem[]
    }
  })

  const allCandidates = perThread.flat()
  console.log(
    `[extract/gmail] done. threads=${threads.length} processed=${threadsProcessed} ` +
    `errored=${threadsErrored} items=${allCandidates.length}`,
  )
  return allCandidates
}
