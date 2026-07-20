// A waiting-list (SPEC-034): a fila FIFO + o teto + os buscadores de vaga na divisão de entrada.
// SÓ-MUNDO. O teto governa a entrada SOLO (cheio → fila); o passe de admissão (world-entry) drena a
// fila todo dia, herdando as vagas que a inatividade/transferência liberam. `entryCap` é tunável (a
// calibração da escassez é decisão de produto). A entrada de TIME é a SPEC-035 (não usa o teto).
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { athlete, club, league, worldOccupation } from '../schema/world.js';
import { waitingList } from '../schema/waiting-list.js';

/** Teto de humanos SOLO na divisão de entrada (tunável — calibração da escassez). */
export const WAITINGLIST = { entryCap: 200 } as const;

export interface QueueEntry {
  readonly humanAthleteId: string;
  readonly position: string;
  readonly ord: number;
}

/** O maior nº de tier = a divisão de ENTRADA (`league.tier`). null se o mundo não existe. */
async function entryTier(db: Db, seed: string): Promise<number | null> {
  const rows = await db.select({ t: league.tier }).from(league).where(eq(league.worldSeed, seed));
  if (rows.length === 0) return null;
  return Math.max(...rows.map((r) => r.t));
}

/** Quantos humanos ocupam a divisão de entrada (o teto governa isto). */
export async function countEntryHumans(db: Db, seed: string): Promise<number> {
  const tier = await entryTier(db, seed);
  if (tier === null) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(worldOccupation)
    .innerJoin(
      club,
      and(eq(club.worldSeed, worldOccupation.worldSeed), eq(club.id, worldOccupation.clubId)),
    )
    .innerJoin(
      league,
      and(eq(league.worldSeed, club.worldSeed), eq(league.leagueId, club.leagueId)),
    )
    .where(and(eq(worldOccupation.worldSeed, seed), eq(league.tier, tier)));
  return rows[0]?.n ?? 0;
}

/** Um clube da divisão de entrada com vaga NPC livre na posição (menor `ord` de clube — determinístico).
 *  null se nenhum. É o clube que o `enterWorld` vai ocupar (a vaga NPC mais fraca lá). */
export async function findEntryClubWithSlot(
  db: Db,
  seed: string,
  position: string,
): Promise<string | null> {
  const tier = await entryTier(db, seed);
  if (tier === null) return null;
  const rows = await db
    .select({ id: club.id })
    .from(club)
    .innerJoin(
      league,
      and(eq(league.worldSeed, club.worldSeed), eq(league.leagueId, club.leagueId)),
    )
    .innerJoin(athlete, and(eq(athlete.worldSeed, club.worldSeed), eq(athlete.clubId, club.id)))
    .where(
      and(
        eq(club.worldSeed, seed),
        eq(league.tier, tier),
        eq(athlete.position, position),
        eq(athlete.isHuman, false),
      ),
    )
    .orderBy(asc(club.ord))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Enfileira (FIFO): `ord = max + 1` do mundo. 1 entrada/humano (`onConflictDoNothing`). Lock advisory
 *  por-mundo serializa enfileiramentos concorrentes → sem colisão de `ord`. */
export async function enqueue(
  db: Db,
  seed: string,
  humanAthleteId: string,
  position: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`waitlist:${seed}`}, 0))`);
    const rows = await tx
      .select({ m: sql<number>`coalesce(max(${waitingList.ord}), -1)::int` })
      .from(waitingList)
      .where(eq(waitingList.worldSeed, seed));
    const ord = (rows[0]?.m ?? -1) + 1;
    await tx
      .insert(waitingList)
      .values({ worldSeed: seed, humanAthleteId, position, ord })
      .onConflictDoNothing();
  });
}

/** Remove da fila (ao admitir). Idempotente. */
export async function dequeue(db: Db, seed: string, humanAthleteId: string): Promise<void> {
  await db
    .delete(waitingList)
    .where(and(eq(waitingList.worldSeed, seed), eq(waitingList.humanAthleteId, humanAthleteId)));
}

/** A fila em ordem FIFO (`ord` asc). */
export async function readQueue(db: Db, seed: string): Promise<QueueEntry[]> {
  const rows = await db
    .select()
    .from(waitingList)
    .where(eq(waitingList.worldSeed, seed))
    .orderBy(asc(waitingList.ord));
  return rows.map((r) => ({ humanAthleteId: r.humanAthleteId, position: r.position, ord: r.ord }));
}

/** O tamanho da fila. */
export async function queueLength(db: Db, seed: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(waitingList)
    .where(eq(waitingList.worldSeed, seed));
  return rows[0]?.n ?? 0;
}
