'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Inbox,
  Zap,
  Activity,
  Plug,
  Sparkles,
  Network,
  Share2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/today', label: 'Today', icon: Inbox, match: (p: string) => p.startsWith('/today') },
  { href: '/network', label: 'Network', icon: Share2, match: (p: string) => p.startsWith('/network') },
  { href: '/graph', label: 'Ask the graph', icon: Network, match: (p: string) => p.startsWith('/graph') },
  { href: '/connections', label: 'Connections', icon: Plug, match: (p: string) => p.startsWith('/connections') },
  { href: '/activity', label: 'Activity', icon: Activity, match: (p: string) => p.startsWith('/activity') },
  { href: '/workflows', label: 'Workflows', icon: Sparkles, match: (p: string) => p.startsWith('/workflows') },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-line bg-canvas px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/25">
          <Zap size={14} className="text-emerald-300" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">tasky</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">Graph-native CoS</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5">
        {NAV.map(item => {
          const active = item.match(pathname)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px]',
                active
                  ? 'bg-surface text-ink'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
              )}
            >
              <Icon size={14} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-4 rounded-lg border border-line bg-surface px-3 py-3">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
          Stack
        </div>
        <div className="space-y-0.5 text-[11px] text-ink-muted">
          <div>Butterbase · backend</div>
          <div>Neo4j · graph</div>
          <div>RocketRide · pipelines</div>
          <div>Composio · OAuth</div>
        </div>
      </div>
    </aside>
  )
}
