// Granola meeting extractor.
//
// Pulls recent Granola notes, hits each detail endpoint for the summary
// (and transcript when available), then runs the extraction prompt
// through Butterbase's AI Gateway. Same shape as Gmail: bounded
// concurrency, per-note try/catch, results feed into the graph merge.

import { ai } from '../butterbase/client'
import { SYSTEM_PROMPT, buildUserPrompt, PROMPT_ID, PROMPT_VERSION } from '../prompts/extract-granola'
import { extractJsonObject } from '../utils'
import type { ExtractedItem } from '../types'

const GRANOLA_API_BASE = 'https://public-api.granola.ai/v1'

interface GranolaNoteRef {
  id: string
  title: string | null
  created_at: string
}

interface GranolaListResponse {
  notes: GranolaNoteRef[]
  hasMore: boolean
  cursor: string | null
}

interface GranolaNote {
  id: string
  title: string | null
  created_at: string
  attendees?: Array<{ email?: string; name?: string }>
  transcript?: string | null
  summary_text?: string | null
  summary_markdown?: string | null
  calendar_event?: {
    event_title?: string
    scheduled_start_time?: string
  } | null
}

interface RawItem {
  title: string
  subtitle?: string | null
  tag: 'action' | 'reply' | 'commit' | 'fyi'
  due_at: string | null
  urgent: boolean
  sub_items?: Array<{ title: string }>
  entities?: Array<{
    kind: 'person' | 'project' | 'company'
    label: string
    ref?: string
  }>
}

export const lastExtractGranolaErrors: string[] = []

async function granolaFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.GRANOLA_API_KEY
  if (!apiKey) throw new Error('Missing GRANOLA_API_KEY. See .env.example.')
  const res = await fetch(`${GRANOLA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`granola ${res.status} ${path}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

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

async function extractOneNote(args: {
  note: GranolaNote
  userEmail: string
  userId: string
}): Promise<ExtractedItem[]> {
  const { note, userEmail, userId } = args
  const title = note.title ?? note.calendar_event?.event_title ?? 'Untitled meeting'
  const attendeeEmails = (note.attendees ?? [])
    .map(a => a.email)
    .filter((e): e is string => Boolean(e))

  const summary = note.summary_text ?? note.summary_markdown ?? ''
  const transcript = note.transcript ?? ''
  const sourceText = [
    summary && `MEETING SUMMARY\n${summary}`,
    transcript && `RAW TRANSCRIPT\n${transcript}`,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n')

  if (!sourceText) return []

  const resp = await ai({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt({
      meetingTitle: title,
      meetingDate: note.calendar_event?.scheduled_start_time ?? note.created_at,
      userEmail,
      sourceText,
      attendeeEmails,
    }),
    prompt_id: PROMPT_ID,
    prompt_version: PROMPT_VERSION,
    user_id: userId,
    max_tokens: 2048,
  })

  const parsed = JSON.parse(extractJsonObject(resp.text)) as { items?: RawItem[] }
  const items = parsed?.items ?? []

  // Build a per-item entity list: the LLM's entities take priority (they
  // are the ones this item is actually about), and if a person's email is
  // omitted the extractor tries to resolve it from the meeting attendees.
  const attendeesByName = new Map<string, string>()
  for (const a of note.attendees ?? []) {
    if (!a.email) continue
    if (a.name) attendeesByName.set(a.name.trim().toLowerCase(), a.email)
    attendeesByName.set(a.email.trim().toLowerCase(), a.email)
  }

  const normalizeEntity = (e: RawItem['entities'] extends (infer U)[] | undefined ? U : never) => {
    // Map company → project so the graph rolls up cleanly.
    const kind = (e.kind === 'company' ? 'project' : e.kind) as 'person' | 'project'
    let ref = e.ref ?? undefined
    if (kind === 'person' && !ref) {
      ref = attendeesByName.get((e.label ?? '').trim().toLowerCase())
    }
    if (!ref && kind === 'person') {
      ref = `${e.label.toLowerCase().replace(/[^a-z]/g, '.')}@unknown`
    }
    return { kind, label: e.label, ref }
  }

  return items.map<ExtractedItem>(item => {
    const llmEntities = (item.entities ?? [])
      .filter(e => e && e.label && (e.kind === 'person' || e.kind === 'project' || e.kind === 'company'))
      .map(normalizeEntity)
      // Never mention the user themselves.
      .filter(e => !(e.kind === 'person' && e.ref === userEmail))
    return {
      source: 'granola',
      source_ref: { granola_meeting_id: note.id },
      parent_context: title,
      title: item.title,
      subtitle: item.subtitle ?? null,
      entities: llmEntities,
      tag: item.tag,
      due_at: item.due_at,
      urgent: !!item.urgent,
      sub_items: item.sub_items,
      _llm_call_id: resp.call_id,
    }
  })
}

export async function extractGranolaMeetings(args: {
  userEmail: string
  userId: string
  days: number
  maxMeetings?: number
}): Promise<ExtractedItem[]> {
  lastExtractGranolaErrors.length = 0
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  // Page through notes.
  const noteRefs: GranolaNoteRef[] = []
  let cursor: string | null = null
  const cap = args.maxMeetings ?? 40
  do {
    const params = new URLSearchParams()
    params.set('created_after', since)
    params.set('page_size', String(Math.min(30, cap)))
    if (cursor) params.set('cursor', cursor)
    const data = await granolaFetch<GranolaListResponse>(`/notes?${params.toString()}`)
    noteRefs.push(...data.notes)
    cursor = data.hasMore ? data.cursor : null
  } while (cursor && noteRefs.length < cap)

  const capped = noteRefs.slice(0, cap)
  console.log(`[extract/granola] fetched ${capped.length} notes`)

  let processed = 0
  let errored = 0

  const perNote = await mapWithConcurrency(capped, 4, async ref => {
    try {
      const note = await granolaFetch<GranolaNote>(`/notes/${ref.id}`)
      const items = await extractOneNote({
        note,
        userEmail: args.userEmail,
        userId: args.userId,
      })
      processed++
      if (items.length > 0) {
        console.log(`[extract/granola] ${ref.title} → ${items.length} items`)
      }
      return items
    } catch (err) {
      errored++
      const msg = err instanceof Error ? err.message : String(err)
      lastExtractGranolaErrors.push(`${ref.title ?? ref.id}: ${msg.slice(0, 200)}`)
      console.warn(`[extract/granola] ${ref.id} failed:`, msg)
      return [] as ExtractedItem[]
    }
  })

  const all = perNote.flat()
  console.log(
    `[extract/granola] done. notes=${capped.length} processed=${processed} ` +
    `errored=${errored} items=${all.length}`,
  )
  return all
}
