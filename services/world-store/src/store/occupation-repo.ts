// Ocupação de vaga NPC por um humano (SPEC-020, card 21) — o PRIMEIRO caminho de mutação do
// snapshot. Transação só-no-mundo (não cruza schema): escolhe a vaga do NPC mais fraco na
// posição (FOR UPDATE), grava o humano na linha (cache: name/ability/is_human) e a AUTORIDADE
// no overlay `world_occupation`. Guarda da GÊNESE: rejeita se a temporada já publicou rodada
// (a re-simulação a cada tick exige snapshot imutável na temporada). A projeção focos→ability
// é da lib pura (OP-17); aqui só orquestra. Erros GENÉRICOS, sem SQL/stack (OP-11).
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Position } from '@camisa-9/world-engine';
import type { Db } from '../client.js';
import { athlete, club, league, world, worldOccupation, worldTier } from '../schema/world.js';
import { publishedRound } from '../schema/round.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Erro de domínio da ocupação — mensagem já é genérica/segura (OP-11). */
export class OccupyError extends Error {}

export interface OccupyInput {
  readonly worldSeed: string;
  readonly clubId: string;
  readonly position: Position;
  readonly humanAthleteId: string;
  readonly humanName: string;
  readonly ability: number;
}

export interface OccupyResult {
  readonly worldAthleteId: string;
  readonly clubId: string;
  readonly position: Position;
  readonly ability: number;
  readonly seasonId: string;
}

/** Ocupa a vaga do NPC mais fraco da posição no clube, numa transação all-or-nothing. */
export async function occupyNpcSlot(db: Db, input: OccupyInput): Promise<OccupyResult> {
  try {
    return await db.transaction(async (tx) => {
      const seasonId = await worldSeasonId(tx, input.worldSeed);
      // Rendezvous com publishWorldRound (round-repo): lock advisory COMPARTILHADO na chave da
      // rodada 1 (a que "abre" a temporada). Ocupações são mútuas-compatíveis (shared×shared não
      // bloqueia); a publicação da rodada 1 toma o EXCLUSIVO → serializa contra a ocupação. Fecha
      // o TOCTOU: nenhuma rodada 1 commita entre o assertGenesis e o commit da ocupação.
      await acquireSeasonStartLock(tx, seasonId);
      await assertGenesis(tx, seasonId);
      await assertEntryClub(tx, input.worldSeed, input.clubId);
      const worldAthleteId = await weakestNpcSlotId(tx, input);
      await tx
        .update(athlete)
        .set({ name: input.humanName, ability: input.ability, isHuman: true })
        .where(and(eq(athlete.worldSeed, input.worldSeed), eq(athlete.id, worldAthleteId)));
      await tx.insert(worldOccupation).values({
        worldSeed: input.worldSeed,
        athleteId: worldAthleteId,
        humanAthleteId: input.humanAthleteId,
        seasonId,
        clubId: input.clubId,
        position: input.position,
        humanName: input.humanName,
        ability: input.ability,
      });
      return {
        worldAthleteId,
        clubId: input.clubId,
        position: input.position,
        ability: input.ability,
        seasonId,
      };
    });
  } catch (err) {
    if (err instanceof OccupyError) throw err;
    if (isUniqueViolation(err)) throw new OccupyError('vaga ou humano já ocupado');
    throw new OccupyError('não foi possível ocupar a vaga');
  }
}

export interface OccupationView {
  readonly worldSeed: string;
  readonly athleteId: string;
  readonly humanAthleteId: string;
  readonly seasonId: string;
  readonly clubId: string;
  readonly position: string;
  readonly humanName: string;
  readonly ability: number;
}

/** A ocupação de um humano num mundo (null se não ocupa nenhuma vaga). */
export async function readOccupation(
  db: Db,
  worldSeed: string,
  humanAthleteId: string,
): Promise<OccupationView | null> {
  const rows = await db
    .select()
    .from(worldOccupation)
    .where(
      and(
        eq(worldOccupation.worldSeed, worldSeed),
        eq(worldOccupation.humanAthleteId, humanAthleteId),
      ),
    )
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    worldSeed: r.worldSeed,
    athleteId: r.athleteId,
    humanAthleteId: r.humanAthleteId,
    seasonId: r.seasonId,
    clubId: r.clubId,
    position: r.position,
    humanName: r.humanName,
    ability: r.ability,
  };
}

