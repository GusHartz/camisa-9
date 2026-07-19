// A costura player↔world de ponta a ponta (SPEC-020, card 21) contra Postgres REAL: um atleta
// humano REAL (conta+atleta do player-store) entra numa vaga NPC e passa a existir no mundo —
// com o `ability` = seu overall (34), aparecendo no elenco e na simulação. Dois handles sobre o
// MESMO Postgres (schemas `public`/`player`). Gated por DATABASE_URL. Serial (SPEC-015).
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete, type Position } from '@camisa-9/player';
import { simulateWorldSeason } from '@camisa-9/world-engine';
import {
  createDb as createWorldDb,
  readClubRoster,
  readOccupation,
  readWorld,
  writeWorld,
  schema as worldSchema,
  type DbHandle as WorldHandle,
} from '@camisa-9/world-store';
import {
  createAccountWithAthlete,
  createDb as createPlayerDb,
  schema as playerSchema,
  type DbHandle as PlayerHandle,
} from '@camisa-9/player-store';
import { enterWorld } from '../src/enter-world.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'entrada-costura';
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

describe.skipIf(!DB_URL)('enter-world — a costura player↔world contra Postgres real', () => {
  let worldHandle: WorldHandle;
  let playerHandle: PlayerHandle;

  beforeAll(async () => {
    worldHandle = createWorldDb(DB_URL as string);
    playerHandle = createPlayerDb(DB_URL as string);
    await migrate(worldHandle.db, {
      migrationsFolder: fileURLToPath(new URL('../../world-store/src/migrations', import.meta.url)),
    });
    await migrate(playerHandle.db, {
      migrationsFolder: fileURLToPath(
        new URL('../../player-store/src/migrations', import.meta.url),
      ),
      migrationsSchema: 'drizzle_player',
    });
  });

  afterAll(async () => {
    if (worldHandle) await worldHandle.pool.end();
    if (playerHandle) await playerHandle.pool.end();
  });

  beforeEach(async () => {
    await wipeAll();
    await writeWorld(worldHandle.db, SEED);
  });

  async function wipeAll(): Promise<void> {
    await worldHandle.db.delete(worldSchema.worldOccupation); // ordem inversa das FKs
    await worldHandle.db.delete(worldSchema.publishedRound);
    await worldHandle.db.delete(worldSchema.season);
    await worldHandle.db.delete(worldSchema.athlete);
    await worldHandle.db.delete(worldSchema.club);
    await worldHandle.db.delete(worldSchema.league);
    await worldHandle.db.delete(worldSchema.worldTier);
    await worldHandle.db.delete(worldSchema.tickProgress);
    await worldHandle.db.delete(worldSchema.world);
    await playerHandle.db.delete(playerSchema.injury); // neto (FK → athlete, SPEC-026)
    await playerHandle.db.delete(playerSchema.decision); // neto (FK → athlete, SPEC-025)
    await playerHandle.db.delete(playerSchema.purchase); // neto (FK → athlete, SPEC-024)
    await playerHandle.db.delete(playerSchema.dailyLedger);
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
    await playerHandle.db.delete(playerSchema.account);
  }

  /** Cria conta+atleta humano (recém-criado → overall 34) e devolve o athleteId. */
  async function createHuman(position: Position, name = 'Atleta Humano'): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name,
      position,
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error(`draft inválido: ${draft.reason}`);
    const { athleteId } = await createAccountWithAthlete(playerHandle.db, {
      email: `e${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    return athleteId;
  }

  /** Um clube da divisão de entrada (maior nº de tier). */
  async function entryClubId(): Promise<string> {
    const w = (await readWorld(worldHandle.db, SEED))!;
    const entry = w.tiers[w.tiers.length - 1]!;
    return entry.leagues[0]!.clubs[0]!.id;
  }

  it('coloca o humano no elenco do clube (name/ability=overall 34/position), 16 preservado', async () => {
    const clubId = await entryClubId();
    const humanId = await createHuman('GK', 'Zé Goleiro');
    const res = await enterWorld(worldHandle.db, playerHandle.db, {
      humanAthleteId: humanId,
      worldSeed: SEED,
      clubId,
    });
    expect(res.ability).toBe(34); // o overall do recém-criado (piso da entrada)
    expect(res.position).toBe('GK');
    const roster = await readClubRoster(worldHandle.db, SEED, clubId);
    expect(roster).toHaveLength(16);
    const human = roster.find((a) => a.id === res.worldAthleteId)!;
    expect(human.name).toBe('Zé Goleiro');
    expect(human.ability).toBe(34);
    expect(human.position).toBe('GK');
  });

  it('grava o vínculo: overlay (autoridade) + is_human (cache)', async () => {
    const clubId = await entryClubId();
    const humanId = await createHuman('MID');
    const res = await enterWorld(worldHandle.db, playerHandle.db, {
      humanAthleteId: humanId,
      worldSeed: SEED,
      clubId,
    });
    const occ = await readOccupation(worldHandle.db, SEED, humanId);
    expect(occ).toMatchObject({
      athleteId: res.worldAthleteId,
      clubId,
      humanAthleteId: humanId,
      position: 'MID',
    });
    const rows = await worldHandle.db
      .select({ isHuman: worldSchema.athlete.isHuman })
      .from(worldSchema.athlete)
      .where(eq(worldSchema.athlete.id, res.worldAthleteId));
    expect(rows[0]?.isHuman).toBe(true);
  });

  it('o humano entra na simulação: readWorld → simulateWorldSeason determinística', async () => {
    const clubId = await entryClubId();
    const humanId = await createHuman('FWD');
    await enterWorld(worldHandle.db, playerHandle.db, {
      humanAthleteId: humanId,
      worldSeed: SEED,
      clubId,
    });
    const w = (await readWorld(worldHandle.db, SEED))!;
    expect(simulateWorldSeason(w, SEED)).toEqual(simulateWorldSeason(w, SEED));
  });

  it('atleta inexistente → erro genérico, nada ocupado', async () => {
    const clubId = await entryClubId();
    await expect(
      enterWorld(worldHandle.db, playerHandle.db, {
        humanAthleteId: '00000000-0000-0000-0000-0000000000ff',
        worldSeed: SEED,
        clubId,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it('atleta INATIVO (active=false) → rejeitado, nada ocupado', async () => {
    const clubId = await entryClubId();
    const humanId = await createHuman('DEF');
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ active: false })
      .where(eq(playerSchema.athlete.id, humanId));
    await expect(
      enterWorld(worldHandle.db, playerHandle.db, {
        humanAthleteId: humanId,
        worldSeed: SEED,
        clubId,
      }),
    ).rejects.toThrow(/não encontrado/i);
    expect(await readOccupation(worldHandle.db, SEED, humanId)).toBeNull();
  });

  it('posição inválida na linha do player (bypass do createAthlete) → rejeitado (isPosition guard)', async () => {
    const clubId = await entryClubId();
    const humanId = await createHuman('MID');
    // a coluna player.athlete.position é text SEM CHECK — um valor cru pode escapar; o guard barra
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ position: 'XX' })
      .where(eq(playerSchema.athlete.id, humanId));
    await expect(
      enterWorld(worldHandle.db, playerHandle.db, {
        humanAthleteId: humanId,
        worldSeed: SEED,
        clubId,
      }),
    ).rejects.toThrow(/inválido/i);
  });

  it('o ability vem dos FOCOS do player (derivado, não hardcoded)', async () => {
    const clubId = await entryClubId();
    const humanId = await createHuman('FWD');
    // eleva os focos para overall 50 via UPDATE cru (createAthlete trava a soma em 136 = overall 34)
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ fisico: 60, tecnico: 50, tatico: 50, mental: 40 }) // soma 200 → floor(200/4) = 50
      .where(eq(playerSchema.athlete.id, humanId));
    const res = await enterWorld(worldHandle.db, playerHandle.db, {
      humanAthleteId: humanId,
      worldSeed: SEED,
      clubId,
    });
    expect(res.ability).toBe(50); // se enterWorld cravasse 34, isto pegaria a regressão
  });
});
