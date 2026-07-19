// O TICK diário (SPEC-030) — a orquestração. Dado um `epochMs` INJETADO (o relógio vive só no
// `main.ts`), dirige, de forma IDEMPOTENTE, todos os passes do mundo/dos humanos numa passada:
// runDailyRound (+moodModulator) → regen (na virada) + vacancy → por ocupação humana: accrue
// (salário+prêmio, idempotente) · mood (decay, idempotente) · resolve ONTEM · gera HOJE · recupera.
// Reusa os repos existentes (engine/goldens intocados); isolamento por-humano (um erro não aborta).
import type { RoundResult, WorldState } from '@camisa-9/world-engine';
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
  const prizes =
    paid && report.seasonId !== null && report.targetRound !== null
      ? await prizesForRound(worldDb, seed, report.seasonId, report.targetRound, occupations)
      : new Map<string, MatchResult>();
  const totals = { accrued: 0, decisions: 0, recovered: 0 };
  for (const occ of occupations) {
    const d = await safeHumanPasses(playerDb, seed, occ, day, prizes.get(occ.athleteId), paid);
    totals.accrued += d.accrued;
    totals.decisions += d.decisions;
    totals.recovered += d.recovered;
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
}

/** Isola um humano: um erro num passe NÃO aborta o tick (log genérico OP-11; o retry recupera). */
async function safeHumanPasses(
  playerDb: PlayerDb,
  seed: string,
  occ: OccupationView,
  day: number,
  prize: MatchResult | undefined,
  paid: boolean,
): Promise<HumanDelta> {
  try {
    return await runHumanPasses(playerDb, seed, occ, day, prize, paid);
  } catch {
    console.error(`tick: passe do humano adiado (day=${day}) — human_pass_failed`);
    return { accrued: 0, decisions: 0, recovered: 0 };
  }
}

/** Os passes por-atleta (na ordem do Dia do Jogador). O accrue SÓ roda quando há rodada PUBLICADA
 *  (`paid`) — nunca na virada/antes da temporada/num dia deferido/locked (senão o salário sairia sem
 *  jogo, e o prêmio se perderia num deferred-retry pois o dia já estaria reivindicado no ledger).
 *  accrue/mood são idempotentes por dia (ledger); resolve ONTEM (18h), gera HOJE, recupera (retry-safe). */
async function runHumanPasses(
  playerDb: PlayerDb,
  seed: string,
  occ: OccupationView,
  day: number,
  prize: MatchResult | undefined,
  paid: boolean,
): Promise<HumanDelta> {
  const id = occ.humanAthleteId;
  const pay = paid ? await accrueRound(playerDb, id, day, prize) : undefined;
  await applyDailyMood(playerDb, id, day);
  await resolveDeadline(playerDb, id, day - 1);
  const injured = !(await readInjuryState(playerDb, id, day)).available;
  const decisions = await generateForDay(playerDb, id, day, seed, { injured });
  const rec = await advanceRecovery(playerDb, id, day);
  return {
    accrued: pay && !pay.idempotent ? 1 : 0,
    decisions: decisions.length,
    recovered: rec.recovered ? 1 : 0,
  };
}

/** O prêmio de cada humano: acha o jogo do clube dele na rodada publicada → win/draw/loss. Lê cada
 *  liga UMA vez (cache). Mapa por `athleteId` (id do mundo — a chave da ocupação). */
async function prizesForRound(
  worldDb: WorldDb,
  seed: string,
  seasonId: string,
  round: number,
  occupations: readonly OccupationView[],
): Promise<Map<string, MatchResult>> {
  const world = await readWorld(worldDb, seed);
  if (!world) return new Map();
  const clubLeague = buildClubLeagueMap(world);
  const roundByLeague = new Map<string, RoundResult | null>();
  const prizes = new Map<string, MatchResult>();
  for (const occ of occupations) {
    const leagueId = clubLeague.get(occ.clubId);
    if (leagueId === undefined) continue;
    if (!roundByLeague.has(leagueId)) {
      roundByLeague.set(leagueId, await readRound(worldDb, leagueId, seasonId, round));
    }
    const rr = roundByLeague.get(leagueId);
    const outcome = rr ? prizeForClub(rr, occ.clubId) : undefined;
    if (outcome !== undefined) prizes.set(occ.athleteId, outcome);
  }
  return prizes;
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

/** O resultado do clube na rodada (win/draw/loss), ou undefined se ele não jogou. Puro. */
function prizeForClub(round: RoundResult, clubId: string): MatchResult | undefined {
  for (const m of round.matches) {
    if (m.homeId === clubId) return outcomeOf(m.homeGoals, m.awayGoals);
    if (m.awayId === clubId) return outcomeOf(m.awayGoals, m.homeGoals);
  }
  return undefined;
}

function outcomeOf(mine: number, theirs: number): MatchResult {
  if (mine > theirs) return 'win';
  if (mine < theirs) return 'loss';
  return 'draw';
}

function emptyTick(report: { dayIndex: number; status: DailyRoundStatus }): DailyTickReport {
  return {
    dayIndex: report.dayIndex,
    roundStatus: report.status,
    humans: 0,
    accrued: 0,
    decisions: 0,
    recovered: 0,
    regenerated: 0,
    vacancy: { frozen: 0, reverted: 0 },
  };
}
