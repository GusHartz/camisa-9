// Ocupação de vaga NPC (SPEC-020, card 21) contra Postgres REAL. Prova: o humano ocupa a vaga
// do NPC mais fraco da posição e aparece no elenco (name/ability/is_human), o overlay é a
// autoridade, ele PARTICIPA do clubStrength, a guarda da gênese barra temporada em andamento, e
// FOR UPDATE + UNIQUE dão conta da corrida/dupla-entrada. Gated por DATABASE_URL. Serial (SPEC-015).
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  seedWorld,
  simulateWorldSeason,
  type Athlete,
  type WorldSeasonResult,
  type WorldState,
} from '@camisa-9/world-engine';
import { createDb, type DbHandle } from '../src/client.js';
import { athlete, club, league, world, worldOccupation, worldTier } from '../src/schema/world.js';
import { tickProgress } from '../src/schema/tick-progress.js';
import { publishedRound } from '../src/schema/round.js';
import { season } from '../src/schema/season.js';
import { readClubRoster, readWorld, writeWorld } from '../src/store/world-repo.js';
import { publishWorldRound, type WorldRoundInput } from '../src/store/round-repo.js';
import { occupyNpcSlot, readOccupation, type OccupyInput } from '../src/store/occupation-repo.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'ocupa-genese';
const H1 = '00000000-0000-0000-0000-000000000001';
const H2 = '00000000-0000-0000-0000-000000000002';
const H3 = '00000000-0000-0000-0000-000000000003';
const NAME = 'Goleiro Humano';

function findClub(w: WorldState, clubId: string) {
  for (const t of w.tiers) {
    for (const lg of t.leagues) {
      const c = lg.clubs.find((x) => x.id === clubId);
      if (c) return c;
    }
  }
  throw new Error('clube não encontrado');
}

function toInput(res: WorldSeasonResult, round: number): WorldRoundInput {
  return {
    seasonId: res.seasonId,
    round,
    leagues: res.leagues.map((l) => ({
      leagueId: l.result.leagueId,
      result: l.result.rounds[round - 1]!,
    })),
  };
}

