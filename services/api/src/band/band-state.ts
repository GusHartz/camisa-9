// O AGREGADOR `readBandState` (SPEC-038): monta o dia inteiro do atleta numa chamada, em duas ondas
// (a onda 2 depende do clube/temporada da onda 1). Dois handles (player + world).
//
// ⚠️ EXPLICITAMENTE NÃO-ATÔMICO: zero transação cross-schema, snapshot eventualmente-consistente. É
// leitura de UI — a faixa tolera um micro-drift entre os dois bancos, e cross-schema atômico não
// existe no pooler. NÃO "conserte" isto para uma transação.
//
// ⚠️ TRÊS RELÓGIOS, de propósito: `slot.hour` → a fase · `slot.dayIndex` (dia-calendário) →
// `roundSettled` e `markActive` · `tickDay = dueDayIndex` → tudo que o tick carimba no player-store
// (lesão, decisões, rodada do clube). Antes das 15h, `tickDay = slot.dayIndex − 1`.
import {
  dueDayIndex,
  resolveSlot,
  type Position,
  type RatingFocos,
  type RoundSlot,
} from '@camisa-9/world-engine';
import { dayPhase, daysUntilRevert } from '@camisa-9/player';
import {
  countCareerSeasons,
  readAthleteIdentity,
  readAthleteProgress,
  readInjuryState,
  readLastClosedSeason,
  readMatchChoices,
  readMood,
  readPendingDecisions,
  readWallet,
  type Db,
} from '@camisa-9/player-store';
import {
  REGEN_AGE,
  VACANCY,
  markActive,
  readClubBrief,
  readClubSquad,
  readLeagueClubIds,
  readOccupation,
  readQueue,
  readRound,
  readSeasonAnchor,
  readTickCursor,
  targetRoundFor,
  type Db as WorldDb,
  type OccupationView,
} from '@camisa-9/world-store';
import {
  buildAthlete,
  buildBars,
  buildDecisions,
  buildLastSeason,
  buildHome,
  buildInjury,
  buildTraining,
} from './from-player.js';
import {
  buildClub,
  buildQueue,
  buildSquad,
  buildTodayMatch,
  findTodayFixture,
  type BandMatchCtx,
} from './from-world.js';
import type {
  BandClub,
  BandMatch,
  BandMate,
  BandQueue,
  BandSeasonSummary,
  BandState,
  BandTime,
} from './types.js';

/** Os dois handles + a seed do mundo. A seed vem de `ApiDeps` (env `WORLD_SEED`), NUNCA do request. */
export interface BandDeps {
  readonly db: Db;
  readonly worldDb: WorldDb;
  readonly worldSeed: string;
}

const EMPTY_SQUAD: readonly BandMate[] = [];

interface ClubClocks {
  readonly tickDay: number;
  readonly calendarDay: number;
  /** A rodada que a faixa MOSTRA (espaço tickDay) já liquidou? Gateia a busca do PLACAR do
   *  `todayMatch` — distinto de `serverTime.roundSettled` (a rodada de HOJE, espaço slot.dayIndex). */
  readonly settled: boolean;
}

interface WorldSlice {
  readonly club: BandClub | null;
  readonly squad: readonly BandMate[];
  readonly queue: BandQueue | null;
}

