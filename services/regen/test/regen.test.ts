// A costura do Regen de ponta a ponta (SPEC-022) contra Postgres REAL: uma carreira humana REAL
// (conta+atleta do player-store, ocupando o mundo) chega aos 42 → runRegenPass encerra, arquiva a
// lenda, e renasce no MESMO clube (novo atleta ativo + banco de legado). Idempotência no nível do
// passe + o seam de compra. Dois handles sobre o MESMO Postgres. Gated por DATABASE_URL. Serial.
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Position, RoundResult, WorldState } from '@camisa-9/world-engine';
import { createAthlete, type Attributes } from '@camisa-9/player';
import {
  createDb as createWorldDb,
  occupyNpcSlot,
  readLegends,
  readOccupation,
  readWorld,
  requestRegen,
  writeWorld,
  schema as worldSchema,
  type DbHandle as WorldHandle,
} from '@camisa-9/world-store';
import {
  createAccountWithAthlete,
  createDb as createPlayerDb,
  readActiveAthlete,
  readAthleteProgress,
  rebirthAthlete,
  schema as playerSchema,
  type DbHandle as PlayerHandle,
} from '@camisa-9/player-store';
import { runRegenPass } from '../src/regen.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'regen-costura';
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

describe.skipIf(!DB_URL)('regen — a costura do renascimento contra Postgres real', () => {
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
    await worldHandle.db.delete(worldSchema.legend);
    await worldHandle.db.delete(worldSchema.worldOccupation);
    await worldHandle.db.delete(worldSchema.turnoverReport);
    await worldHandle.db.delete(worldSchema.publishedRound);
    await worldHandle.db.delete(worldSchema.season);
    await worldHandle.db.delete(worldSchema.athlete);
    await worldHandle.db.delete(worldSchema.club);
    await worldHandle.db.delete(worldSchema.league);
    await worldHandle.db.delete(worldSchema.worldTier);
    await worldHandle.db.delete(worldSchema.world);
    await playerHandle.db.delete(playerSchema.purchase); // neto (FK → athlete, SPEC-024)
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
    await playerHandle.db.delete(playerSchema.account);
  }

  function entryClubId(w: WorldState): string {
    return w.tiers[w.tiers.length - 1]!.leagues[0]!.clubs[0]!.id;
  }

  const RESET: Attributes = { fisico: 34, tecnico: 34, tatico: 34, mental: 34 };

  /** Cria uma carreira humana no mundo, com pontos treinados (para o legado ser > 0), na `age`
   *  dada (42 = gatilho forçado; 25..41 = candidato ao gatilho voluntário via `requestRegen`). */
  async function seedVeteran(
    age = 42,
  ): Promise<{ accountId: string; oldId: string; clubId: string }> {
    seq += 1;
    const draft = createAthlete({
      name: 'Velho',
      position: 'GK',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { accountId, athleteId } = await createAccountWithAthlete(playerHandle.db, {
      email: `v${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    // treino "acumulado": soma 162 → pointsEarnedTotal 26 → legado = floor(26×25%) = 6
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ fisico: 60 })
      .where(eq(playerSchema.athlete.id, athleteId));
    const clubId = entryClubId((await readWorld(worldHandle.db, SEED))!);
    const occ = await occupyNpcSlot(worldHandle.db, {
      worldSeed: SEED,
      clubId,
      position: 'GK' as Position,
      humanAthleteId: athleteId,
      humanName: 'Velho',
      ability: 34,
    });
    await worldHandle.db
      .update(worldSchema.athlete)
      .set({ age })
      .where(eq(worldSchema.athlete.id, occ.worldAthleteId));
    return { accountId, oldId: athleteId, clubId };
  }

  it('o loop completo: encerra → lenda → renasce no mesmo clube com banco de legado', async () => {
    const { accountId, oldId, clubId } = await seedVeteran();
    const n = await runRegenPass(worldHandle.db, playerHandle.db, SEED);
    expect(n).toBe(1);

    // Hall of Fame: a carreira antiga virou lenda
    const legends = await readLegends(worldHandle.db, SEED);
    expect(legends).toHaveLength(1);
    expect(legends[0]).toMatchObject({ humanAthleteId: oldId, age: 42, legacyPoints: 6 });

    // player: o velho é inativo; nasceu um novo ativo com nome novo + banco de legado
    const active = await readActiveAthlete(playerHandle.db, accountId);
    expect(active).toBeTruthy();
    expect(active?.id).not.toBe(oldId);
    expect(active?.name).not.toBe('Velho');
    const prog = await readAthleteProgress(playerHandle.db, active!.id);
    expect(prog?.overall).toBe(34); // reset
    expect(prog?.freePoints).toBe(6); // legado

    // mundo: o renascido ocupa o MESMO clube; a ocupação antiga sumiu
    const newOcc = await readOccupation(worldHandle.db, SEED, active!.id);
    expect(newOcc?.clubId).toBe(clubId);
    expect(await readOccupation(worldHandle.db, SEED, oldId)).toBeNull();
  });

  it('gatilho VOLUNTÁRIO ponta-a-ponta: pediu + idade ≥25 → runRegenPass renasce', async () => {
    const { accountId, oldId } = await seedVeteran(30); // 30, sem forçar
    await requestRegen(worldHandle.db, SEED, oldId); // o jogador PEDE o regen (voluntário)
    expect(await runRegenPass(worldHandle.db, playerHandle.db, SEED)).toBe(1);

    const active = await readActiveAthlete(playerHandle.db, accountId);
    expect(active?.id).not.toBe(oldId); // renasceu
    const legends = await readLegends(worldHandle.db, SEED);
    expect(legends).toHaveLength(1);
    expect(legends[0]).toMatchObject({ humanAthleteId: oldId, age: 30 }); // encerrou aos 30
  });

  it('recuperação pós-crash: rebirth feito mas mundo não reatribuído → o passe completa sem duplicar', async () => {
    const { accountId, oldId, clubId } = await seedVeteran();
    // simula um crash ENTRE o rebirth (player) e o reassign (mundo): o player já renasceu, mas a
    // ocupação antiga (idade 42) sobrevive intacta → o candidato segue elegível.
    const { newAthleteId } = await rebirthAthlete(playerHandle.db, oldId, 'Meio-Renascido', RESET);
    // o próximo passe reencontra o candidato e COMPLETA (rebirth idempotente devolve o mesmo ativo).
    expect(await runRegenPass(worldHandle.db, playerHandle.db, SEED)).toBe(1);

    expect(await readLegends(worldHandle.db, SEED)).toHaveLength(1); // 1 lenda (não duplicou)
    const newOcc = await readOccupation(worldHandle.db, SEED, newAthleteId);
    expect(newOcc?.clubId).toBe(clubId); // o MESMO renascido ocupa o mesmo clube
    expect(await readOccupation(worldHandle.db, SEED, oldId)).toBeNull(); // o velho saiu da vaga
    const rows = await playerHandle.db
      .select({ id: playerSchema.athlete.id })
      .from(playerSchema.athlete)
      .where(eq(playerSchema.athlete.accountId, accountId));
    expect(rows.length).toBe(2); // 1 lenda (inativa) + 1 renascido (ativo) — rebirth não duplicou
  });

  it('idempotência no passe: rodar 2× não duplica lenda nem cria 2 ativos', async () => {
    const { accountId } = await seedVeteran();
    expect(await runRegenPass(worldHandle.db, playerHandle.db, SEED)).toBe(1);
    expect(await runRegenPass(worldHandle.db, playerHandle.db, SEED)).toBe(0); // o renascido tem 17 → não elegível
    expect(await readLegends(worldHandle.db, SEED)).toHaveLength(1);
    const actives = await playerHandle.db
      .select({ id: playerSchema.athlete.id })
      .from(playerSchema.athlete)
      .where(eq(playerSchema.athlete.accountId, accountId));
    expect(actives.length).toBe(2); // 1 lenda (inativa) + 1 renascido (ativo)
  });

  it('guarda de gênese: com rodada publicada, o reassign é bloqueado → snapshot do mundo intocado', async () => {
    const { oldId } = await seedVeteran();
    const w = (await readWorld(worldHandle.db, SEED))!;
    const leagueId = w.tiers[w.tiers.length - 1]!.leagues[0]!.leagueId;
    // simula uma temporada EM ANDAMENTO (rodada 1 publicada) — o regen só pode em gênese
    await worldHandle.db.insert(worldSchema.publishedRound).values({
      leagueId,
      seasonId: w.seasonId,
      round: 1,
      result: { leagueId, round: 1, matches: [] } as unknown as RoundResult,
    });
    // o reassign bate na guarda → isolado por candidato → nada regenera
    expect(await runRegenPass(worldHandle.db, playerHandle.db, SEED)).toBe(0);
    // INVARIANTE: o snapshot do mundo é INTOCADO — o velho segue na vaga, idade NÃO resetada a 17
    // (senão a re-simulação reescreveria a rodada já publicada). Recuperável na próxima gênese.
    const occ = await readOccupation(worldHandle.db, SEED, oldId);
    expect(occ).toBeTruthy();
    const slot = await worldHandle.db
      .select({ age: worldSchema.athlete.age })
      .from(worldSchema.athlete)
      .where(eq(worldSchema.athlete.id, occ!.athleteId));
    expect(slot[0]?.age).toBe(42);
  });

  it('seam de compra: canRegen que NEGA pula o regen (nada muda)', async () => {
    const { oldId } = await seedVeteran();
    const n = await runRegenPass(worldHandle.db, playerHandle.db, SEED, () => false);
    expect(n).toBe(0);
    expect(await readLegends(worldHandle.db, SEED)).toHaveLength(0);
    expect(await readOccupation(worldHandle.db, SEED, oldId)).toBeTruthy(); // continua no mundo
  });
});
