'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TaskRow } from '@/lib/types'
import { TaskCard } from './task-card'
import { TaskDetailSheet } from './task-detail-sheet'
import {
  Search,
  Play,
  Loader2,
  Filter,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Users,
  FolderKanban,
  Video,
  Layers,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TagFilter = 'all' | 'reply' | 'action' | 'commit' | 'fyi'
type GroupBy = 'none' | 'person' | 'project' | 'meeting'

type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ok'; result: any }
  | { status: 'error'; error: string }

interface Group {
  key: string
  label: string
  icon: 'person' | 'project' | 'meeting'
  tasks: TaskRow[]
  urgent_count: number
}

export function TodayView({ tasks }: { tasks: TaskRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<TagFilter>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [runState, setRunState] = useState<RunState>({ status: 'idle' })
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (tagFilter !== 'all' && t.tag !== tagFilter) return false
      if (query.trim()) {
        const q = query.toLowerCase()
        if (
          !t.title.toLowerCase().includes(q) &&
          !(t.subtitle ?? '').toLowerCase().includes(q) &&
          !t.mentioned.some(m => (m ?? '').toLowerCase().includes(q))
        )
          return false
      }
      return true
    })
  }, [tasks, query, tagFilter])

  const groups = useMemo(
    () => (groupBy === 'none' ? [] : buildGroups(filtered, groupBy)),
    [filtered, groupBy],
  )

  const selected = tasks.find(t => t.id === selectedId) ?? null
  const counts = useMemo(() => tally(tasks), [tasks])

  async function runDigest() {
    setRunState({ status: 'running' })
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: ['gmail', 'granola'], days: 7 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Run failed')
      setRunState({ status: 'ok', result: data })
      startTransition(() => router.refresh())
    } catch (err: any) {
      setRunState({ status: 'error', error: err.message ?? String(err) })
    }
  }

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const running = runState.status === 'running' || isPending

  return (
    <div className="mx-auto max-w-[1120px] px-8 py-6 space-y-5">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <div className="mt-1 text-xs text-ink-faint">
            {filtered.length} of {tasks.length} · pulled live from Neo4j via Cypher
          </div>
        </div>
        <button
          onClick={runDigest}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black shadow-sm hover:bg-emerald-400 disabled:opacity-50"
        >
          {running ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Sparkles size={13} />
          )}
          {running ? 'Running digest…' : 'Run digest'}
        </button>
      </header>

      {runState.status === 'ok' && <RunBanner result={runState.result} />}
      {runState.status === 'error' && <RunErrorBanner error={runState.error} />}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter tasks, people, projects…"
            className="w-full rounded-md border border-line bg-canvas pl-8 pr-3 py-1.5 text-sm outline-none focus:border-line-strong"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-line bg-canvas p-0.5">
          <FilterChip
            active={tagFilter === 'all'}
            onClick={() => setTagFilter('all')}
            label="All"
            count={tasks.length}
          />
          <FilterChip active={tagFilter === 'reply'} onClick={() => setTagFilter('reply')} label="Reply" count={counts.reply} />
          <FilterChip active={tagFilter === 'action'} onClick={() => setTagFilter('action')} label="Action" count={counts.action} />
          <FilterChip active={tagFilter === 'commit'} onClick={() => setTagFilter('commit')} label="Commit" count={counts.commit} />
          <FilterChip active={tagFilter === 'fyi'} onClick={() => setTagFilter('fyi')} label="FYI" count={counts.fyi} />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-line bg-canvas p-0.5" title="Group tasks by their graph neighbors">
          <GroupChip active={groupBy === 'none'} onClick={() => setGroupBy('none')} icon={Layers} label="Flat" />
          <GroupChip active={groupBy === 'person'} onClick={() => setGroupBy('person')} icon={Users} label="Person" />
          <GroupChip active={groupBy === 'project'} onClick={() => setGroupBy('project')} icon={FolderKanban} label="Project" />
          <GroupChip active={groupBy === 'meeting'} onClick={() => setGroupBy('meeting')} icon={Video} label="Meeting" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasTasks={tasks.length > 0} onRun={runDigest} running={running} />
      ) : groupBy === 'none' ? (
        <div className="space-y-2">
          {filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              isActive={task.id === selectedId}
              onClick={() => setSelectedId(task.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const collapsed = collapsedGroups.has(group.key)
            const Icon =
              group.icon === 'person' ? Users : group.icon === 'project' ? FolderKanban : Video
            return (
              <div key={group.key} className="space-y-2">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-surface"
                >
                  {collapsed ? (
                    <ChevronRight size={13} className="text-ink-faint" />
                  ) : (
                    <ChevronDown size={13} className="text-ink-faint" />
                  )}
                  <Icon size={13} className="text-ink-muted" />
                  <span className="text-sm font-medium">{group.label}</span>
                  <span className="text-[11px] text-ink-faint">{group.tasks.length}</span>
                  {group.urgent_count > 0 && (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
                      {group.urgent_count} urgent
                    </span>
                  )}
                </button>
                {!collapsed && (
                  <div className="space-y-2 pl-6">
                    {group.tasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isActive={task.id === selectedId}
                        onClick={() => setSelectedId(task.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected && <TaskDetailSheet task={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

// ─── group-by logic ───────────────────────────────────────────────

function buildGroups(tasks: TaskRow[], groupBy: GroupBy): Group[] {
  const map = new Map<string, Group>()

  const push = (key: string, label: string, icon: Group['icon'], task: TaskRow) => {
    const existing = map.get(key)
    if (existing) {
      existing.tasks.push(task)
      if (task.urgent) existing.urgent_count++
    } else {
      map.set(key, {
        key,
        label,
        icon,
        tasks: [task],
        urgent_count: task.urgent ? 1 : 0,
      })
    }
  }

  for (const task of tasks) {
    if (groupBy === 'person') {
      const people = task.mentioned.filter(Boolean)
      if (people.length === 0) {
        push('__unattributed', 'Unattributed', 'person', task)
      } else {
        for (const person of people) push(`p:${person}`, person, 'person', task)
      }
    } else if (groupBy === 'project') {
      const projects = task.projects.filter(Boolean)
      if (projects.length === 0) {
        push('__no_project', 'No project', 'project', task)
      } else {
        for (const project of projects) push(`pj:${project}`, project, 'project', task)
      }
    } else if (groupBy === 'meeting') {
      const context = task.parent_context ?? '__no_meeting'
      push(
        `m:${context}`,
        task.parent_context ?? 'No meeting linked',
        'meeting',
        task,
      )
    }
  }

  // "Unattributed" / "No project" / "No meeting" buckets always sort to
  // the bottom regardless of size — real named entities come first.
  const UNATTRIBUTED_KEYS = new Set(['__unattributed', '__no_project', '__no_meeting'])
  return Array.from(map.values()).sort((a, b) => {
    const aOrphan = UNATTRIBUTED_KEYS.has(a.key)
    const bOrphan = UNATTRIBUTED_KEYS.has(b.key)
    if (aOrphan !== bOrphan) return aOrphan ? 1 : -1
    if (b.tasks.length !== a.tasks.length) return b.tasks.length - a.tasks.length
    if (b.urgent_count !== a.urgent_count) return b.urgent_count - a.urgent_count
    return a.label.localeCompare(b.label)
  })
}

// ─── small components ────────────────────────────────────────────

function EmptyState({
  hasTasks,
  onRun,
  running,
}: {
  hasTasks: boolean
  onRun: () => void
  running: boolean
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-10 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-surface-muted">
        <Filter size={14} className="text-ink-faint" />
      </div>
      <div className="mb-4 text-sm text-ink-muted">
        {hasTasks
          ? 'No tasks match this filter.'
          : 'No tasks yet. Fire the digest to pull from Gmail and Granola.'}
      </div>
      {!hasTasks && (
        <button
          onClick={onRun}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
        >
          {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          {running ? 'Running' : 'Run digest'}
        </button>
      )}
    </div>
  )
}

function RunBanner({ result }: { result: any }) {
  const errors: Record<string, string> = result.source_errors ?? {}
  const counts: Record<string, number> = result.source_counts ?? {}
  const errorKeys = Object.keys(errors)
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
        <CheckCircle2 size={12} />
        Pipeline complete · list refreshed
      </div>
      <div className="grid gap-x-6 gap-y-1 text-[11px] text-ink-muted md:grid-cols-6">
        <Stat label="Extracted" value={result.extracted} />
        <Stat label="Kept" value={result.kept} />
        <Stat label="Nested subtasks" value={result.nested_subtasks ?? 0} />
        <Stat label="Dropped / merged" value={result.dropped_or_merged ?? 0} />
        <Stat label="Graph context" value={result.graph_context_used ?? 0} />
        <Stat label="Judge mode" value={result.judge_mode ?? '—'} />
      </div>
      {(Object.keys(counts).length > 0 || errorKeys.length > 0 || result.synthesized_used) && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-emerald-500/15 pt-2.5 text-[10px]">
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} className="rounded bg-surface-muted px-1.5 py-0.5 text-ink-muted">
              {k}: <span className="text-ink">{v}</span>
            </span>
          ))}
          {errorKeys.map(k => (
            <span
              key={k}
              className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-300"
              title={errors[k]}
            >
              {k} skipped
            </span>
          ))}
          {result.synthesized_used && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
              synthesizer used (no live source data)
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-ink-faint">{label}</div>
      <div className="font-mono text-ink">{value}</div>
    </div>
  )
}

function RunErrorBanner({ error }: { error: string }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <AlertCircle size={12} /> Pipeline failed
      </div>
      <code className="text-[11px]">{error}</code>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded px-2 py-1 text-xs',
        active ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink',
      )}
    >
      {label}
      <span className="ml-1 text-ink-faint">{count}</span>
    </button>
  )
}

function GroupChip({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Users
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-xs',
        active ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink',
      )}
    >
      <Icon size={11} />
      {label}
    </button>
  )
}

function tally(tasks: TaskRow[]) {
  const t: Record<string, number> = { reply: 0, action: 0, commit: 0, fyi: 0 }
  for (const task of tasks) t[task.tag] = (t[task.tag] ?? 0) + 1
  return t as { reply: number; action: number; commit: number; fyi: number }
}
