import Link from 'next/link'
import { runCypher } from '@/lib/neo4j/client'
import { LIST_RUNS } from '@/lib/neo4j/queries'
import { Play, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface RunRow {
  id: string
  started_at: string
  completed_at: string
  sources: string[]
  extracted: number
  kept: number
  nested_subtasks: number
  dropped: number
  graph_context_used: number
  status: 'ok' | 'error'
  error: string | null
}

async function loadRuns(): Promise<RunRow[]> {
  try {
    return await runCypher<RunRow>(LIST_RUNS, {})
  } catch (err) {
    console.error('[/activity] Neo4j read failed:', err)
    return []
  }
}

export default async function ActivityPage() {
  const runs = await loadRuns()
  return (
    <div className="mx-auto max-w-[1120px] px-8 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-1 text-xs text-ink-faint">
            Every pipeline run is a <code className="rounded bg-surface-muted px-1">(:Run)</code> node
            in Neo4j · latest {runs.length}
          </p>
        </div>
        <Link
          href="/connections"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400"
        >
          <Play size={11} />
          Fire a new run
        </Link>
      </header>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
          <div className="text-sm text-ink-muted">
            No runs yet. Fire the first one from{' '}
            <Link href="/connections" className="text-emerald-300 hover:underline">
              Connections
            </Link>
            .
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 border-b border-line px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            <div>Status</div>
            <div>Started</div>
            <div className="text-right">Sources</div>
            <div className="text-right">Kept</div>
            <div className="text-right">Nested</div>
            <div className="text-right">Dropped</div>
          </div>
          <div className="divide-y divide-line">
            {runs.map(run => (
              <RunRowItem key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RunRowItem({ run }: { run: RunRow }) {
  const started = new Date(run.started_at)
  const duration = new Date(run.completed_at).getTime() - started.getTime()
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-3 text-sm hover:bg-surface-muted/50">
      <div>
        {run.status === 'ok' ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            <CheckCircle2 size={10} />
            ok
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">
            <AlertCircle size={10} />
            error
          </span>
        )}
      </div>
      <div>
        <div className="text-[13px]">
          {started.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-faint">
          <Clock size={9} />
          {(duration / 1000).toFixed(1)}s
          <span className="ml-1">· {run.graph_context_used} graph rows queried</span>
          {run.error && <span className="ml-2 text-red-400">· {run.error.slice(0, 60)}</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="flex justify-end gap-1">
          {(run.sources ?? []).map(s => (
            <span
              key={s}
              className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase text-ink-muted"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="text-right font-mono text-sm">{run.kept ?? 0}</div>
      <div className="text-right font-mono text-sm text-ink-muted">{run.nested_subtasks ?? 0}</div>
      <div className="text-right font-mono text-sm text-ink-faint">{run.dropped ?? 0}</div>
    </div>
  )
}
