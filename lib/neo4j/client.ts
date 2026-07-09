// Neo4j driver — singleton across the app.
//
// Import this everywhere that touches the graph. Do not create new
// Driver instances in each module: driver holds a connection pool.

import neo4j, { Driver, Session, isInt } from 'neo4j-driver'

let _driver: Driver | null = null

/**
 * Recursively convert Neo4j Integer values (and any nested {low, high} shapes)
 * to plain JS numbers so results can safely cross the Server → Client
 * Component boundary in Next.js.
 */
function normalizeNeo4jValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (isInt(value as any)) {
    const n = value as any
    return n.inSafeRange() ? n.toNumber() : n.toString()
  }
  if (Array.isArray(value)) return value.map(normalizeNeo4jValue)
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src)) out[k] = normalizeNeo4jValue(src[k])
    return out
  }
  return value
}

function getDriver(): Driver {
  if (_driver) return _driver
  const uri = process.env.NEO4J_URI
  const user = process.env.NEO4J_USER
  const password = process.env.NEO4J_PASSWORD
  if (!uri || !user || !password) {
    throw new Error(
      'Missing Neo4j env vars: NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD. See .env.example.'
    )
  }
  _driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 20,
    connectionAcquisitionTimeout: 10_000,
  })
  return _driver
}

/**
 * Run a Cypher query and return records mapped through the provided
 * transformer. Auto-closes the session; use for read queries or single
 * write statements. For multi-statement transactions, use runTx.
 */
export async function runCypher<T>(
  cypher: string,
  params: Record<string, unknown> = {},
  map: (record: neo4j.Record) => T = (r) => normalizeNeo4jValue(r.toObject()) as T,
): Promise<T[]> {
  const driver = getDriver()
  const session: Session = driver.session()
  try {
    const result = await session.run(cypher, params)
    return result.records.map(map)
  } finally {
    await session.close()
  }
}

/**
 * Multi-statement transaction wrapper. Use when a single logical change
 * requires several MERGE + MATCH + SET statements to stay consistent.
 */
export async function runTx<T>(
  work: (tx: neo4j.ManagedTransaction) => Promise<T>,
  mode: 'read' | 'write' = 'write',
): Promise<T> {
  const driver = getDriver()
  const session = driver.session()
  try {
    return mode === 'write'
      ? await session.executeWrite(work)
      : await session.executeRead(work)
  } finally {
    await session.close()
  }
}

/**
 * Close the driver on graceful shutdown. Next.js may call this from
 * onBeforeUnload; RocketRide pipelines can call at pipeline end.
 */
export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close()
    _driver = null
  }
}
