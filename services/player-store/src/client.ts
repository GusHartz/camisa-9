// Conexão Postgres POOLED/TCP (SPEC-016) — mesmo padrão do world-store. `DATABASE_URL`
// é server-only (OP-02/OP-12). O player-store compartilha o DB, mas vive no schema `player`.
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

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
