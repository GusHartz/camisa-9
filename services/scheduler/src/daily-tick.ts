// O TICK diário (SPEC-030 + catch-up SPEC-032) — a orquestração. Dado um `epochMs` INJETADO
// (o relógio vive só no `main.ts`), dirige, de forma IDEMPOTENTE, todos os passes do mundo/dos
// humanos. CATCH-UP: em vez de um dia só, processa o intervalo `[from..to]` — `to` = o dia vencido
// (dueDayIndex), `from` = `min(cursor + 1, to)` — replayando qualquer dia perdido (downtime) E
// sempre re-processando o dia corrente (idempotente). O cursor (tick_progress) avança só no settle
// da RODADA DO MUNDO → o mundo nunca trava por um humano quebrado; um dia deferido PARA o loop
// (retenta). Reusa os repos existentes (engine/goldens intocados); isolamento por-humano.
import { dueDayIndex } from '@camisa-9/world-engine';
import {
  advanceTickCursor,
  readSeasonAnchor,
  readTickCursor,
  readWorld,
  readWorldOccupations,
  runRoundForDay,
  runVacancyPass,
  type Db as WorldDb,
  type DailyRoundStatus,
  type OccupationView,
  type VacancyReport,
  type WorldModulator,
} from '@camisa-9/world-store';
import { deleteExpiredSessions, type Db as PlayerDb } from '@camisa-9/player-store';
import { moodModulator, runAdmissionPass } from '@camisa-9/world-entry';
import { runRegenPass } from '@camisa-9/regen';
import { runTransferPass } from '@camisa-9/transfer';
import { runSeasonClosePass } from '@camisa-9/season-summary';
import type { WorldState } from '@camisa-9/world-engine';
import {
  EMPTY_OUTCOMES,
  roundOutcomes,
  yesterdayMatches,
  type YesterdayMatch,
} from './round-outcomes.js';
import { safeHumanPasses } from './human-passes.js';

export interface DailyTickReport {
  /** O último dia processado (ou o dia vencido, se nada foi processado). */
  readonly dayIndex: number;
  /** O status da rodada do ÚLTIMO dia processado. */
  readonly roundStatus: DailyRoundStatus;
  /** Quantos dias foram LIQUIDADOS neste tick (0 = no-op; >1 = catch-up de dias perdidos). */
  readonly daysProcessed: number;
  /** Ocupações humanas no último dia processado. */
  readonly humans: number;
  /** Quantos foram PAGOS de fato nesta passada (0 num re-run = idempotência provada). */
  readonly accrued: number;
  /** Decisões PRESENTES nos dias processados (observabilidade; idempotente-estável). */
  readonly decisions: number;
  readonly recovered: number;
  /** Humanos que se LESIONARAM nas partidas deste tick (SPEC-031; 0 num re-run). */
  readonly injured: number;
  readonly regenerated: number;
  /** Humanos TRANSFERIDOS de clube nesta passada (SPEC-033; só na viragem). */
  readonly transferred: number;
  /** Humanos ADMITIDOS da waiting-list nesta passada (SPEC-034; diário). */
  readonly admitted: number;
  /** Campanhas de temporada FECHADAS nesta passada (SPEC-053; diário, idempotente). */
  readonly seasonsClosed: number;
  readonly vacancy: VacancyReport;
}

/** O tick do dia (15h Brasília) com CATCH-UP. `epochMs` é INJETADO (sem relógio aqui). */
export async function runDailyTick(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  epochMs: number,
): Promise<DailyTickReport> {
  await purgeSessions(playerDb, epochMs);
  const to = dueDayIndex(epochMs);
  const world = await readWorld(worldDb, seed);
  if (!world) return emptyTick(to, 'sem_mundo');
  const seasonStart = await readSeasonAnchor(worldDb, seed, world.seasonId);
  if (seasonStart === null) return emptyTick(to, 'sem_ancora');
  if (to < seasonStart) return emptyTick(to, 'fora_de_janela'); // nada venceu ainda
  const cursor = await readTickCursor(worldDb, seed);
  // 1º tick (cursor nulo): faz backfill da temporada CORRENTE desde a rodada 1 (`seasonStart − 1`),
  // não só o dia de hoje — senão uma âncora no passado (um deploy que atrasa) pularia rodadas em
  // SILÊNCIO (buraco na linha do tempo, viola uptime 100%). Bounded à temporada corrente (≤38 dias;
  // a viragem re-ancora, então nunca replaya a pré-história).
  const from = Math.min((cursor ?? seasonStart - 1) + 1, to);
  const modulate = moodModulator(worldDb, playerDb, seed);
  return runCatchUp(worldDb, playerDb, seed, from, to, modulate);
}

