'use client'

import { useEffect, useState } from 'react'
import type { TaskRow } from '@/lib/types'
import {
  X,
  Mail,
  Video,
  CalendarDays,
  Users,
  FolderKanban,
  ListTree,
  Network,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'context' | 'subtasks' | 'related'

interface TaskContext {
  id: string
  title: string
  subtitle: string | null
  tag: string
  urgent: boolean
  source: string
  parent_context: string | null
  due_at: string | null
  first_seen_at: string | null
  subtasks: Array<{ id: string; title: string; status: string; tag: string }>
  people: Array<{ email: string; name: string | null }>
  projects: string[]
  source_event: { kind: string; label: string; ref: string } | null
  related: Array<{ id: string; title: string; tag: string; overlap: number }>
}

const SOURCE_ICON: Record<string, typeof Mail> = {
  gmail: Mail,
  granola: Video,
  calendar: CalendarDays,
}

export function TaskDetailSheet({
  task,
  onClose,
}: {
  task: TaskRow
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('context')
  const [context, setContext] = useState<TaskContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/task/${encodeURIComponent(task.id)}/context`)
      .then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        setContext(data)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message ?? String(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [task.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const SourceIcon = SOURCE_ICON[task.source] ?? Mail

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 animate-fade-in bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] animate-slide-in-right flex-col border-l border-line bg-canvas">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-muted">
                <SourceIcon size={10} /> {task.source}
              </span>
              <TagChip tag={task.tag} />
              {task.urgent && (
                <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
                  Urgent
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold leading-snug">{task.title}</h2>
            {task.subtitle && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                {task.subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-line px-3">
          <TabButton active={tab === 'context'} onClick={() => setTab('context')} icon={FolderKanban}>
            Context
          </TabButton>
          <TabButton active={tab === 'subtasks'} onClick={() => setTab('subtasks')} icon={ListTree}>
            Subtasks
            {context && context.subtasks.length > 0 && (
              <span className="ml-1 rounded bg-surface-muted px-1 text-[10px] text-ink-faint">
                {context.subtasks.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'related'} onClick={() => setTab('related')} icon={Network}>
            Related
            {context && context.related.length > 0 && (
              <span className="ml-1 rounded bg-surface-muted px-1 text-[10px] text-ink-faint">
                {context.related.length}
              </span>
            )}
          </TabButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && (
            <div className="flex items-center justify-center py-16 text-ink-faint">
              <Loader2 size={16} className="mr-2 animate-spin" /> Loading subgraph…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
              Failed to load context: {error}
            </div>
          )}

          {!loading && !error && context && tab === 'context' && (
            <ContextTab context={context} />
          )}

          {!loading && !error && context && tab === 'subtasks' && (
            <SubtasksTab subtasks={context.subtasks} />
          )}

          {!loading && !error && context && tab === 'related' && (
            <RelatedTab related={context.related} />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-5 py-3">
          <div className="text-[11px] text-ink-faint">
            Data pulled live via <code className="rounded bg-surface-muted px-1">TASK_CONTEXT</code> Cypher · Neo4j Aura
          </div>
        </div>
      </aside>
    </>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Mail
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium',
        active
          ? 'border-emerald-400 text-ink'
          : 'border-transparent text-ink-muted hover:text-ink',
      )}
    >
      <Icon size={12} />
      {children}
    </button>
  )
}

function ContextTab({ context }: { context: TaskContext }) {
  return (
    <div className="space-y-5">
      <Section title="Source event" icon={Mail}>
        {context.source_event ? (
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-ink-faint">
              {context.source_event.kind}
            </div>
            <div className="text-sm text-ink">{context.source_event.label}</div>
            {context.parent_context && context.parent_context !== context.source_event.label && (
              <div className="mt-1 text-xs text-ink-muted">{context.parent_context}</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-ink-faint">
            {context.parent_context ?? 'No source event linked.'}
          </div>
        )}
      </Section>

      {context.people.length > 0 && (
        <Section title={`Mentioned people (${context.people.length})`} icon={Users}>
          <div className="flex flex-wrap gap-1.5">
            {context.people.map(p => (
              <span
                key={p.email}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs"
              >
                <span className="size-1.5 rounded-full bg-blue-400" />
                {p.name ?? p.email}
              </span>
            ))}
          </div>
        </Section>
      )}

      {context.projects.length > 0 && (
        <Section title={`Projects (${context.projects.length})`} icon={FolderKanban}>
          <div className="flex flex-wrap gap-1.5">
            {context.projects.map(p => (
              <span
                key={p}
                className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-muted"
              >
                {p}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Timestamps" icon={CalendarDays}>
        <dl className="space-y-1 text-xs text-ink-muted">
          {context.due_at && (
            <div className="flex justify-between">
              <dt>Due</dt>
              <dd className="text-ink">{formatDate(context.due_at)}</dd>
            </div>
          )}
          {context.first_seen_at && (
            <div className="flex justify-between">
              <dt>First seen</dt>
              <dd className="text-ink">{formatDate(context.first_seen_at)}</dd>
            </div>
          )}
        </dl>
      </Section>
    </div>
  )
}

function SubtasksTab({
  subtasks,
}: {
  subtasks: Array<{ id: string; title: string; status: string; tag: string }>
}) {
  if (subtasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink-faint">
        No subtasks. The judge hasn&apos;t nested anything under this task yet.
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {subtasks.map(s => (
        <li
          key={s.id}
          className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5"
        >
          <div className="size-1.5 rounded-full bg-ink-faint" />
          <TagChip tag={s.tag} />
          <span className="flex-1 truncate text-sm">{s.title}</span>
          <span className="text-[10px] uppercase tracking-wider text-ink-faint">
            {s.status}
          </span>
        </li>
      ))}
    </ul>
  )
}

function RelatedTab({
  related,
}: {
  related: Array<{ id: string; title: string; tag: string; overlap: number }>
}) {
  if (related.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink-faint">
        No related open tasks share people or projects.
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {related.map(r => (
        <li
          key={r.id}
          className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5"
        >
          <TagChip tag={r.tag} />
          <span className="flex-1 truncate text-sm">{r.title}</span>
          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-ink-faint">
            {r.overlap} shared
          </span>
          <ExternalLink size={12} className="text-ink-faint" />
        </li>
      ))}
    </ul>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof Mail
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
        <Icon size={11} />
        {title}
      </div>
      {children}
    </div>
  )
}

function TagChip({ tag }: { tag: string }) {
  const map: Record<string, string> = {
    action: 'bg-blue-500/15 text-blue-300',
    reply: 'bg-amber-500/15 text-amber-300',
    commit: 'bg-emerald-500/15 text-emerald-300',
    fyi: 'bg-neutral-500/15 text-neutral-300',
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${map[tag] ?? map.action}`}
    >
      {tag}
    </span>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}
