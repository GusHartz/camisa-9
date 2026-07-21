// Os passes POR-HUMANO do tick (SPEC-030…041), extraídos do `daily-tick.ts` (OP-16). Cada humano é
// ISOLADO (`safeHumanPasses`): um erro num passe NÃO aborta o tick (log genérico OP-11; o retry
// recupera). A ordem segue o Dia do Jogador; o accrue SÓ roda com rodada PUBLICADA (`paid`).
import {
  accrueRound,
  advanceRecovery,
  applyDailyMood,
  applyTraining,
  generateForDay,
  injureFromMatch,
  readInjuryState,
  resolveDeadline,
  type Db as PlayerDb,
} from '@camisa-9/player-store';
import type { OccupationView } from '@camisa-9/world-store';
import type { MatchResult } from '@camisa-9/player';

export interface HumanDelta {
  readonly accrued: number;
  readonly decisions: number;
  readonly recovered: number;
  readonly injured: number;
}

/** Isola um humano: um erro num passe NÃO aborta o tick (log genérico OP-11; o retry recupera). */
export async function safeHumanPasses(
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
  await tryTrain(playerDb, id, day); // treino idle: o técnico treina o mais baixo, 1×/dia (SPEC-041)
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

/** Treino idle (SPEC-041): o técnico treina o foco mais baixo, ISOLADO — um erro (race) NÃO pode
 *  starvar os demais passes do humano. Idempotente 1×/dia via o claim `'train'` no ledger (o acúmulo
 *  alcança todo humano, presente ou não; o jogador distribui os pontos via `POST /v1/training/spend`). */
async function tryTrain(playerDb: PlayerDb, athleteId: string, day: number): Promise<void> {
  try {
    await applyTraining(playerDb, athleteId, null, day);
  } catch {
    // best-effort: um dia de treino perdido é tolerável (o jogador só não acumula XP nesse dia).
  }
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
