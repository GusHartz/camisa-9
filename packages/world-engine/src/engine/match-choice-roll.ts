// Roll das opções ARRISCADAS (SPEC-050) — puro/determinístico, sob o guardrail. Resolve sucesso/falha
// de uma opção `risky` ponderando ATRIBUTO (60%) + MORAL (40%): o treino passa a importar nos
// MOMENTOS. Stream próprio ('choice-roll' + sub-seed por template/opção) — disjunto da oferta
// ('choices'), do placar, dos eventos ('events') e da nota ('rating') → NUNCA roda na simulação;
// goldens intocados por construção. Inteiro (Math.trunc, precedente mood.ts). Zero I/O.
import { createRng, deriveSeed, nextUint32 } from './prng.js';
import { choiceTemplateById, type MatchChoiceOption } from './match-choices.js';
import type { Seed } from '../types.js';

/** A opção `optionId` do template — validação/hidratação server-side da resposta (SPEC-050). */
export function choiceOptionById(
  templateId: string,
  optionId: string,
): MatchChoiceOption | undefined {
  return choiceTemplateById(templateId)?.options.find((o) => o.id === optionId);
}

/** A opção conservadora do template (fallback `options[0]` — molde `conservativeOption` das
 *  decisions/SPEC-025). O resolver do timeout usa. */
export function conservativeChoiceOption(templateId: string): MatchChoiceOption | undefined {
  const t = choiceTemplateById(templateId);
  if (!t) return undefined;
  return t.options.find((o) => o.conservative) ?? t.options[0];
}

export interface RollInput {
  readonly seed: Seed;
  readonly leagueId: string;
  readonly seasonId: string;
  readonly round: number;
  readonly homeId: string;
  readonly awayId: string;
  /** Id do MUNDO do humano (o espaço dos streams 'choices'/'rating'). */
  readonly athleteId: string;
  readonly templateId: string;
  readonly optionId: string;
  /** O valor VIVO do foco que a opção pondera (`risky.attr`), 0..99. */
  readonly attr: number;
  /** A moral VIVA (0..100). */
  readonly moral: number;
}

/** Tunáveis do roll — a calibração vive aqui. Chance em % inteiro. */
export const CHOICE_ROLL = {
  base: 50,
  attrNum: 3, // peso do atributo: (attr−50)·3/5 → 60% (eco do 60/40 do effectiveAbility)
  attrDen: 5,
  moralNum: 2, // peso da moral: (moral−50)·2/5 → 40%
  moralDen: 5,
  min: 15, // nunca sem esperança
  max: 85, // nunca certo
} as const;

/** A chance (%) de sucesso — inteira, monotônica em attr e moral, clamp [min,max]. */
export function rollChance(attr: number, moral: number): number {
  const n =
    CHOICE_ROLL.base +
    Math.trunc(((attr - 50) * CHOICE_ROLL.attrNum) / CHOICE_ROLL.attrDen) +
    Math.trunc(((moral - 50) * CHOICE_ROLL.moralNum) / CHOICE_ROLL.moralDen);
  return n < CHOICE_ROLL.min ? CHOICE_ROLL.min : n > CHOICE_ROLL.max ? CHOICE_ROLL.max : n;
}

/** Resolve o roll de uma opção arriscada. Determinístico por
 *  `(seed, liga, temporada, rodada, casa, fora, atleta, 'choice-roll')` + `(templateId, optionId)`.
 *  ⚠️ `attr`/`moral` são inputs VIVOS (lidos na resposta) — o resultado PERSISTIDO é a verdade
 *  durável (classe SPEC-029/046 do débito de replay, declarada na SPEC-050). */
export function resolveChoiceRoll(input: RollInput): { success: boolean; chance: number } {
  const base = deriveSeed(
    input.seed,
    input.leagueId,
    input.seasonId,
    input.round,
    input.homeId,
    input.awayId,
    input.athleteId,
    'choice-roll',
  );
  const rng = createRng(deriveSeed(base, input.templateId, input.optionId));
  const chance = rollChance(input.attr, input.moral);
  return { success: nextUint32(rng) % 100 < chance, chance };
}