/**
 * Purga as sessões vencidas (SPEC-037). Roda **UMA vez por tick**, e o POSICIONAMENTO é a decisão:
 * **antes dos três early-returns** (`sem_mundo`/`sem_ancora`/`fora_de_janela`) — senão o dia 1 de
 * produção, que retorna `sem_ancora`, nunca purgaria — e **fora do `runCatchUp`**, que é um LOOP e
 * purgaria N vezes.
 *
 * ⚠️ ISOLADA (molde do `tryInjure`, SPEC-031): uma concern de AUTH não pode, em hipótese nenhuma,
 * derrubar a rodada das 15h. Se o player-db falhar aqui, o mundo joga do mesmo jeito.
 */
export async function purgeSessions(playerDb: PlayerDb, epochMs: number): Promise<void> {
  try {
    await deleteExpiredSessions(playerDb, epochMs);
  } catch (err) {
    // OP-11: genérico, sem SQL/stack.
    console.error('tick: purga de sessões falhou —', err instanceof Error ? err.message : 'erro');
  }
}

interface TickTotals {
  humans: number;
  accrued: number;
  decisions: number;
  recovered: number;
  injured: number;
  regenerated: number;
  transferred: number;
  admitted: number;
  seasonsClosed: number;
  frozen: number;
  reverted: number;
}

/** Processa `[from..to]` em ordem; para no primeiro dia NÃO liquidado (deferido → retenta). */
async function runCatchUp(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  from: number,
  to: number,
  modulate: WorldModulator,
): Promise<DailyTickReport> {
  const totals: TickTotals = zeroTotals();
  let lastStatus: DailyRoundStatus = 'fora_de_janela';
  let daysProcessed = 0;
  let lastDay = to;
  for (let day = from; day <= to; day += 1) {
    const out = await processDay(worldDb, playerDb, seed, day, modulate);
    lastStatus = out.status;
    lastDay = day;
    if (!out.settled) break; // deferido/locked → não avança o cursor; retenta no próximo tick
    addDay(totals, out);
    daysProcessed += 1;
    await advanceTickCursor(worldDb, seed, day);
  }
  return {
    dayIndex: lastDay,
    roundStatus: lastStatus,
    daysProcessed,
    humans: totals.humans,
    accrued: totals.accrued,
    decisions: totals.decisions,
    recovered: totals.recovered,
    injured: totals.injured,
    regenerated: totals.regenerated,
    transferred: totals.transferred,
    admitted: totals.admitted,
    seasonsClosed: totals.seasonsClosed,
    vacancy: { frozen: totals.frozen, reverted: totals.reverted },
  };
}

interface DayOutcome extends TickTotals {
  readonly settled: boolean;
  readonly status: DailyRoundStatus;
}

/**
 * Os passes de nível-MUNDO de um dia liquidado (extraídos do `processDay` por OP-15).
 *
 * Regen e transferência rodam na JANELA DE GÊNESE (a viragem OU o reprocesso `before_season`
 * dela), NÃO num dia publicado: o `reassignSlot` muta o snapshot congelado e a guarda de gênese o
 * barra depois da 1ª rodada. Incluir `before_season` AUTO-CURA o órfão: se a viragem committou mas
 * o pass falhou e o cursor travou, o retry reprocessa o dia como `before_season` → o regen re-roda.
 * A transferência vem DEPOIS do regen (um ≥42 regenera em vez de transferir, e o regen troca o
 * humano da vaga, então a flag não sobreviveria).
 *
 * O FECHO DE TEMPORADA (SPEC-053) é o único que roda em TODO dia liquidado: a janela de gênese
 * dura um dia só, então um fecho perdido lá dentro nunca mais teria retry e a campanha ficaria sem
 * card para sempre. É idempotente (`closed_at IS NULL`) e no-op quando não há temporada virada.
 */
async function runWorldPasses(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  day: number,
  status: DailyRoundStatus,
): Promise<{
  regenerated: number;
  transferred: number;
  frozen: number;
  reverted: number;
  seasonsClosed: number;
}> {
  const inGenesisWindow = status === 'season_rolled' || status === 'before_season';
  const regenerated = inGenesisWindow ? await runRegenPass(worldDb, playerDb, seed) : 0;
  const transferred = inGenesisWindow ? await runTransferPass(worldDb, playerDb, seed) : 0;
  const vacancy = await runVacancyPass(worldDb, seed, day);
  const seasons = await runSeasonClosePass(worldDb, playerDb, seed);
  return {
    regenerated,
    transferred,
    frozen: vacancy.frozen,
    reverted: vacancy.reverted,
    seasonsClosed: seasons.closed,
  };
}

/** Um dia do mundo: publica a rodada (ou vira/pula), roda os passes de mundo, e os por-humano.
 *  `settled` = a rodada do mundo liquidou (o cursor pode avançar). */
