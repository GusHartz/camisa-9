// O tick diário (SPEC-030) contra Postgres REAL, ponta a ponta: um humano ocupando uma vaga, num
// dia de rodada, é PAGO (salário+prêmio), tem o mood decaído, decisões geradas — e rodar o MESMO dia
// 2× é NO-OP (nada paga/decai em dobro: a idempotência que o ledger garante). Dois handles sobre o
// mesmo Postgres. Gated por DATABASE_URL. Serial (SPEC-015).
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAthlete,
  generateDailyDecisions,
  matchPrize,
  salaryPerRound,
} from '@camisa-9/player';
import {
  advanceTickCursor,
  createDb as createWorldDb,
  readLegends,
  readOccupation,
  readRound,
  readTickCursor,
  readWorld,
  setSeasonAnchor,
  writeWorld,
  schema as worldSchema,
  type DbHandle as WorldHandle,
} from '@camisa-9/world-store';
import {
  createAccountWithAthlete,
  createDb as createPlayerDb,
  createSession,
  readSessionByHash,
  injureFromMatch,
  readDecisionLog,
  readInjuryState,
  readMood,
  readWallet,
  schema as playerSchema,
  type DbHandle as PlayerHandle,
} from '@camisa-9/player-store';
import { admitOrEnqueue, enterWorld } from '@camisa-9/world-entry';
import { runDailyTick } from '../src/index.js';
import { purgeSessions } from '../src/daily-tick.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'tick-prod';
const PASSWORD = 'senha-bem-forte-123';
const START = 20_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const BRASILIA_OFFSET_MS = -3 * MS_PER_HOUR;
function epochAt(dayIndex: number, hour = 15): number {
  return dayIndex * MS_PER_DAY + hour * MS_PER_HOUR - BRASILIA_OFFSET_MS;
}
let seq = 0;

