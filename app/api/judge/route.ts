// POST /api/judge — run the Judge on already-extracted candidates.
//
// Useful for single-thread demos ("watch the Judge decide on this one email").
// The full digest flow lives at /api/extract.

import { NextRequest, NextResponse } from 'next/server'
import { judge } from '@/lib/rocketride/client'
import { findNearbyTasksBatch, findRecentlyCleared } from '@/lib/graph/find-parent'
import { mergeItemBatch } from '@/lib/graph/merge-item'
import type { ExtractedItem } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      userEmail?: string
      userId?: string
      source?: 'gmail' | 'granola'
      batchLabel?: string
      sourceText?: string
      candidates?: ExtractedItem[]
    }
    const userEmail = body.userEmail ?? process.env.APP_USER_EMAIL
    const userId = body.userId ?? 'default'
    if (!userEmail || !body.candidates?.length) {
      return NextResponse.json({ error: 'userEmail and candidates required' }, { status: 400 })
    }

    const perCandidateContext = await findNearbyTasksBatch({
      candidates: body.candidates,
      userEmail,
    })
    const clearedContext = await findRecentlyCleared()

    const seen = new Set<string>()
    const graphContext = perCandidateContext.flat().filter(item => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })

    const judgeResult = await judge({
      source: body.source ?? 'gmail',
      batchLabel: body.batchLabel ?? 'demo',
      sourceText: body.sourceText ?? '',
      candidates: body.candidates.map((c, idx) => ({
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

    const kept: ExtractedItem[] = []
    const subtasks: Array<{ target_id: string; candidate: ExtractedItem }> = []
    for (const decision of judgeResult.decisions) {
      const candidate = body.candidates[decision.idx]
      if (!candidate) continue
      if (decision.verdict === 'keep') kept.push(candidate)
      else if (decision.verdict === 'subtask' && decision.subtask_target_id)
        subtasks.push({ target_id: decision.subtask_target_id, candidate })
    }

    const summary = await mergeItemBatch({ userEmail, kept, subtasks })

    return NextResponse.json({
      ok: true,
      decisions: judgeResult.decisions,
      kept: summary.created,
      nested_subtasks: summary.nested,
      graph_context: graphContext,
    })
  } catch (err) {
    console.error('[/api/judge] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    )
  }
}
