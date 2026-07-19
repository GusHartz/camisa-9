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
import { runTransferPass } from '@camisa-9/transfer';
import type { WorldState } from '@camisa-9/world-engine';
import { EMPTY_OUTCOMES, roundOutcomes } from './round-outcomes.js';

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
  readonly vacancy: VacancyReport;
}

/** O tick do dia (15h Brasília) com CATCH-UP. `epochMs` é INJETADO (sem relógio aqui). */
export async function runDailyTick(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  epochMs: number,
): Promise<DailyTickReport> {
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

interface TickTotals {
  humans: number;
  accrued: number;
  decisions: number;
  recovered: number;
  injured: number;
  regenerated: number;
  transferred: number;
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
    vacancy: { frozen: totals.frozen, reverted: totals.reverted },
  };
}

interface DayOutcome extends TickTotals {
  readonly settled: boolean;
  readonly status: DailyRoundStatus;
}

/** Um dia do mundo: publica a rodada (ou vira/pula), roda regen+vacancy, e os passes por-humano.
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
  // Regen roda na JANELA DE GÊNESE (a viragem OU o reprocesso `before_season` dela), NÃO num dia
  // publicado: o reassignSlot muta o snapshot congelado e a guarda de gênese o barra depois da 1ª
  // rodada. Incluir `before_season` AUTO-CURA o órfão do MAJOR: se a viragem committou mas o pass
  // falhou (ex.: readRegenEligible cai por reset de conexão) e o cursor travou, o retry reprocessa
  // o dia como before_season (gênese ainda aberta) → o regen re-roda. Só-`season_rolled` órfãva-o.
  const inGenesisWindow = round.status === 'season_rolled' || round.status === 'before_season';
  const regenerated = inGenesisWindow ? await runRegenPass(worldDb, playerDb, seed) : 0;
  // Transferência ACEITA aplica na gênese (SPEC-033), APÓS o regen (um ≥42 regenera, não transfere —
  // o regen troca o humano da vaga, então a flag não sobrevive). Molde do regen: só na gênese.
  const transferred = inGenesisWindow ? await runTransferPass(worldDb, playerDb, seed) : 0;
  const vacancy = await runVacancyPass(worldDb, seed, day);
  const occupations = await readWorldOccupations(worldDb, seed);
  const world = await readWorld(worldDb, seed); // p/ o `tier` do clube de cada humano (seam da proposta)
  const clubTier = world ? buildClubTierMap(world) : new Map<string, number>();
  const paid = round.status === 'published' || round.status === 'idempotent';
  const outcomes =
    paid && round.seasonId !== null && round.targetRound !== null
      ? await roundOutcomes(worldDb, seed, round.seasonId, round.targetRound, occupations)
      : EMPTY_OUTCOMES;
  const totals = zeroTotals();
  totals.humans = occupations.length;
  totals.regenerated = regenerated;
  totals.transferred = transferred;
  totals.frozen = vacancy.frozen;
  totals.reverted = vacancy.reverted;
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
    );
    totals.accrued += d.accrued;
    totals.decisions += d.decisions;
    totals.recovered += d.recovered;
    totals.injured += d.injured;
  }
  return { ...totals, settled: true, status: round.status };
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
  tier: number | undefined,
): Promise<HumanDelta> {
  try {
    return await runHumanPasses(playerDb, seed, occ, day, prize, injurySeverity, paid, tier);
  } catch {
    console.error(`tick: passe do humano adiado (day=${day}) — human_pass_failed`);
    return { accrued: 0, decisions: 0, recovered: 0, injured: 0 };
  }
}

/** Os passes por-atleta (na ordem do Dia do Jogador). O accrue SÓ roda quando há rodada PUBLICADA
 *  (`paid`); a LESÃO da partida (SPEC-031) é injetada via `injureFromMatch` (idempotente), ANTES dos
 *  demais passes → o `injured` do dia já reflete na geração de decisões. accrue/mood idempotentes
 *  por dia (ledger); resolve ONTEM, gera HOJE, recupera. */
async function runHumanPasses(
  playerDb: PlayerDb,
  seed: string,
  occ: OccupationView,
  day: number,
  prize: MatchResult | undefined,
  injurySeverity: string | undefined,
  paid: boolean,
  tier: number | undefined,
): Promise<HumanDelta> {
  const id = occ.humanAthleteId;
  const pay = paid ? await accrueRound(playerDb, id, day, prize) : undefined;
  const hurt =
    injurySeverity !== undefined ? await tryInjure(playerDb, id, day, injurySeverity) : false;
  await applyDailyMood(playerDb, id, day);
  await resolveDeadline(playerDb, id, day - 1);
  const available = (await readInjuryState(playerDb, id, day)).available;
  const decisions = await generateForDay(playerDb, id, day, seed, {
    injured: !available,
    ...(tier !== undefined ? { tier } : {}), // seam do MUNDO p/ a proposta-clube-maior (SPEC-033)
  });
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

function zeroTotals(): TickTotals {
  return {
    humans: 0,
    accrued: 0,
    decisions: 0,
    recovered: 0,
    injured: 0,
    regenerated: 0,
    transferred: 0,
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
    vacancy: { frozen: 0, reverted: 0 },
  };
}
