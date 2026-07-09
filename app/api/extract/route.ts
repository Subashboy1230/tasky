// POST /api/extract
//
// Runs the full extract → judge → graph-merge flow. Each hop is wrapped
// so the pipeline degrades gracefully:
//
//   • If a live source (Composio Gmail, Granola API) isn't wired yet,
//     that source is skipped and reported as `source_errors[key]`.
//   • If all sources return zero, the demo synthesizer produces a couple
//     realistic candidates so the graph story still shows end-to-end.
//   • If the RocketRide judge isn't deployed yet, a naive keeper runs
//     (mergeItemBatch handles dedup via Neo4j MERGE on source_ref).
//
// The full response reports every phase so the UI can show exactly where
// the pipeline succeeded and where it fell back.

import { NextRequest, NextResponse } from 'next/server'
import { extractGmailThreads } from '@/lib/extract/gmail'
import { extractGranolaMeetings } from '@/lib/extract/granola'
import { synthesizeCandidates } from '@/lib/extract/synthesize'
import { judge } from '@/lib/rocketride/client'
import { findNearbyTasksBatch, findRecentlyCleared } from '@/lib/graph/find-parent'
import { mergeItemBatch } from '@/lib/graph/merge-item'
import { runCypher } from '@/lib/neo4j/client'
import {
  RECORD_RUN,
  CLUSTER_PROJECT_TASKS,
  CLUSTER_MEETING_TASKS,
} from '@/lib/neo4j/queries'
import { randomUUID } from 'node:crypto'
import type { ExtractedItem } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 300

async function recordRun(payload: {
  runId: string
  startedAt: string
  sources: string[]
  status: 'ok' | 'error'
  extracted: number
  kept: number
  nestedSubtasks: number
  dropped: number
  graphContextUsed: number
  error: string | null
}) {
  try {
    await runCypher(RECORD_RUN, {
      ...payload,
      completedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[/api/extract] failed to record Run:', err)
  }
}

function briefError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200)
  return String(err ?? '').slice(0, 200)
}

