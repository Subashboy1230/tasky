// Core type definitions shared across the app.

export type Source = 'gmail' | 'granola' | 'calendar' | 'linear' | 'slack' | 'manual'

export type TaskStatus = 'open' | 'completed' | 'dismissed' | 'snoozed'

export type TaskTag = 'action' | 'reply' | 'commit' | 'fyi'

export type DraftConfidence = 'high' | 'medium' | 'low' | 'skip'

export interface SourceRef {
  gmail_thread_id?: string
  gmail_message_id?: string
  granola_meeting_id?: string
  google_calendar_event_id?: string
}

export interface ExtractedItem {
  source: Source
  source_ref: SourceRef | null
  parent_context: string          // thread subject or meeting title
  title: string
  subtitle?: string | null
  entities?: Array<{ kind: 'person' | 'project' | 'thread'; label: string; ref?: string }>
  tag: TaskTag
  due_at: string | null
  urgent: boolean
  draft_confidence?: DraftConfidence | null
  sub_items?: Array<{ title: string }>
  /** Filled by the extract pipeline; used by the graph merge to link items to their originating LLM call. */
  _llm_call_id?: string
}

export interface TaskRow {
  id: string
  title: string
  subtitle: string | null
  status: TaskStatus
  tag: TaskTag
  due_at: string | null
  urgent: boolean
  source: Source
  parent_context: string | null
  mentioned: string[]
  projects: string[]
  subtask_count: number
}
