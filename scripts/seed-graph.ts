// Seed the graph with sample data so the /today and /graph pages
// aren't empty on first run. Uses the same mergeItem path the pipeline
// uses in production.
//
// Usage: npm run graph:seed

import { mergeItem } from '../lib/graph/merge-item'
import { closeDriver } from '../lib/neo4j/client'
import type { ExtractedItem } from '../lib/types'

const SEED_USER_EMAIL = process.env.APP_USER_EMAIL ?? 'you@example.com'
const SEED_USER_NAME = process.env.APP_USER_NAME ?? 'You'

const SEEDS: ExtractedItem[] = [
  {
    source: 'gmail',
    source_ref: { gmail_thread_id: 'seed-thread-1' },
    parent_context: 'Q3 planning',
    title: 'Send Q3 OKRs to Anna',
    subtitle: 'Anna is waiting on sign-off before tomorrow\'s leadership sync.',
    entities: [
      { kind: 'person', label: 'Anna Choi', ref: 'anna@example.com' },
      { kind: 'project', label: 'Q3 planning' },
    ],
    tag: 'commit',
    due_at: null,
    urgent: true,
  },
  {
    source: 'granola',
    source_ref: { granola_meeting_id: 'seed-meeting-1' },
    parent_context: 'Nummo partnership sync',
    title: 'Share pain-points deck with Matthew',
    subtitle: 'Three-page framing doc. Deck is the blocker on the partnership.',
    entities: [
      { kind: 'person', label: 'Matthew Rowe', ref: 'matthew@nummo.example' },
      { kind: 'project', label: 'Nummo partnership' },
    ],
    tag: 'commit',
    due_at: null,
    urgent: false,
  },
  {
    source: 'gmail',
    source_ref: { gmail_thread_id: 'seed-thread-2' },
    parent_context: 'Series A intro thread',
    title: 'Reconnect with Eric Lavin on Array Ventures pitch',
    subtitle: 'Eric asked for a 20-min slot next week to walk through the deck.',
    entities: [
      { kind: 'person', label: 'Eric Lavin', ref: 'eric@arrayventures.example' },
      { kind: 'project', label: 'Series A fundraise' },
    ],
    tag: 'reply',
    due_at: null,
    urgent: false,
    draft_confidence: 'high',
  },
  {
    source: 'granola',
    source_ref: { granola_meeting_id: 'seed-meeting-2' },
    parent_context: 'Hiring pipeline review',
    title: 'Send job offer to Aarav Kalra',
    subtitle: 'Approved comp band. Verbal confirmed. Written offer to go by Friday.',
    entities: [
      { kind: 'person', label: 'Aarav Kalra', ref: 'aarav@example.com' },
      { kind: 'project', label: 'Hiring' },
    ],
    tag: 'action',
    due_at: null,
    urgent: false,
  },
  {
    source: 'gmail',
    source_ref: { gmail_thread_id: 'seed-thread-3' },
    parent_context: 'Onboarding',
    title: 'Confirm meeting with Anna Choi for onboarding kickoff',
    subtitle: 'Recurring 1:1 slot. Waiting on her time preferences.',
    entities: [{ kind: 'person', label: 'Anna Choi', ref: 'anna@example.com' }],
    tag: 'action',
    due_at: null,
    urgent: false,
  },
]

async function main() {
  console.log(`Seeding ${SEEDS.length} tasks for ${SEED_USER_EMAIL}...`)
  for (const candidate of SEEDS) {
    try {
      const { taskId } = await mergeItem({
        candidate,
        userEmail: SEED_USER_EMAIL,
        userName: SEED_USER_NAME,
      })
      console.log(`  ok  ${taskId.slice(0, 8)}  ${candidate.title}`)
    } catch (err) {
      console.error(`  fail  ${candidate.title}:`, err instanceof Error ? err.message : err)
    }
  }
  await closeDriver()
  console.log('\nDone. Open /today to see them.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
