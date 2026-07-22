// Orquestração da RESPOSTA de uma escolha de partida (SPEC-050). O handler fica fino (OP-15/16);
// aqui: gates temporais → RECOMPUTE da oferta (fn pura — zero confiança no cliente) → roll (opção
// arriscada) → repo (tx: claim + efeitos). IDs, explícito: `matchChoices`/`choiceContextFrom`/
// `resolveChoiceRoll` falam o id do MUNDO (`occupation.athleteId`); `answerMatchChoice`/bumps falam
// o id do PLAYER (da sessão). Erros tipados (`GameplayError.code`), mapeados na borda (OP-11).
import {
  choiceContextFrom,
  dueDayIndex,
  matchChoices,
  resolveChoiceRoll,
  type MatchChoiceOption,
  type MatchResult,
} from '@camisa-9/world-engine';
import {
  GameplayError,
  answerMatchChoice,
  readAthleteProgress,
  readMood,
  type ChoiceEffectData,
  type ChoiceResult,
} from '@camisa-9/player-store';
import {
  readClubBrief,
  readOccupation,
  readRound,
  readSeasonAnchor,
  readTickCursor,
  targetRoundFor,
  type OccupationView,
} from '@camisa-9/world-store';
import type { BandDeps } from '../band/band-state.js';

export interface ChoiceAnswerInput {
  readonly round: number;
  readonly templateId: string;
  readonly optionId: string;
}

interface ShownMatch {
  readonly occupation: OccupationView;
  readonly leagueId: string;
  readonly round: number;
  readonly match: MatchResult;
}

/** A rodada MOSTRADA pela faixa (espaço tickDay, gate `cursor >= tickDay` — SPEC-038) + a partida
 *  publicada do clube do humano. Qualquer pré-condição ausente → `choice_not_available` (409). */
async function resolveShownMatch(
  deps: BandDeps,
  athleteId: string,
  tickDay: number,
  inputRound: number,
): Promise<ShownMatch> {
  const gone = (): GameplayError =>
    new GameplayError('choice_not_available', 'escolha indisponível');
  const [occupation, cursor] = await Promise.all([
    readOccupation(deps.worldDb, deps.worldSeed, athleteId),
    readTickCursor(deps.worldDb, deps.worldSeed),
  ]);
  if (!occupation || (cursor ?? -1) < tickDay) throw gone();
  const [brief, startDayIndex] = await Promise.all([
    readClubBrief(deps.worldDb, deps.worldSeed, occupation.clubId),
    readSeasonAnchor(deps.worldDb, deps.worldSeed, occupation.seasonId),
  ]);
  if (!brief || startDayIndex === null) throw gone();
  const round = targetRoundFor(tickDay, startDayIndex);
  if (inputRound !== round) throw gone();
  const roundResult = await readRound(deps.worldDb, brief.leagueId, occupation.seasonId, round);
  const match = roundResult?.matches.find(
    (m) => m.homeId === occupation.clubId || m.awayId === occupation.clubId,
  );
  if (!match) throw gone();
  return { occupation, leagueId: brief.leagueId, round, match };
}

/** Responde uma escolha da partida mostrada. Recomputa a oferta server-side, valida template+opção,
 *  rola a arriscada (atributo VIVO + moral VIVA) e persiste via a tx do repo (PK = idempotência —
 *  retry/double-click morrem no conflito ANTES de qualquer efeito). */
export async function answerMatchChoiceAction(
  deps: BandDeps,
  athleteId: string,
  input: ChoiceAnswerInput,
  epochMs: number,
): Promise<void> {
  const tickDay = dueDayIndex(epochMs);
  const shown = await resolveShownMatch(deps, athleteId, tickDay, input.round);
  const { occupation, leagueId, round, match } = shown;
  const ctx = choiceContextFrom(match, occupation.clubId, occupation.athleteId);
  const offer = matchChoices(
    deps.worldSeed,
    leagueId,
    occupation.seasonId,
    round,
    match.homeId,
    match.awayId,
    occupation.athleteId,
    ctx,
  );
  const offered = offer.find((c) => c.templateId === input.templateId);
  const option = offered?.options.find((o) => o.id === input.optionId);
  if (!offered || !option) throw new GameplayError('invalid_option', 'opção inválida');
  const { result, effect } = await resolveEffect(
    deps,
    athleteId,
    shown,
    offered.templateId,
    option,
  );
  await answerMatchChoice(deps.db, athleteId, {
    seasonId: occupation.seasonId,
    round,
    templateId: offered.templateId,
    chosenOption: option.id,
    result,
    effect,
    day: tickDay,
    resolvedBy: 'player',
  });
}

/** O desfecho da opção: sem `risky` → determinística (`na`, efeito declarado); com `risky` → roll
 *  ponderado pelo foco VIVO (`risky.attr`) + moral VIVA — sucesso → `effect`, falha → `risky.fail`. */
async function resolveEffect(
  deps: BandDeps,
  athleteId: string,
  shown: ShownMatch,
  templateId: string,
  option: MatchChoiceOption,
): Promise<{ result: ChoiceResult; effect: ChoiceEffectData }> {
  if (!option.risky) return { result: 'na', effect: option.effect };
  const [mood, progress] = await Promise.all([
    readMood(deps.db, athleteId),
    readAthleteProgress(deps.db, athleteId),
  ]);
  // A sessão VOUCHERou um atleta ativo; ausência = corrida com o regen → 500 genérico (rethrow).
  if (!mood || !progress) throw new Error('match-choice: estado do atleta ativo ausente');
  const roll = resolveChoiceRoll({
    seed: deps.worldSeed,
    leagueId: shown.leagueId,
    seasonId: shown.occupation.seasonId,
    round: shown.round,
    homeId: shown.match.homeId,
    awayId: shown.match.awayId,
    athleteId: shown.occupation.athleteId,
    templateId,
    optionId: option.id,
    attr: progress.attributes[option.risky.attr],
    moral: mood.moral,
  });
  return {
    result: roll.success ? 'success' : 'fail',
    effect: roll.success ? option.effect : option.risky.fail,
  };
}
