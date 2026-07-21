// Os readers estreitos que a faixa (SPEC-038) consome, contra Postgres real: readClubBrief,
// readClubSquad (com isHuman — a coluna que rowToAthlete descarta), readLeagueClubIds,
// readOccupationsByClub, targetRoundFor. Gated por DATABASE_URL.
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../src/client.js';
import { athlete, club, league, world, worldOccupation, worldTier } from '../src/schema/world.js';
import { tickProgress } from '../src/schema/tick-progress.js';
import { waitingList } from '../src/schema/waiting-list.js';
import { season } from '../src/schema/season.js';
import { publishedRound } from '../src/schema/round.js';
import { writeWorld, readWorld } from '../src/store/world-repo.js';
import { readClubBrief, readClubSquad, readLeagueClubIds } from '../src/store/world-repo.js';
import { readOccupationsByClub } from '../src/store/occupation-by-club.js';
import { occupyNpcSlot } from '../src/store/occupation-repo.js';
import { targetRoundFor } from '../src/store/daily-round.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'band-readers-039';
// `world_occupation.human_athlete_id` é coluna `uuid` (schema/world.ts:115) → os ids humanos
// DEVEM ser UUIDs válidos (senão o INSERT falha com 22P02, engolido pelo catch-all do occupy).
const H1 = '00000000-0000-0000-0000-0000000000f1';
const H2 = '00000000-0000-0000-0000-0000000000f2';

describe.skipIf(!DB_URL)('world-store — readers da faixa (SPEC-038)', () => {
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
    await handle.db.delete(publishedRound);
    await handle.db.delete(worldOccupation);
    await handle.db.delete(athlete);
    await handle.db.delete(club);
    await handle.db.delete(league);
    await handle.db.delete(worldTier);
    await handle.db.delete(waitingList);
    await handle.db.delete(tickProgress);
    await handle.db.delete(season);
    await handle.db.delete(world);
    await writeWorld(handle.db, SEED);
  });

  /** O clube de entrada (tier-4) do mundo semeado — onde um humano pode ocupar vaga. */
  async function entryClub(): Promise<{ clubId: string; leagueId: string; tier: number }> {
    const w = (await readWorld(handle.db, SEED))!;
    const entryTier = w.tiers[w.tiers.length - 1]!;
    const lg = entryTier.leagues[0]!;
    return { clubId: lg.clubs[0]!.id, leagueId: lg.leagueId, tier: entryTier.tier };
  }

  it('readClubBrief junta league.tier (não existe club.tier)', async () => {
    const { clubId, leagueId, tier } = await entryClub();
    const brief = (await readClubBrief(handle.db, SEED, clubId))!;
    expect(brief.id).toBe(clubId);
    expect(brief.leagueId).toBe(leagueId);
    expect(brief.tier).toBe(tier); // veio do JOIN com league
    expect(brief.name.length).toBeGreaterThan(0);
    expect(await readClubBrief(handle.db, SEED, 'clube-inexistente')).toBeNull();
  });

  it('readClubSquad traz o elenco COM isHuman, em ordem canônica', async () => {
    const { clubId } = await entryClub();
    const squad = await readClubSquad(handle.db, SEED, clubId);
    expect(squad.length).toBe(16); // 11+5
    expect(squad.every((e) => e.isHuman === false)).toBe(true); // 100% NPC antes de ocupar
    expect(squad.every((e) => e.ability > 0 && e.age > 0)).toBe(true);
    // ordem canônica (ord): estável entre chamadas
    const again = await readClubSquad(handle.db, SEED, clubId);
    expect(again.map((e) => e.athleteId)).toEqual(squad.map((e) => e.athleteId));
  });

  it('após ocupar, exatamente UM do elenco vira isHuman — e é o da ocupação', async () => {
    const { clubId } = await entryClub();
    const antes = await readClubSquad(handle.db, SEED, clubId);
    const alvo = antes.find((e) => e.position === 'FWD')!;
    await occupyNpcSlot(handle.db, {
      worldSeed: SEED,
      clubId,
      position: 'FWD',
      humanAthleteId: H1,
      humanName: 'Craque',
      ability: 50,
    });
    const depois = await readClubSquad(handle.db, SEED, clubId);
    const humanos = depois.filter((e) => e.isHuman);
    expect(humanos).toHaveLength(1);
    // cruzamento com readOccupationsByClub: o athleteId humano bate
    const ocup = await readOccupationsByClub(handle.db, SEED, clubId);
    expect(ocup).toHaveLength(1);
    expect(humanos[0]!.athleteId).toBe(ocup[0]!.athleteId);
    expect(ocup[0]!.humanAthleteId).toBe(H1);
    // e o ocupado é da posição que pedimos
    expect(humanos[0]!.position).toBe('FWD');
    void alvo;
  });

  it('readOccupationsByClub isola por clube (não devolve o mundo inteiro)', async () => {
    const { clubId } = await entryClub();
    await occupyNpcSlot(handle.db, {
      worldSeed: SEED,
      clubId,
      position: 'MID',
      humanAthleteId: H2,
      humanName: 'Meia',
      ability: 45,
    });
    expect(await readOccupationsByClub(handle.db, SEED, clubId)).toHaveLength(1);
    expect(await readOccupationsByClub(handle.db, SEED, 'outro-clube')).toHaveLength(0);
  });

  it('readLeagueClubIds devolve os 20 clubes da liga, ordenados', async () => {
    const { leagueId } = await entryClub();
    const ids = await readLeagueClubIds(handle.db, SEED, leagueId);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20); // sem duplicata
  });

  it('targetRoundFor: dayIndex − start + 1 (puro)', () => {
    expect(targetRoundFor(100, 100)).toBe(1); // dia da rodada 1
    expect(targetRoundFor(105, 100)).toBe(6);
    expect(targetRoundFor(99, 100)).toBe(0); // antes da temporada
  });
});
