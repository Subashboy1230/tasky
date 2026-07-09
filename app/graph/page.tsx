'use client'

import { useState } from 'react'
import { Send, Loader2, Sparkles, Network } from 'lucide-react'

interface AskResult {
  cypher: string | null
  explanation: string
  rows: Record<string, unknown>[]
}

const SUGGESTIONS = [
  'What do I owe Matthew this week?',
  'Show open commits from the Nummo partnership',
  'Which tasks mention Anna Choi and are urgent?',
  'How many open tasks per source?',
]

export default function GraphPage() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<AskResult | null>(null)
  const [loading, setLoading] = useState(false)

  const ask = async (q?: string) => {
    const query = (q ?? question).trim()
    if (!query) return
    setQuestion(query)
    setLoading(true)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: query }),
      })
      const data = (await res.json()) as AskResult
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1120px] px-8 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ask the graph</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
          Natural language becomes read-only Cypher and executes against Neo4j Aura.
          Every answer shows you the query that ran.
        </p>
      </header>

      {/* Input */}
      <div className="rounded-2xl border border-line bg-surface p-2.5">
        <div className="flex items-center gap-2">
          <Network size={14} className="ml-2 text-ink-faint" />
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask()}
            placeholder="Ask about people, tasks, projects, threads…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          />
          <button
            onClick={() => ask()}
            disabled={loading || !question.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-40"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            {loading ? 'Thinking' : 'Ask'}
          </button>
        </div>
      </div>

      {!result && !loading && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            <Sparkles size={11} /> Try one
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink hover:border-line-strong"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <Panel label="Interpretation">
            <div className="text-sm text-ink">{result.explanation}</div>
          </Panel>

          {result.cypher && (
            <Panel label="Generated Cypher">
              <pre className="overflow-x-auto rounded-md bg-canvas p-3 text-xs text-emerald-200/90">
                {result.cypher}
              </pre>
            </Panel>
          )}

          <Panel label={`Results · ${result.rows.length}`}>
            {result.rows.length === 0 ? (
              <div className="text-xs text-ink-faint">No matches.</div>
            ) : (
              <ResultsTable rows={result.rows} />
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </div>
      {children}
    </div>
  )
}

function ResultsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = Array.from(
    rows.reduce<Set<string>>((s, r) => {
      Object.keys(r).forEach(k => s.add(k))
      return s
    }, new Set()),
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
            {keys.map(k => (
              <th key={k} className="border-b border-line pb-1.5 pr-4 font-medium">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/50 last:border-0">
              {keys.map(k => (
                <td key={k} className="py-1.5 pr-4 text-ink-muted">
                  {formatCell(r[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
