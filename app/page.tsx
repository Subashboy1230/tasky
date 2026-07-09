import Link from 'next/link'
import { ArrowRight, Network, Calendar, MessageCircle } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-10 space-y-10">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
          The graph-native Chief of Staff
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your work is a graph. tasky knows it.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">
          Every task manager treats your work as a flat list. That&apos;s a lie.
          Every task is a knot in a web of people, projects, threads, and dependencies.
          tasky is the first Chief of Staff that thinks in graphs.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <FeatureCard
          icon={Network}
          title="Live graph judgment"
          body="A new email lands. A Cypher query fires against Neo4j. The judge decides subtask_of instead of new — and it nests, cleanly."
        />
        <FeatureCard
          icon={Calendar}
          title="Meeting prep from a subgraph"
          body="Click a meeting. Watch a Cypher query paint the 1-hop neighborhood around attendees. That subgraph becomes the brief."
        />
        <FeatureCard
          icon={MessageCircle}
          title="Ask the graph"
          body="&ldquo;What do I owe Matthew this week?&rdquo; Natural language → Cypher → results."
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Try it
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <StepLink href="/today" step="1" label="See your task graph" />
          <StepLink href="/connections" step="2" label="Fire an extract job" />
          <StepLink href="/graph" step="3" label="Ask the graph anything" />
        </div>
      </section>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Network
  title: string
  body: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 inline-flex size-8 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/25">
        <Icon size={14} className="text-emerald-300" />
      </div>
      <div className="mb-1.5 text-sm font-semibold">{title}</div>
      <div className="text-[13px] leading-relaxed text-ink-muted">{body}</div>
    </div>
  )
}

function StepLink({ href, step, label }: { href: string; step: string; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-lg border border-line bg-canvas px-4 py-3 hover:border-line-strong"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-6 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-ink-muted">
          {step}
        </span>
        <span className="text-sm">{label}</span>
      </div>
      <ArrowRight size={14} className="text-ink-faint transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