describe.skipIf(!DB_URL)('daily-tick — o tick de produção contra Postgres real', () => {
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
    await worldHandle.db.delete(worldSchema.turnoverReport); // sem FK; a viragem (season_rolled) grava
    await worldHandle.db.delete(worldSchema.legend); // sem FK; o regen (SPEC-032) arquiva lendas
    await worldHandle.db.delete(worldSchema.worldOccupation);
    await worldHandle.db.delete(worldSchema.publishedRound);
    await worldHandle.db.delete(worldSchema.season);
    await worldHandle.db.delete(worldSchema.athlete);
    await worldHandle.db.delete(worldSchema.club);
    await worldHandle.db.delete(worldSchema.league);
    await worldHandle.db.delete(worldSchema.worldTier);
    await worldHandle.db.delete(worldSchema.waitingList);
    await worldHandle.db.delete(worldSchema.tickProgress);
    await worldHandle.db.delete(worldSchema.world);
    await playerHandle.db.delete(playerSchema.dailyLedger);
    await playerHandle.db.delete(playerSchema.injury);
    await playerHandle.db.delete(playerSchema.decision);
    await playerHandle.db.delete(playerSchema.purchase);
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
    await playerHandle.db.delete(playerSchema.session); // SPEC-037: filha de account (FK)
    await playerHandle.db.delete(playerSchema.account);
  }

  /** Um humano fresco (overall 34) ocupando o clube `clubId` da divisão de entrada. */
  async function seatHuman(clubId: string): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name: 'Titular',
      position: 'FWD',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(playerHandle.db, {
      email: `t${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    await enterWorld(worldHandle.db, playerHandle.db, {
      humanAthleteId: athleteId,
      worldSeed: SEED,
      clubId,
    });
    return athleteId;
  }

  /** O resultado (win/draw/loss) do clube na rodada `round` da liga — o oráculo do prêmio. */
  async function prizeOf(
    leagueId: string,
    seasonId: string,
    clubId: string,
    round = 1,
  ): Promise<'win' | 'draw' | 'loss'> {
    const rr = (await readRound(worldHandle.db, leagueId, seasonId, round))!;
    const m = rr.matches.find((x) => x.homeId === clubId || x.awayId === clubId)!;
    const mine = m.homeId === clubId ? m.homeGoals : m.awayGoals;
    const theirs = m.homeId === clubId ? m.awayGoals : m.homeGoals;
    return mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
  }

  it('o tick paga (salário+prêmio), decai o mood, gera decisões — e é IDEMPOTENTE (2× = no-op)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ forma: 70, moral: 70 })
      .where(eq(playerSchema.athlete.id, humanId));

    // TICK 1 — a rodada publica e o humano é processado
    const r1 = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(r1.roundStatus).toBe('published');
    expect(r1.humans).toBe(1);
    expect(r1.accrued).toBe(1); // pago de fato

    // o prêmio bate com o resultado REAL do clube na rodada publicada
    const paid =
      salaryPerRound(34) + matchPrize(await prizeOf(league.leagueId, world.seasonId, clubId));
    expect((await readWallet(playerHandle.db, humanId))!.balance).toBe(paid);

    expect((await readMood(playerHandle.db, humanId))!.moral).toBe(65); // 70 decaiu 1 passo
    const decisions1 = (await readDecisionLog(playerHandle.db, humanId)).length;
    expect(decisions1).toBeGreaterThan(0); // gerou o dia

    // TICK 2 — o MESMO dia: nada dobra
    const r2 = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(r2.roundStatus).toBe('idempotent'); // a rodada não republica
    expect(r2.accrued).toBe(0); // ninguém foi re-pago
    expect((await readWallet(playerHandle.db, humanId))!.balance).toBe(paid); // saldo NÃO dobra
    expect((await readMood(playerHandle.db, humanId))!.moral).toBe(65); // mood NÃO re-decai (não 60)
    expect((await readDecisionLog(playerHandle.db, humanId)).length).toBe(decisions1); // NÃO re-gera
  });

  it('viragem (season_rolled): NÃO paga salário (dia de descanso, sem rodada) — fix do MAJOR', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const clubId = world.tiers[world.tiers.length - 1]!.leagues[0]!.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    // cursor em START+37 → o tick de START+38 processa SÓ a virada (isola o dia de descanso)
    await advanceTickCursor(worldHandle.db, SEED, START + 37);
    // dia START+38 → targetRound 39 > 38 → season_rolled (a virada, sem rodada publicada)
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START + 38));
    expect(rep.roundStatus).toBe('season_rolled');
    expect(rep.accrued).toBe(0); // ninguém pago
    expect((await readWallet(playerHandle.db, humanId))!.balance).toBe(0); // saldo intacto (sem salário)
  });

  it('deferred → retry no MESMO dia: o PRÊMIO não se perde (fix do MAJOR)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    // força o INSERT da rodada 1 a estourar → o tick DEFERE (sem accrue, sem reivindicar o dia)
    await worldHandle.db.execute(
      sql`ALTER TABLE published_round ADD CONSTRAINT tmp_boom CHECK (round <> 1)`,
    );
    try {
      const deferred = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
      expect(deferred.roundStatus).toBe('deferred');
      expect(deferred.accrued).toBe(0); // NÃO pagou (sem rodada) e NÃO reivindicou o dia no ledger
    } finally {
      await worldHandle.db.execute(sql`ALTER TABLE published_round DROP CONSTRAINT tmp_boom`);
    }
    expect((await readWallet(playerHandle.db, humanId))!.balance).toBe(0);
    // retry no MESMO dia: agora publica → paga salário + PRÊMIO (não perdido)
    const retry = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(retry.roundStatus).toBe('published');
    expect(retry.accrued).toBe(1);
    const paid =
      salaryPerRound(34) + matchPrize(await prizeOf(league.leagueId, world.seasonId, clubId));
    expect((await readWallet(playerHandle.db, humanId))!.balance).toBe(paid);
  });

  it('múltiplos humanos em clubes diferentes: cada prêmio bate com o SEU jogo (roteamento)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubA = league.clubs[0]!.id;
    const clubB = league.clubs[1]!.id;
    const humanA = await seatHuman(clubA);
    const humanB = await seatHuman(clubB);
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(rep.humans).toBe(2);
    expect(rep.accrued).toBe(2);
    const paidA =
      salaryPerRound(34) + matchPrize(await prizeOf(league.leagueId, world.seasonId, clubA));
    const paidB =
      salaryPerRound(34) + matchPrize(await prizeOf(league.leagueId, world.seasonId, clubB));
    expect((await readWallet(playerHandle.db, humanA))!.balance).toBe(paidA);
    expect((await readWallet(playerHandle.db, humanB))!.balance).toBe(paidB);
  });

  it('isolamento: um humano cujo passe FALHA não aborta o tick (os outros processam)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const humanOk = await seatHuman(league.clubs[0]!.id);
    const humanBroken = await seatHuman(league.clubs[1]!.id);
    // some com a linha do player do humanBroken (a ocupação fica) → o accrue lança "não encontrado"
    await playerHandle.db
      .delete(playerSchema.athlete)
      .where(eq(playerSchema.athlete.id, humanBroken));
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(rep.humans).toBe(2); // as 2 ocupações
    expect(rep.accrued).toBe(1); // só o OK foi pago (o quebrado falhou e foi ISOLADO, não abortou)
    expect((await readWallet(playerHandle.db, humanOk))!.balance).toBeGreaterThan(0);
  });

  it('cross-day: o tick de HOJE resolve as decisões PENDENTES de ontem (o deadline das 18h)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const clubId = world.tiers[world.tiers.length - 1]!.leagues[0]!.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START)); // gera o dia START (pendentes)
    const before = (await readDecisionLog(playerHandle.db, humanId)).filter((d) => d.day === START);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((d) => d.status === 'pending')).toBe(true); // ninguém respondeu
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START + 1)); // resolve ONTEM (START)
    const after = (await readDecisionLog(playerHandle.db, humanId)).filter((d) => d.day === START);
    expect(after.every((d) => d.status === 'resolved')).toBe(true); // o agente fechou às 18h
  });

  it('ATIVA o seam de lesão (SPEC-031 → SPEC-026): evento na rodada → o humano fica LESIONADO', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    const worldAthleteId = (await readOccupation(worldHandle.db, SEED, humanId))!.athleteId;

    // tick 1 publica a rodada; limpa qualquer lesão que o engine tenha sorteado (o teste controla)
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    await playerHandle.db
      .delete(playerSchema.injury)
      .where(eq(playerSchema.injury.athleteId, humanId));
    // injeta DETERMINISTICAMENTE um evento de lesão do humano na rodada publicada (testa o WIRING)
    const rr = (await readRound(worldHandle.db, league.leagueId, world.seasonId, 1))!;
    const modified = {
      ...rr,
      matches: rr.matches.map((m) =>
        m.homeId === clubId || m.awayId === clubId
          ? {
              ...m,
              events: [
                {
                  kind: 'injury' as const,
                  clubId,
                  athleteId: worldAthleteId,
                  severity: 'media' as const,
                  minute: 40,
                },
              ],
            }
          : m,
      ),
    };
    await worldHandle.db
      .update(worldSchema.publishedRound)
      .set({ result: modified })
      .where(
        and(
          eq(worldSchema.publishedRound.leagueId, league.leagueId),
          eq(worldSchema.publishedRound.seasonId, world.seasonId),
          eq(worldSchema.publishedRound.round, 1),
        ),
      );

    // tick 2 (mesmo dia, rodada idempotente): lê o evento → injureFromMatch → o humano fica lesionado
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(rep.injured).toBe(1);
    const state = await readInjuryState(playerHandle.db, humanId, START);
    expect(state.injury?.severity).toBe('media');
    expect(state.available).toBe(false); // lesionado → indisponível (o seam que o mundo lê)
  });

  it('idempotência: o tick 2× no mesmo dia NÃO re-lesiona (injureFromMatch é idempotente)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    const worldAthleteId = (await readOccupation(worldHandle.db, SEED, humanId))!.athleteId;
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    await playerHandle.db
      .delete(playerSchema.injury)
      .where(eq(playerSchema.injury.athleteId, humanId));
    const rr = (await readRound(worldHandle.db, league.leagueId, world.seasonId, 1))!;
    const modified = {
      ...rr,
      matches: rr.matches.map((m) =>
        m.homeId === clubId || m.awayId === clubId
          ? {
              ...m,
              events: [
                {
                  kind: 'injury' as const,
                  clubId,
                  athleteId: worldAthleteId,
                  severity: 'leve' as const,
                  minute: 5,
                },
              ],
            }
          : m,
      ),
    };
    await worldHandle.db
      .update(worldSchema.publishedRound)
      .set({ result: modified })
      .where(
        and(
          eq(worldSchema.publishedRound.leagueId, league.leagueId),
          eq(worldSchema.publishedRound.seasonId, world.seasonId),
          eq(worldSchema.publishedRound.round, 1),
        ),
      );
    const a = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(a.injured).toBe(1); // lesionou 1×
    const b = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(b.injured).toBe(0); // o retry NÃO re-lesiona (1 ativa/atleta)
    expect((await readInjuryState(playerHandle.db, humanId, START)).injury?.severity).toBe('leve');
  });

  it('NPC lesionado NÃO persiste: evento de um athleteId SEM ocupação → o humano intacto', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    await playerHandle.db
      .delete(playerSchema.injury)
      .where(eq(playerSchema.injury.athleteId, humanId));
    // evento de lesão de um NPC (athleteId inexistente como ocupação) no jogo do clube do humano
    const rr = (await readRound(worldHandle.db, league.leagueId, world.seasonId, 1))!;
    const modified = {
      ...rr,
      matches: rr.matches.map((m) =>
        m.homeId === clubId || m.awayId === clubId
          ? {
              ...m,
              events: [
                {
                  kind: 'injury' as const,
                  clubId,
                  athleteId: 'npc-sem-ocupacao',
                  severity: 'grave' as const,
                  minute: 20,
                },
              ],
            }
          : m,
      ),
    };
    await worldHandle.db
      .update(worldSchema.publishedRound)
      .set({ result: modified })
      .where(
        and(
          eq(worldSchema.publishedRound.leagueId, league.leagueId),
          eq(worldSchema.publishedRound.seasonId, world.seasonId),
          eq(worldSchema.publishedRound.round, 1),
        ),
      );
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(rep.injured).toBe(0); // o evento é de um NPC → não roteia p/ nenhum humano
    expect((await readInjuryState(playerHandle.db, humanId, START)).injury).toBeNull(); // intacto
  });

  it('robustez: gravidade INVÁLIDA no evento é isolada — não starva os demais passes do humano', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    const worldAthleteId = (await readOccupation(worldHandle.db, SEED, humanId))!.athleteId;
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    await playerHandle.db
      .delete(playerSchema.injury)
      .where(eq(playerSchema.injury.athleteId, humanId));
    const rr = (await readRound(worldHandle.db, league.leagueId, world.seasonId, 1))!;
    // gravidade CORROMPIDA no jsonb (só via tampering; o engine nunca produz) → injureFromMatch lança
    const events = [
      { kind: 'injury', clubId, athleteId: worldAthleteId, severity: 'mortal', minute: 10 },
    ];
    const modified = {
      ...rr,
      matches: rr.matches.map((m) =>
        m.homeId === clubId || m.awayId === clubId ? { ...m, events } : m,
      ),
    };
    await worldHandle.db
      .update(worldSchema.publishedRound)
      .set({ result: modified as typeof rr })
      .where(
        and(
          eq(worldSchema.publishedRound.leagueId, league.leagueId),
          eq(worldSchema.publishedRound.seasonId, world.seasonId),
          eq(worldSchema.publishedRound.round, 1),
        ),
      );
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(rep.injured).toBe(0); // a lesão inválida foi IGNORADA (isolada)
    expect((await readInjuryState(playerHandle.db, humanId, START)).injury).toBeNull();
    // mas os demais passes RODARAM (o humano não foi starvado): decisões presentes
    expect((await readDecisionLog(playerHandle.db, humanId)).length).toBeGreaterThan(0);
  });

  it('PAYOFF (SPEC-031 → SPEC-026): humano lesionado → o tick gera a decisão lesao-volta no dia', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const humanId = await seatHuman(league.clubs[0]!.id);
    // oráculo determinístico: acha um dia onde o motor (SPEC-025) inclui lesao-volta com injured=true
    // (o MESMO contexto que o `buildContext` do tick produz p/ um humano fresco lesionado).
    const ctx = { overall: 34, balance: 0, lifestyleTier: 0, moral: 50, injured: true };
    let injuryDay = START;
    for (let d = START; d < START + 300; d++) {
      if (
        generateDailyDecisions(SEED, d, humanId, ctx).some((x) => x.templateId === 'lesao-volta')
      ) {
        injuryDay = d;
        break;
      }
    }
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, injuryDay); // injuryDay = round 1
    await injureFromMatch(playerHandle.db, humanId, injuryDay, 'grave'); // o humano está lesionado
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(injuryDay));
    const templates = (await readDecisionLog(playerHandle.db, humanId))
      .filter((e) => e.day === injuryDay)
      .map((e) => e.templateId);
    expect(templates).toContain('lesao-volta'); // a lesão do dia gera a decisão (o injured chega à geração)
  });

  it('fora da janela (não 15h) → o tick não processa ninguém', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START, 10));
    expect(rep.roundStatus).toBe('fora_de_janela');
    expect(rep.humans).toBe(0);
    expect(rep.accrued).toBe(0);
  });

  // ─────────────────── CATCH-UP (SPEC-032) ───────────────────

  it('same-day: o tick roda às 20h (não 15h) e AINDA publica a rodada do dia (janela larga)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START, 20));
    expect(rep.roundStatus).toBe('published'); // 20h ainda é dia vencido (antes: só 15h publicava)
    expect(rep.daysProcessed).toBe(1);
    expect(rep.accrued).toBe(1);
    const paid =
      salaryPerRound(34) + matchPrize(await prizeOf(league.leagueId, world.seasonId, clubId));
    expect((await readWallet(playerHandle.db, humanId))!.balance).toBe(paid);
  });

  it('multi-day: cursor em START, o tick em START+3 recupera as rodadas 2,3,4 e paga cada uma', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START)); // round 1 → cursor START
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START + 3));
    expect(rep.daysProcessed).toBe(3); // dias START+1, +2, +3 (perdidos) recuperados
    expect(rep.accrued).toBe(3); // 3 rodadas pagas
    expect(rep.roundStatus).toBe('published');
    for (const r of [2, 3, 4]) {
      expect(await readRound(worldHandle.db, league.leagueId, world.seasonId, r)).not.toBeNull();
    }
    let expected = 0;
    for (const r of [1, 2, 3, 4]) {
      expected +=
        salaryPerRound(34) + matchPrize(await prizeOf(league.leagueId, world.seasonId, clubId, r));
    }
    expect((await readWallet(playerHandle.db, humanId))!.balance).toBe(expected);
    expect(await readTickCursor(worldHandle.db, SEED)).toBe(START + 3);
  });

  it('deferido no meio do catch-up PARA o cursor (retenta); o retry retoma e completa', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    await seatHuman(clubId);
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START)); // round 1 → cursor START
    // a rodada 3 estoura → o catch-up publica a 2, DEFERE a 3 e para o cursor em START+1
    await worldHandle.db.execute(
      sql`ALTER TABLE published_round ADD CONSTRAINT tmp_boom3 CHECK (round <> 3)`,
    );
    try {
      const partial = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START + 3));
      expect(partial.daysProcessed).toBe(1); // só a rodada 2 liquidou
      expect(partial.roundStatus).toBe('deferred'); // parou na 3
      expect(await readTickCursor(worldHandle.db, SEED)).toBe(START + 1); // NÃO passou do buraco
      expect(await readRound(worldHandle.db, league.leagueId, world.seasonId, 2)).not.toBeNull();
      expect(await readRound(worldHandle.db, league.leagueId, world.seasonId, 3)).toBeNull();
    } finally {
      await worldHandle.db.execute(sql`ALTER TABLE published_round DROP CONSTRAINT tmp_boom3`);
    }
    // retry: retoma de START+2 → publica a 3 e a 4
    const rest = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START + 3));
    expect(rest.daysProcessed).toBe(2);
    expect(await readTickCursor(worldHandle.db, SEED)).toBe(START + 3);
    expect(await readRound(worldHandle.db, league.leagueId, world.seasonId, 3)).not.toBeNull();
    expect(await readRound(worldHandle.db, league.leagueId, world.seasonId, 4)).not.toBeNull();
  });

  it('cross-season: o catch-up cruza o fim da temporada → publica a 38, VIRA, e o humano sobrevive', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    await advanceTickCursor(worldHandle.db, SEED, START + 36); // cursor na véspera da rodada 38
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START + 38));
    expect(rep.daysProcessed).toBe(2); // a rodada 38 (START+37) + a viragem (START+38)
    expect(rep.roundStatus).toBe('season_rolled');
    expect(await readRound(worldHandle.db, league.leagueId, world.seasonId, 38)).not.toBeNull();
    // o humano SOBREVIVE à virada (imune) — a ocupação segue existindo no mundo virado
    expect(await readOccupation(worldHandle.db, SEED, humanId)).not.toBeNull();
  });

  it('backfill do 1º tick: âncora no passado (cursor nulo) NÃO pula rodadas — publica 1..N (fix MINOR)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START); // rodada 1 = dia START
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    // 1º tick roda 3 dias DEPOIS do início da temporada (deploy que atrasou) — cursor nulo
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START + 3));
    expect(rep.daysProcessed).toBe(4); // rodadas 1,2,3,4 — nenhuma pulada (antes: só a 4)
    expect(rep.accrued).toBe(4);
    for (const r of [1, 2, 3, 4]) {
      expect(await readRound(worldHandle.db, league.leagueId, world.seasonId, r)).not.toBeNull();
    }
    let expected = 0;
    for (const r of [1, 2, 3, 4]) {
      expected +=
        salaryPerRound(34) + matchPrize(await prizeOf(league.leagueId, world.seasonId, clubId, r));
    }
    expect((await readWallet(playerHandle.db, humanId))!.balance).toBe(expected);
  });

  it('idempotência: re-rodar o mesmo tick não avança o cursor nem re-paga', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const clubId = world.tiers[world.tiers.length - 1]!.leagues[0]!.clubs[0]!.id;
    await seatHuman(clubId);
    await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    const cursor1 = await readTickCursor(worldHandle.db, SEED);
    const r2 = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(r2.accrued).toBe(0); // ninguém re-pago
    expect(r2.roundStatus).toBe('idempotent'); // o dia é re-processado, mas a rodada não republica
    expect(await readTickCursor(worldHandle.db, SEED)).toBe(cursor1); // cursor NÃO avança além de START
  });

  it('regen processa um candidato ≥42 na viragem (janela de gênese; before_season no gate auto-cura)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const humanId = await seatHuman(league.clubs[0]!.id);
    const worldAthleteId = (await readOccupation(worldHandle.db, SEED, humanId))!.athleteId;
    // idade 41 → a viragem (ageAndRetire) o leva a 42 = gatilho de regen FORÇADO. A viragem abre a
    // gênese (nenhuma rodada da temporada nova publicada) → o regen consegue reassign (senão a guarda
    // de gênese barra). É a MESMA janela que o gate `before_season` reabre no retry de uma viragem falha.
    await worldHandle.db
      .update(worldSchema.athlete)
      .set({ age: 41 })
      .where(eq(worldSchema.athlete.id, worldAthleteId));
    await advanceTickCursor(worldHandle.db, SEED, START + 37); // isola a viragem (dia START+38)
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START + 38));
    expect(rep.roundStatus).toBe('season_rolled');
    expect(rep.regenerated).toBe(1); // o humano que chegou a 42 na virada renasceu
    const legends = await readLegends(worldHandle.db, SEED);
    expect(legends.some((l) => l.humanAthleteId === humanId)).toBe(true); // virou lenda
  });

  it('transferência ACEITA é EXECUTADA na viragem (o tick wira runTransferPass — SPEC-033)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    const league = world.tiers[world.tiers.length - 1]!.leagues[0]!;
    const clubId = league.clubs[0]!.id;
    const humanId = await seatHuman(clubId);
    const occ = (await readOccupation(worldHandle.db, SEED, humanId))!;
    // forte de verdade: os FOCOS vivos = 70 (o que a proposta E o destino usam) + aceitou (flag pendente)
    await worldHandle.db
      .update(worldSchema.worldOccupation)
      .set({ ability: 70 })
      .where(
        and(
          eq(worldSchema.worldOccupation.worldSeed, SEED),
          eq(worldSchema.worldOccupation.humanAthleteId, humanId),
        ),
      );
    await worldHandle.db
      .update(worldSchema.athlete)
      .set({ ability: 70 })
      .where(
        and(eq(worldSchema.athlete.worldSeed, SEED), eq(worldSchema.athlete.id, occ.athleteId)),
      );
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ fisico: 70, tecnico: 70, tatico: 70, mental: 70, transferRequested: true })
      .where(eq(playerSchema.athlete.id, humanId));
    await advanceTickCursor(worldHandle.db, SEED, START + 37); // isola a viragem
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START + 38));
    expect(rep.roundStatus).toBe('season_rolled');
    expect(rep.transferred).toBe(1); // o tick executou a transferência na gênese
    expect((await readOccupation(worldHandle.db, SEED, humanId))!.clubId).not.toBe(clubId); // mudou
  });

  it('a waiting-list é drenada no TICK diário (o passe de admissão wired — SPEC-034)', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START);
    // um humano solo no player-store, enfileirado (teto 0 → não entra direto)
    seq += 1;
    const draft = createAthlete({
      name: 'Novato',
      position: 'FWD',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(playerHandle.db, {
      email: `q${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    await admitOrEnqueue(
      worldHandle.db,
      playerHandle.db,
      { humanAthleteId: athleteId, worldSeed: SEED },
      0,
    );
    // o tick roda o passe (teto default alto) → admite da fila
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(rep.admitted).toBe(1);
    expect(await readOccupation(worldHandle.db, SEED, athleteId)).not.toBeNull();
    // a admissão roda no FIM do dia → o admitido NÃO é processado HOJE (não herda o resultado/lesão
    // da rodada já publicada do NPC): sem decisões geradas no dia da entrada (revisão MINOR).
    expect((await readDecisionLog(playerHandle.db, athleteId)).length).toBe(0);
  });

  it('âncora no futuro (nada venceu ainda) → fora_de_janela, ninguém processado', async () => {
    const world = (await readWorld(worldHandle.db, SEED))!;
    await setSeasonAnchor(worldHandle.db, SEED, world.seasonId, START + 5); // temporada começa em 5 dias
    const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
    expect(rep.roundStatus).toBe('fora_de_janela');
    expect(rep.daysProcessed).toBe(0);
  });

  // SPEC-037 (critério 6): a purga de sessões roda no tick, e uma concern de AUTH não pode derrubar
  // a rodada das 15h. Sem estes dois, o posicionamento e o isolamento não eram provados por nada.
  describe('purga de sessões (SPEC-037)', () => {
    it('é ISOLADA: um erro na purga não propaga — a rodada não pode cair por causa de auth', async () => {
      const quebrado = {
        delete: () => {
          throw new Error('player-db fora do ar');
        },
      } as unknown as Parameters<typeof purgeSessions>[0];
      await expect(purgeSessions(quebrado, epochAt(START))).resolves.toBeUndefined();
    });

    it('roda ANTES dos early-returns: purga mesmo num tick que retorna sem_ancora', async () => {
      // Este é o cenário do DIA 1 DE PRODUÇÃO (mundo semeado, âncora ainda não): se a purga
      // estivesse depois dos early-returns, ela nunca rodaria aqui.
      const draft = createAthlete({
        name: 'Zé da Purga',
        position: 'FWD',
        appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
        attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
      });
      if (!draft.ok) throw new Error('draft inválido');
      const conta = await createAccountWithAthlete(playerHandle.db, {
        email: 'purga@varzea.test',
        password: PASSWORD,
        draft: draft.value,
      });
      const vencida = 'a'.repeat(64);
      await createSession(playerHandle.db, conta.accountId, vencida, epochAt(START) - 31 * 86_400_000);
      await worldHandle.db.delete(worldSchema.season); // força `sem_ancora`
      const rep = await runDailyTick(worldHandle.db, playerHandle.db, SEED, epochAt(START));
      expect(rep.roundStatus).toBe('sem_ancora');
      expect(await readSessionByHash(playerHandle.db, vencida, epochAt(START))).toBeNull();
    });
  });
});