export async function readBandState(
  deps: BandDeps,
  athleteId: string,
  epochMs: number,
): Promise<BandState> {
  const slot = resolveSlot(epochMs);
  const tickDay = dueDayIndex(epochMs);
  const [identity, progress, wallet, mood, injuryState, pendingRows, occupation, tickCursor] =
    await Promise.all([
      readAthleteIdentity(deps.db, athleteId),
      readAthleteProgress(deps.db, athleteId),
      readWallet(deps.db, athleteId),
      readMood(deps.db, athleteId),
      readInjuryState(deps.db, athleteId, tickDay),
      readPendingDecisions(deps.db, athleteId, tickDay),
      readOccupation(deps.worldDb, deps.worldSeed, athleteId),
      readTickCursor(deps.worldDb, deps.worldSeed),
    ]);
  if (!identity || !progress || !wallet || !mood) {
    // A sessão VOUCHERou um atleta ativo; ausência aqui = corrida com o regen. Inconsistência
    // honesta → 500 (o gate "nunca 500" é dos casos de MUNDO ausente, não deste).
    throw new Error('band: estado do atleta ativo ausente');
  }
  // DOIS gates do cursor, de propósito: `serverTime.roundSettled` = a rodada de HOJE (dia-calendário)
  // liquidou; `clocks.settled` = a rodada que a faixa MOSTRA (espaço tickDay) liquidou. De manhã
  // (hora<15) divergem: hoje ainda não jogou, mas a rodada de ONTEM (=tickDay) já tem placar — e é
  // ela que o `todayMatch` mostra, então o placar gateia no SEGUNDO (senão o jogo de ontem sumiria).
  const cursor = tickCursor ?? -1;
  const world = await resolveWorldSlice(
    deps,
    occupation,
    athleteId,
    { tickDay, calendarDay: slot.dayIndex, settled: cursor >= tickDay },
    progress.attributes, // os focos vivos → a ponderação/nota da partida (SPEC-046)
  );
  const age = ageOfMe(world.squad);
  const canRegen = canRegenOf(world.club, age);
  const decisions = buildDecisions(pendingRows);
  // A campanha fechada é da CONTA (SPEC-053): depois do regen o atleta ativo é outro, e é a
  // temporada do atleta ANTERIOR que o card quer contar. Fora do Promise.all porque o `accountId`
  // só existe depois da identidade.
  const lastSeason = await readLastSeason(deps.db, identity.accountId);
  return {
    contractVersion: 'v1',
    serverTime: buildTime(slot, epochMs, cursor >= slot.dayIndex),
    phase: dayPhase(slot.hour),
    athlete: buildAthlete(athleteId, identity, progress, injuryState.available, age, canRegen),
    bars: buildBars(mood),
    training: buildTraining(progress),
    home: buildHome(wallet),
    injury: buildInjury(injuryState, tickDay),
    club: world.club,
    squad: world.squad,
    // A contagem = o tamanho da lista (mantida aditivo-only p/ o cliente antigo). Ambas do mesmo dia.
    pendingDecisions: decisions.length,
    decisions,
    queue: world.queue,
    // Aditivo-only: a chave só APARECE quando existe (nunca `null` fingido — regra da SPEC-038).
    ...(lastSeason ? { lastSeason } : {}),
  };
}

/** A campanha fechada mais recente da CONTA (SPEC-053). Duas leituras porque o card mostra tanto a
 *  temporada quanto o contador de carreira, e ambos atravessam o regen — em PARALELO, porque estão
 *  no caminho de cada poll da faixa e não dependem uma da outra. */
async function readLastSeason(db: Db, accountId: string): Promise<BandSeasonSummary | undefined> {
  const [row, careerSeasons] = await Promise.all([
    readLastClosedSeason(db, accountId),
    countCareerSeasons(db, accountId),
  ]);
  return buildLastSeason(row, careerSeasons);
}

/** A DICA de regen (SPEC-045): tem vaga no mundo E a idade (relógio de carreira) atingiu o mínimo
 *  voluntário. É só render; a autoridade é o `requestRegen` (409 `regen_ineligible`). */
function canRegenOf(club: BandClub | null, age: number | null): boolean {
  return club !== null && age !== null && age >= REGEN_AGE.voluntary;
}

/** Resolve o lado MUNDO. Com ocupação: carimba presença (best-effort; markActive é UPDATE
 *  incondicional, o throttle de 1×/dia por dia-calendário vive aqui) e lê o clube. Sem ocupação: a
 *  fila. ⚠️ o throttle usa `calendarDay` (slot.dayIndex), NÃO tickDay — antes das 15h tickDay é ONTEM
 *  e congelaria quem abriu a faixa de manhã. */
async function resolveWorldSlice(
  deps: BandDeps,
  occupation: OccupationView | null,
  athleteId: string,
  clocks: ClubClocks,
  focos: RatingFocos,
): Promise<WorldSlice> {
  if (!occupation) {
    return { club: null, squad: EMPTY_SQUAD, queue: await readQueueSlice(deps, athleteId) };
  }
  if (occupation.lastActiveDay !== clocks.calendarDay) {
    await markPresence(deps, athleteId, clocks.calendarDay);
  }
  return readClubWorld(deps, occupation, athleteId, clocks, focos);
}

function buildTime(slot: RoundSlot, epochMs: number, settled: boolean): BandTime {
  return {
    epochMs,
    dayIndex: slot.dayIndex,
    brtHour: slot.hour,
    brtMinute: slot.minute,
    roundSettled: settled,
  };
}

function ageOfMe(squad: readonly BandMate[]): number | null {
  return squad.find((m) => m.isMe)?.age ?? null;
}

/** markActive é UPDATE incondicional sem throttle interno — o throttle (1×/dia) vive AQUI. */
async function markPresence(deps: BandDeps, athleteId: string, calendarDay: number): Promise<void> {
  try {
    await markActive(deps.worldDb, deps.worldSeed, athleteId, calendarDay);
  } catch {
    // best-effort: um relógio de vacância que falha NÃO devolve 500 na faixa (OP-11, sem detalhe).
    console.warn('band: markActive best-effort falhou');
  }
}

async function readQueueSlice(deps: BandDeps, athleteId: string): Promise<BandQueue | null> {
  const entries = await readQueue(deps.worldDb, deps.worldSeed);
  return buildQueue(entries, athleteId);
}

