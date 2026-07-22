// Os passes POR-HUMANO do tick (SPEC-030…041), extraídos do `daily-tick.ts` (OP-16). Cada humano é
// ISOLADO (`safeHumanPasses`): um erro num passe NÃO aborta o tick (log genérico OP-11; o retry
// recupera). A ordem segue o Dia do Jogador; o accrue SÓ roda com rodada PUBLICADA (`paid`).
import {
  choiceContextFrom,
  conservativeChoiceOption,
  dueDayIndex,
  matchChoices,
  matchRating,
  type GoalEvent,
} from '@camisa-9/world-engine';
import type { Position } from '@camisa-9/world-engine';
import {
  accrueRound,
  accrueSeasonMatch,
  advanceRecovery,
  applyDailyMood,
  applyTraining,
  generateForDay,
  injureFromMatch,
  readFocosByIds,
  readInjuryState,
  resolveConservative,
  resolveDeadline,
  type Db as PlayerDb,
  type Focos,
  type SeasonMatchInput,
} from '@camisa-9/player-store';
import type { OccupationView } from '@camisa-9/world-store';
import { abilityFromFocos, isPosition, type MatchResult } from '@camisa-9/player';
import type { RoundMatch, YesterdayMatch } from './round-outcomes.js';

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
  today: RoundMatch | undefined,
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
      today,
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
  today: RoundMatch | undefined,
): Promise<HumanDelta> {
  const id = occ.humanAthleteId;
  const pay = paid ? await accrueRound(playerDb, id, day, prize) : undefined;
  // A campanha da temporada (SPEC-053) — logo após o accrue, sob o mesmo gate `paid`, e ANTES do
  // treino: a nota e o overall do dia são os do jogador que ENTROU em campo.
  if (paid && today !== undefined) await trySeasonStats(playerDb, seed, occ, day, today);
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

/**
 * A campanha da temporada (SPEC-053), ISOLADA (molde `tryInjure`): soma a partida do dia à linha
 * de temporada — jogos, gols, assistências, a nota e o **overall de hoje**, que é a linha EVOLUÇÃO
 * do card e o único desses números irrecuperável depois (a viragem sobrescreve o mundo).
 *
 * Gate de ENTRADA (lição SPEC-034/050): se a rodada deste dia JÁ tinha vencido quando o humano
 * ocupou a vaga, quem a jogou foi o NPC — sem o gate, um admitido mid-season herdaria como suas as
 * partidas de antes da entrada. Comparação no espaço `dueDayIndex`, não em dia-calendário.
 */
async function trySeasonStats(
  playerDb: PlayerDb,
  seed: string,
  occ: OccupationView,
  day: number,
  today: RoundMatch,
): Promise<void> {
  if (dueDayIndex(occ.occupiedAt.getTime()) >= day) return;
  if (!isPosition(occ.position)) return; // coluna `text` sem CHECK (lição SPEC-047): sem posição
  try {
    //                                     válida não há nota honesta — melhor não registrar.
    const focos = (await readFocosByIds(playerDb, [occ.humanAthleteId])).get(occ.humanAthleteId);
    if (!focos) return;
    await accrueSeasonMatch(
      playerDb,
      occ.humanAthleteId,
      seasonInputFrom(seed, occ, occ.position, day, today, focos),
    );
  } catch {
    console.error(`tick: campanha da temporada adiada (day=${day}) — season_stats_failed`); // OP-11
  }
}

/** Monta o que a partida do dia acrescenta à campanha. A nota usa os focos de AGORA (o jogador que
 *  entrou em campo) e o overall idem — é o ponto da fatia. Puro. */
function seasonInputFrom(
  seed: string,
  occ: OccupationView,
  position: Position,
  day: number,
  t: RoundMatch,
  focos: Focos,
): SeasonMatchInput {
  const isHome = t.match.homeId === occ.clubId;
  const goalsFor = isHome ? t.match.homeGoals : t.match.awayGoals;
  const goalsAgainst = isHome ? t.match.awayGoals : t.match.homeGoals;
  const goalEvents = (t.match.events ?? []).filter((e): e is GoalEvent => e.kind === 'goal');
  return {
    seasonId: t.seasonId,
    round: t.round,
    day,
    clubId: occ.clubId,
    clubName: t.clubName,
    leagueId: t.leagueId,
    tier: t.tier,
    position,
    goals: goalEvents.filter((e) => e.athleteId === occ.athleteId).length,
    assists: goalEvents.filter((e) => e.assistId === occ.athleteId).length,
    rating: matchRating({
      seed,
      leagueId: t.leagueId,
      seasonId: t.seasonId,
      round: t.round,
      homeId: t.match.homeId,
      awayId: t.match.awayId,
      athleteId: occ.athleteId,
      position,
      goalsScored: goalEvents.filter((e) => e.athleteId === occ.athleteId).length,
      assists: goalEvents.filter((e) => e.assistId === occ.athleteId).length,
      goalsAgainst,
      result: goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw',
      focos,
    }),
    overall: abilityFromFocos(focos, position),
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
