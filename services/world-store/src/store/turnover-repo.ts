// Viragem de temporada PERSISTIDA (SPEC-021 — Fatia 3). Porta o `advanceWorld` (viragem pura do
// engine, in-memory) para o snapshot Postgres, numa transação atômica (a linha do tempo do mundo é
// all-or-nothing). Deriva os `immuneIds` (humanos) de `world_occupation` → o humano SOBREVIVE à
// virada (não aposenta/transfere como NPC); o engine fica golden-safe (fala de ids). Overwrite
// in-place + re-aplica as ocupações + grava a auditoria. Idempotente (lock + season_id). OP-11.
import { and, eq, sql } from 'drizzle-orm';
import {
  advanceWorld,
  turnoverReport as buildTurnoverReport,
  type WorldSeasonResult,
  type WorldState,
} from '@camisa-9/world-engine';
import type { Db } from '../client.js';
import { athlete, club, league, world, worldOccupation, worldTier } from '../schema/world.js';
import { season } from '../schema/season.js';
import { turnoverReport } from '../schema/turnover.js';
import { worldStateToRows } from '../mapping/world-mapper.js';
import { readWorld } from './world-repo.js';
import { readWorldOccupations, type OccupationView } from './occupation-repo.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Erro de domínio da viragem — mensagem já genérica/segura (OP-11). */
export class TurnoverError extends Error {}

export type TurnoverStatus = 'rolled' | 'already_rolled' | 'locked';

export interface TurnoverOutcome {
  readonly status: TurnoverStatus;
  readonly fromSeasonId: string;
  readonly toSeasonId: string | null;
}

/**
 * Vira a temporada e persiste. Lê mundo/ocupações/âncora (fora da tx: estáveis na janela pós-última-
 * rodada), roda `advanceWorld` com os imunes, e numa ÚNICA transação sobrescreve o snapshot,
 * re-aplica as ocupações, grava o `turnover_report` e semeia a nova âncora. Idempotente. Falha →
 * ROLLBACK total (season_id inalterado → o tick deriva `deferred`).
 */
export async function persistWorldTurnover(
  db: Db,
  seed: string,
  results: WorldSeasonResult,
  dayIndex: number,
): Promise<TurnoverOutcome> {
  const before = await readWorld(db, seed);
  if (!before) throw new TurnoverError('mundo não encontrado');
  if (before.seasonId !== results.seasonId) {
    return {
      status: 'already_rolled',
      fromSeasonId: results.seasonId,
      toSeasonId: before.seasonId,
    };
  }
  // Ocupações lidas na janela pós-temporada (estáveis: publicada a rodada 1, occupyNpcSlot é
  // barrado pela guarda de gênese). Race conhecido e ESTREITO: numa temporada 100% deferida (zero
  // rodadas publicadas — falha catastrófica já gritando no monitor) uma ocupação concorrente na
  // janela da tx poderia se perder; endurecer = ler sob o lock / cross-lock com occupyNpcSlot.
  const occupations = await readWorldOccupations(db, seed);
  const immuneIds = new Set(occupations.map((o) => o.athleteId));
  const after = advanceWorld(before, results, seed, immuneIds);
  const report = buildTurnoverReport(before, after);
  // A nova temporada começa no DIA SEGUINTE ao dia REAL da virada — não no calendário ideal — para
  // NÃO pular a rodada 1 se a virada rodar atrasada (deferida → retry N dias depois). SPEC crit. 7.
  const newStart = dayIndex + 1;

  return db.transaction(async (tx) => {
    if (!(await acquireRolloverLock(tx, seed, before.seasonId))) {
      return { status: 'locked', fromSeasonId: before.seasonId, toSeasonId: null };
    }
    if ((await currentSeasonId(tx, seed)) !== before.seasonId) {
      return { status: 'already_rolled', fromSeasonId: before.seasonId, toSeasonId: null };
    }
    await overwriteSnapshot(tx, seed, after);
    await reapplyOccupations(tx, seed, occupations, after.seasonId);
    await tx.insert(turnoverReport).values({
      worldSeed: seed,
      fromSeasonId: report.fromSeasonId,
      toSeasonId: report.toSeasonId,
      report,
    });
    await upsertAnchor(tx, seed, after.seasonId, newStart);
    return { status: 'rolled', fromSeasonId: before.seasonId, toSeasonId: after.seasonId };
  });
}