/** A onda 2: o clube do humano (brief + elenco + temporada), o adversário do dia e o relógio de vaga.
 *  `brief` null (mundo ausente/inconsistente) ⇒ `club: null` mas o elenco lido segue (vazio). */
async function readClubWorld(
  deps: BandDeps,
  occupation: OccupationView,
  athleteId: string,
  clocks: ClubClocks,
  focos: RatingFocos,
): Promise<WorldSlice> {
  const [brief, squadRows, startDayIndex] = await Promise.all([
    readClubBrief(deps.worldDb, deps.worldSeed, occupation.clubId),
    readClubSquad(deps.worldDb, deps.worldSeed, occupation.clubId),
    readSeasonAnchor(deps.worldDb, deps.worldSeed, occupation.seasonId),
  ]);
  const squad = buildSquad(squadRows, occupation.athleteId);
  if (!brief) return { club: null, squad, queue: null };
  const leagueClubIds = await readLeagueClubIds(deps.worldDb, deps.worldSeed, brief.leagueId);
  const round = seasonRound(startDayIndex, clocks.tickDay, leagueClubIds.length);
  // As respostas persistidas da rodada MOSTRADA (SPEC-050) — anotam a oferta (`chosenOptionId`/
  // `result`). Só quando liquidada (o mesmo gate da oferta/placar). `athleteId` = id do PLAYER.
  const answers =
    round !== null && clocks.settled
      ? await readAnswersMap(deps.db, athleteId, occupation.seasonId, round)
      : undefined;
  // O contexto do humano p/ orientar a partida (SPEC-046): id do mundo + focos vivos + seed/liga/
  // temporada + o mapa de nomes do MEU elenco (nomear autor/assistente dos meus gols).
  const ctx: BandMatchCtx = {
    meWorldId: occupation.athleteId,
    position: occupation.position as Position,
    focos,
    seed: deps.worldSeed,
    leagueId: brief.leagueId,
    seasonId: occupation.seasonId,
    nameByWorldId: new Map(squadRows.map((r) => [r.athleteId, r.name])),
    ...(answers !== undefined ? { answers } : {}),
  };
  const todayMatch =
    round === null
      ? null
      : await readTodayMatch(deps, occupation, leagueClubIds, round, clocks.settled, ctx);
  const revert = daysUntilRevert(
    occupation.frozenSinceDay,
    clocks.calendarDay,
    VACANCY.revertAfterDays,
  );
  const club = buildClub({ occupation, brief, round, daysUntilRevert: revert, todayMatch });
  return { club, squad, queue: null };
}

/** O jogo do dia: o fixture (puro) dá o adversário; PÓS-JOGO a rodada publicada dá o placar + a
 *  timeline com autor/assistência/nota (SPEC-046, via o `ctx`). */
async function readTodayMatch(
  deps: BandDeps,
  occupation: OccupationView,
  leagueClubIds: readonly string[],
  round: number,
  settled: boolean,
  ctx: BandMatchCtx,
): Promise<BandMatch | null> {
  const fixture = findTodayFixture(occupation.clubId, round, leagueClubIds);
  if (!fixture) return null;
  const [oppBrief, roundResult] = await Promise.all([
    readClubBrief(deps.worldDb, deps.worldSeed, fixture.opponentClubId),
    settled
      ? readRound(deps.worldDb, ctx.leagueId, occupation.seasonId, round)
      : Promise.resolve(null),
  ]);
  return buildTodayMatch(
    occupation.clubId,
    fixture,
    roundResult,
    oppBrief?.name ?? fixture.opponentClubId,
    ctx,
  );
}

/** As respostas da rodada mostrada, por `templateId` (SPEC-050) — best-effort do lado player. O
 *  `effect` gravado viaja junto para a SPEC-051 derivar o `moralDelta` do desfecho. */
async function readAnswersMap(
  db: Db,
  athleteId: string,
  seasonId: string,
  round: number,
): Promise<
  ReadonlyMap<
    string,
    {
      readonly chosenOption: string;
      readonly result: string;
      readonly effect?: Readonly<Record<string, number | string>>;
    }
  >
> {
  const rows = await readMatchChoices(db, athleteId, seasonId, round);
  return new Map(
    rows.map((r) => [
      r.templateId,
      { chosenOption: r.chosenOption, result: r.result, effect: r.effect },
    ]),
  );
}

/** A rodada-alvo do dia; `null` fora de temporada (antes do dia 1 OU depois da última rodada). O
 *  total de rodadas é derivado do tamanho REAL da liga (a Pirâmide Elástica alarga além de 20). */
function seasonRound(
  startDayIndex: number | null,
  tickDay: number,
  leagueSize: number,
): number | null {
  if (startDayIndex === null || leagueSize < 2) return null;
  const round = targetRoundFor(tickDay, startDayIndex);
  const totalRounds = 2 * (leagueSize - 1);
  return round >= 1 && round <= totalRounds ? round : null;
}
