// Publicador de rodada TRANSACIONAL (SPEC-014 — Fatia 2). Porte fiel do RoundPublisher
// da SPEC-002 (in-memory) para Postgres real: a publicação é uma transação interativa
// (BEGIN → stage → COMMIT) que prova a atomicidade de BANCO (all-or-nothing durável)
// que o shim in-memory deliberadamente não provava. Reusa o CONTRATO público do engine
// (PublishInput/PublishOutcome) — o engine fica intocado (OP-17).
import { and, eq, sql } from 'drizzle-orm';
import type {
  MatchResult,
  PublishInput,
  PublishOutcome,
  RoundResult,
} from '@camisa-9/world-engine';
import type { Db } from '../client.js';
import { publishedRound } from '../schema/round.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Publica uma rodada numa ÚNICA transação. Advisory lock (não-bloqueante, xact-scoped)
 * mapeia a semântica `locked` do lock in-process; a PK composta é a idempotência durável;
 * `onBeforeCommit` (sync OU async) que falha rola TUDO de volta (nada meio-publicado).
 */
export async function publishRound(
  db: Db,
  input: PublishInput,
  onBeforeCommit?: () => void | Promise<void>,
): Promise<PublishOutcome> {
  const { leagueId, seasonId } = input;
  const round = input.result.round;
  const key = `${leagueId}:${seasonId}:${round}`;
  return db.transaction(async (tx) => {
    if (!(await acquireLock(tx, key))) return { status: 'locked', round };
    if (await roundExists(tx, leagueId, seasonId, round)) return { status: 'idempotent', round };
    await tx.insert(publishedRound).values({ leagueId, seasonId, round, result: input.result });
    // await OBRIGATÓRIO: sem ele, uma rejeição assíncrona vazaria e a rodada commitaria
    // errada. Com ele, a falha propaga → o Drizzle faz ROLLBACK da transação inteira.
    await onBeforeCommit?.();
    return { status: 'published', round };
  });
}

/** Lê o RoundResult de uma rodada publicada (null se não existe). */
export async function readRound(
  db: Db,
  leagueId: string,
  seasonId: string,
  round: number,
): Promise<RoundResult | null> {
  const rows = await db
    .select({ result: publishedRound.result })
    .from(publishedRound)
    .where(roundEq(leagueId, seasonId, round))
    .limit(1);
  return rows[0]?.result ?? null;
}

/**
 * TODAS as partidas publicadas de uma liga numa temporada (SPEC-053) — o insumo da classificação
 * final. Lê o `published_round` porque, depois da viragem, o snapshot do mundo já foi sobrescrito:
 * as rodadas publicadas são a única memória do que de fato aconteceu naquela temporada.
 * Ordenado por rodada (determinístico); `[]` se a temporada não tem rodada publicada.
 */
export async function readSeasonMatches(
  db: Db,
  leagueId: string,
  seasonId: string,
): Promise<readonly MatchResult[]> {
  const rows = await db
    .select({ result: publishedRound.result })
    .from(publishedRound)
    .where(and(eq(publishedRound.leagueId, leagueId), eq(publishedRound.seasonId, seasonId)))
    .orderBy(publishedRound.round);
  return rows.flatMap((r) => r.result.matches);
}

/** Rodada-do-mundo: a rodada N de TODAS as ligas, publicada junta. */
export interface WorldRoundInput {
  readonly seasonId: string;
  readonly round: number;
  readonly leagues: readonly { readonly leagueId: string; readonly result: RoundResult }[];
}

/**
 * Publica a rodada N de TODAS as ligas numa ÚNICA transação (grão-MUNDO, all-or-nothing —
 * charter: a linha do tempo do mundo é all-or-nothing). Advisory lock world-day + INSERT
 * multi-linha + seam. Idempotente por (season_id, round). Falha (sync/async) → ROLLBACK total.
 */
export async function publishWorldRound(
  db: Db,
  input: WorldRoundInput,
  onBeforeCommit?: () => void | Promise<void>,
): Promise<PublishOutcome> {
  const { seasonId, round } = input;
  const key = `world:${seasonId}:${round}`;
  return db.transaction(async (tx) => {
    if (!(await acquireLock(tx, key))) return { status: 'locked', round };
    if (await worldRoundExists(tx, seasonId, round)) return { status: 'idempotent', round };
    await tx
      .insert(publishedRound)
      .values(
        input.leagues.map((l) => ({ leagueId: l.leagueId, seasonId, round, result: l.result })),
      );
    await onBeforeCommit?.();
    return { status: 'published', round };
  });
}

/** Existe QUALQUER liga publicada em (season, round)? Grão-mundo é all-or-nothing → uma ⇔ todas. */
async function worldRoundExists(tx: Tx, seasonId: string, round: number): Promise<boolean> {
  const rows = await tx
    .select({ leagueId: publishedRound.leagueId })
    .from(publishedRound)
    .where(and(eq(publishedRound.seasonId, seasonId), eq(publishedRound.round, round)))
    .limit(1);
  return rows.length > 0;
}

/** try-advisory-xact-lock: true se adquiriu; false se outra sessão o segura (→ locked). */
async function acquireLock(tx: Tx, key: string): Promise<boolean> {
  const res = await tx.execute(
    sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as locked`,
  );
  return res.rows[0]?.['locked'] === true;
}

async function roundExists(
  tx: Tx,
  leagueId: string,
  seasonId: string,
  round: number,
): Promise<boolean> {
  const rows = await tx
    .select({ leagueId: publishedRound.leagueId })
    .from(publishedRound)
    .where(roundEq(leagueId, seasonId, round))
    .limit(1);
  return rows.length > 0;
}

function roundEq(leagueId: string, seasonId: string, round: number) {
  return and(
    eq(publishedRound.leagueId, leagueId),
    eq(publishedRound.seasonId, seasonId),
    eq(publishedRound.round, round),
  );
}