/** try-advisory-xact-lock de mundo-rollover: serializa dois ticks de virada no mesmo season. */
async function acquireRolloverLock(tx: Tx, seed: string, seasonId: string): Promise<boolean> {
  const key = `world:rollover:${seed}:${seasonId}`;
  const res = await tx.execute(
    sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as locked`,
  );
  return res.rows[0]?.['locked'] === true;
}

async function currentSeasonId(tx: Tx, seed: string): Promise<string | null> {
  const rows = await tx
    .select({ seasonId: world.seasonId })
    .from(world)
    .where(eq(world.seed, seed))
    .limit(1);
  return rows[0]?.seasonId ?? null;
}

/** Overwrite in-place: apaga o snapshot (ordem das FKs) e reinsere o mundo virado. */
async function overwriteSnapshot(tx: Tx, seed: string, after: WorldState): Promise<void> {
  await tx.delete(worldOccupation).where(eq(worldOccupation.worldSeed, seed));
  await tx.delete(athlete).where(eq(athlete.worldSeed, seed));
  await tx.delete(club).where(eq(club.worldSeed, seed));
  await tx.delete(league).where(eq(league.worldSeed, seed));
  await tx.delete(worldTier).where(eq(worldTier.worldSeed, seed));
  const rows = worldStateToRows(seed, after);
  await tx.update(world).set({ seasonId: after.seasonId }).where(eq(world.seed, seed));
  if (rows.tiers.length > 0) await tx.insert(worldTier).values(rows.tiers);
  if (rows.leagues.length > 0) await tx.insert(league).values(rows.leagues);
  if (rows.clubs.length > 0) await tx.insert(club).values(rows.clubs);
  if (rows.athletes.length > 0) await tx.insert(athlete).values(rows.athletes);
}

/** Re-aplica a autoridade dos humanos sobre o mundo virado (o write zerou o `is_human`). O
 *  `athlete_id` do imune persiste (não aposentado/transferido); se sumiu, é bug → ROLLBACK. */
async function reapplyOccupations(
  tx: Tx,
  seed: string,
  occupations: readonly OccupationView[],
  newSeasonId: string,
): Promise<void> {
  for (const o of occupations) {
    const updated = await tx
      .update(athlete)
      .set({ isHuman: true, name: o.humanName, ability: o.ability })
      .where(and(eq(athlete.worldSeed, seed), eq(athlete.id, o.athleteId)))
      .returning({ id: athlete.id });
    if (updated.length !== 1) throw new TurnoverError('ocupação órfã após a viragem');
    await tx.insert(worldOccupation).values({
      worldSeed: seed,
      athleteId: o.athleteId,
      humanAthleteId: o.humanAthleteId,
      seasonId: newSeasonId,
      clubId: o.clubId,
      position: o.position,
      humanName: o.humanName,
      ability: o.ability,
      regenRequested: o.regenRequested, // o pedido de regen VOLUNTÁRIO sobrevive à virada (SPEC-022)
      lastActiveDay: o.lastActiveDay, // o relógio de congelamento sobrevive à virada (SPEC-023)
      frozenSinceDay: o.frozenSinceDay,
    });
  }
}

async function upsertAnchor(
  tx: Tx,
  seed: string,
  seasonId: string,
  startDayIndex: number,
): Promise<void> {
  await tx
    .insert(season)
    .values({ worldSeed: seed, seasonId, startDayIndex })
    .onConflictDoUpdate({ target: [season.worldSeed, season.seasonId], set: { startDayIndex } });
}