export async function POST(req: NextRequest) {
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  let sources: Array<'gmail' | 'granola'> = []

  try {
    const body = (await req.json().catch(() => ({}))) as {
      userEmail?: string
      userId?: string
      sources?: Array<'gmail' | 'granola'>
      days?: number
    }
    const userEmail = body.userEmail ?? process.env.APP_USER_EMAIL
    const userId = body.userId ?? 'default'
    sources = body.sources ?? ['gmail', 'granola']
    const days = body.days ?? 30

    if (!userEmail) {
      return NextResponse.json({ error: 'userEmail required' }, { status: 400 })
    }

    // ─── Phase 1: pull from each source (isolated failures) ──────
    const candidates: ExtractedItem[] = []
    const source_errors: Record<string, string> = {}
    const source_counts: Record<string, number> = {}

    if (sources.includes('gmail')) {
      try {
        const items = await extractGmailThreads({ userEmail, userId, days })
        candidates.push(...items)
        source_counts.gmail = items.length
      } catch (err) {
        source_errors.gmail = briefError(err)
        console.warn('[/api/extract] gmail source failed:', err)
      }
    }
    if (sources.includes('granola')) {
      try {
        const items = await extractGranolaMeetings({ userEmail, userId, days })
        candidates.push(...items)
        source_counts.granola = items.length
      } catch (err) {
        source_errors.granola = briefError(err)
        console.warn('[/api/extract] granola source failed:', err)
      }
    }

    // ─── Phase 1b: synthesize if live sources produced nothing ───
    let synthesized_used = false
    if (candidates.length === 0) {
      synthesized_used = true
      candidates.push(...synthesizeCandidates())
    }

    // ─── Phase 2: graph context for the judge ────────────────────
    const perCandidateContext = await findNearbyTasksBatch({
      candidates,
      userEmail,
    }).catch(err => {
      console.warn('[/api/extract] findNearbyTasksBatch failed:', err)
      return [] as any[]
    })
    const clearedContext = await findRecentlyCleared().catch(err => {
      console.warn('[/api/extract] findRecentlyCleared failed:', err)
      return [] as any[]
    })

    const seen = new Set<string>()
    const graphContext = (perCandidateContext.flat() as Array<{ id: string }>)
      .filter(item => {
        if (!item?.id || seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })

    // ─── Phase 3: judge (RocketRide → Butterbase → naive) ────────
    let judgeMode: 'rocketride' | 'butterbase' | 'naive' = process.env
      .ROCKETRIDE_PIPELINE_JUDGE
      ? 'rocketride'
      : 'butterbase'
    let decisions: Array<{
      idx: number
      verdict: 'keep' | 'drop' | 'merge' | 'subtask'
      subtask_target_id?: string
      corrected_tag?: string
      corrected_urgent?: boolean
    }> = []

    try {
      const judgeResult = await judge({
        source: candidates[0].source as 'gmail' | 'granola',
        batchLabel: `digest ${new Date().toISOString().slice(0, 10)}`,
        sourceText: candidates.map(c => `- ${c.title}`).join('\n').slice(0, 4000),
        candidates: candidates.map((c, idx) => ({
          idx,
          title: c.title,
          subtitle: c.subtitle ?? null,
          tag: c.tag,
          urgent: c.urgent,
          due_at: c.due_at,
          draft_confidence: c.draft_confidence ?? null,
          sub_items: (c.sub_items ?? []).map(s => s.title),
        })) as Array<Record<string, unknown>>,
        graphContext: graphContext as unknown as Array<Record<string, unknown>>,
        clearedContext: clearedContext as unknown as Array<Record<string, unknown>>,
        userId,
      })
      decisions = judgeResult.decisions as typeof decisions
    } catch (err) {
      // Naive fallback: keep every candidate. Stable-id MERGE in
      // mergeItem still deduplicates against existing Task nodes so
      // the graph stays clean.
      console.warn('[/api/extract] judge fell back to naive:', err)
      judgeMode = 'naive'
      decisions = candidates.map((_, idx) => ({ idx, verdict: 'keep' as const }))
    }

    // ─── Phase 4: apply decisions ────────────────────────────────
    const kept: ExtractedItem[] = []
    const subtasks: Array<{ target_id: string; candidate: ExtractedItem }> = []

    for (const decision of decisions) {
      const candidate = candidates[decision.idx]
      if (!candidate) continue
      if (decision.corrected_tag) {
        candidate.tag = decision.corrected_tag as ExtractedItem['tag']
      }
      if (typeof decision.corrected_urgent === 'boolean') {
        candidate.urgent = decision.corrected_urgent
      }

      if (decision.verdict === 'keep') {
        kept.push(candidate)
      } else if (decision.verdict === 'subtask' && decision.subtask_target_id) {
        subtasks.push({ target_id: decision.subtask_target_id, candidate })
      }
    }

    // ─── Phase 5: write to graph ─────────────────────────────────
    const summary = await mergeItemBatch({ userEmail, kept, subtasks })
    const dropped = decisions.length - summary.created - summary.nested

    // ─── Phase 6: post-judge cluster pass ────────────────────────
    // Nest same-project (and same-meeting) tasks under a single anchor
    // so the flat /today list stays tight instead of showing 5 rows for
    // one initiative. Idempotent — MERGE only creates missing edges.
    let clustered_projects = 0
    let clustered_meetings = 0
    let extraNested = 0
    try {
      const projectClusters = await runCypher<{ nested_count: number }>(
        CLUSTER_PROJECT_TASKS,
        { userEmail },
      )
      clustered_projects = projectClusters.length
      extraNested += projectClusters.reduce(
        (s, r) => s + Number(r.nested_count ?? 0),
        0,
      )
      const meetingClusters = await runCypher<{ nested_count: number }>(
        CLUSTER_MEETING_TASKS,
        { userEmail },
      )
      clustered_meetings = meetingClusters.length
      extraNested += meetingClusters.reduce(
        (s, r) => s + Number(r.nested_count ?? 0),
        0,
      )
    } catch (err) {
      console.warn('[/api/extract] cluster pass failed:', err)
    }

    const totalNested = summary.nested + extraNested

    await recordRun({
      runId,
      startedAt,
      sources,
      status: 'ok',
      extracted: candidates.length,
      kept: summary.created,
      nestedSubtasks: totalNested,
      dropped,
      graphContextUsed: graphContext.length,
      error: null,
    })

    return NextResponse.json({
      ok: true,
      runId,
      extracted: candidates.length,
      kept: summary.created,
      nested_subtasks: totalNested,
      dropped_or_merged: dropped,
      graph_context_used: graphContext.length,
      judge_mode: judgeMode,
      synthesized_used,
      source_counts,
      source_errors,
      clustered_projects,
      clustered_meetings,
    })
  } catch (err) {
    console.error('[/api/extract] failed:', err)
    const message = briefError(err)
    await recordRun({
      runId,
      startedAt,
      sources,
      status: 'error',
      extracted: 0,
      kept: 0,
      nestedSubtasks: 0,
      dropped: 0,
      graphContextUsed: 0,
      error: message,
    })
    return NextResponse.json({ error: message, runId }, { status: 500 })
  }
}