/** Lock advisory COMPARTILHADO na chave da rodada 1 da temporada — mesmo namespace que o
 *  publishWorldRound (exclusivo). shared×shared não bloqueia (ocupações concorrentes seguem);
 *  shared×exclusive serializa (ocupação vs. publicação da rodada que abre a temporada). */
async function acquireSeasonStartLock(tx: Tx, seasonId: string): Promise<void> {
  const key = `world:${seasonId}:1`;
  await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`);
}

/** A ocupação só vale na DIVISÃO DE ENTRADA (o maior nº de tier). Autoridade server-side: não
 *  confia num clubId da rota futura (OP-09). Clube inexistente ou de outro tier → erro genérico. */
async function assertEntryClub(tx: Tx, worldSeed: string, clubId: string): Promise<void> {
  const clubRows = await tx
    .select({ tier: league.tier })
    .from(club)
    .innerJoin(
      league,
      and(eq(club.worldSeed, league.worldSeed), eq(club.leagueId, league.leagueId)),
    )
    .where(and(eq(club.worldSeed, worldSeed), eq(club.id, clubId)))
    .limit(1);
  const clubTier = clubRows[0]?.tier;
  if (clubTier === undefined) throw new OccupyError('clube não encontrado');
  const tierRows = await tx
    .select({ tier: worldTier.tier })
    .from(worldTier)
    .where(eq(worldTier.worldSeed, worldSeed));
  const entryTier = Math.max(...tierRows.map((t) => t.tier));
  if (clubTier !== entryTier) throw new OccupyError('clube fora da divisão de entrada');
}

/** seasonId atual do mundo (a temporada em que a ocupação é gravada). */
async function worldSeasonId(tx: Tx, worldSeed: string): Promise<string> {
  const rows = await tx
    .select({ seasonId: world.seasonId })
    .from(world)
    .where(eq(world.seed, worldSeed))
    .limit(1);
  const r = rows[0];
  if (!r) throw new OccupyError('mundo não encontrado');
  return r.seasonId;
}

/** Guarda da gênese: a temporada NÃO pode ter rodada publicada (senão a re-simulação a cada
 *  tick reescreveria rounds já publicados — a trava do MEMORY.md). Presença ⇒ rejeita. */
async function assertGenesis(tx: Tx, seasonId: string): Promise<void> {
  const rows = await tx
    .select({ round: publishedRound.round })
    .from(publishedRound)
    .where(eq(publishedRound.seasonId, seasonId))
    .limit(1);
  if (rows.length > 0) throw new OccupyError('temporada em andamento — entrada só na gênese');
}

/** Id da vaga do NPC mais fraco (menor ability, empate → menor ord) da posição no clube,
 *  travada com FOR UPDATE (serializa a corrida pela vaga). Sem NPC livre → erro. */
async function weakestNpcSlotId(tx: Tx, input: OccupyInput): Promise<string> {
  const rows = await tx
    .select({ id: athlete.id })
    .from(athlete)
    .where(
      and(
        eq(athlete.worldSeed, input.worldSeed),
        eq(athlete.clubId, input.clubId),
        eq(athlete.position, input.position),
        eq(athlete.isHuman, false),
      ),
    )
    .orderBy(asc(athlete.ability), asc(athlete.ord))
    .limit(1)
    .for('update');
  const r = rows[0];
  if (!r) throw new OccupyError('sem vaga NPC para a posição');
  return r.id;
}

/** pg unique_violation = SQLSTATE 23505 (Drizzle envelopa → caminha a cadeia de causas). */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && isRecord(cur); i++) {
    if (cur['code'] === '23505') return true;
    cur = cur['cause'];
  }
  return false;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
