import { Suspense } from 'react'
import { ConnectionsView } from './connections-view'

export const dynamic = 'force-dynamic'

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-ink-muted">Loading…</div>}>
      <ConnectionsView />
    </Suspense>
  )
}
