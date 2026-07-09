// Apply the Cypher schema to Neo4j.
//
// Usage: npm run schema:init
//
// Reads lib/neo4j/schema.cypher and executes each statement in order.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runCypher, closeDriver } from '../lib/neo4j/client'

async function main() {
  const path = resolve(__dirname, '..', 'lib', 'neo4j', 'schema.cypher')
  const source = readFileSync(path, 'utf8')

  // Split on semicolons at end-of-line, drop comments and empty lines.
  const statements = source
    .split(/;\s*(?:\n|$)/)
    .map(s =>
      s
        .split('\n')
        .filter(line => !line.trim().startsWith('//'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean)

  console.log(`Applying ${statements.length} schema statements...`)

  for (const stmt of statements) {
    console.log(`\n> ${stmt.slice(0, 80)}...`)
    try {
      await runCypher(stmt)
      console.log('  ok')
    } catch (err) {
      console.error('  FAILED:', err instanceof Error ? err.message : err)
    }
  }

  await closeDriver()
  console.log('\nSchema applied.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
