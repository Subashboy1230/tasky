// merge-item — the write path from a judged candidate into Neo4j.
//
// Called after the Judge accepts a candidate (verdict = keep OR subtask
// under an existing parent). Handles Task node upsert, OWNED_BY,
// MENTIONS, COMMITTED_IN, ABOUT, SUBTASK_OF edges in one transaction.

import { createHash, randomUUID } from 'node:crypto'
import { runCypher } from '../neo4j/client'
import { UPSERT_TASK } from '../neo4j/queries'
import type { ExtractedItem } from '../types'

/**
 * Derive a stable Task id from (source, source_ref, title). Same email
 * thread + same extracted title = same id, so a re-run of the digest
 * updates the existing node instead of creating a duplicate.
 *
 * Falls back to a random UUID when no source_ref is available (rare —
 * manual items).
 */
function stableTaskId(candidate: ExtractedItem): string {
  const anchor =
    candidate.source_ref?.gmail_thread_id ??
    candidate.source_ref?.granola_meeting_id ??
    candidate.source_ref?.gmail_message_id ??
    null
  if (!anchor) return randomUUID()
  const key = [
    candidate.source,
    anchor,
    (candidate.title ?? '').toLowerCase().replace(/\s+/g, ' ').trim(),
  ].join('::')
  return createHash('sha1').update(key).digest('hex').slice(0, 24)
}

export interface MergeItemArgs {
  candidate: ExtractedItem
  userEmail: string
  userName?: string
  /** Set when the Judge said verdict='subtask' with subtask_target_id. */
  parentTaskId?: string | null
}

export interface MergeItemResult {
  taskId: string
}

/**
 * Upsert a Task node and its edges from an accepted candidate.
 *
 * Returns the Task id. Idempotent — repeat calls with the same taskId
 * update rather than duplicate.
 */
export async function mergeItem(args: MergeItemArgs): Promise<MergeItemResult> {
  const { candidate, userEmail, userName, parentTaskId } = args

  const taskId = stableTaskId(candidate)
  const mentioned = (candidate.entities ?? [])
    .filter(e => e.kind === 'person')
    .map(e => ({
      email: e.ref ?? `${e.label.toLowerCase().replace(/[^a-z]/g, '.')}@unknown`,
      name: e.label,
    }))

  const projectEntity = (candidate.entities ?? []).find(e => e.kind === 'project')
  const projectName = projectEntity?.label ?? null

  const threadId = candidate.source_ref?.gmail_thread_id ?? null
  const meetingId = candidate.source_ref?.granola_meeting_id ?? null

  const params = {
    taskId,
    ownerEmail: userEmail,
    ownerName: userName ?? null,
    title: candidate.title,
    subtitle: candidate.subtitle ?? null,
    status: 'open',
    tag: candidate.tag,
    dueAt: candidate.due_at,
    urgent: candidate.urgent,
    parentContext: candidate.parent_context,
    source: candidate.source,
    mentioned,
    threadId,
    threadSubject: threadId ? candidate.parent_context : null,
    meetingId,
    meetingTitle: meetingId ? candidate.parent_context : null,
    projectName,
    parentTaskId: parentTaskId ?? null,
  }

  const [row] = await runCypher<{ id: string }>(UPSERT_TASK, params)
  return { taskId: row?.id ?? taskId }
}

/**
 * Batch merge — accepts the Judge's kept/subtask candidates and writes
 * them all in one loop. Kept simple: each merge is its own transaction
 * so a single failing candidate does not roll back the batch.
 */
export async function mergeItemBatch(args: {
  userEmail: string
  userName?: string
  kept: ExtractedItem[]
  subtasks: Array<{ target_id: string; candidate: ExtractedItem }>
}): Promise<{ created: number; nested: number; errors: number }> {
  let created = 0
  let nested = 0
  let errors = 0

  for (const candidate of args.kept) {
    try {
      await mergeItem({ candidate, userEmail: args.userEmail, userName: args.userName })
      created++
    } catch (err) {
      console.error('[merge-item] kept failed:', err)
      errors++
    }
  }

  for (const { target_id, candidate } of args.subtasks) {
    try {
      await mergeItem({
        candidate,
        userEmail: args.userEmail,
        userName: args.userName,
        parentTaskId: target_id,
      })
      nested++
    } catch (err) {
      console.error('[merge-item] subtask failed:', err)
      errors++
    }
  }

  return { created, nested, errors }
}
