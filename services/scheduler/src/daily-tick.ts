// O TICK diário (SPEC-030) — a orquestração. Dado um `epochMs` INJETADO (o relógio vive só no
// `main.ts`), dirige, de forma IDEMPOTENTE, todos os passes do mundo/dos humanos numa passada:
// runDailyRound (+moodModulator) → regen (na virada) + vacancy → por ocupação humana: accrue
// (salário+prêmio, idempotente) · mood (decay, idempotente) · resolve ONTEM · gera HOJE · recupera.
// Reusa os repos existentes (engine/goldens intocados); isolamento por-humano (um erro não aborta).
import type { MatchResult as MatchRecord, RoundResult, WorldState } from '@camisa-9/world-engine';
import {
  readRound,
  readWorld,
  readWorldOccupations,
  runDailyRound,
  runVacancyPass,
  type Db as WorldDb,
  type DailyRoundStatus,
  type OccupationView,
  type VacancyReport,
} from '@camisa-9/world-store';
import {
  accrueRound,
  advanceRecovery,
  applyDailyMood,
  generateForDay,
  injureFromMatch,
  readInjuryState,
  resolveDeadline,
  type Db as PlayerDb,
} from '@camisa-9/player-store';
import type { MatchResult } from '@camisa-9/player';
import { moodModulator } from '@camisa-9/world-entry';
import { runRegenPass } from '@camisa-9/regen';

export interface DailyTickReport {
  readonly dayIndex: number;
  readonly roundStatus: DailyRoundStatus;
  readonly humans: number;
  /** Quantos foram PAGOS de fato nesta passada (0 num re-run = idempotência provada). */
  readonly accrued: number;
  /** Decisões PRESENTES no dia (observabilidade; idempotente-estável — NÃO zera num re-run, ao
   *  contrário de `accrued`, pois `generateForDay` devolve as existentes). */
  readonly decisions: number;
  readonly recovered: number;
  /** Humanos que se LESIONARAM na partida deste tick (SPEC-031; idempotência-aware: 0 num re-run). */
  readonly injured: number;
  readonly regenerated: number;
  readonly vacancy: VacancyReport;
}

/** O tick do dia (15h Brasília). `epochMs` é INJETADO (sem relógio aqui). Idempotente ponta a ponta. */
export async function runDailyTick(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  epochMs: number,
): Promise<DailyTickReport> {
  const report = await runDailyRound(
    worldDb,
    seed,
    epochMs,
    moodModulator(worldDb, playerDb, seed),
  );
  if (report.status === 'fora_de_janela' || report.status === 'sem_mundo') return emptyTick(report);
  const day = report.dayIndex;
  const regenerated =
    report.status === 'season_rolled' ? await runRegenPass(worldDb, playerDb, seed) : 0;
  const vacancy = await runVacancyPass(worldDb, seed, day);
  const occupations = await readWorldOccupations(worldDb, seed);
  const paid = report.status === 'published' || report.status === 'idempotent';
  const outcomes =
    paid && report.seasonId !== null && report.targetRound !== null
      ? await roundOutcomes(worldDb, seed, report.seasonId, report.targetRound, occupations)
      : EMPTY_OUTCOMES;
  const totals = { accrued: 0, decisions: 0, recovered: 0, injured: 0 };
  for (const occ of occupations) {
    const d = await safeHumanPasses(
      playerDb,
      seed,
      occ,
      day,
      outcomes.prizes.get(occ.athleteId),
      outcomes.injuries.get(occ.athleteId),
      paid,
    );
    totals.accrued += d.accrued;
    totals.decisions += d.decisions;
    totals.recovered += d.recovered;
    totals.injured += d.injured;
  }
  return {
    dayIndex: day,
    roundStatus: report.status,
    humans: occupations.length,
    ...totals,
    regenerated,
    vacancy,
  };
}

interface HumanDelta {
  readonly accrued: number;
  readonly decisions: number;
  readonly recovered: number;
  readonly injured: number;
}

/** Isola um humano: um erro num passe NÃO aborta o tick (log genérico OP-11; o retry recupera). */
async function safeHumanPasses(
  playerDb: PlayerDb,
  seed: string,
  occ: OccupationView,
  day: number,
  prize: MatchResult | undefined,
  injurySeverity: string | undefined,
  paid: boolean,
): Promise<HumanDelta> {
  try {
    return await runHumanPasses(playerDb, seed, occ, day, prize, injurySeverity, paid);
  } catch {
    console.error(`tick: passe do humano adiado (day=${day}) — human_pass_failed`);
    return { accrued: 0, decisions: 0, recovered: 0, injured: 0 };
  }
}

/** Os passes por-atleta (na ordem do Dia do Jogador). O accrue SÓ roda quando há rodada PUBLICADA
 *  (`paid`); a LESÃO da partida (SPEC-031) é injetada via `injureFromMatch` (idempotente — o retry
 *  não re-lesiona; o guard de 1-ativa/atleta), ANTES dos demais passes → o `injured` do dia já reflete
 *  na geração de decisões. accrue/mood idempotentes por dia (ledger); resolve ONTEM, gera HOJE, recupera. */
