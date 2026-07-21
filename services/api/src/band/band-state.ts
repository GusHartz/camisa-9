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
import { dueDayIndex, resolveSlot, type RoundSlot } from '@camisa-9/world-engine';
import { dayPhase, daysUntilRevert } from '@camisa-9/player';
import {
  countPendingDecisions,
  readAthleteIdentity,
  readAthleteProgress,
  readInjuryState,
  readMood,
  readWallet,
  type Db,
} from '@camisa-9/player-store';
import {
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
import { buildAthlete, buildBars, buildHome, buildInjury, buildTraining } from './from-player.js';
import {
  buildClub,
  buildQueue,
  buildSquad,
  buildTodayMatch,
  findTodayFixture,
} from './from-world.js';
import type { BandClub, BandMatch, BandMate, BandQueue, BandState, BandTime } from './types.js';

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
  const [identity, progress, wallet, mood, injuryState, pendingDecisions, occupation, tickCursor] =
    await Promise.all([
      readAthleteIdentity(deps.db, athleteId),
      readAthleteProgress(deps.db, athleteId),
      readWallet(deps.db, athleteId),
      readMood(deps.db, athleteId),
      readInjuryState(deps.db, athleteId, tickDay),
      countPendingDecisions(deps.db, athleteId, tickDay),
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
  const world = await resolveWorldSlice(deps, occupation, athleteId, {
    tickDay,
    calendarDay: slot.dayIndex,
    settled: cursor >= tickDay,
  });
  return {
    contractVersion: 'v1',
    serverTime: buildTime(slot, epochMs, cursor >= slot.dayIndex),
    phase: dayPhase(slot.hour),
    athlete: buildAthlete(
      athleteId,
      identity,
      progress,
      injuryState.available,
      ageOfMe(world.squad),
    ),
    bars: buildBars(mood),
    training: buildTraining(progress),
    home: buildHome(wallet),
    injury: buildInjury(injuryState, tickDay),
    club: world.club,
    squad: world.squad,
    pendingDecisions,
    queue: world.queue,
  };
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
): Promise<WorldSlice> {
  if (!occupation) {
    return { club: null, squad: EMPTY_SQUAD, queue: await readQueueSlice(deps, athleteId) };
  }
  if (occupation.lastActiveDay !== clocks.calendarDay) {
    await markPresence(deps, athleteId, clocks.calendarDay);
  }
  return readClubWorld(deps, occupation, clocks);
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
  clocks: ClubClocks,
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
  const todayMatch =
    round === null
      ? null
      : await readTodayMatch(
          deps,
          occupation,
          brief.leagueId,
          leagueClubIds,
          round,
          clocks.settled,
        );
  const revert = daysUntilRevert(
    occupation.frozenSinceDay,
    clocks.calendarDay,
    VACANCY.revertAfterDays,
  );
  const club = buildClub({ occupation, brief, round, daysUntilRevert: revert, todayMatch });
  return { club, squad, queue: null };
}

/** O jogo do dia: o fixture (puro) dá o adversário; PÓS-JOGO a rodada publicada dá o placar. */
async function readTodayMatch(
  deps: BandDeps,
  occupation: OccupationView,
  leagueId: string,
  leagueClubIds: readonly string[],
  round: number,
  settled: boolean,
): Promise<BandMatch | null> {
  const fixture = findTodayFixture(occupation.clubId, round, leagueClubIds);
  if (!fixture) return null;
  const [oppBrief, roundResult] = await Promise.all([
    readClubBrief(deps.worldDb, deps.worldSeed, fixture.opponentClubId),
    settled ? readRound(deps.worldDb, leagueId, occupation.seasonId, round) : Promise.resolve(null),
  ]);
  return buildTodayMatch(
    occupation.clubId,
    fixture,
    roundResult,
    oppBrief?.name ?? fixture.opponentClubId,
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
