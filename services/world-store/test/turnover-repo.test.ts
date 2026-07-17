// Viragem PERSISTIDA (SPEC-021 — Fatia 3) contra Postgres REAL. Prova: o mundo vira e persiste
// (season_id++, nova âncora, turnover_report), o resultado bate byte-a-byte com o advanceWorld puro
// (determinismo NPC), o HUMANO sobrevive (imune: não aposenta, is_human re-aplicado), e o rollover
// é atômico/idempotente/serializado por lock. Gated por DATABASE_URL. Serial + reseed por teste.
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  advanceWorld,
  simulateWorldSeason,
  WORLD,
  worldHash,
  type WorldSeasonResult,
  type WorldState,
} from '@camisa-9/world-engine';
import { createDb, type DbHandle } from '../src/client.js';
import { turnoverReport } from '../src/schema/turnover.js';
import { athlete, club, league, world, worldOccupation, worldTier } from '../src/schema/world.js';
import { publishedRound } from '../src/schema/round.js';
import { season } from '../src/schema/season.js';
import { readWorld, writeWorld } from '../src/store/world-repo.js';
import { readSeasonAnchor, setSeasonAnchor } from '../src/store/season-repo.js';
import { occupyNpcSlot, readOccupation } from '../src/store/occupation-repo.js';
import { persistWorldTurnover } from '../src/store/turnover-repo.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'vira-teste';
const START = 20_000;
const ROUNDS = 38;
const ROLL_DAY = START + ROUNDS; // 1º dia com targetRound > roundsLength (a virada ON-TIME)
const H1 = '00000000-0000-0000-0000-0000000000a1';

