// Conexão Postgres POOLED/TCP (SPEC-013). O driver HTTP one-shot da Neon NÃO serve —
// a Fatia 2 (publicador all-or-nothing) exige transação interativa multi-statement.
// `DATABASE_URL` é server-only (OP-02/OP-12) — nunca hardcoded, nunca no cliente.
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/world.js';

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  readonly db: Db;
  readonly pool: Pool;
}

/** Cria o handle de banco a partir da `DATABASE_URL` (pool TCP). Feche com `pool.end()`. */
export function createDb(url: string): DbHandle {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
