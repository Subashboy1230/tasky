'use client'

import type { TaskRow } from '@/lib/types'
import { Mail, Video, CalendarDays, Zap, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const SOURCE_ICON = {
  gmail: Mail,
  granola: Video,
  calendar: CalendarDays,
  linear: Zap,
  slack: Zap,
  manual: Zap,
}

export function TaskCard({
  task,
  isActive,
  onClick,
}: {
  task: TaskRow
  isActive: boolean
  onClick: () => void
}) {
  const SourceIcon = SOURCE_ICON[task.source] ?? Mail
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full rounded-xl border bg-surface px-4 py-3 text-left transition-colors',
        isActive
          ? 'border-line-strong ring-1 ring-emerald-500/20'
          : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted">
          <SourceIcon size={12} className="text-ink-faint" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TagChip tag={task.tag} />
            {task.urgent && <UrgentChip />}
            <span className="truncate text-sm font-medium">{task.title}</span>
          </div>

          {task.subtitle && (
            <div className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
              {task.subtitle}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {task.projects.filter(Boolean).map(p => (
              <span key={p} className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-ink-muted">
                {p}
              </span>
            ))}
            {task.mentioned.filter(Boolean).map(m => (
              <span key={m} className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[11px] text-blue-300">
                @{m}
              </span>
            ))}
            {task.subtask_count > 0 && (
              <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-ink-faint">
                {task.subtask_count} subtasks
              </span>
            )}
          </div>
        </div>

        <ChevronRight
          size={14}
          className={cn(
            'mt-1 shrink-0 transition-transform',
            isActive ? 'text-ink' : 'text-ink-faint group-hover:translate-x-0.5',
          )}
        />
      </div>
    </button>
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

function UrgentChip() {
  return (
    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
      Urgent
    </span>
  )
}
