// A costura de Forma/Moral na PARTIDA (SPEC-029, fatia B) contra Postgres REAL: um humano ocupando
// uma vaga tem a ability EFETIVA modulada por forma/moral (in-memory), o clube dele fica mais/menos
// forte, e a base CONGELADA (SPEC-020) NÃO muda. Sem humanos → no-op. Dois handles sobre o mesmo
// Postgres. Gated por DATABASE_URL. Serial (SPEC-015).
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete, effectiveAbility, type Position } from '@camisa-9/player';
import type { WorldState } from '@camisa-9/world-engine';
import {
  createDb as createWorldDb,
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
import { enterWorld, moodModulator } from '../src/index.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'mood-partida';
const PASSWORD = 'senha-bem-forte-123';
const BASE = 70; // overall do humano forte (acima da faixa de entrada → no top-11 do clube)
let seq = 0;

function findAthlete(world: WorldState, id: string) {
  for (const t of world.tiers) {
    for (const l of t.leagues) {
      for (const c of l.clubs) {
        const a = c.roster.find((x) => x.id === id);
        if (a) return a;
      }
    }
  }
  return undefined;
}

function findClub(world: WorldState, clubId: string) {
  for (const t of world.tiers) {
    for (const l of t.leagues) {
      for (const c of l.clubs) if (c.id === clubId) return c;
    }
  }
  return undefined;
}

describe.skipIf(!DB_URL)('mood-modulator — Forma/Moral na partida contra Postgres real', () => {
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
    await worldHandle.db.delete(worldSchema.worldOccupation);
    await worldHandle.db.delete(worldSchema.publishedRound);
    await worldHandle.db.delete(worldSchema.season);
    await worldHandle.db.delete(worldSchema.athlete);
    await worldHandle.db.delete(worldSchema.club);
    await worldHandle.db.delete(worldSchema.league);
    await worldHandle.db.delete(worldSchema.worldTier);
    await worldHandle.db.delete(worldSchema.world);
    await playerHandle.db.delete(playerSchema.injury);
    await playerHandle.db.delete(playerSchema.decision);
    await playerHandle.db.delete(playerSchema.purchase);
    await playerHandle.db.delete(playerSchema.dailyLedger);
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
    await playerHandle.db.delete(playerSchema.account);
  }

  /** Humano FORTE (overall BASE) — focos elevados por UPDATE cru ANTES de entrar (a ability
   *  congela no enterWorld). Acima da faixa de entrada → garantidamente no top-11 do clube. */
  async function createStrongHuman(position: Position): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name: 'Craque',
      position,
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(playerHandle.db, {
      email: `mp${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ fisico: BASE, tecnico: BASE, tatico: BASE, mental: BASE }) // overall = BASE
      .where(eq(playerSchema.athlete.id, athleteId));
    return athleteId;
  }

  async function entryClubId(): Promise<string> {
    const w = (await readWorld(worldHandle.db, SEED))!;
    const entry = w.tiers[w.tiers.length - 1]!;
    return entry.leagues[0]!.clubs[0]!.id;
  }

  async function setMood(id: string, forma: number, moral: number): Promise<void> {
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ forma, moral })
      .where(eq(playerSchema.athlete.id, id));
  }

  it('modula a ability efetiva do humano por forma/moral; a base congelada fica intacta', async () => {
    const clubId = await entryClubId();
    const humanId = await createStrongHuman('FWD');
    const res = await enterWorld(worldHandle.db, playerHandle.db, {
      humanAthleteId: humanId,
      worldSeed: SEED,
      clubId,
    });
    const world = (await readWorld(worldHandle.db, SEED))!;
    const mod = moodModulator(worldHandle.db, playerHandle.db, SEED);

    const neutral = await mod(world); // forma/moral nascem em 50 → efetiva = base
    expect(findAthlete(neutral, res.worldAthleteId)!.ability).toBe(effectiveAbility(BASE, 50, 50));

    await setMood(humanId, 100, 100); // ótima fase → efetiva > base, clube mais forte
    const boosted = await mod(world);
    expect(findAthlete(boosted, res.worldAthleteId)!.ability).toBe(
      effectiveAbility(BASE, 100, 100),
    );
    expect(findClub(boosted, clubId)!.strength).toBeGreaterThanOrEqual(
      findClub(neutral, clubId)!.strength,
    );

    await setMood(humanId, 20, 20); // má fase → efetiva < base, clube não mais forte
    const low = await mod(world);
    expect(findAthlete(low, res.worldAthleteId)!.ability).toBe(effectiveAbility(BASE, 20, 20));
    expect(findClub(low, clubId)!.strength).toBeLessThanOrEqual(
      findClub(neutral, clubId)!.strength,
    );

    // a base CONGELADA (SPEC-020) não mudou — a modulação é só in-memory
    expect((await readOccupation(worldHandle.db, SEED, humanId))!.ability).toBe(BASE);
  });

  it('mundo SEM humanos → o modulador é no-op (deep-equal)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    const same = await moodModulator(worldHandle.db, playerHandle.db, SEED)(world);
    expect(same).toEqual(world);
  });
});
