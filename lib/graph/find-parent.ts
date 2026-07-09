// find-parent — the graph-context lookup that powers every Judge decision.
//
// Given an extractor candidate, we ask Neo4j: "What OPEN tasks share the
// most graph neighbors with this candidate?" The answer becomes the
// judge's graph_context block, which lets it decide subtask_of / merge /
// new against real graph structure instead of fuzzy string match.
//
// This is the module that makes Neo4j load-bearing. Everything else is
// storage; this is reasoning.

import { runCypher } from '../neo4j/client'
import { FIND_NEARBY_TASKS, FIND_RECENTLY_CLEARED } from '../neo4j/queries'
import type { ExtractedItem } from '../types'

export interface GraphContextItem {
  id: string
  title: string
  subtitle: string | null
  parent_context: string | null
  source: string
  status: string
  graph_score: number
}

export interface ClearedContextItem {
  id: string
  title: string
  status: 'completed' | 'dismissed' | 'snoozed'
  source: string
  cleared_at: string
}

/**
 * Neighborhood lookup for a single candidate.
 *
 * Extracts signals from the candidate (owner, mentioned people, thread /
 * meeting, project) and runs FIND_NEARBY_TASKS. Returns the top 10 by
 * graph score (shared people + shared source * 2 + shared project * 3).
 */
export async function findNearbyTasks(args: {
  candidate: ExtractedItem
  userEmail: string
}): Promise<GraphContextItem[]> {
  const { candidate, userEmail } = args

  // Pull mentioned person emails from the extractor's entities.
  const mentionedEmails = (candidate.entities ?? [])
    .filter(e => e.kind === 'person' && e.ref?.includes('@'))
    .map(e => e.ref as string)

  // Project name from entities (loose — the extractor may or may not surface it).
  const projectEntity = (candidate.entities ?? []).find(e => e.kind === 'project')
  const projectName = projectEntity?.label ?? null

  const threadId = candidate.source_ref?.gmail_thread_id ?? null
  const meetingId = candidate.source_ref?.granola_meeting_id ?? null

  return runCypher<GraphContextItem>(FIND_NEARBY_TASKS, {
    ownerEmail: userEmail,
    mentionedEmails,
    threadId,
    meetingId,
    projectName,
  })
}

/**
 * Batch variant — one Cypher round-trip per candidate. Kept simple
 * for now; if this becomes a bottleneck, we can UNWIND all candidates
 * into a single query with candidate-tagged rows.
 */
export async function findNearbyTasksBatch(args: {
  candidates: ExtractedItem[]
  userEmail: string
}): Promise<GraphContextItem[][]> {
  return Promise.all(
    args.candidates.map(candidate => findNearbyTasks({ candidate, userEmail: args.userEmail })),
  )
}

/**
 * Recently cleared tasks — passed to the Judge as the "never resurrect
 * these" list. Independent of any single candidate.
 */
export async function findRecentlyCleared(): Promise<ClearedContextItem[]> {
  return runCypher<ClearedContextItem>(FIND_RECENTLY_CLEARED, {})
}
