// Cognee sidecar client.
//
// The Python FastAPI service in /cognee wraps `cognee` OSS
// (github.com/topoteretes/cognee) and shares tasky's Neo4j instance.
// This module is the thin TypeScript layer that hits its /add and
// /search endpoints.
//
// COGNEE_API_URL defaults to http://localhost:8080 (docker compose in
// /cognee). Leave unset in prod to signal the brain is offline — the
// callers here soft-fail so /graph and /brain still render even when
// the sidecar is down.

const DEFAULT_URL = 'http://localhost:8080'

function baseUrl(): string {
  return process.env.COGNEE_API_URL || DEFAULT_URL
}

export interface CogneeHealth {
  ok: boolean
  cognee_version?: string
  config?: Record<string, boolean>
  graph_backend?: string
  vector_backend?: string
  error?: string
}

export interface CogneeSearchHit {
  text?: string
  score?: number
  metadata?: Record<string, unknown>
  edges?: Array<{ source: string; target: string; relation: string }>
  [k: string]: unknown
}

export interface CogneeSearchResult {
  ok: boolean
  query?: string
  dataset?: string
  count?: number
  results?: CogneeSearchHit[]
  error?: string
}

export async function health(): Promise<CogneeHealth> {
  try {
    const res = await fetch(`${baseUrl()}/health`, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    return (await res.json()) as CogneeHealth
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Ingest raw text into the brain. Cognee runs extraction + embedding
 * inline — expect this to take a few seconds even for a short input. */
export async function addText(args: {
  text: string
  dataset?: string
  metadata?: Record<string, unknown>
}): Promise<{ ok: boolean; dataset?: string; error?: string }> {
  try {
    const res = await fetch(`${baseUrl()}/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: args.text,
        dataset: args.dataset ?? 'tasky-brain',
        metadata: args.metadata ?? null,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    return (await res.json()) as { ok: boolean; dataset: string }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Ingest a file (already read into a Buffer) into the brain. */
export async function addFile(args: {
  filename: string
  contentType: string
  buffer: Buffer | ArrayBuffer
  dataset?: string
}): Promise<{ ok: boolean; dataset?: string; error?: string }> {
  try {
    const form = new FormData()
    form.append(
      'file',
      new Blob([args.buffer], { type: args.contentType }),
      args.filename,
    )
    form.append('dataset', args.dataset ?? 'tasky-brain')

    const res = await fetch(`${baseUrl()}/add`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    return (await res.json()) as { ok: boolean; dataset: string }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Semantic + graph-grounded search over the brain. */
export async function search(args: {
  query: string
  dataset?: string
  topK?: number
}): Promise<CogneeSearchResult> {
  try {
    const res = await fetch(`${baseUrl()}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: args.query,
        dataset: args.dataset ?? 'tasky-brain',
        top_k: args.topK ?? 5,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    return (await res.json()) as CogneeSearchResult
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
