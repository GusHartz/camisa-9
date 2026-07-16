// Repositório do snapshot (SPEC-013). ORQUESTRA a transação (a lógica pura vive no
// mapper). `writeWorldState` grava TUDO numa transação única — all-or-nothing: se
// qualquer INSERT falha, nada fica (prova de atomicidade da Fatia 2, exercitada aqui).
import { and, eq } from 'drizzle-orm';
import { seedWorld, type Athlete, type WorldState } from '@camisa-9/world-engine';
import type { Db } from '../client.js';
import { athlete, club, league, world, worldTier } from '../schema/world.js';
import { rowToAthlete, rowsToWorldState, worldStateToRows } from '../mapping/world-mapper.js';

/** Semeia a `seed` e persiste o WorldState resultante (fonte-da-verdade + snapshot). */
export async function writeWorld(db: Db, seed: string): Promise<void> {
  await writeWorldState(db, seed, seedWorld(seed));
}

/** Persiste um WorldState já pronto em UMA transação (all-or-nothing). */
export async function writeWorldState(db: Db, seed: string, state: WorldState): Promise<void> {
  const rows = worldStateToRows(seed, state);
  await db.transaction(async (tx) => {
    await tx.insert(world).values(rows.world);
    if (rows.tiers.length > 0) await tx.insert(worldTier).values(rows.tiers);
    if (rows.leagues.length > 0) await tx.insert(league).values(rows.leagues);
    if (rows.clubs.length > 0) await tx.insert(club).values(rows.clubs);
    if (rows.athletes.length > 0) await tx.insert(athlete).values(rows.athletes);
  });
}

/** Lê o WorldState completo da `seed` (null se não existe). Strength é recomputada. */
export async function readWorld(db: Db, seed: string): Promise<WorldState | null> {
  const worldRows = await db.select().from(world).where(eq(world.seed, seed));
  const worldRow = worldRows[0];
  if (!worldRow) return null;
  const [tiers, leagues, clubs, athletes] = await Promise.all([
    db.select().from(worldTier).where(eq(worldTier.worldSeed, seed)),
    db.select().from(league).where(eq(league.worldSeed, seed)),
    db.select().from(club).where(eq(club.worldSeed, seed)),
    db.select().from(athlete).where(eq(athlete.worldSeed, seed)),
  ]);
  return rowsToWorldState({ world: worldRow, tiers, leagues, clubs, athletes });
}

/** Reader de consulta tipado: o elenco de um clube, em ordem canônica. */
export async function readClubRoster(db: Db, seed: string, clubId: string): Promise<Athlete[]> {
  const rows = await db
    .select()
    .from(athlete)
    .where(and(eq(athlete.worldSeed, seed), eq(athlete.clubId, clubId)));
  return [...rows].sort((a, b) => a.ord - b.ord).map(rowToAthlete);
}
