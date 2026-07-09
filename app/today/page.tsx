import { runCypher } from '@/lib/neo4j/client'
import { LIST_OPEN_TASKS } from '@/lib/neo4j/queries'
import type { TaskRow } from '@/lib/types'
import { TodayView } from './today-view'

export const dynamic = 'force-dynamic'

async function loadTasks(userEmail: string): Promise<TaskRow[]> {
  try {
    return await runCypher<TaskRow>(LIST_OPEN_TASKS, { userEmail })
  } catch (err) {
    console.error('[/today] Neo4j read failed:', err)
    return []
  }
}

export default async function TodayPage() {
  const userEmail = process.env.APP_USER_EMAIL ?? 'you@example.com'
  const tasks = await loadTasks(userEmail)
  return <TodayView tasks={tasks} />
}
