'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Mail,
  Video,
  CalendarDays,
  MessageSquare,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SOURCES = [
  {
    key: 'gmail',
    name: 'Gmail',
    icon: Mail,
    auth: 'Composio OAuth',
    description: 'Threads → judge → subtasks under the right parent.',
    connected: true,
    accent: 'text-red-300 bg-red-500/10',
  },
  {
    key: 'granola',
    name: 'Granola',
    icon: Video,
    auth: 'API key',
    description: 'Transcripts + notes → commitments the judge nests.',
    connected: true,
    accent: 'text-purple-300 bg-purple-500/10',
  },
  {
    key: 'googlecalendar',
    name: 'Google Calendar',
    icon: CalendarDays,
    auth: 'Composio OAuth',
    description: 'Attendees + times populate the meeting-prep subgraph.',
    connected: true,
    accent: 'text-blue-300 bg-blue-500/10',
  },
  {
    key: 'slack',
    name: 'Slack',
    icon: MessageSquare,
    auth: 'Composio OAuth',
    description: 'Threaded asks with @you → open items.',
    connected: true,
    accent: 'text-emerald-300 bg-emerald-500/10',
  },
] as const

export function ConnectionsView() {
  const search = useSearchParams()
  const error = search.get('error')
  const errorApp = search.get('app')
  const connected = search.get('connected')

  return (
    <div className="mx-auto max-w-[1120px] px-8 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
          Each source is authorized once and hands data to the extract pipelines.
          Fire runs from <Link href="/today" className="text-emerald-300 hover:underline">Today</Link> — the button up top.
        </p>
      </header>

      {connected && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" />
          <div className="text-emerald-200">
            <span className="font-semibold">{connected}</span> connected. Head to <Link href="/today" className="underline">Today</Link> and hit Run digest.
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-300" />
          <div>
            <div className="font-semibold">
              Couldn&apos;t start OAuth for {errorApp ?? 'that source'}.
            </div>
            <code className="mt-1 block break-all text-[11px] text-red-300">{error}</code>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {SOURCES.map(source => {
          const Icon = source.icon
          return (
            <div
              key={source.key}
              className="flex flex-col rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={cn('flex size-9 items-center justify-center rounded-lg', source.accent)}>
                    <Icon size={14} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{source.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        Connected
                      </span>
                      <span className="text-[11px] text-ink-faint">via {source.auth}</span>
                    </div>
                  </div>
                </div>
                <Link
                  href={`/api/connect/${source.key}`}
                  className="rounded-md border border-line bg-canvas px-2 py-1 text-[11px] text-ink-muted hover:text-ink hover:border-line-strong"
                >
                  Reconnect
                </Link>
              </div>

              <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                {source.description}
              </p>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="text-sm text-ink-muted">
          Ready to pull? Fire the digest from your task list.
        </div>
        <Link
          href="/today"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400"
        >
          Go to Today
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  )
}
