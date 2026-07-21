// O agregador `readBandState` (SPEC-038) contra Postgres REAL, SEM subir servidor (chama a fn
// direto). Cobre: campo-a-campo vs a fonte, estados degradados, os TRÊS relógios, o throttle do
// markActive, a forma ADITIVA do contrato, os grep-gates estruturais e o teto de round-trips.
// Dois handles sobre o MESMO Postgres. Gated por DATABASE_URL. Serial (SPEC-015).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAthlete,
  dayPhase,
  daysLeftOf,
  injuryPhase,
  kitFromClubId,
  shirtNumber,
  SHIRT,
  type Position,
} from '@camisa-9/player';
import {
  accrueRound,
  countPendingDecisions,
  createAccountWithAthlete,
  createDb as createPlayerDb,
  generateForDay,
  injureFromMatch,
  readAthleteProgress,
  readInjuryState,
  readMood,
  readWallet,
  schema as playerSchema,
  type DbHandle as PlayerHandle,
} from '@camisa-9/player-store';
import * as worldStore from '@camisa-9/world-store';
import {
  advanceTickCursor,
  createDb as createWorldDb,
  enqueue,
  occupyNpcSlot,
  readClubBrief,
  readClubSquad,
  readOccupation,
  readOccupationsByClub,
  readRound,
  runRoundForDay,
  runVacancyPass,
  setSeasonAnchor,
  schema as worldSchema,
  writeWorld,
  readWorld,
  type DbHandle as WorldHandle,
} from '@camisa-9/world-store';
import { readBandState, type BandDeps } from '../src/band/band-state.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'band-agg-038';
const PASSWORD = 'senha-bem-forte-123';
const D = 20_000; // dia-base da temporada (round 1 = startDayIndex)
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;
let seq = 0;

/** epochMs que resolve para (dayIndex, hour) em BRT (offset fixo UTC-3). */
function epochAt(dayIndex: number, hour: number, minute = 0): number {
  return dayIndex * MS_DAY + hour * MS_HOUR + minute * 60_000 + 3 * MS_HOUR;
}

