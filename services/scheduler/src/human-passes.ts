// Os passes POR-HUMANO do tick (SPEC-030…041), extraídos do `daily-tick.ts` (OP-16). Cada humano é
// ISOLADO (`safeHumanPasses`): um erro num passe NÃO aborta o tick (log genérico OP-11; o retry
// recupera). A ordem segue o Dia do Jogador; o accrue SÓ roda com rodada PUBLICADA (`paid`).
import {
  choiceContextFrom,
  conservativeChoiceOption,
  dueDayIndex,
  matchChoices,
} from '@camisa-9/world-engine';
import {
  accrueRound,
  advanceRecovery,
  applyDailyMood,
  applyTraining,
  generateForDay,
  injureFromMatch,
  readInjuryState,
  resolveConservative,
  resolveDeadline,
  type Db as PlayerDb,
} from '@camisa-9/player-store';
import type { OccupationView } from '@camisa-9/world-store';
import type { MatchResult } from '@camisa-9/player';
import type { YesterdayMatch } from './round-outcomes.js';

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
  yesterday: YesterdayMatch | undefined,
): Promise<HumanDelta> {
  try {
    return await runHumanPasses(
      playerDb,
      seed,
      occ,
      day,
      prize,
      injurySeverity,
      paid,
      tier,
      yesterday,
    );
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
  yesterday: YesterdayMatch | undefined,
): Promise<HumanDelta> {
  const id = occ.humanAthleteId;
  const pay = paid ? await accrueRound(playerDb, id, day, prize) : undefined;
  const hurt =
    injurySeverity !== undefined ? await tryInjure(playerDb, id, day, injurySeverity) : false;
  await applyDailyMood(playerDb, id, day);
  await tryTrain(playerDb, id, day); // treino idle: o técnico treina o mais baixo, 1×/dia (SPEC-041)
  await resolveDeadline(playerDb, id, day - 1);
  await tryResolveChoices(playerDb, seed, occ, day, yesterday); // escolhas de ONTEM → conservadora (SPEC-050)
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

/**
 * O TIMEOUT das escolhas de partida (SPEC-050): resolve as de ONTEM com a CONSERVADORA ("resolve
 * ONTEM, gera HOJE" — molde `resolveDeadline`). Recomputa a oferta (fn pura) da partida publicada
 * de day−1 e insere via `resolveConservative` — o conflito da PK é BENIGNO por template ({inserted:
 * false} → continua): a corrida responder×resolver se decide no INSERT, e um template já respondido
 * NUNCA impede a conservadora dos demais. Sem punição por catálogo (toda conservadora tem moral ≥ 0);
 * o focusBias NÃO aplica (resolvedBy='agent' — viés de treino é agência do jogador, gate no repo).
 *
 * Gate de ENTRADA (lição SPEC-034): compara no espaço "que rodada já tinha VENCIDO quando entrou"
 * (`dueDayIndex(occupiedAt)`), não em dia-calendário — a admissão acontece às ~15h de day−1, DEPOIS
 * da rodada publicada, e um `resolveSlot` de dia-calendário não distingue antes/depois das 15h (o
 * off-by-one pego na revisão): se a rodada de day−1 já tinha vencido na entrada, o humano NÃO a
 * jogou → pula (senão herdaria escolhas-fantasma + moral de uma partida do NPC).
 * ISOLADO (molde tryInjure): um erro aqui não starva os demais passes do humano.
 */
async function tryResolveChoices(
  playerDb: PlayerDb,
  seed: string,
  occ: OccupationView,
  day: number,
  yesterday: YesterdayMatch | undefined,
): Promise<void> {
  if (yesterday === undefined) return; // sem partida publicada ontem (sem fixture/gênese) → nada
  try {
    if (dueDayIndex(occ.occupiedAt.getTime()) >= day - 1) return; // a rodada de ontem já tinha vencido na entrada → não a jogou
    const ctx = choiceContextFrom(yesterday.match, occ.clubId, occ.athleteId);
    const offer = matchChoices(
      seed,
      yesterday.leagueId,
      yesterday.seasonId,
      yesterday.round,
      yesterday.match.homeId,
      yesterday.match.awayId,
      occ.athleteId,
      ctx,
    );
    for (const c of offer) {
      const opt = conservativeChoiceOption(c.templateId);
      if (!opt) continue;
      await resolveConservative(playerDb, occ.humanAthleteId, {
        seasonId: yesterday.seasonId,
        round: yesterday.round,
        templateId: c.templateId,
        chosenOption: opt.id,
        result: 'na',
        effect: opt.effect,
        day: day - 1, // o day-index da PARTIDA (semântica da SPEC-050)
        resolvedBy: 'agent',
      });
    }
  } catch {
    console.error(`tick: resolver de escolhas adiado (day=${day}) — choice_resolve_failed`); // OP-11
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
