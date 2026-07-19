// A costura de Transferência (SPEC-033, card 1.4) contra Postgres REAL: um humano com a proposta
// ACEITA (`transfer_requested`) é MOVIDO de clube na janela de gênese — a vaga de origem volta a NPC,
// a flag limpa, o quinteto racha. Sem candidato → não move. Idempotente. Gated por DATABASE_URL.
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete } from '@camisa-9/player';
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
  createAccountWithTeam,
  createDb as createPlayerDb,
  readTransferRequested,
  schema as playerSchema,
  type DbHandle as PlayerHandle,
} from '@camisa-9/player-store';
import { enterWorld } from '@camisa-9/world-entry';
import { runTransferPass } from '../src/index.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'transfer-test';
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

describe.skipIf(!DB_URL)('runTransferPass — a transferência do humano contra Postgres real', () => {
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
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
    await playerHandle.db.delete(playerSchema.account);
  }

  /** O clube da divisão de ENTRADA (tier maior). */
  async function entryClub(): Promise<{ clubId: string; tier: number }> {
    const world = (await readWorld(worldHandle.db, SEED))!;
    const t = world.tiers[world.tiers.length - 1]!;
    return { clubId: t.leagues[0]!.clubs[0]!.id, tier: t.tier };
  }

  /** Um humano ocupando `clubId` (FWD), com a ability da ocupação sobrescrita p/ `ability`. */
  async function seatHuman(
    clubId: string,
    ability: number,
    opts: { team?: boolean } = {},
  ): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name: 'Titular',
      position: 'FWD',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    let athleteId: string;
    if (opts.team) {
      const res = await createAccountWithTeam(playerHandle.db, {
        email: `t${seq}@x.com`,
        password: PASSWORD,
        teamName: 'Os Craques',
        kit: { primaryColor: 1, secondaryColor: 1, crest: 1 },
        captainPosition: 'FWD',
        draft: draft.value,
      });
      athleteId = res.athleteId;
    } else {
      const res = await createAccountWithAthlete(playerHandle.db, {
        email: `t${seq}@x.com`,
        password: PASSWORD,
        draft: draft.value,
      });
      athleteId = res.athleteId;
    }
    await enterWorld(worldHandle.db, playerHandle.db, {
      humanAthleteId: athleteId,
      worldSeed: SEED,
      clubId,
    });
    // a força VIVA (os FOCOS) — o que a proposta E a busca de destino usam (SPEC-033 fix). Setar
    // os 4 focos = `ability` → overall vivo = `ability`. (A ocupação congelada acompanha p/ coerência.)
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ fisico: ability, tecnico: ability, tatico: ability, mental: ability })
      .where(eq(playerSchema.athlete.id, athleteId));
    const occ = (await readOccupation(worldHandle.db, SEED, athleteId))!;
    await worldHandle.db
      .update(worldSchema.worldOccupation)
      .set({ ability })
      .where(
        and(
          eq(worldSchema.worldOccupation.worldSeed, SEED),
          eq(worldSchema.worldOccupation.humanAthleteId, athleteId),
        ),
      );
    await worldHandle.db
      .update(worldSchema.athlete)
      .set({ ability })
      .where(
        and(eq(worldSchema.athlete.worldSeed, SEED), eq(worldSchema.athlete.id, occ.athleteId)),
      );
    return athleteId;
  }

  async function requestTransfer(athleteId: string): Promise<void> {
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ transferRequested: true })
      .where(eq(playerSchema.athlete.id, athleteId));
  }

  function tierOfClub(world: Awaited<ReturnType<typeof readWorld>>, clubId: string): number | null {
    for (const t of world!.tiers) {
      for (const l of t.leagues) for (const c of l.clubs) if (c.id === clubId) return t.tier;
    }
    return null;
  }

  it('a proposta ACEITA MOVE o humano de clube; a vaga antiga volta a NPC; a flag limpa; melhor-ou-igual tier', async () => {
    const { clubId, tier } = await entryClub();
    const humanId = await seatHuman(clubId, 70); // forte → há destino
    await requestTransfer(humanId);
    const fromSlot = (await readOccupation(worldHandle.db, SEED, humanId))!.athleteId;

    const moved = await runTransferPass(worldHandle.db, playerHandle.db, SEED);
    expect(moved).toBe(1);

    const occ = (await readOccupation(worldHandle.db, SEED, humanId))!;
    expect(occ.clubId).not.toBe(clubId); // mudou de clube
    const world = await readWorld(worldHandle.db, SEED);
    expect(tierOfClub(world, occ.clubId)!).toBeLessThanOrEqual(tier); // melhor-ou-igual (nº ≤)
    // a vaga de ORIGEM voltou a NPC
    const [old] = await worldHandle.db
      .select({ isHuman: worldSchema.athlete.isHuman })
      .from(worldSchema.athlete)
      .where(and(eq(worldSchema.athlete.worldSeed, SEED), eq(worldSchema.athlete.id, fromSlot)));
    expect(old?.isHuman).toBe(false);
    // a flag limpa
    expect(await readTransferRequested(playerHandle.db, humanId)).toBe(false);
  });

  it('o quinteto RACHA: um humano de time transferido tem o team_id limpo (vira solo)', async () => {
    const { clubId } = await entryClub();
    const humanId = await seatHuman(clubId, 70, { team: true });
    const [before] = await playerHandle.db
      .select({ teamId: playerSchema.athlete.teamId })
      .from(playerSchema.athlete)
      .where(eq(playerSchema.athlete.id, humanId));
    expect(before?.teamId).not.toBeNull(); // estava num time
    await requestTransfer(humanId);
    await runTransferPass(worldHandle.db, playerHandle.db, SEED);
    const [after] = await playerHandle.db
      .select({ teamId: playerSchema.athlete.teamId })
      .from(playerSchema.athlete)
      .where(eq(playerSchema.athlete.id, humanId));
    expect(after?.teamId).toBeNull(); // rachou (solo no novo clube)
  });

  it('idempotência: rodar o passe 2× move UMA vez (a flag limpa após a 1ª)', async () => {
    const { clubId } = await entryClub();
    const humanId = await seatHuman(clubId, 70);
    await requestTransfer(humanId);
    expect(await runTransferPass(worldHandle.db, playerHandle.db, SEED)).toBe(1);
    expect(await runTransferPass(worldHandle.db, playerHandle.db, SEED)).toBe(0); // não re-move
  });

  it('sem candidato: um humano FRACO não acha destino → não move, a flag limpa (não vingou)', async () => {
    const { clubId } = await entryClub();
    const humanId = await seatHuman(clubId, 20); // fraco: nenhum clube melhora com ele
    await requestTransfer(humanId);
    const moved = await runTransferPass(worldHandle.db, playerHandle.db, SEED);
    expect(moved).toBe(0);
    expect((await readOccupation(worldHandle.db, SEED, humanId))!.clubId).toBe(clubId); // ficou
    expect(await readTransferRequested(playerHandle.db, humanId)).toBe(false); // a flag limpa
  });

  it('a força VIVA (não a congelada) decide: um humano que CRESCEU é transferido e leva o overall vivo (fix #3)', async () => {
    const { clubId } = await entryClub();
    const humanId = await seatHuman(clubId, 34); // ability congelada 34 (fraca) — não acharia destino
    // mas os focos VIVOS cresceram (treino) → overall 70 → a proposta/o destino usam ISSO
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ fisico: 70, tecnico: 70, tatico: 70, mental: 70 })
      .where(eq(playerSchema.athlete.id, humanId));
    await requestTransfer(humanId);
    const moved = await runTransferPass(worldHandle.db, playerHandle.db, SEED);
    expect(moved).toBe(1); // com a congelada (34) não vingaria; com a viva (70), vinga
    const occ = (await readOccupation(worldHandle.db, SEED, humanId))!;
    expect(occ.clubId).not.toBe(clubId);
    expect(occ.ability).toBe(70); // a transferência reconhece o crescimento (grava a força viva)
  });

  it('sem pendência: um humano que NÃO aceitou não é tocado', async () => {
    const { clubId } = await entryClub();
    const humanId = await seatHuman(clubId, 70); // forte, mas sem transfer_requested
    const moved = await runTransferPass(worldHandle.db, playerHandle.db, SEED);
    expect(moved).toBe(0);
    expect((await readOccupation(worldHandle.db, SEED, humanId))!.clubId).toBe(clubId);
  });
});