async function runHumanPasses(
  playerDb: PlayerDb,
  seed: string,
  occ: OccupationView,
  day: number,
  prize: MatchResult | undefined,
  injurySeverity: string | undefined,
  paid: boolean,
): Promise<HumanDelta> {
  const id = occ.humanAthleteId;
  const pay = paid ? await accrueRound(playerDb, id, day, prize) : undefined;
  const hurt =
    injurySeverity !== undefined ? await tryInjure(playerDb, id, day, injurySeverity) : false;
  await applyDailyMood(playerDb, id, day);
  await resolveDeadline(playerDb, id, day - 1);
  const available = (await readInjuryState(playerDb, id, day)).available;
  const decisions = await generateForDay(playerDb, id, day, seed, { injured: !available });
  const rec = await advanceRecovery(playerDb, id, day);
  return {
    accrued: pay && !pay.idempotent ? 1 : 0,
    decisions: decisions.length,
    recovered: rec.recovered ? 1 : 0,
    injured: hurt ? 1 : 0,
  };
}

/** Injeta a lesão da partida, ISOLADA: um evento corrompido (gravidade inválida) ou uma falha
 *  transitória NÃO pode starvar os demais passes do humano no dia (mood/decisões/recuperação). */
async function tryInjure(
  playerDb: PlayerDb,
  athleteId: string,
  day: number,
  severity: string,
): Promise<boolean> {
  try {
    return (await injureFromMatch(playerDb, athleteId, day, severity)).injured;
  } catch {
    console.error(`tick: lesão de partida ignorada (day=${day}) — injury_event_failed`); // OP-11
    return false;
  }
}

interface RoundOutcomes {
  readonly prizes: Map<string, MatchResult>; // athleteId → win/draw/loss
  readonly injuries: Map<string, string>; // athleteId → gravidade (evento de lesão da partida)
}

const EMPTY_OUTCOMES: RoundOutcomes = { prizes: new Map(), injuries: new Map() };

/** Prêmios (win/draw/loss) E lesões de cada humano, da rodada publicada. Acha o jogo do clube dele,
 *  lê cada liga UMA vez (cache). Mapas por `athleteId` (id do mundo — a chave da ocupação). */
async function roundOutcomes(
  worldDb: WorldDb,
  seed: string,
  seasonId: string,
  round: number,
  occupations: readonly OccupationView[],
): Promise<RoundOutcomes> {
  const prizes = new Map<string, MatchResult>();
  const injuries = new Map<string, string>();
  const world = await readWorld(worldDb, seed);
  if (!world) return { prizes, injuries };
  const clubLeague = buildClubLeagueMap(world);
  const roundByLeague = new Map<string, RoundResult | null>();
  for (const occ of occupations) {
    const leagueId = clubLeague.get(occ.clubId);
    if (leagueId === undefined) continue;
    if (!roundByLeague.has(leagueId)) {
      roundByLeague.set(leagueId, await readRound(worldDb, leagueId, seasonId, round));
    }
    const match = matchOf(roundByLeague.get(leagueId), occ.clubId);
    if (!match) continue;
    prizes.set(occ.athleteId, outcomeOf(match, occ.clubId));
    const sev = injuryFor(match, occ.athleteId);
    if (sev !== undefined) injuries.set(occ.athleteId, sev);
  }
  return { prizes, injuries };
}

/** clubId → leagueId (a liga do clube), de `readWorld`. Puro. */
function buildClubLeagueMap(world: WorldState): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of world.tiers) {
    for (const l of t.leagues) {
      for (const c of l.clubs) map.set(c.id, l.leagueId);
    }
  }
  return map;
}

/** O jogo do clube na rodada (ou undefined se não jogou / rodada ausente). */
function matchOf(round: RoundResult | null | undefined, clubId: string): MatchRecord | undefined {
  return round?.matches.find((m) => m.homeId === clubId || m.awayId === clubId);
}

/** win/draw/loss do clube na partida. Puro. */
function outcomeOf(m: MatchRecord, clubId: string): MatchResult {
  const mine = m.homeId === clubId ? m.homeGoals : m.awayGoals;
  const theirs = m.homeId === clubId ? m.awayGoals : m.homeGoals;
  if (mine > theirs) return 'win';
  if (mine < theirs) return 'loss';
  return 'draw';
}

/** A gravidade do evento de LESÃO do atleta na partida (SPEC-031), ou undefined. */
function injuryFor(m: MatchRecord, athleteId: string): string | undefined {
  return m.events?.find((e) => e.kind === 'injury' && e.athleteId === athleteId)?.severity;
}

function emptyTick(report: { dayIndex: number; status: DailyRoundStatus }): DailyTickReport {
  return {
    dayIndex: report.dayIndex,
    roundStatus: report.status,
    humans: 0,
    accrued: 0,
    decisions: 0,
    recovered: 0,
    injured: 0,
    regenerated: 0,
    vacancy: { frozen: 0, reverted: 0 },
  };
}
