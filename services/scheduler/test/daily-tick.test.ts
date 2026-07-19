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
  createDb as createWorldDb,
  readOccupation,
  readRound,
  readWorld,
  setSeasonAnchor,
  writeWorld,
  schema as worldSchema,
  type DbHandle as WorldHandle,
} from '@camisa-9/world-store';
import {
  createAccountWithAthlete,
  createDb as createPlayerDb,
  injureFromMatch,
  readDecisionLog,
  readInjuryState,
  readMood,
  readWallet,
  schema as playerSchema,
  type DbHandle as PlayerHandle,
} from '@camisa-9/player-store';
import { enterWorld } from '@camisa-9/world-entry';
import { runDailyTick } from '../src/index.js';

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
    await worldHandle.db.delete(worldSchema.worldOccupation);
    await worldHandle.db.delete(worldSchema.publishedRound);
    await worldHandle.db.delete(worldSchema.season);
    await worldHandle.db.delete(worldSchema.athlete);
    await worldHandle.db.delete(worldSchema.club);
    await worldHandle.db.delete(worldSchema.league);
    await worldHandle.db.delete(worldSchema.worldTier);
    await worldHandle.db.delete(worldSchema.world);
    await playerHandle.db.delete(playerSchema.dailyLedger);
    await playerHandle.db.delete(playerSchema.injury);
    await playerHandle.db.delete(playerSchema.decision);
    await playerHandle.db.delete(playerSchema.purchase);
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
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
});
