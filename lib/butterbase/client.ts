// Butterbase client — auth + DB + storage + AI Gateway.
//
// Every LLM call in tasky goes through butterbase.ai(). No direct
// provider SDKs anywhere in the codebase. The Gateway handles routing,
// rate limiting, and cost tracking across Opus, GPT-5, Gemini.

interface ButterbaseConfig {
  url: string
  apiKey: string
  projectId: string
  defaultModel: string
}

function config(): ButterbaseConfig {
  const url = process.env.BUTTERBASE_URL
  const apiKey = process.env.BUTTERBASE_API_KEY
  const projectId = process.env.BUTTERBASE_PROJECT_ID
  const defaultModel = process.env.BUTTERBASE_LLM_MODEL ?? 'claude-opus-4-7'
  if (!url || !apiKey || !projectId) {
    throw new Error(
      'Missing Butterbase env vars: BUTTERBASE_URL, BUTTERBASE_API_KEY, BUTTERBASE_PROJECT_ID.'
    )
  }
  return { url, apiKey, projectId, defaultModel }
}

async function req<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, apiKey, projectId } = config()
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'x-butterbase-project': projectId,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`butterbase ${res.status} ${path}: ${body.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

// ─── AI Gateway ────────────────────────────────────────────────

export interface AiRequest {
  model?: string
  system: string
  user: string
  max_tokens?: number
  /** Traceable label so gateway usage shows up under the right prompt id. */
  prompt_id: string
  prompt_version: number
  user_id?: string | null
}

export interface AiResponse {
  text: string
  model: string
  usage?: { input_tokens: number; output_tokens: number }
  call_id: string
}

interface OpenAiChatResponse {
  id: string
  model: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Route any LLM call through the Butterbase AI Gateway. The Gateway is
 * OpenAI-compatible at /v1/{app_id}/chat/completions with provider-
 * prefixed model IDs like "anthropic/claude-3.5-sonnet".
 */
export async function ai(input: AiRequest): Promise<AiResponse> {
  const { defaultModel } = config()
  const model = input.model ?? defaultModel
  // Use the app-less gateway endpoint. It's OpenAI-compatible and only
  // requires a bearer token with the ai:gateway scope. This keeps tasky
  // from having to know an app_id (BUTTERBASE_PROJECT_ID above is the
  // org id, which is a separate concept).
  const raw = await req<OpenAiChatResponse>(
    `/v1/chat/completions`,
    {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.max_tokens ?? 2048,
      }),
    },
  )
  return {
    text: raw.choices?.[0]?.message?.content ?? '',
    model: raw.model,
    usage: raw.usage
      ? {
          input_tokens: raw.usage.prompt_tokens,
          output_tokens: raw.usage.completion_tokens,
        }
      : undefined,
    call_id: raw.id,
  }
}

// ─── Auth (user sign-in) ───────────────────────────────────────

export interface ButterbaseUser {
  id: string
  email: string
  name: string | null
  created_at: string
}

export async function getUser(userId: string): Promise<ButterbaseUser | null> {
  try {
    return await req<ButterbaseUser>(`/v1/auth/users/${userId}`)
  } catch {
    return null
  }
}

// ─── DB (flat rows) ────────────────────────────────────────────
//
// Butterbase's tables layer stores the flat, non-graph data:
// user profiles, connection tokens, feedback rows, session state.

export async function dbInsert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  return req<T>(`/v1/db/${table}`, {
    method: 'POST',
    body: JSON.stringify(row),
  })
}

export async function dbSelect<T>(
  table: string,
  filters: Record<string, unknown> = {},
): Promise<T[]> {
  const qs = new URLSearchParams(
    Object.entries(filters).map(([k, v]) => [k, String(v)]),
  ).toString()
  return req<T[]>(`/v1/db/${table}${qs ? `?${qs}` : ''}`)
}

export async function dbUpdate<T>(
  table: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<T> {
  return req<T>(`/v1/db/${table}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// ─── Storage (blobs) ───────────────────────────────────────────
//
// For attachments, meeting recordings, and any source doc we want to
// keep around for later replay.

export async function storagePut(
  key: string,
  body: Blob | ArrayBuffer | string,
  contentType = 'application/octet-stream',
): Promise<{ url: string }> {
  return req<{ url: string }>(`/v1/storage/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: body as BodyInit,
  })
}
