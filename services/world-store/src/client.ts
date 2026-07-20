// Conexão Postgres POOLED/TCP (SPEC-013). O driver HTTP one-shot da Neon NÃO serve —
// a Fatia 2 (publicador all-or-nothing) exige transação interativa multi-statement.
// SPEC-035 (Fatia 4 — Neon): o driver é endurecido p/ produção na Neon (SSL + tuning de
// autosuspend) e o endpoint de migrations é separado (direct/unpooled). `DATABASE_URL` é
// server-only (OP-02/OP-12) — nunca hardcoded, nunca no cliente.
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  readonly db: Db;
  readonly pool: Pool;
}

/** Env é lida como um mapa simples (compatível com `process.env`). */
type Env = Record<string, string | undefined>;

const NEON_HOST_SUFFIX = '.neon.tech';

/** Hostname da URL, ou '' se ela for inválida (heurística de SSL — não lança). */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Config do Pool a partir da `DATABASE_URL` (puro, testável sem DB). Liga SSL quando o host é
 * Neon (`*.neon.tech`) ou a URL pede (`sslmode=…`) — desligado em local (plaintext).
 * ⚠️ Quando a URL tem `sslmode`, o `pg` DERIVA o SSL dela (o parse da connection string vence o
 * objeto explícito abaixo via Object.assign) → use `sslmode=verify-full` nas URLs Neon p/ garantir
 * a verificação do certificado à prova de futuro (ver ADR-002). O objeto explícito só é honrado no
 * caso host-Neon-SEM-`sslmode`. O tuning cobre o autosuspend (timeout folgado dá tempo do cold-start).
 */
export function buildPoolConfig(url: string): PoolConfig {
  const wantsSsl =
    /[?&]sslmode=(require|verify-ca|verify-full)(&|$)/i.test(url) ||
    hostOf(url).endsWith(NEON_HOST_SUFFIX);
  return {
    connectionString: url,
    // Neon usa CA pública → `rejectUnauthorized: true` verifica o certificado (não o desliga).
    ...(wantsSsl ? { ssl: { rejectUnauthorized: true } } : {}),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // keepAlive protege conexões EM USO contra drop de NAT/middlebox (NÃO impede o autosuspend
    // da Neon, que é por ausência de query, não de socket).
    keepAlive: true,
  };
}

/**
 * URL para MIGRATIONS: prefere o endpoint DIRECT (unpooled) — o migrator do drizzle e o DDL
 * não devem depender do PgBouncer (transaction-pooling do endpoint pooled). Puro.
 * Usa `||` (não `??`): um `DATABASE_URL_UNPOOLED=` VAZIO cai na `DATABASE_URL` (o `.env.example`
 * documenta que ele pode ficar vazio) — um endpoint vazio nunca é um endpoint válido.
 */
export function pickMigrationUrl(env: Env): string | undefined {
  return env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || undefined;
}

/** Cria o handle de banco a partir da `DATABASE_URL` (pool TCP). Feche com `pool.end()`. */
export function createDb(url: string): DbHandle {
  const pool = new Pool(buildPoolConfig(url));
  const db = drizzle(pool, { schema });
  return { db, pool };
}
