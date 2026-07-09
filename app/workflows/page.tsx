import { Zap, Mail, Video, Network, Wand2, GitBranch, Users } from 'lucide-react'
import Link from 'next/link'

const WORKFLOWS = [
  {
    key: 'gmail-extract',
    name: 'Gmail extract',
    stack: 'RocketRide → Claude Opus 4.7',
    icon: Mail,
    accent: 'text-red-300 bg-red-500/10',
    description:
      'Pulls recent Gmail threads via Composio, sends them through a strict prompt: real reply asks only, no cold outreach, no marketing.',
    output: 'ExtractedItem[] with source_ref and mentioned people.',
  },
  {
    key: 'granola-extract',
    name: 'Granola extract',
    stack: 'RocketRide → Claude Opus 4.7',
    icon: Video,
    accent: 'text-purple-300 bg-purple-500/10',
    description:
      'Reads the full transcript first, then the notes. Commits with parent_context = meeting title so the judge nests correctly.',
    output: 'ExtractedItem[] tagged commit / action.',
  },
  {
    key: 'judge',
    name: 'Judge (subtask-first)',
    stack: 'RocketRide → Claude Opus 4.7 + Neo4j subgraph',
    icon: Wand2,
    accent: 'text-emerald-300 bg-emerald-500/10',
    description:
      'Second-pass reviewer. Compares each candidate against a subgraph of nearby open tasks. Verdicts: keep / drop / merge / subtask.',
    output: 'JudgeDecision[] with corrected_tag + subtask_target_id.',
  },
  {
    key: 'graph-merge',
    name: 'Graph merge',
    stack: 'Neo4j Aura · UPSERT_TASK Cypher',
    icon: GitBranch,
    accent: 'text-blue-300 bg-blue-500/10',
    description:
      'Applies the judge decisions. Creates Task nodes, MENTIONS/ABOUT/COMMITTED_IN edges. SUBTASK_OF when nested.',
    output: 'Persisted graph delta. Feeds /today.',
  },
  {
    key: 'meeting-prep',
    name: 'Meeting prep subgraph',
    stack: 'MEETING_SUBGRAPH Cypher · Claude Opus 4.7',
    icon: Users,
    accent: 'text-amber-300 bg-amber-500/10',
    description:
      '1-hop neighborhood around meeting attendees: open tasks, past meetings, unresolved threads, active projects. Fed to a brief.',
    output: 'A brief per attendee, plus talking points.',
  },
  {
    key: 'ask-the-graph',
    name: 'Ask the graph',
    stack: 'Butterbase AI Gateway → Cypher → Neo4j',
    icon: Network,
    accent: 'text-cyan-300 bg-cyan-500/10',
    description:
      'Natural language → guarded read-only Cypher → live results. Great for "who owes me a reply on the fundraise?"',
    output: 'Table of rows and a natural-language summary.',
  },
]

export default function WorkflowsPage() {
  return (
    <div className="mx-auto max-w-[1120px] px-8 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
          Every workflow is a RocketRide pipeline. Every LLM call is Claude Opus 4.7.
          Every persistence hop is a Cypher query against Neo4j Aura.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {WORKFLOWS.map(w => {
          const Icon = w.icon
          return (
            <div key={w.key} className="rounded-xl border border-line bg-surface p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className={`flex size-9 items-center justify-center rounded-lg ${w.accent}`}>
                  <Icon size={14} />
                </div>
                <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                  {w.stack}
                </span>
              </div>
              <div className="mb-1 text-sm font-semibold">{w.name}</div>
              <p className="text-[13px] leading-relaxed text-ink-muted">{w.description}</p>
              <div className="mt-3 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-[11px] text-ink-muted">
                Output: <span className="text-ink">{w.output}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          <Zap size={11} />
          Try it
        </div>
        <Link
          href="/connections"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400"
        >
          Fire a pipeline from Connections
        </Link>
      </div>
    </div>
  )
}
