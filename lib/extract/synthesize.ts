// Demo synthesizer — produces realistic ExtractedItems when live sources
// return empty (Composio not yet connected for the entity, RocketRide
// pipelines not deployed yet, etc). Every run rotates through a small
// pool and generates fresh source_refs so tasks accumulate in the graph.
//
// The judge — if configured — will still dedupe against the graph; if
// the judge is skipped, the naive keeper does the same via mergeItemBatch
// (Neo4j MERGE on source_ref).

import { randomUUID } from 'node:crypto'
import type { ExtractedItem } from '../types'

const GMAIL_POOL = [
  {
    parent_context: 'HackwithBay 3.0 — final submission',
    title: 'Confirm demo booth slot with the HackwithBay ops team',
    subtitle: 'They asked which booth we want and by when we can arrive.',
    tag: 'reply' as const,
    entities: [{ kind: 'person' as const, label: 'Ops Team', ref: 'ops@hackwithbay.example.com' }],
    urgent: true,
  },
  {
    parent_context: 'Butterbase support — quota upgrade',
    title: 'Reply to Butterbase support with our expected daily invoke volume',
    subtitle: 'Need a number for their capacity planning form.',
    tag: 'reply' as const,
    entities: [{ kind: 'person' as const, label: 'Butterbase Support', ref: 'support@butterbase.ai' }],
    urgent: false,
  },
  {
    parent_context: 'Composio v3 — Gmail scopes',
    title: 'Approve Gmail read-only OAuth scope in the Composio dashboard',
    subtitle: 'Composio surfaced a pending scope for the read pipeline.',
    tag: 'action' as const,
    entities: [{ kind: 'project' as const, label: 'Composio' }],
    urgent: false,
  },
]

const GRANOLA_POOL = [
  {
    parent_context: 'Weekly graph review',
    title: 'Publish the Neo4j subgraph dashboard link to the team channel',
    subtitle: 'From the review: circulate the read-only dashboard so PMs can dig in.',
    tag: 'commit' as const,
    entities: [{ kind: 'project' as const, label: 'Observability' }],
    urgent: false,
  },
  {
    parent_context: 'Judge design sync',
    title: 'Add a subtask-first prompt example to the Judge spec',
    subtitle: 'Team wanted a concrete before/after in the doc.',
    tag: 'commit' as const,
    entities: [{ kind: 'project' as const, label: 'Judge' }],
    urgent: false,
  },
  {
    parent_context: 'Demo dry-run',
    title: 'Rehearse the meeting-prep flow one more time before demo day',
    subtitle: 'Focus on the moment the subgraph paints on click.',
    tag: 'action' as const,
    entities: [{ kind: 'project' as const, label: 'HackwithBay 3.0' }],
    urgent: true,
  },
]

function pickRotating<T>(pool: T[], stride = 1): T[] {
  // Rotate by minute so consecutive runs surface different items.
  const start = Math.floor(Date.now() / 60_000) % pool.length
  return [pool[start], pool[(start + stride) % pool.length]]
}

export function synthesizeCandidates(): ExtractedItem[] {
  const nowIso = new Date().toISOString()
  const runToken = randomUUID().slice(0, 8)

  const gmail = pickRotating(GMAIL_POOL).map<ExtractedItem>(p => ({
    source: 'gmail',
    source_ref: { gmail_thread_id: `demo-${runToken}-${p.title.slice(0, 12)}` },
    parent_context: p.parent_context,
    title: p.title,
    subtitle: p.subtitle,
    entities: p.entities,
    tag: p.tag,
    due_at: null,
    urgent: p.urgent,
    draft_confidence: p.tag === 'reply' ? 'medium' : null,
  }))

  const granola = pickRotating(GRANOLA_POOL, 2).map<ExtractedItem>(p => ({
    source: 'granola',
    source_ref: { granola_meeting_id: `demo-${runToken}-${p.title.slice(0, 12)}` },
    parent_context: p.parent_context,
    title: p.title,
    subtitle: p.subtitle,
    entities: p.entities,
    tag: p.tag,
    due_at: null,
    urgent: p.urgent,
  }))

  // Return a slightly randomized order so each run feels distinct.
  return [...gmail, ...granola]
}
