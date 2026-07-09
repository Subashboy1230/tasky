// Composio v3 client — delegated OAuth + tool execution.
//
// Uses the modern @composio/core SDK against the v3 dashboard. Auth
// configs live in the dashboard (one per toolkit, e.g. tasky-gmail),
// and each user is a `userId` string.
//
// One integration surface for every source. Adding a new source is:
//   1. Create the auth config in the dashboard
//   2. Add COMPOSIO_<APP>_AUTH_CONFIG=ac_... to .env.local
//   3. Call `authorizeApp(userId, 'gmail')` from /api/connect/gmail
//   4. Call `execute({ userId, action, arguments })` from the extractor

import { Composio } from '@composio/core'

let _client: Composio | null = null

function client(): Composio {
  if (_client) return _client
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) throw new Error('Missing COMPOSIO_API_KEY. See .env.example.')
  _client = new Composio({ apiKey })
  return _client
}

// Composio v3 requires either a versioned toolkit or a per-call escape
// hatch. Passing `dangerouslySkipVersionCheck: true` binds the call to
// the toolkit's `latest` alias, which is what the dashboard shows.
const V3_EXECUTE_OPTIONS = { dangerouslySkipVersionCheck: true } as const

/**
 * Entity id — one per user. Composio scopes tokens per-user so multiple
 * users can each hold their own Gmail/Calendar/Slack tokens without
 * touching each other.
 */
export function entityIdFor(userId: string): string {
  return userId || process.env.COMPOSIO_ENTITY_ID || 'default'
}

const AUTH_CONFIG_ENV: Record<string, string> = {
  gmail: 'COMPOSIO_GMAIL_AUTH_CONFIG',
  googlecalendar: 'COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG',
  slack: 'COMPOSIO_SLACK_AUTH_CONFIG',
  linear: 'COMPOSIO_LINEAR_AUTH_CONFIG',
  notion: 'COMPOSIO_NOTION_AUTH_CONFIG',
}

function authConfigFor(app: string): string | undefined {
  const envKey = AUTH_CONFIG_ENV[app]
  return envKey ? process.env[envKey] : undefined
}

// ─── Connection lifecycle ─────────────────────────────────────

export interface ConnectionUrl {
  redirectUrl: string | null
  connectionRequestId: string
  status: string
}

/**
 * Start an OAuth flow for a given app on a user. Returns the OAuth URL
 * to present to the user. Composio persists the token against the user
 * once the flow completes.
 */
export async function authorizeApp(args: {
  userId: string
  app: 'gmail' | 'googlecalendar' | 'slack' | 'notion' | 'linear'
  callbackUrl?: string
}): Promise<ConnectionUrl> {
  const c = client()
  const userId = entityIdFor(args.userId)
  const authConfigId = authConfigFor(args.app)

  if (!authConfigId) {
    throw new Error(
      `Missing ${AUTH_CONFIG_ENV[args.app]} in .env.local. ` +
      `Create an auth config for "${args.app}" in the Composio dashboard, then copy the ac_... id here.`,
    )
  }

  // `link()` is the current endpoint for Composio-managed OAuth (initiate
  // is deprecated for redirectable schemes as of the 2026 cutover). Takes
  // the authConfigId directly and skips the toolkit-slug lookup.
  // `allowMultiple` lets a single Composio user hold, e.g., a personal
  // Gmail and a work Gmail under the same tasky user.
  const connectionRequest = await c.connectedAccounts.link(
    userId,
    authConfigId,
    {
      allowMultiple: true,
      ...(args.callbackUrl ? { callbackUrl: args.callbackUrl } : {}),
    } as any,
  )

  return {
    redirectUrl: connectionRequest.redirectUrl ?? null,
    connectionRequestId: (connectionRequest as any).id ?? '',
    status: (connectionRequest as any).connectionStatus ?? 'pending',
  }
}

// ─── Tool execution ───────────────────────────────────────────

interface ExecuteResult<T = unknown> {
  successful: boolean
  data: T
  error: string | null
}

/**
 * Execute a Composio tool for a user. Actions are things like
 * GMAIL_FETCH_EMAILS or GOOGLECALENDAR_LIST_EVENTS. When a user has
 * multiple connected accounts for the same toolkit, pass connectedAccountId
 * to disambiguate.
 */
export async function execute<T = unknown>(args: {
  userId: string
  action: string
  params?: Record<string, unknown>
  connectedAccountId?: string
}): Promise<T> {
  const c = client()
  const userId = entityIdFor(args.userId)
  const res = (await c.tools.execute(args.action, {
    userId,
    arguments: args.params ?? {},
    ...(args.connectedAccountId
      ? { connectedAccountId: args.connectedAccountId }
      : {}),
    ...V3_EXECUTE_OPTIONS,
  } as any)) as ExecuteResult<T>

  if (!res.successful) {
    throw new Error(`composio ${args.action} failed: ${res.error ?? 'unknown'}`)
  }
  return res.data
}

/** List every connected account for a user + toolkit. */
export async function listConnectedAccounts(args: {
  userId: string
  toolkit: string
}): Promise<Array<{ id: string; status: string; toolkitSlug: string }>> {
  const c = client()
  const userId = entityIdFor(args.userId)
  const res: any = await c.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: [args.toolkit],
  } as any)
  const items: any[] = res?.items ?? res?.data ?? []
  return items.map(it => ({
    id: it.id ?? it.connectedAccountId,
    status: it.status ?? 'active',
    toolkitSlug: it.toolkit?.slug ?? args.toolkit,
  }))
}

// ─── Convenience per-app calls used by the extractors ──────────