describe.skipIf(!DB_URL)('turnover-repo — viragem persistida contra Postgres real', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = createDb(DB_URL as string);
    await migrate(handle.db, {
      migrationsFolder: fileURLToPath(new URL('../src/migrations', import.meta.url)),
    });
  });

  afterAll(async () => {
    if (handle) await handle.pool.end();
  });

  beforeEach(async () => {
    await wipeAll();
    await writeWorld(handle.db, SEED); // mundo fresco (season 2026) por teste — o rollover muta
    await setSeasonAnchor(handle.db, SEED, '2026', START);
  });

  async function wipeAll(): Promise<void> {
    await handle.db.delete(turnoverReport);
    await handle.db.delete(worldOccupation);
    await handle.db.delete(publishedRound);
    await handle.db.delete(season);
    await handle.db.delete(athlete);
    await handle.db.delete(club);
    await handle.db.delete(league);
    await handle.db.delete(worldTier);
    await handle.db.delete(world);
  }

  /** O par (mundo atual, resultados da temporada) — como o tick os monta. */
  async function currentResults(): Promise<{ before: WorldState; results: WorldSeasonResult }> {
    const before = (await readWorld(handle.db, SEED))!;
    return { before, results: simulateWorldSeason(before, SEED) };
  }

  function entryClubId(w: WorldState): string {
    return w.tiers[w.tiers.length - 1]!.leagues[0]!.clubs[0]!.id; // divisão de entrada
  }

  it('vira e persiste: season_id++, nova âncora semeada, turnover_report gravado', async () => {
    const { results } = await currentResults();
    const out = await persistWorldTurnover(handle.db, SEED, results, ROLL_DAY);
    expect(out.status).toBe('rolled');
    expect(out.toSeasonId).toBe('2027');
    const after = await readWorld(handle.db, SEED);
    expect(after?.seasonId).toBe('2027');
    expect(after?.tiers).toHaveLength(WORLD.tiers); // pirâmide intacta
    expect(await readSeasonAnchor(handle.db, SEED, '2027')).toBe(START + ROUNDS + 1); // âncora derivada
    const reports = await handle.db
      .select()
      .from(turnoverReport)
      .where(eq(turnoverReport.worldSeed, SEED));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.fromSeasonId).toBe('2026');
    expect(reports[0]?.toSeasonId).toBe('2027');
  });

  it('determinismo NPC: o mundo persistido = advanceWorld puro (worldHash, sem humanos)', async () => {
    const { before, results } = await currentResults();
    await persistWorldTurnover(handle.db, SEED, results, ROLL_DAY);
    const persisted = (await readWorld(handle.db, SEED))!;
    const pure = advanceWorld(before, results, SEED); // immuneIds vazio (sem ocupação)
    expect(worldHash(persisted)).toBe(worldHash(pure));
  });

  it('o humano SOBREVIVE à virada (imune): não aposenta, is_human re-aplicado, ocupação atualizada', async () => {
    const clubId = entryClubId((await readWorld(handle.db, SEED))!);
    const occ = await occupyNpcSlot(handle.db, {
      worldSeed: SEED,
      clubId,
      position: 'GK',
      humanAthleteId: H1,
      humanName: 'Imortal',
      ability: 42,
    });
    // força a idade para 34 → SEM imunidade, aposentaria (34→35) na virada
    await handle.db
      .update(athlete)
      .set({ age: WORLD.retirementAge - 1 })
      .where(eq(athlete.id, occ.worldAthleteId));
    const { results } = await currentResults();
    await persistWorldTurnover(handle.db, SEED, results, ROLL_DAY);

    const rows = await handle.db.select().from(athlete).where(eq(athlete.id, occ.worldAthleteId));
    expect(rows).toHaveLength(1); // sobreviveu (não foi cortado)
    expect(rows[0]?.isHuman).toBe(true); // is_human re-aplicado (o write o havia zerado)
    expect(rows[0]?.age).toBe(WORLD.retirementAge); // 35 — envelheceu, mas imune à aposentadoria
    expect(rows[0]?.name).toBe('Imortal');
    expect(rows[0]?.ability).toBe(42);
    const view = await readOccupation(handle.db, SEED, H1);
    expect(view?.seasonId).toBe('2027'); // ocupação re-aplicada no season novo
    expect(view?.athleteId).toBe(occ.worldAthleteId);
  });

  it('idempotência: virar 2× com os mesmos results → a 2ª é already_rolled, mundo fica em 2027', async () => {
    const { results } = await currentResults();
    await persistWorldTurnover(handle.db, SEED, results, ROLL_DAY);
    const again = await persistWorldTurnover(handle.db, SEED, results, ROLL_DAY);
    expect(again.status).toBe('already_rolled');
    expect((await readWorld(handle.db, SEED))?.seasonId).toBe('2027'); // não virou 2×
  });

  it('atomicidade: falha no meio da virada → ROLLBACK total, mundo permanece em 2026', async () => {
    const { results } = await currentResults();
    // CHECK temporária faz o UPDATE de world.season_id p/ '2027' estourar no meio da transação
    await handle.db.execute(
      sql`ALTER TABLE world ADD CONSTRAINT tmp_no_2027 CHECK (season_id <> '2027')`,
    );
    try {
      await expect(persistWorldTurnover(handle.db, SEED, results, ROLL_DAY)).rejects.toThrow();
    } finally {
      await handle.db.execute(sql`ALTER TABLE world DROP CONSTRAINT tmp_no_2027`);
    }
    expect((await readWorld(handle.db, SEED))?.seasonId).toBe('2026'); // não virou
    expect(await readSeasonAnchor(handle.db, SEED, '2027')).toBeNull(); // sem âncora nova
    const reports = await handle.db
      .select()
      .from(turnoverReport)
      .where(eq(turnoverReport.worldSeed, SEED));
    expect(reports).toHaveLength(0); // nada gravado (all-or-nothing)
  });

  it('lock: uma virada concorrente segurando o advisory lock → locked, mundo intacto', async () => {
    const { results } = await currentResults();
    const client = await handle.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `world:rollover:${SEED}:2026`,
      ]);
      const out = await persistWorldTurnover(handle.db, SEED, results, ROLL_DAY);
      expect(out.status).toBe('locked');
      expect((await readWorld(handle.db, SEED))?.seasonId).toBe('2026'); // intacto
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('virada ATRASADA (deferida→retry): a nova âncora = dia REAL + 1, não o calendário ideal', async () => {
    const { results } = await currentResults();
    const late = ROLL_DAY + 3; // rodou 3 dias depois (a virada foi deferida e retentou)
    const out = await persistWorldTurnover(handle.db, SEED, results, late);
    expect(out.status).toBe('rolled');
    // a rodada 1 de 2027 começa no dia SEGUINTE ao dia REAL da virada → nenhuma rodada pulada
    expect(await readSeasonAnchor(handle.db, SEED, '2027')).toBe(late + 1);
  });

  it('concorrência: 2 viradas do mesmo season em paralelo → exatamente 1 vira; mundo em 2027 (não 2028)', async () => {
    const { results } = await currentResults();
    const [a, b] = await Promise.all([
      persistWorldTurnover(handle.db, SEED, results, ROLL_DAY),
      persistWorldTurnover(handle.db, SEED, results, ROLL_DAY),
    ]);
    expect([a.status, b.status].filter((s) => s === 'rolled')).toHaveLength(1); // exatamente uma vira
    // a outra recua LIMPO (already_rolled ou locked) — nunca vira 2×
    for (const s of [a.status, b.status]) {
      expect(['rolled', 'already_rolled', 'locked']).toContain(s);
    }
    expect((await readWorld(handle.db, SEED))?.seasonId).toBe('2027'); // virou 1×, não 2×
  });
});