async function processDay(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  day: number,
  modulate: WorldModulator,
): Promise<DayOutcome> {
  const round = await runRoundForDay(worldDb, seed, day, modulate);
  if (!isSettled(round.status)) return { ...zeroTotals(), settled: false, status: round.status };
  const world0 = await runWorldPasses(worldDb, playerDb, seed, day, round.status);
  const occupations = await readWorldOccupations(worldDb, seed);
  const world = await readWorld(worldDb, seed); // p/ o `tier` do clube de cada humano (seam da proposta)
  const clubTier = world ? buildClubTierMap(world) : new Map<string, number>();
  const paid = round.status === 'published' || round.status === 'idempotent';
  const outcomes =
    paid && round.seasonId !== null && round.targetRound !== null
      ? await roundOutcomes(worldDb, seed, round.seasonId, round.targetRound, occupations)
      : EMPTY_OUTCOMES;
  const yesterday = await yesterdayFor(worldDb, seed, round, paid, occupations);
  const totals = zeroTotals();
  totals.humans = occupations.length;
  totals.regenerated = world0.regenerated;
  totals.transferred = world0.transferred;
  totals.frozen = world0.frozen;
  totals.reverted = world0.reverted;
  totals.seasonsClosed = world0.seasonsClosed;
  for (const occ of occupations) {
    const d = await safeHumanPasses(
      playerDb,
      seed,
      occ,
      day,
      outcomes.prizes.get(occ.athleteId),
      outcomes.injuries.get(occ.athleteId),
      paid,
      clubTier.get(occ.clubId),
      yesterday.get(occ.athleteId),
      outcomes.matches.get(occ.athleteId), // a partida de HOJE (SPEC-053)
    );
    totals.accrued += d.accrued;
    totals.decisions += d.decisions;
    totals.recovered += d.recovered;
    totals.injured += d.injured;
  }
  // Admissão da waiting-list (SPEC-034): DIÁRIA, no FIM do dia — DEPOIS dos passes (revisão MINOR).
  // Se rodasse antes, o admitido HOJE herdaria o resultado/LESÃO da rodada já publicada do NPC que
  // substituiu (uma partida que ele não jogou). No fim, ele entra e começa a ser processado AMANHÃ.
  // O vacancy já rodou → as vagas revertidas HOJE já contam e são herdadas pelo próximo da fila.
  totals.admitted = await runAdmissionPass(worldDb, playerDb, seed);
  return { ...totals, settled: true, status: round.status };
}

/** As partidas de ONTEM (SPEC-050) — o insumo do resolver de escolhas (timeout → conservadora),
 *  pré-computado AQUI (o passe por-humano não abre leituras próprias do mundo). Gates: dia normal
 *  (`paid`) com rodada > 1 na MESMA temporada — na janela de gênese a liga antiga não é derivável
 *  da ocupação atual (as escolhas do último dia da temporada expiram: limitação documentada). */
async function yesterdayFor(
  worldDb: WorldDb,
  seed: string,
  round: { seasonId: string | null; targetRound: number | null },
  paid: boolean,
  occupations: readonly OccupationView[],
): Promise<ReadonlyMap<string, YesterdayMatch>> {
  if (!paid || round.seasonId === null || round.targetRound === null || round.targetRound <= 1) {
    return new Map<string, YesterdayMatch>();
  }
  return yesterdayMatches(worldDb, seed, round.seasonId, round.targetRound - 1, occupations);
}

/** clubId → tier (a divisão do clube), de `readWorld` — o seam do MUNDO p/ a proposta (SPEC-033). */
function buildClubTierMap(world: WorldState): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of world.tiers) {
    for (const l of t.leagues) {
      for (const c of l.clubs) map.set(c.id, t.tier);
    }
  }
  return map;
}

/** A rodada do mundo LIQUIDOU (o cursor pode avançar)? Deferido/locked/erro NÃO liquidam. */
function isSettled(status: DailyRoundStatus): boolean {
  return (
    status === 'published' ||
    status === 'idempotent' ||
    status === 'season_rolled' ||
    status === 'before_season'
  );
}

function zeroTotals(): TickTotals {
  return {
    humans: 0,
    accrued: 0,
    decisions: 0,
    recovered: 0,
    injured: 0,
    regenerated: 0,
    transferred: 0,
    admitted: 0,
    seasonsClosed: 0,
    frozen: 0,
    reverted: 0,
  };
}

function addDay(totals: TickTotals, out: DayOutcome): void {
  totals.humans = out.humans; // o roster do ÚLTIMO dia processado (não soma)
  totals.accrued += out.accrued;
  totals.decisions += out.decisions;
  totals.recovered += out.recovered;
  totals.injured += out.injured;
  totals.regenerated += out.regenerated;
  totals.transferred += out.transferred;
  totals.admitted += out.admitted;
  totals.seasonsClosed += out.seasonsClosed;
  totals.frozen += out.frozen;
  totals.reverted += out.reverted;
}

function emptyTick(dayIndex: number, status: DailyRoundStatus): DailyTickReport {
  return {
    dayIndex,
    roundStatus: status,
    daysProcessed: 0,
    humans: 0,
    accrued: 0,
    decisions: 0,
    recovered: 0,
    injured: 0,
    regenerated: 0,
    transferred: 0,
    admitted: 0,
    seasonsClosed: 0,
    vacancy: { frozen: 0, reverted: 0 },
  };
}
