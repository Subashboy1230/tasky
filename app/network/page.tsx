import Link from 'next/link'
import { runCypher } from '@/lib/neo4j/client'
import {
  NETWORK_PEOPLE,
  NETWORK_PROJECTS,
  NETWORK_MEETINGS,
} from '@/lib/neo4j/queries'
import { Users, FolderKanban, Video, ArrowRight, Sparkles } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Preview {
  id: string
  title: string
  tag: string
  urgent: boolean
}

interface Entity {
  name: string
  email?: string
  ref?: string
  task_count: number
  urgent_count: number
  preview: Preview[]
}

async function loadAll(userEmail: string): Promise<{
  people: Entity[]
  projects: Entity[]
  meetings: Entity[]
}> {
  const [people, projects, meetings] = await Promise.all([
    runCypher<Entity>(NETWORK_PEOPLE, { userEmail }).catch(() => []),
    runCypher<Entity>(NETWORK_PROJECTS, { userEmail }).catch(() => []),
    runCypher<Entity>(NETWORK_MEETINGS, { userEmail }).catch(() => []),
  ])
  return { people, projects, meetings }
}

export default async function NetworkPage() {
  const userEmail = process.env.APP_USER_EMAIL ?? 'you@example.com'
  const { people, projects, meetings } = await loadAll(userEmail)
  const totalPeople = people.length
  const totalProjects = projects.length
  const totalMeetings = meetings.length
  const totalUrgent =
    people.reduce((s, p) => s + p.urgent_count, 0)

  return (
    <div className="mx-auto max-w-[1120px] px-8 py-6 space-y-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Network</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
            Your open work by <span className="text-ink">who</span>,{' '}
            <span className="text-ink">what</span>, and{' '}
            <span className="text-ink">where it came from</span>. Every count
            is a Cypher aggregation on Neo4j — click any name to see just
            those tasks.
          </p>
        </div>
        <Link
          href="/today"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-1.5 text-xs text-ink-muted hover:text-ink hover:border-line-strong"
        >
          Go to today
          <ArrowRight size={11} />
        </Link>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryTile label="People with open work" value={totalPeople} icon={Users} />
        <SummaryTile label="Projects active" value={totalProjects} icon={FolderKanban} />
        <SummaryTile label="Meetings with commitments" value={totalMeetings} icon={Video} />
        <SummaryTile label="Urgent items" value={totalUrgent} icon={Sparkles} tone="urgent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <EntityColumn
          title="People you have open work with"
          empty="No people mentioned in any open task yet."
          entities={people}
          icon="person"
        />
        <EntityColumn
          title="Projects with active work"
          empty="No open task has been tagged to a project yet."
          entities={projects}
          icon="project"
        />
      </div>

      {meetings.length > 0 && (
        <EntityColumn
          title="Meetings you left commitments in"
          empty="No open commitments from Granola meetings."
          entities={meetings}
          icon="meeting"
          columns={2}
        />
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: number
  icon: typeof Users
  tone?: 'default' | 'urgent'
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon
          size={13}
          className={tone === 'urgent' ? 'text-red-300' : 'text-emerald-300'}
        />
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </span>
      </div>
      <div
        className={`text-2xl font-semibold ${
          tone === 'urgent' && value > 0 ? 'text-red-300' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function EntityColumn({
  title,
  empty,
  entities,
  icon,
  columns = 1,
}: {
  title: string
  empty: string
  entities: Entity[]
  icon: 'person' | 'project' | 'meeting'
  columns?: 1 | 2
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <span className="text-[11px] text-ink-faint">{entities.length}</span>
      </div>
      {entities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-xs text-ink-faint">
          {empty}
        </div>
      ) : (
        <div className={`grid gap-2 ${columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
          {entities.map(e => (
            <EntityCard key={`${e.name}-${e.email ?? e.ref ?? ''}`} entity={e} icon={icon} />
          ))}
        </div>
      )}
    </section>
  )
}

function EntityCard({ entity, icon }: { entity: Entity; icon: 'person' | 'project' | 'meeting' }) {
  const Icon = icon === 'person' ? Users : icon === 'project' ? FolderKanban : Video
  const filterParam =
    icon === 'person' ? `q=${encodeURIComponent(entity.name)}` : `q=${encodeURIComponent(entity.name)}`
  return (
    <Link
      href={`/today?${filterParam}`}
      className="group block rounded-xl border border-line bg-surface p-4 hover:border-line-strong"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`flex size-6 shrink-0 items-center justify-center rounded-md ${
              icon === 'person'
                ? 'bg-blue-500/10 text-blue-300'
                : icon === 'project'
                ? 'bg-purple-500/10 text-purple-300'
                : 'bg-amber-500/10 text-amber-300'
            }`}
          >
            <Icon size={12} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{entity.name}</div>
            {entity.email && (
              <div className="truncate text-[11px] text-ink-faint">{entity.email}</div>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-mono">{entity.task_count}</div>
          {entity.urgent_count > 0 && (
            <div className="text-[10px] uppercase text-red-300">
              {entity.urgent_count} urgent
            </div>
          )}
        </div>
      </div>
      <ul className="space-y-1">
        {entity.preview.slice(0, 3).map((t, i) => (
          <li key={i} className="flex items-center gap-1.5 truncate text-[12px] text-ink-muted">
            <TagPill tag={t.tag} />
            {t.urgent && (
              <span className="rounded bg-red-500/15 px-1 py-0 text-[9px] font-semibold uppercase tracking-wider text-red-300">
                U
              </span>
            )}
            <span className="truncate">{t.title}</span>
          </li>
        ))}
        {entity.task_count > entity.preview.length && (
          <li className="text-[11px] text-ink-faint">
            + {entity.task_count - entity.preview.length} more
          </li>
        )}
      </ul>
    </Link>
  )
}

function TagPill({ tag }: { tag: string }) {
  const map: Record<string, string> = {
    action: 'bg-blue-500/15 text-blue-300',
    reply: 'bg-amber-500/15 text-amber-300',
    commit: 'bg-emerald-500/15 text-emerald-300',
    fyi: 'bg-neutral-500/15 text-neutral-300',
  }
  return (
    <span
      className={`rounded px-1 py-0 text-[9px] font-semibold uppercase tracking-wider ${
        map[tag] ?? map.action
      }`}
    >
      {tag}
    </span>
  )
}
