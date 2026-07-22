// O fecho de temporada (SPEC-053) contra Postgres REAL. Prova as três correções que a pré-mortem
// exigiu sobre o desenho original:
//
//  1. o passe NÃO depende da janela de gênese — uma campanha que não fechou no dia da viragem fecha
//     dias depois (a janela dura UM dia; sem isto, o card daquele jogador nunca existiria);
//  2. é dirigido pela LINHA — cada campanha pergunta pelo turnover DA PRÓPRIA temporada, por PK,
//     então uma sobra nunca é carimbada com o desfecho de outra virada;
//  3. `champion` exige DUAS condições (1º da tabela publicada E não-rebaixado) — a classificação e
//     a re-simulação da viragem são simulações DIFERENTES e podem se contradizer.
//
// Dois handles sobre o MESMO Postgres. Gated por DATABASE_URL. Serial (SPEC-015).
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MatchResult, RoundResult, TurnoverReport } from '@camisa-9/world-engine';
import { createAthlete } from '@camisa-9/player';
import {
  createDb as createWorldDb,
  publishRound,
  writeWorld,
  schema as worldSchema,
  type DbHandle as WorldHandle,
} from '@camisa-9/world-store';
import {
  accrueSeasonMatch,
  createAccountWithAthlete,
  createDb as createPlayerDb,
  readLastClosedSeason,
  schema as playerSchema,
  type DbHandle as PlayerHandle,
  type SeasonMatchInput,
} from '@camisa-9/player-store';
import { runSeasonClosePass } from '../src/close-pass.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'close-pass';
const PASSWORD = 'senha-bem-forte-123';
const LEAGUE = 'l-close';
const MINE = 'c-meu';
const RIVAL = 'c-rival';
let seq = 0;

