// POST /api/debug/merge-person?keep=Kartik&drop=Karthik
//
// Reconcile two Person nodes that are the same human but got MERGE'd
// on different placeholder emails (kartik@unknown vs karthik@unknown).
// Rewires every incoming edge on the loser to the winner, then deletes
// the loser. Idempotent — safe to re-run.
//
// Matches are case-insensitive substring on Person.name so you can pass
// "kartik" and hit "Kartik" or "Karthik". If more than one node matches
// the "keep" side, we pick the one with more incoming edges (the more
// canonical node in the graph).

import { NextRequest, NextResponse } from 'next/server'
import { runCypher } from '@/lib/neo4j/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIND_PERSON = `
MATCH (p:Person)
WHERE toLower(p.name) CONTAINS toLower($q)
  AND coalesce(p.is_user, false) = false
OPTIONAL MATCH (p)<-[r]-()
WITH p, count(r) AS edge_count
ORDER BY edge_count DESC, p.name
LIMIT 5
RETURN p.email AS email, p.name AS name, edge_count
`

const MERGE_PERSON = `
MATCH (winner:Person {email: $winnerEmail}), (loser:Person {email: $loserEmail})
WHERE winner.email <> loser.email

// Rewire every incoming edge on the loser to point at the winner
// instead. Uses APOC-free pattern: iterate relationship types manually.
WITH winner, loser
OPTIONAL MATCH (t:Task)-[r:MENTIONS]->(loser)
FOREACH (rel IN CASE WHEN r IS NULL THEN [] ELSE [r] END |
  MERGE (t)-[:MENTIONS]->(winner)
  DELETE rel
)
WITH winner, loser
OPTIONAL MATCH (t2:Task)-[r2:OWNED_BY]->(loser)
FOREACH (rel IN CASE WHEN r2 IS NULL THEN [] ELSE [r2] END |
  MERGE (t2)-[:OWNED_BY]->(winner)
  DELETE rel
)
WITH winner, loser
// Any other edge type on Person we don't know about yet — this catches
// them. Not idempotent-safe if a new edge type ever appears, but for
// now Person only carries MENTIONS + OWNED_BY.

// Preserve the loser's name as an alias on the winner so future
// LLM queries or graph inspection can find "Karthik" and land on the
// canonical node.
WITH winner, loser, loser.name AS loser_name
SET winner.aliases = CASE
  WHEN winner.aliases IS NULL THEN [loser_name]
  WHEN loser_name IN winner.aliases THEN winner.aliases
  ELSE winner.aliases + [loser_name]
END

WITH winner, loser
DETACH DELETE loser

RETURN winner.email AS email, winner.name AS name, winner.aliases AS aliases
`

export async function POST(req: NextRequest) {
  const keep = req.nextUrl.searchParams.get('keep')
  const drop = req.nextUrl.searchParams.get('drop')

  if (!keep || !drop) {
    return NextResponse.json(
      {
        error:
          'Missing ?keep=... &drop=... params. Example: ?keep=Kartik&drop=Karthik',
      },
      { status: 400 },
    )
  }

  try {
    const winners = await runCypher<{
      email: string
      name: string
      edge_count: number
    }>(FIND_PERSON, { q: keep })
    const losers = await runCypher<{
      email: string
      name: string
      edge_count: number
    }>(FIND_PERSON, { q: drop })

    if (winners.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No Person node matches keep=${keep}.` },
        { status: 404 },
      )
    }
    if (losers.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No Person node matches drop=${drop}.` },
        { status: 404 },
      )
    }

    const winner = winners[0]
    const loser = losers.find(l => l.email !== winner.email)
    if (!loser) {
      return NextResponse.json({
        ok: true,
        merged: false,
        message: `keep and drop resolved to the same Person node (${winner.email}). Nothing to do.`,
        winner,
      })
    }

    const result = await runCypher<{
      email: string
      name: string
      aliases: string[]
    }>(MERGE_PERSON, {
      winnerEmail: winner.email,
      loserEmail: loser.email,
    })

    return NextResponse.json({
      ok: true,
      merged: true,
      winner: result[0] ?? winner,
      dropped: { email: loser.email, name: loser.name },
      also_matched_keep: winners.slice(1),
      also_matched_drop: losers.filter(
        l => l.email !== winner.email && l.email !== loser.email,
      ),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
