'use client'

// The Brain — Cognee OSS wrapped in tasky's UI.
//
// Two panels:
//   1. Capture context — paste text or upload a file. Sends it to
//      the Python sidecar, which runs cognee.add() + cognee.cognify().
//   2. Search the brain — semantic + graph-grounded retrieval over
//      everything you've ingested.
//
// Cognee shares tasky's Neo4j, so the entities it extracts (people,
// projects, concepts) show up in the same graph as tasks. That's the
// pitch: one graph, two lenses.

import { useState } from 'react'
import { Upload, Search, Loader2, Sparkles, FileText, CheckCircle2, XCircle } from 'lucide-react'

interface Hit {
  text?: string
  score?: number
  metadata?: Record<string, unknown>
  edges?: Array<{ source: string; target: string; relation: string }>
  [k: string]: unknown
}

interface SearchResult {
  ok: boolean
  count?: number
  results?: Hit[]
  error?: string
}

export default function BrainPage() {
  // Capture pane
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [ingesting, setIngesting] = useState(false)
  const [ingestStatus, setIngestStatus] = useState<
    { ok: boolean; message: string } | null
  >(null)

  // Search pane
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)

  const ingestText = async () => {
    if (!text.trim()) return
    setIngesting(true)
    setIngestStatus(null)
    try {
      const res = await fetch('/api/cognee/add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const body = await res.json()
      setIngestStatus({
        ok: !!body.ok,
        message: body.ok
          ? 'Added to the brain. Entities extracted and linked into Neo4j.'
          : `Sidecar error: ${body.error ?? 'unknown'}`,
      })
      if (body.ok) setText('')
    } catch (err) {
      setIngestStatus({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIngesting(false)
    }
  }

  const ingestFile = async () => {
    if (!file) return
    setIngesting(true)
    setIngestStatus(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/cognee/add', {
        method: 'POST',
        body: form,
      })
      const body = await res.json()
      setIngestStatus({
        ok: !!body.ok,
        message: body.ok
          ? `Ingested ${file.name}. Cognee ran extraction + embedding.`
          : `Sidecar error: ${body.error ?? 'unknown'}`,
      })
      if (body.ok) setFile(null)
    } catch (err) {
      setIngestStatus({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIngesting(false)
    }
  }

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchResult(null)
    try {
      const res = await fetch('/api/cognee/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, top_k: 5 }),
      })
      setSearchResult(await res.json())
    } catch (err) {
      setSearchResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-300" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            Cognee · OSS
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">The Brain</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Paste context or upload a doc. Cognee extracts entities, embeds
          them, and writes into the same Neo4j graph as your tasks. Then
          any agent can query it across sessions.
        </p>
      </div>

      {/* ─── Capture ─────────────────────────────────────────── */}
      <section className="mb-8 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Capture context</h2>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste a memo, meeting notes, a research summary, a company profile..."
          rows={6}
          className="w-full resize-y rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-emerald-500/50 focus:outline-none"
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={ingestText}
            disabled={ingesting || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ingesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Add text
          </button>

          <div className="text-xs text-ink-faint">or</div>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-1.5 text-sm text-ink-muted hover:text-ink">
            <Upload className="h-3.5 w-3.5" />
            {file ? file.name : 'Choose file'}
            <input
              type="file"
              className="hidden"
              accept=".txt,.md,.pdf,.docx,.html,.csv"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {file && (
            <button
              onClick={ingestFile}
              disabled={ingesting}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ingesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload
            </button>
          )}
        </div>

        {ingestStatus && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
              ingestStatus.ok
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'
                : 'border-red-500/30 bg-red-500/5 text-red-200'
            }`}
          >
            {ingestStatus.ok ? (
              <CheckCircle2 className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            ) : (
              <XCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            )}
            <span>{ingestStatus.message}</span>
          </div>
        )}
      </section>

      {/* ─── Search ─────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Ask the brain</h2>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2">
            <Search className="h-3.5 w-3.5 text-ink-faint" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') runSearch()
              }}
              placeholder="What did we decide about the Q3 budget?"
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
          <button
            onClick={runSearch}
            disabled={searching || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Search
          </button>
        </div>

        {searchResult && (
          <div className="mt-4">
            {!searchResult.ok && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
                {searchResult.error ?? 'Search failed.'}
              </div>
            )}
            {searchResult.ok && (searchResult.results?.length ?? 0) === 0 && (
              <div className="rounded-md border border-line bg-canvas px-3 py-2 text-xs text-ink-muted">
                No matches. Try capturing some context first.
              </div>
            )}
            {searchResult.ok && (searchResult.results?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                  Results · {searchResult.count}
                </div>
                {searchResult.results!.map((hit, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-line bg-canvas p-3"
                  >
                    <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                      <FileText className="h-3 w-3" />
                      <span>#{i + 1}</span>
                      {typeof hit.score === 'number' && (
                        <span>score {hit.score.toFixed(3)}</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-ink">
                      {hit.text ?? JSON.stringify(hit)}
                    </div>
                    {hit.edges && hit.edges.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {hit.edges.slice(0, 6).map((edge, ei) => (
                          <span
                            key={ei}
                            className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-muted"
                          >
                            {edge.source} <span className="text-ink-faint">·{edge.relation}·</span>{' '}
                            {edge.target}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