describe.skipIf(!DB_URL)('close-pass — o fecho de temporada contra Postgres real', () => {
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
    // O mundo semeado só existe para o passe achar o `seasonId` CORRENTE (ele filtra a temporada em
    // curso da lista de trabalho). As partidas/turnover do teste são injetados à mão.
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
    await worldHandle.db.delete(worldSchema.waitingList);
    await worldHandle.db.delete(worldSchema.tickProgress);
    await worldHandle.db.delete(worldSchema.world);
    await playerHandle.db.delete(playerSchema.injury);
    await playerHandle.db.delete(playerSchema.decision);
    await playerHandle.db.delete(playerSchema.purchase);
    await playerHandle.db.delete(playerSchema.dailyLedger);
    await playerHandle.db.delete(playerSchema.seasonSummary);
    await playerHandle.db.delete(playerSchema.matchChoice);
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
    await playerHandle.db.delete(playerSchema.session);
    await playerHandle.db.delete(playerSchema.account);
  }

  /** Um humano com uma campanha ABERTA na temporada dada. */
  async function humanWithCampaign(
    seasonId: string,
  ): Promise<{ athleteId: string; accountId: string }> {
    seq += 1;
    const draft = createAthlete({
      name: 'Craque',
      position: 'FWD',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const created = await createAccountWithAthlete(playerHandle.db, {
      email: `cp${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    const input: SeasonMatchInput = {
      seasonId,
      round: 1,
      day: 1000 + seq,
      clubId: MINE,
      clubName: 'Meu Clube',
      leagueId: LEAGUE,
      tier: 3,
      position: 'FWD',
      goals: 1,
      assists: 0,
      rating: 75,
      overall: 41,
    };
    await accrueSeasonMatch(playerHandle.db, created.athleteId, input);
    return created;
  }

  /** Publica uma rodada com um placar escolhido — é dela que sai a classificação final. */
  async function publish(seasonId: string, round: number, mineGoals: number, rivalGoals: number) {
    const match: MatchResult = {
      round,
      homeId: MINE,
      awayId: RIVAL,
      homeGoals: mineGoals,
      awayGoals: rivalGoals,
    };
    const result: RoundResult = { round, matches: [match] };
    await publishRound(worldHandle.db, { leagueId: LEAGUE, seasonId, result });
  }

  async function writeTurnover(fromSeasonId: string, report: Partial<TurnoverReport>) {
    await worldHandle.db.insert(worldSchema.turnoverReport).values({
      worldSeed: SEED,
      fromSeasonId,
      toSeasonId: `${fromSeasonId}-next`,
      report: {
        fromSeasonId,
        toSeasonId: `${fromSeasonId}-next`,
        promoted: [],
        relegated: [],
        retired: [],
        born: [],
        transferred: [],
        ...report,
      } as TurnoverReport,
    });
  }

  async function currentSeasonId(): Promise<string> {
    const [w] = await worldHandle.db.select().from(worldSchema.world);
    return w?.seasonId ?? '';
  }

  it('não fecha nada enquanto a temporada não virou (não é erro, é "ainda não")', async () => {
    const { accountId } = await humanWithCampaign('2024');
    await publish('2024', 1, 3, 0);

    const report = await runSeasonClosePass(worldHandle.db, playerHandle.db, SEED);

    expect(report.closed).toBe(0);
    expect(report.pending).toBe(1);
    expect(await readLastClosedSeason(playerHandle.db, accountId)).toBeNull();
  });

  it('fecha com PROMOVIDO quando o turnover diz que o clube subiu', async () => {
    const { accountId } = await humanWithCampaign('2024');
    await publish('2024', 1, 0, 2); // perdeu: não é campeão
    await writeTurnover('2024', { promoted: [{ clubId: MINE, fromTier: 3, toTier: 2 }] });

    const report = await runSeasonClosePass(worldHandle.db, playerHandle.db, SEED);

    expect(report.closed).toBe(1);
    const last = await readLastClosedSeason(playerHandle.db, accountId);
    expect(last?.outcome).toBe('promoted');
    expect(last?.tierAfter).toBe(2);
  });

  it('fecha com PERMANECEU quando o turnover não move o clube', async () => {
    const { accountId } = await humanWithCampaign('2024');
    await publish('2024', 1, 0, 2); // perdeu → não é o 1º da tabela (senão sairia `champion`)
    await writeTurnover('2024', {});

    await runSeasonClosePass(worldHandle.db, playerHandle.db, SEED);

    const last = await readLastClosedSeason(playerHandle.db, accountId);
    expect(last?.outcome).toBe('stayed');
    expect(last?.tierAfter).toBeNull();
  });

  it('fecha com CAMPEÃO quando é o 1º da tabela publicada e não foi rebaixado', async () => {
    const { accountId } = await humanWithCampaign('2024');
    await publish('2024', 1, 3, 0); // 3 pontos contra 0 → 1º lugar
    await writeTurnover('2024', { promoted: [{ clubId: MINE, fromTier: 3, toTier: 2 }] });

    await runSeasonClosePass(worldHandle.db, playerHandle.db, SEED);

    expect((await readLastClosedSeason(playerHandle.db, accountId))?.outcome).toBe('champion');
  });

  it('NUNCA campeão descendo: 1º da tabela mas rebaixado no turnover → rebaixado', async () => {
    // As duas fontes podem divergir de verdade (a tabela vem das rodadas PUBLICADAS; a promoção vem
    // da re-simulação da viragem, que roda com a modulação de outro dia). O card não pode dizer
    // CAMPEÃO com a seta para baixo.
    const { accountId } = await humanWithCampaign('2024');
    await publish('2024', 1, 5, 0); // disparado em 1º na tabela publicada
    await writeTurnover('2024', { relegated: [{ clubId: MINE, fromTier: 3, toTier: 4 }] });

    await runSeasonClosePass(worldHandle.db, playerHandle.db, SEED);

    const last = await readLastClosedSeason(playerHandle.db, accountId);
    expect(last?.outcome).toBe('relegated');
    expect(last?.tierAfter).toBe(4);
  });

  it('é idempotente: rodar todo dia não reescreve um fecho', async () => {
    const { accountId } = await humanWithCampaign('2024');
    await publish('2024', 1, 3, 0);
    await writeTurnover('2024', { promoted: [{ clubId: MINE, fromTier: 3, toTier: 2 }] });

    const first = await runSeasonClosePass(worldHandle.db, playerHandle.db, SEED);
    const second = await runSeasonClosePass(worldHandle.db, playerHandle.db, SEED);

    expect(first.closed).toBe(1);
    expect(second.closed).toBe(0); // nada a fechar; o passe é no-op barato
    expect((await readLastClosedSeason(playerHandle.db, accountId))?.outcome).toBe('champion');
  });

  it('SOBRA ÓRFÃ: uma campanha que não fechou na virada fecha depois, contra o turnover DELA', async () => {
    // O cenário que a janela de gênese perderia para sempre: o fecho de 2026 falhou no dia da
    // virada; dias depois 2027 também virou. Cada linha tem de pegar o SEU turnover, por PK.
    const a = await humanWithCampaign('2024');
    const b = await humanWithCampaign('2025');
    await publish('2024', 1, 0, 4);
    await publish('2025', 1, 0, 4);
    await writeTurnover('2024', { relegated: [{ clubId: MINE, fromTier: 3, toTier: 4 }] });
    await writeTurnover('2025', { promoted: [{ clubId: MINE, fromTier: 4, toTier: 3 }] });

    const report = await runSeasonClosePass(worldHandle.db, playerHandle.db, SEED);

    expect(report.closed).toBe(2);
    const closedA = await readLastClosedSeason(playerHandle.db, a.accountId);
    const closedB = await readLastClosedSeason(playerHandle.db, b.accountId);
    expect(closedA?.seasonId).toBe('2024');
    expect(closedA?.outcome).toBe('relegated'); // o desfecho de 2026, não o de 2027
    expect(closedB?.seasonId).toBe('2025');
    expect(closedB?.outcome).toBe('promoted');
  });

  it('a temporada CORRENTE do mundo nunca é fechada', async () => {
    const current = await currentSeasonId();
    const { accountId } = await humanWithCampaign(current);
    await publish(current, 1, 3, 0);
    await writeTurnover(current, { promoted: [{ clubId: MINE, fromTier: 3, toTier: 2 }] });

    const report = await runSeasonClosePass(worldHandle.db, playerHandle.db, SEED);

    expect(report.closed).toBe(0);
    expect(await readLastClosedSeason(playerHandle.db, accountId)).toBeNull();
  });
});