describe.skipIf(!DB_URL)('occupation-repo — ocupação de vaga NPC contra Postgres real', () => {
  let handle: DbHandle;
  let clubId: string;
  let gks: Athlete[];

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
    await writeWorld(handle.db, SEED);
    const w = (await readWorld(handle.db, SEED))!;
    const entry = w.tiers[w.tiers.length - 1]!; // maior nº de tier = divisão de entrada
    const c = entry.leagues[0]!.clubs[0]!;
    clubId = c.id;
    gks = c.roster.filter((a) => a.position === 'GK');
  });

  async function wipeAll(): Promise<void> {
    await handle.db.delete(worldOccupation); // ordem inversa das FKs
    await handle.db.delete(publishedRound);
    await handle.db.delete(season);
    await handle.db.delete(athlete);
    await handle.db.delete(club);
    await handle.db.delete(league);
    await handle.db.delete(worldTier);
    await handle.db.delete(tickProgress);
    await handle.db.delete(world);
  }

  function input(overrides: Partial<OccupyInput> = {}): OccupyInput {
    return {
      worldSeed: SEED,
      clubId,
      position: 'GK',
      humanAthleteId: H1,
      humanName: NAME,
      ability: 90,
      ...overrides,
    };
  }

  it('ocupa a vaga: o humano aparece no elenco (name/ability/position), 16 preservado', async () => {
    const res = await occupyNpcSlot(handle.db, input());
    expect(res.position).toBe('GK');
    expect(res.ability).toBe(90);
    const roster = await readClubRoster(handle.db, SEED, clubId);
    expect(roster).toHaveLength(16);
    const human = roster.find((a) => a.id === res.worldAthleteId)!;
    expect(human.name).toBe(NAME);
    expect(human.ability).toBe(90);
    expect(human.position).toBe('GK');
  });

  it('marca is_human na linha (cache) e grava a AUTORIDADE no overlay', async () => {
    const res = await occupyNpcSlot(handle.db, input());
    const rows = await handle.db
      .select({ isHuman: athlete.isHuman })
      .from(athlete)
      .where(eq(athlete.id, res.worldAthleteId));
    expect(rows[0]?.isHuman).toBe(true);
    const occ = await readOccupation(handle.db, SEED, H1);
    expect(occ).toMatchObject({
      athleteId: res.worldAthleteId,
      clubId,
      humanAthleteId: H1,
      position: 'GK',
    });
  });

  it('escolhe a vaga do NPC MAIS FRACO da posição (menor ability, empate → menor ord)', async () => {
    const weakest = [...gks].sort((a, b) => a.ability - b.ability)[0]!;
    const res = await occupyNpcSlot(handle.db, input());
    expect(res.worldAthleteId).toBe(weakest.id);
  });

  it('participa do clubStrength: um humano forte (90) eleva a força do clube', async () => {
    const before = findClub((await readWorld(handle.db, SEED))!, clubId).strength;
    await occupyNpcSlot(handle.db, input({ ability: 90 }));
    const after = findClub((await readWorld(handle.db, SEED))!, clubId).strength;
    expect(after).toBeGreaterThan(before); // 90 entra nas 11 melhores (tier-4 vai só até 66)
  });

  it('determinismo: readWorld → simulateWorldSeason roda igual com o humano presente', async () => {
    await occupyNpcSlot(handle.db, input());
    const w = (await readWorld(handle.db, SEED))!;
    expect(simulateWorldSeason(w, SEED)).toEqual(simulateWorldSeason(w, SEED));
  });

  it('guarda da GÊNESE: temporada já com rodada publicada → rejeita, nada escrito', async () => {
    const res = simulateWorldSeason(seedWorld(SEED), SEED);
    await publishWorldRound(handle.db, toInput(res, 1));
    await expect(occupyNpcSlot(handle.db, input())).rejects.toThrow(/gênese/i);
    expect(await readOccupation(handle.db, SEED, H1)).toBeNull();
  });

  it('sem vaga: as 2 vagas de GK preenchidas → o 3º humano é rejeitado', async () => {
    await occupyNpcSlot(handle.db, input({ humanAthleteId: H1 }));
    await occupyNpcSlot(handle.db, input({ humanAthleteId: H2 }));
    await expect(occupyNpcSlot(handle.db, input({ humanAthleteId: H3 }))).rejects.toThrow(
      /sem vaga/i,
    );
  });

  it('dupla-entrada: o MESMO humano 2× → a 2ª falha (unique), sem vazar a 2ª linha', async () => {
    const first = await occupyNpcSlot(handle.db, input({ humanAthleteId: H1 }));
    await expect(occupyNpcSlot(handle.db, input({ humanAthleteId: H1 }))).rejects.toThrow(
      /já ocupad/i,
    );
    const roster = await readClubRoster(handle.db, SEED, clubId);
    expect(roster.filter((a) => a.name === NAME)).toHaveLength(1); // a 2ª tentativa reverteu
    expect((await readOccupation(handle.db, SEED, H1))?.athleteId).toBe(first.worldAthleteId);
  });

  it('concorrência (FOR UPDATE): 2 humanos na mesma posição → 2 vagas DISTINTAS, sem double-book', async () => {
    const [a, b] = await Promise.allSettled([
      occupyNpcSlot(handle.db, input({ humanAthleteId: H1 })),
      occupyNpcSlot(handle.db, input({ humanAthleteId: H2 })),
    ]);
    expect(a.status).toBe('fulfilled');
    expect(b.status).toBe('fulfilled');
    if (a.status === 'fulfilled' && b.status === 'fulfilled') {
      expect(a.value.worldAthleteId).not.toBe(b.value.worldAthleteId);
    }
    const roster = await readClubRoster(handle.db, SEED, clubId);
    expect(roster.filter((x) => x.name === NAME)).toHaveLength(2);
  });

  it('o overlay carrega os valores CONGELADOS (human_name + ability) — replay honesto', async () => {
    const res = await occupyNpcSlot(handle.db, input({ ability: 77, humanName: 'Craque Fixo' }));
    const occ = await readOccupation(handle.db, SEED, H1);
    expect(occ?.ability).toBe(77); // não recuperável dos focos mutáveis do player → mora no overlay
    expect(occ?.humanName).toBe('Craque Fixo');
    expect(res.ability).toBe(77);
  });

  it('mundo inexistente → erro genérico', async () => {
    await expect(occupyNpcSlot(handle.db, input({ worldSeed: 'nao-existe' }))).rejects.toThrow(
      /mundo não encontrado/i,
    );
  });

  it('rodada publicada de OUTRO season NÃO bloqueia a ocupação da gênese', async () => {
    const res = simulateWorldSeason(seedWorld(SEED), SEED);
    await handle.db.insert(publishedRound).values({
      leagueId: 'liga-x',
      seasonId: `${res.seasonId}-OUTRO`, // ≠ o season do mundo → o guard não deve enxergar
      round: 1,
      result: res.leagues[0]!.result.rounds[0]!,
    });
    const r = await occupyNpcSlot(handle.db, input());
    expect(r.worldAthleteId).toBeTruthy(); // ocupou normalmente
  });

  it('empate de ability → escolhe a de MENOR ord (determinístico, guarda o asc(ord))', async () => {
    // força os 2 GKs à MESMA ability → o desempate passa a ser SÓ por ord
    await handle.db
      .update(athlete)
      .set({ ability: 50 })
      .where(
        and(eq(athlete.worldSeed, SEED), eq(athlete.clubId, clubId), eq(athlete.position, 'GK')),
      );
    const res = await occupyNpcSlot(handle.db, input());
    expect(res.worldAthleteId).toBe(gks[0]!.id); // roster vem ord-sorted → gks[0] = menor ord
  });

  it('clube fora da divisão de entrada (tier topo) → rejeitado (autoridade server-side)', async () => {
    const w = (await readWorld(handle.db, SEED))!;
    const topClub = w.tiers[0]!.leagues[0]!.clubs[0]!; // tier 1 = topo da pirâmide
    await expect(occupyNpcSlot(handle.db, input({ clubId: topClub.id }))).rejects.toThrow(
      /divisão de entrada/i,
    );
  });

  it('clube inexistente → erro genérico', async () => {
    await expect(occupyNpcSlot(handle.db, input({ clubId: 'clube-fantasma' }))).rejects.toThrow(
      /clube não encontrado/i,
    );
  });

  it('TOCTOU: a ocupação toma o lock COMPARTILHADO e serializa contra a publicação da rodada 1', async () => {
    const seasonId = (await readWorld(handle.db, SEED))!.seasonId;
    const client = await handle.pool.connect();
    try {
      await client.query('BEGIN');
      // segura o EXCLUSIVO da rodada 1 (mesma chave do publishWorldRound)
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `world:${seasonId}:1`,
      ]);
      const p = occupyNpcSlot(handle.db, input()); // shared lock → BLOQUEIA enquanto o exclusivo é segurado
      const race = await Promise.race([
        p.then(() => 'terminou').catch(() => 'terminou'),
        new Promise((r) => setTimeout(() => r('bloqueada'), 300)),
      ]);
      expect(race).toBe('bloqueada'); // sem o shared lock, a ocupação teria colado imediatamente
      await client.query('COMMIT'); // libera → a ocupação prossegue (gênese ok: nenhuma rodada publicada)
      const done = await p;
      expect(done.worldAthleteId).toBeTruthy();
    } finally {
      client.release();
    }
  });
});