describe.skipIf(!DB_URL)('readBandState — o agregador da faixa (SPEC-038)', () => {
  let worldHandle: WorldHandle;
  let playerHandle: PlayerHandle;
  let deps: BandDeps;

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
    deps = { db: playerHandle.db, worldDb: worldHandle.db, worldSeed: SEED };
  });

  afterAll(async () => {
    if (worldHandle) await worldHandle.pool.end();
    if (playerHandle) await playerHandle.pool.end();
  });

  beforeEach(async () => {
    await wipeAll();
    await writeWorld(worldHandle.db, SEED);
  });

  afterEach(() => vi.restoreAllMocks());

  async function wipeAll(): Promise<void> {
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
    await playerHandle.db.delete(playerSchema.injury);
    await playerHandle.db.delete(playerSchema.decision);
    await playerHandle.db.delete(playerSchema.purchase);
    await playerHandle.db.delete(playerSchema.dailyLedger);
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
    await playerHandle.db.delete(playerSchema.session);
    await playerHandle.db.delete(playerSchema.account);
  }

  async function createHuman(position: Position, name = 'Craque'): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name,
      position,
      appearance: { skinTone: 2, hairStyle: 3, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error(`draft inválido: ${draft.reason}`);
    const { athleteId } = await createAccountWithAthlete(playerHandle.db, {
      email: `b${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    return athleteId;
  }

  async function entryClubId(): Promise<string> {
    const w = (await readWorld(worldHandle.db, SEED))!;
    const entry = w.tiers[w.tiers.length - 1]!;
    return entry.leagues[0]!.clubs[0]!.id;
  }

  /** Humano ocupando a vaga do NPC mais fraco (FWD) num clube de entrada, com a temporada ancorada
   *  em `startDay`. Devolve os ids que a faixa vai ler. */
  async function seatHuman(
    startDay = D,
  ): Promise<{ athleteId: string; clubId: string; seasonId: string }> {
    const clubId = await entryClubId();
    const athleteId = await createHuman('FWD');
    const res = await occupyNpcSlot(worldHandle.db, {
      worldSeed: SEED,
      clubId,
      position: 'FWD',
      humanAthleteId: athleteId,
      humanName: 'Craque',
      ability: 34,
    });
    await setSeasonAnchor(worldHandle.db, SEED, res.seasonId, startDay);
    return { athleteId, clubId, seasonId: res.seasonId };
  }

  it('campo a campo: todo campo do contrato bate com sua FONTE (com clube, pré-jogo)', async () => {
    const { athleteId, clubId } = await seatHuman();
    // estado rico: overall != frozen, saldo, lesão, decisões, humor não-default.
    await playerHandle.db
      .update(playerSchema.athlete)
      .set({ fisico: 60, tecnico: 50, tatico: 50, mental: 40, forma: 70, moral: 30 })
      .where(eq(playerSchema.athlete.id, athleteId));
    await accrueRound(playerHandle.db, athleteId, D);
    await injureFromMatch(playerHandle.db, athleteId, D, 'media');
    await generateForDay(playerHandle.db, athleteId, D, SEED, {});

    const state = await readBandState(deps, athleteId, epochAt(D, 16));

    // relógio + fase
    expect(state.contractVersion).toBe('v1');
    expect(state.serverTime.dayIndex).toBe(D);
    expect(state.serverTime.brtHour).toBe(16);
    expect(state.phase).toBe('casa'); // 15h cai em 'casa'
    expect(state.phase).toBe(dayPhase(16));

    // atleta: overall VIVO (do progress), age do MUNDO, available da lesão
    const progress = (await readAthleteProgress(playerHandle.db, athleteId))!;
    expect(state.athlete.overall).toBe(progress.overall);
    expect(state.athlete.overall).not.toBe(34); // prova: não é a ability CONGELADA
    expect(state.athlete.appearance).toEqual({ skinTone: 2, hairStyle: 3, hairColor: 1 });
    // número DERIVADO da posição (FWD, SPEC-040) — determinístico, no pool da posição
    expect(state.athlete.number).toBe(shirtNumber('FWD', athleteId));
    expect(SHIRT.pools.FWD).toContain(state.athlete.number);
    const injState = await readInjuryState(playerHandle.db, athleteId, D);
    expect(state.athlete.available).toBe(injState.available);

    // barras: EXATAMENTE forma/moral, da fonte
    const mood = (await readMood(playerHandle.db, athleteId))!;
    expect(state.bars).toEqual({ forma: mood.forma, moral: mood.moral });
    expect(state.bars).toEqual({ forma: 70, moral: 30 });

    // treino
    expect(state.training.attributes).toEqual(progress.attributes);
    expect(state.training.freePoints).toBe(progress.freePoints);
    expect(state.training.nextThreshold).toBe(progress.nextThreshold);

    // casa
    const wallet = (await readWallet(playerHandle.db, athleteId))!;
    expect(state.home.balance).toBe(wallet.balance);
    expect(state.home.lifestyleTier).toBe(wallet.lifestyleTier);
    expect(state.home.hasMothersHouse).toBe(wallet.hasMothersHouse);

    // lesão: arco, daysLeft >= 0, bate com as fns puras no espaço tickDay (=D)
    expect(state.injury).not.toBeNull();
    expect(state.injury!.phase).toBe(injuryPhase(injState.injury!, D));
    expect(state.injury!.daysLeft).toBe(
      daysLeftOf(injState.injury!.startedDay, injState.injury!.recoveryDays, D),
    );
    expect(state.injury!.daysLeft).toBeGreaterThanOrEqual(0);

    // clube + kit determinístico
    const occ = (await readOccupation(worldHandle.db, SEED, athleteId))!;
    expect(state.club).not.toBeNull();
    expect(state.club!.clubId).toBe(clubId);
    expect(state.club!.seasonId).toBe(occ.seasonId);
    const brief = (await readClubBrief(worldHandle.db, SEED, clubId))!;
    expect(state.club!.name).toBe(brief.name);
    expect(state.club!.tier).toBe(brief.tier);
    expect(state.club!.kit).toEqual(kitFromClubId(clubId));
    expect(state.club!.round).toBe(1); // tickDay D − startDay D + 1

    // elenco: 16, exatamente um isMe, isHuman cruzado com readOccupationsByClub
    const squad = await readClubSquad(worldHandle.db, SEED, clubId);
    expect(state.squad).toHaveLength(16);
    expect(squad).toHaveLength(16);
    const mine = state.squad.filter((m) => m.isMe);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.athleteId).toBe(occ.athleteId);
    expect(mine[0]!.isHuman).toBe(true);
    expect(mine[0]!.avatarSeed).toBe(occ.athleteId);
    const occsByClub = await readOccupationsByClub(worldHandle.db, SEED, clubId);
    // conjunto de humanos do elenco == conjunto de ocupações (e os 15 restantes são NPC)
    expect(
      state.squad
        .filter((m) => m.isHuman)
        .map((m) => m.athleteId)
        .sort(),
    ).toEqual(occsByClub.map((o) => o.athleteId).sort());
    expect(state.squad.filter((m) => !m.isHuman)).toHaveLength(15);
    // athlete.age vem do MUNDO (o membro isMe do elenco) — entra aos 17 (SPEC-022)
    expect(state.athlete.age).toBe(mine[0]!.age);
    expect(state.athlete.age).toBe(17);

    // pré-jogo: adversário presente, ainda NÃO jogado
    expect(state.club!.todayMatch).not.toBeNull();
    expect(state.club!.todayMatch!.played).toBe(false);
    expect(state.club!.todayMatch!.goalsFor).toBeNull();
    expect(state.club!.todayMatch!.opponentClubId).not.toBe(clubId);

    // decisões: CONTAGEM == a fonte
    expect(state.pendingDecisions).toBe(await countPendingDecisions(playerHandle.db, athleteId, D));
    expect(state.pendingDecisions).toBeGreaterThan(0);

    // sem vaga? não — está no clube → queue null
    expect(state.queue).toBeNull();
  });

  it('pós-jogo: a rodada publicada preenche o PLACAR (played + goalsFor/Against)', async () => {
    const { athleteId, clubId, seasonId } = await seatHuman();
    await runRoundForDay(worldHandle.db, SEED, D); // publica a rodada 1 de todas as ligas
    await advanceTickCursor(worldHandle.db, SEED, D); // a rodada do dia LIQUIDOU

    const state = await readBandState(deps, athleteId, epochAt(D, 16));
    expect(state.serverTime.roundSettled).toBe(true);
    const match = state.club!.todayMatch!;
    expect(match.played).toBe(true);
    expect(typeof match.goalsFor).toBe('number');
    expect(typeof match.goalsAgainst).toBe('number');
    // cruza com o readRound cru
    const brief = (await readClubBrief(worldHandle.db, SEED, clubId))!;
    const round = (await readRound(worldHandle.db, brief.leagueId, seasonId, 1))!;
    const raw = round.matches.find((m) => m.homeId === clubId || m.awayId === clubId)!;
    const isHome = raw.homeId === clubId;
    expect(match.goalsFor).toBe(isHome ? raw.homeGoals : raw.awayGoals);
    expect(match.goalsAgainst).toBe(isHome ? raw.awayGoals : raw.homeGoals);
    // SPEC-043: a timeline de gols ROUND-TRIPPA (jsonb do published_round) e é orientada `isMine`.
    expect(match.goals).toBeDefined();
    const rawGoals = (raw.events ?? []).filter((e) => e.kind === 'goal');
    expect(match.goals!.length).toBe(rawGoals.length); // sobreviveu ao publish → readRound
    expect(match.goals!.length).toBe((match.goalsFor ?? 0) + (match.goalsAgainst ?? 0)); // soma o placar
    expect(match.goals!.filter((g) => g.isMine).length).toBe(match.goalsFor); // meus gols == meu placar
  });

  it('manhã do dia SEGUINTE: o placar de ONTEM (rodada mostrada, já publicada) aparece jogado', async () => {
    // Regressão do MAJOR do review: o gate do placar do todayMatch usava slot.dayIndex (a rodada de
    // HOJE), mas a rodada MOSTRADA é a de tickDay. Às 09h de D+1: club.round = round de D (tickDay),
    // que JÁ jogou/publicou — mas serverTime.roundSettled (dia-calendário D+1) é false. O placar de
    // ontem DEVE aparecer; antes do fix vinha played:false/goals:null por ~15h todo dia.
    const { athleteId, clubId, seasonId } = await seatHuman();
    await runRoundForDay(worldHandle.db, SEED, D); // publica a rodada 1 (dia D)
    await advanceTickCursor(worldHandle.db, SEED, D); // tickCursor = D
    const state = await readBandState(deps, athleteId, epochAt(D + 1, 9)); // 09h de D+1
    expect(state.serverTime.roundSettled).toBe(false); // a rodada de HOJE (D+1) ainda não liquidou
    expect(state.club!.round).toBe(1); // mas a rodada MOSTRADA é a de tickDay=D → round 1
    const match = state.club!.todayMatch!;
    expect(match.played).toBe(true); // ← o fix: o placar de ontem aparece, não null
    expect(typeof match.goalsFor).toBe('number');
    const brief = (await readClubBrief(worldHandle.db, SEED, clubId))!;
    const raw = (await readRound(worldHandle.db, brief.leagueId, seasonId, 1))!.matches.find(
      (m) => m.homeId === clubId || m.awayId === clubId,
    )!;
    const isHome = raw.homeId === clubId;
    expect(match.goalsFor).toBe(isHome ? raw.homeGoals : raw.awayGoals);
  });

  it('degradado — na FILA: club null, squad [], queue preenchida; nunca 500', async () => {
    const athleteId = await createHuman('MID');
    await enqueue(worldHandle.db, SEED, athleteId, 'MID');
    const state = await readBandState(deps, athleteId, epochAt(D, 16));
    expect(state.club).toBeNull();
    expect(state.squad).toEqual([]);
    expect(state.queue).not.toBeNull();
    expect(state.queue!.rank).toBe(1);
    expect(state.queue!.total).toBe(1);
  });

  it('degradado — SEED sem mundo (dia 1 de produção): club null, squad [], queue null; nunca 500', async () => {
    const athleteId = await createHuman('DEF');
    const emptyDeps: BandDeps = {
      db: playerHandle.db,
      worldDb: worldHandle.db,
      worldSeed: 'seed-sem-mundo',
    };
    const state = await readBandState(emptyDeps, athleteId, epochAt(D, 16));
    expect(state.club).toBeNull();
    expect(state.squad).toEqual([]);
    expect(state.queue).toBeNull();
    expect(state.bars).toEqual({ forma: 50, moral: 50 }); // defaults, atleta existe
  });

  describe('os TRÊS relógios', () => {
    it('roundSettled usa slot.dayIndex (não dueDayIndex): 12h com tick de ONTEM → false', async () => {
      const { athleteId } = await seatHuman();
      await advanceTickCursor(worldHandle.db, SEED, D - 1); // liquidou ONTEM
      const state = await readBandState(deps, athleteId, epochAt(D, 12)); // hoje, 12h
      expect(state.serverTime.roundSettled).toBe(false); // senão anunciaria "jogo já aconteceu" às 09h
    });

    it('lesão/decisões usam tickDay: às 09h de D+1, refletem D (não zeram)', async () => {
      const { athleteId } = await seatHuman();
      await injureFromMatch(playerHandle.db, athleteId, D, 'media');
      await generateForDay(playerHandle.db, athleteId, D, SEED, {});
      // 09h de D+1 → slot.dayIndex = D+1, mas tickDay = dueDayIndex = D (09h < 15h)
      const state = await readBandState(deps, athleteId, epochAt(D + 1, 9));
      expect(state.serverTime.dayIndex).toBe(D + 1);
      expect(state.pendingDecisions).toBe(
        await countPendingDecisions(playerHandle.db, athleteId, D),
      );
      expect(state.pendingDecisions).toBeGreaterThan(0);
      const inj = await readInjuryState(playerHandle.db, athleteId, D);
      expect(state.injury!.daysLeft).toBe(
        daysLeftOf(inj.injury!.startedDay, inj.injury!.recoveryDays, D),
      );
    });
  });

  describe('markActive — presença best-effort', () => {
    it('throttle: 3 chamadas no MESMO dia → markActive chamado 1×', async () => {
      const { athleteId } = await seatHuman();
      const spy = vi.spyOn(worldStore, 'markActive');
      const e = epochAt(D, 16);
      await readBandState(deps, athleteId, e);
      await readBandState(deps, athleteId, e);
      await readBandState(deps, athleteId, e);
      expect(spy).toHaveBeenCalledTimes(1); // o throttle vê lastActiveDay no banco
    });

    it('grava com slot.dayIndex e impede o congelamento do mesmo dia', async () => {
      const { athleteId } = await seatHuman();
      await readBandState(deps, athleteId, epochAt(D, 9)); // abre a faixa de manhã (09h)
      await runVacancyPass(worldHandle.db, SEED, D); // o passe do dia D
      const occ = (await readOccupation(worldHandle.db, SEED, athleteId))!;
      expect(occ.lastActiveDay).toBe(D);
      expect(occ.frozenSinceDay).toBeNull(); // NÃO congelou quem abriu a faixa hoje
    });

    it('vaga congelada + faixa aberta → descongela (thaw)', async () => {
      const { athleteId } = await seatHuman();
      await worldHandle.db
        .update(worldSchema.worldOccupation)
        .set({ frozenSinceDay: D - 40, lastActiveDay: D - 40 })
        .where(eq(worldSchema.worldOccupation.humanAthleteId, athleteId));
      await readBandState(deps, athleteId, epochAt(D, 16));
      const occ = (await readOccupation(worldHandle.db, SEED, athleteId))!;
      expect(occ.frozenSinceDay).toBeNull(); // descongelou
      expect(occ.lastActiveDay).toBe(D);
    });

    it('markActive que LANÇA → a faixa devolve o BandState íntegro (best-effort)', async () => {
      const { athleteId } = await seatHuman();
      const spy = vi.spyOn(worldStore, 'markActive').mockRejectedValue(new Error('boom'));
      const state = await readBandState(deps, athleteId, epochAt(D, 16));
      expect(spy).toHaveBeenCalled(); // não-vácuo: o caminho de erro foi exercido
      expect(state.club).not.toBeNull(); // o estado veio inteiro apesar do markActive quebrar
      expect(state.contractVersion).toBe('v1');
    });
  });

  describe('contrato: DUAS barras e forma ADITIVA', () => {
    it('bars tem EXATAMENTE as chaves forma/moral (um folego acrescentado quebraria)', async () => {
      const { athleteId } = await seatHuman();
      const state = await readBandState(deps, athleteId, epochAt(D, 16));
      expect(Object.keys(state.bars).sort()).toEqual(['forma', 'moral']);
    });

    it('V1_SHAPE: presença + tipo de cada campo (sem proibir chaves NOVAS)', async () => {
      const { athleteId } = await seatHuman();
      const s = await readBandState(deps, athleteId, epochAt(D, 16));
      expect(s.contractVersion).toBe('v1');
      expect(typeof s.serverTime.epochMs).toBe('number');
      expect(typeof s.serverTime.roundSettled).toBe('boolean');
      expect(['ct', 'vespera', 'casa']).toContain(s.phase);
      expect(typeof s.athlete.id).toBe('string');
      expect(typeof s.athlete.overall).toBe('number');
      expect(typeof s.athlete.available).toBe('boolean');
      expect(typeof s.athlete.number).toBe('number');
      expect(typeof s.bars.forma).toBe('number');
      expect(typeof s.training.trainingXp).toBe('number');
      expect(typeof s.home.balance).toBe('number');
      expect(typeof s.pendingDecisions).toBe('number');
      expect(Array.isArray(s.squad)).toBe(true);
      // nulos-explícitos: injury pode ser null; club presente aqui
      expect(s.club === null || typeof s.club.clubId === 'string').toBe(true);
      expect(s.queue === null || typeof s.queue.rank === 'number').toBe(true);
    });
  });

  describe('grep-gates estruturais + teto de round-trips', () => {
    const bandFiles = [
      'band/band-state.ts',
      'band/from-player.ts',
      'band/from-world.ts',
      'band/types.ts',
      'routes/band.ts',
    ].map((f) => readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), 'utf8'));

    it('src/band|routes/band NÃO importa readWorld/readWorldOccupations/readClubRoster nem node:http', () => {
      for (const src of bandFiles) {
        expect(/\breadWorld\b/.test(src)).toBe(false);
        expect(src.includes('readWorldOccupations')).toBe(false);
        expect(src.includes('readClubRoster')).toBe(false);
        expect(src.includes('node:http')).toBe(false);
        // locks só xact-scoped (ADR-002): nada de sessão/LISTEN/NOTIFY/SET SESSION no código novo
        expect(src.includes('pg_advisory_lock')).toBe(false);
        expect(/\bLISTEN\b|\bNOTIFY\b|SET SESSION/.test(src)).toBe(false);
      }
    });

    it('≤ 28 round-trips no agregador (1ª chamada COM markActive e 2ª SEM)', async () => {
      const { athleteId } = await seatHuman();
      const counter = instrument([worldHandle.pool, playerHandle.pool]);
      await readBandState(deps, athleteId, epochAt(D, 16)); // 1ª: inclui markActive
      const first = counter.count();
      await readBandState(deps, athleteId, epochAt(D, 16)); // 2ª: sem markActive
      const second = counter.count() - first;
      counter.restore();
      expect(first).toBeLessThanOrEqual(28);
      expect(second).toBeLessThanOrEqual(28);
    });
  });
});

/** Conta round-trips reais: envolve SÓ `pool.connect` e conta cada `client.query`. O `pool.query`
 *  do pg roteia por `connect` internamente, então isto captura as queries simples E as internas das
 *  transações (readWallet/markActive) sem contar em dobro. Trata as formas promise e callback do
 *  `connect`, não re-envolve o mesmo client (pool reusa), e é restaurável. */
type QueryFn = (...q: unknown[]) => unknown;
type PoolLike = {
  connect: (cb?: (e: unknown, c: unknown, r: unknown) => void) => unknown;
};
function instrument(pools: readonly unknown[]): { count: () => number; restore: () => void } {
  let n = 0;
  const restores: (() => void)[] = [];
  const seen = new WeakSet<object>();
  const wrap = (client: unknown): void => {
    if (!client || typeof client !== 'object' || seen.has(client)) return;
    seen.add(client);
    const c = client as { query: QueryFn };
    const cq = c.query.bind(c);
    c.query = (...q: unknown[]) => {
      n += 1;
      return cq(...q);
    };
    restores.push(() => {
      c.query = cq;
    });
  };
  for (const pool of pools) {
    const p = pool as PoolLike;
    const origConnect = p.connect.bind(p);
    p.connect = (cb?: (e: unknown, c: unknown, r: unknown) => void) => {
      if (typeof cb === 'function') {
        return origConnect((e, client, r) => {
          wrap(client);
          cb(e, client, r);
        });
      }
      return (origConnect() as Promise<unknown>).then((client) => {
        wrap(client);
        return client;
      });
    };
    restores.push(() => {
      p.connect = origConnect;
    });
  }
  return { count: () => n, restore: () => restores.forEach((r) => r()) };
}