export interface GmailMessageRef {
  messageId?: string
  id?: string
  threadId: string
  subject?: string
  sender?: string
  from?: string
  to?: string
  snippet?: string
  messageText?: string
  messageTimestamp?: string
  date?: string
}

export interface GmailThread {
  threadId: string
  subject: string
  messages: Array<{
    id: string
    from: string
    to: string
    date: string
    subject: string
    body: string
    snippet: string
  }>
}

/**
 * Pull recent inbox messages via GMAIL_FETCH_EMAILS (verbose=true so
 * each message includes body + headers) and group them into threads.
 * One Composio call per run instead of N+1.
 */
async function fetchOneGmailAccount(args: {
  userId: string
  connectedAccountId?: string
  query: string
  maxResults: number
  accountLabel: string
}): Promise<GmailThread[]> {
  const data = await execute<{
    messages?: GmailMessageRef[]
    resultSizeEstimate?: number
  }>({
    userId: args.userId,
    action: 'GMAIL_FETCH_EMAILS',
    params: {
      query: args.query,
      max_results: args.maxResults,
      verbose: true,
    },
    connectedAccountId: args.connectedAccountId,
  })

  const messages = data.messages ?? []
  const byThread = new Map<string, GmailThread>()

  for (const m of messages) {
    const tid = m.threadId ?? m.messageId ?? m.id
    if (!tid) continue
    const normalized = {
      id: m.messageId ?? m.id ?? '',
      from: m.sender ?? m.from ?? '',
      to: m.to ?? '',
      date: m.messageTimestamp ?? m.date ?? '',
      subject: m.subject ?? '',
      body: m.messageText ?? m.snippet ?? '',
      snippet: m.snippet ?? '',
    }
    const existing = byThread.get(tid)
    if (existing) {
      existing.messages.push(normalized)
    } else {
      byThread.set(tid, {
        threadId: tid,
        subject: normalized.subject,
        messages: [normalized],
      })
    }
  }

  const threads = Array.from(byThread.values())
  console.log(`[composio/gmail] ${args.accountLabel} → ${threads.length} threads`)
  return threads
}

export async function listGmailThreadsWithMessages(args: {
  userId: string
  days: number
  maxResults?: number
  query?: string
}): Promise<GmailThread[]> {
  const query = args.query
    ?? `in:inbox newer_than:${args.days}d -category:promotions -category:social`
  const maxResults = args.maxResults ?? 30

  // Enumerate every connected Gmail account for this user. If Composio
  // has only one, fall through to the single-account path (no
  // connectedAccountId needed). If there are two or more, hit each with
  // its explicit id and aggregate the results.
  let accounts: Array<{ id: string; status: string }> = []
  try {
    accounts = await listConnectedAccounts({
      userId: args.userId,
      toolkit: 'gmail',
    })
  } catch (err) {
    console.warn('[composio/gmail] connectedAccounts.list failed:', err)
  }

  const activeAccounts = accounts.filter(
    a => (a.status ?? '').toLowerCase() !== 'inactive',
  )

  if (activeAccounts.length === 0) {
    return fetchOneGmailAccount({
      userId: args.userId,
      query,
      maxResults,
      accountLabel: 'single-account',
    })
  }
  if (activeAccounts.length === 1) {
    return fetchOneGmailAccount({
      userId: args.userId,
      connectedAccountId: activeAccounts[0].id,
      query,
      maxResults,
      accountLabel: `1 of 1 (${activeAccounts[0].id.slice(0, 8)})`,
    })
  }

  const perAccountMax = Math.max(5, Math.ceil(maxResults / activeAccounts.length))
  const results = await Promise.all(
    activeAccounts.map((a, i) =>
      fetchOneGmailAccount({
        userId: args.userId,
        connectedAccountId: a.id,
        query,
        maxResults: perAccountMax,
        accountLabel: `${i + 1} of ${activeAccounts.length} (${a.id.slice(0, 8)})`,
      }).catch(err => {
        console.warn(`[composio/gmail] account ${a.id} failed:`, err)
        return [] as GmailThread[]
      }),
    ),
  )

  return results.flat()
}

// Back-compat shim — some callers still just want (id, snippet).
export async function listGmailThreads(args: {
  userId: string
  days: number
  maxResults?: number
}): Promise<{ threads: Array<{ id: string; snippet?: string }> }> {
  const threads = await listGmailThreadsWithMessages(args)
  return {
    threads: threads.map(t => ({
      id: t.threadId,
      snippet: t.messages[0]?.snippet,
    })),
  }
}

// Kept for the debug endpoint; returns whatever we already have grouped.
export async function getGmailThread(args: {
  userId: string
  threadId: string
}): Promise<GmailThread> {
  const threads = await listGmailThreadsWithMessages({
    userId: args.userId,
    days: 30,
    maxResults: 50,
  })
  const hit = threads.find(t => t.threadId === args.threadId)
  if (!hit) {
    return { threadId: args.threadId, subject: '', messages: [] }
  }
  return hit
}

export async function createGmailDraft(args: {
  userId: string
  to: string[]
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string
}): Promise<{ draftId: string }> {
  return execute({
    userId: args.userId,
    action: 'GMAIL_CREATE_EMAIL_DRAFT',
    params: {
      recipient_email: args.to[0],
      subject: args.subject,
      body: args.body,
      thread_id: args.threadId,
    },
  })
}

export async function listCalendarEvents(args: {
  userId: string
  timeMin: string
  timeMax: string
}): Promise<{ events: unknown[] }> {
  return execute({
    userId: args.userId,
    action: 'GOOGLECALENDAR_LIST_EVENTS',
    params: args,
  })
}
