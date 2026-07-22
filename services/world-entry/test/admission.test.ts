// A admissão / waiting-list (SPEC-034) contra Postgres REAL: o solo entra IMEDIATO mid-season (o
// relaxamento da guarda de gênese); cheio → fila; o passe diário drena a fila até o teto e herda as
// vagas liberadas. Gated por DATABASE_URL. Serial.
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete } from '@camisa-9/player';
import {
  countEntryHumans,
  createDb as createWorldDb,
  queueLength,
  readOccupation,
  readWorld,
  runDailyRound,
  setSeasonAnchor,
  vacateSlot,
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
import { admitOrEnqueue, runAdmissionPass } from '../src/index.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'admission-test';
const PASSWORD = 'senha-bem-forte-123';
const START = 20_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const BRASILIA_OFFSET_MS = -3 * MS_PER_HOUR;
const epochAt = (day: number, hour = 15): number =>
  day * MS_PER_DAY + hour * MS_PER_HOUR - BRASILIA_OFFSET_MS;
let seq = 0;

describe.skipIf(!DB_URL)('admission / waiting-list — SPEC-034 contra Postgres real', () => {
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
    await worldHandle.db.delete(worldSchema.turnoverReport);
    await worldHandle.db.delete(worldSchema.legend);
    await worldHandle.db.delete(worldSchema.waitingList);
    await worldHandle.db.delete(worldSchema.worldOccupation);
    await worldHandle.db.delete(worldSchema.publishedRound);
    await worldHandle.db.delete(worldSchema.season);
    await worldHandle.db.delete(worldSchema.athlete);
    await worldHandle.db.delete(worldSchema.club);
    await worldHandle.db.delete(worldSchema.league);
    await worldHandle.db.delete(worldSchema.worldTier);
    await worldHandle.db.delete(worldSchema.tickProgress);
    await worldHandle.db.delete(worldSchema.world);
    await playerHandle.db.delete(playerSchema.dailyLedger);
    await playerHandle.db.delete(playerSchema.injury);
    await playerHandle.db.delete(playerSchema.decision);
    await playerHandle.db.delete(playerSchema.purchase);
    await playerHandle.db.delete(playerSchema.seasonSummary); // FK→athlete+account (SPEC-053) — antes do atleta
    await playerHandle.db.delete(playerSchema.matchChoice); // FK→athlete (SPEC-050) — antes do atleta
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
    await playerHandle.db.delete(playerSchema.session); // SPEC-037: filha de account (FK)
    await playerHandle.db.delete(playerSchema.account);
  }

  /** Um humano solo (FWD) no player-store, AINDA fora do mundo. */
  async function makeHuman(): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name: 'Novato',
      position: 'FWD',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(playerHandle.db, {
      email: `a${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    return athleteId;
  }

  it('entrada IMEDIATA mid-season: publica a rodada 1 e mesmo assim o solo ENTRA (relaxamento)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    // temporada EM ANDAMENTO: a rodada 1 publicada → a guarda de gênese barraria sem allowMidSeason
    await runDailyRound(worldHandle.db, SEED, epochAt(START));
    const humanId = await makeHuman();
    const res = await admitOrEnqueue(worldHandle.db, playerHandle.db, {
      humanAthleteId: humanId,
      worldSeed: SEED,
    });
    expect(res.admitted).toBe(true); // entrou COM a temporada correndo
    expect(await readOccupation(worldHandle.db, SEED, humanId)).not.toBeNull();
  });

  it('cap-then-queue: sob o teto entra; no teto vai pra FILA', async () => {
    const h1 = await makeHuman();
    const h2 = await makeHuman();
    expect(
      (
        await admitOrEnqueue(
          worldHandle.db,
          playerHandle.db,
          { humanAthleteId: h1, worldSeed: SEED },
          1,
        )
      ).admitted,
    ).toBe(true);
    const r2 = await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h2, worldSeed: SEED },
      1,
    );
    expect(r2.admitted).toBe(false); // teto (1) atingido → fila
    expect(await readOccupation(worldHandle.db, SEED, h2)).toBeNull();
    expect(await queueLength(worldHandle.db, SEED)).toBe(1);
  });

  it('o passe de admissão drena a fila até o teto (FIFO)', async () => {
    const h1 = await makeHuman();
    const h2 = await makeHuman();
    await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h1, worldSeed: SEED },
      0,
    ); // teto 0 → fila
    await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h2, worldSeed: SEED },
      0,
    );
    expect(await queueLength(worldHandle.db, SEED)).toBe(2);
    const admitted = await runAdmissionPass(worldHandle.db, playerHandle.db, SEED, 5);
    expect(admitted).toBe(2);
    expect(await queueLength(worldHandle.db, SEED)).toBe(0);
    expect(await readOccupation(worldHandle.db, SEED, h1)).not.toBeNull();
    expect(await readOccupation(worldHandle.db, SEED, h2)).not.toBeNull();
  });

  it('o teto barra a admissão: com o teto cheio, a fila NÃO é drenada', async () => {
    const h1 = await makeHuman();
    const h2 = await makeHuman();
    await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h1, worldSeed: SEED },
      1,
    ); // entra (teto 1)
    await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h2, worldSeed: SEED },
      1,
    ); // fila
    const admitted = await runAdmissionPass(worldHandle.db, playerHandle.db, SEED, 1); // teto 1 já cheio
    expect(admitted).toBe(0);
    expect(await queueLength(worldHandle.db, SEED)).toBe(1); // h2 segue na fila
  });

  it('a vaga LIBERADA (revert) é herdada pelo próximo da fila', async () => {
    const h1 = await makeHuman();
    const h2 = await makeHuman();
    await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h1, worldSeed: SEED },
      1,
    ); // entra
    await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h2, worldSeed: SEED },
      1,
    ); // fila
    expect(await runAdmissionPass(worldHandle.db, playerHandle.db, SEED, 1)).toBe(0); // cheio
    // h1 libera a vaga (revert = vacateSlot da SPEC-023) → a contagem cai
    const occ = (await readOccupation(worldHandle.db, SEED, h1))!;
    await vacateSlot(worldHandle.db, SEED, occ.athleteId);
    expect(await countEntryHumans(worldHandle.db, SEED)).toBe(0);
    // o passe agora admite h2 (herdou a camisa)
    expect(await runAdmissionPass(worldHandle.db, playerHandle.db, SEED, 1)).toBe(1);
    expect(await readOccupation(worldHandle.db, SEED, h2)).not.toBeNull();
    expect(await queueLength(worldHandle.db, SEED)).toBe(0);
  });

  it('NÃO fura a fila: um novo da MESMA posição entra ATRÁS de quem já espera (FIFO)', async () => {
    const h1 = await makeHuman(); // FWD
    const h2 = await makeHuman(); // FWD
    await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h1, worldSeed: SEED },
      0,
    ); // fila
    // h2 com teto ALTO — mas h1 (FWD) já espera → h2 NÃO fura: entra na fila
    const r2 = await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h2, worldSeed: SEED },
      5,
    );
    expect(r2.admitted).toBe(false);
    expect(await readOccupation(worldHandle.db, SEED, h2)).toBeNull();
    expect(await queueLength(worldHandle.db, SEED)).toBe(2);
  });

  it('idempotência: rodar o passe 2× não admite em dobro', async () => {
    const h1 = await makeHuman();
    await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: h1, worldSeed: SEED },
      0,
    ); // fila
    expect(await runAdmissionPass(worldHandle.db, playerHandle.db, SEED, 5)).toBe(1);
    expect(await runAdmissionPass(worldHandle.db, playerHandle.db, SEED, 5)).toBe(0); // fila vazia
  });
});
