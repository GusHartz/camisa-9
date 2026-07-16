// Progressão por treino (SPEC-017, card 13) — a barra de XP → +1 ponto livre (Model A).
// Pura e determinística (sob o guardrail): sem relógio/entropia/transcendentais; a curva é
// INTEIRA/piecewise por zona. O FOCO do dia multiplica a TAXA (seam neutro em v1); o ponto
// é FLUTUANTE — gasto em qualquer foco via `applyPoint` (teto 99), distinto da criação.
import { CREATION_TOTAL, FOCI, PLAYER, TRAINING } from './constants.js';
import type { Attributes, Focus, Result, TrainOpts, TrainResult, TrainState } from './types.js';

/**
 * Pontos já GANHOS na carreira = (soma dos focos − soma de criação) + pontos ainda não gastos.
 * Inclui os não gastos de propósito: assim o limiar NÃO barateia com hoarding (anti-exploit).
 */
export function pointsEarnedTotal(attributes: Attributes, freePoints: number): number {
  let sum = 0;
  for (const f of FOCI) sum += attributes[f];
  return sum - CREATION_TOTAL + freePoints;
}

/**
 * XP necessário p/ o PRÓXIMO ponto, pela curva de 3 zonas (várzea rápida → meio → cauda elite).
 * `pointsEarned` = pontos já ganhos. Inteira/piecewise — nada de exp/pow (guardrail).
 */
export function nextThreshold(pointsEarned: number): number {
  const t = TRAINING;
  if (pointsEarned < t.midStartPoints) return t.zone1Xp;
  if (pointsEarned < t.eliteStartPoints) return t.zone2Xp;
  const overElite = pointsEarned - t.eliteStartPoints; // >= 0
  return t.zone3BaseXp + overElite * t.zone3RampXp;
}

/**
 * XP depositado por UMA sessão de treino. Multiplicadores como % com divisão inteira (mantém
 * tudo inteiro/determinístico): FOCO = taxa (seam); speed = DLC; age = idade.
 */
function sessionDeposit(focus: Focus, opts: TrainOpts): number {
  const speed = opts.speedMultiplierPct ?? TRAINING.speedMultiplierPct;
  const age = opts.ageFactorPct ?? TRAINING.ageFactorPct;
  let xp = Math.floor((TRAINING.sessionXp * TRAINING.focusMultPct[focus]) / 100);
  xp = Math.floor((xp * speed) / 100);
  xp = Math.floor((xp * age) / 100);
  return xp;
}

/**
 * Uma sessão de treino: deposita XP na barra e estoura EM CASCATA os pontos que couberem — o
 * limiar recomputa a cada ponto (fica mais caro conforme sobe) — carregando o resto na barra.
 */
export function trainSession(state: TrainState, focus: Focus, opts: TrainOpts = {}): TrainResult {
  let bar = state.trainingXp + sessionDeposit(focus, opts);
  let freePoints = state.freePoints;
  let gained = 0;
  for (;;) {
    const threshold = nextThreshold(pointsEarnedTotal(state.attributes, freePoints));
    if (bar < threshold) break;
    bar -= threshold;
    freePoints += 1;
    gained += 1;
  }
  return { trainingXp: bar, freePoints, freePointsGained: gained };
}

/**
 * Gasta UM ponto livre: +1 no foco escolhido (teto `attrMax` = 99). Distinta de
 * `allocateAttributes` (trava de criação, soma===136) — aqui a soma CRESCE. Quem garante que
 * há ponto disponível é o store (que decrementa `free_points`).
 */
export function applyPoint(attributes: Attributes, focus: Focus): Result<Attributes> {
  if (attributes[focus] >= PLAYER.attrMax) {
    return { ok: false, reason: `foco já no máximo (${PLAYER.attrMax})` };
  }
  return { ok: true, value: { ...attributes, [focus]: attributes[focus] + 1 } };
}
