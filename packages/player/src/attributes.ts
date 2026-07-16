// Alocação de atributos da criação (SPEC-016) — a primitiva reusável (o treino do card 13
// reusará a mesma régua, com +1 ponto até 99). Pura e determinística.
import { CREATION_TOTAL, PLAYER } from './constants.js';
import type { Attributes, Focus, Result } from './types.js';

/**
 * Valida os valores FINAIS dos 4 focos: cada um inteiro em [floor, cap] e a soma = 136
 * (pool fixo → overall uniforme = 34). Como cap (50) ≤ 99 e floor (20) ≥ 0, o intervalo
 * [floor, cap] já garante a régua [0, 99]. Devolve os atributos validados ou o motivo.
 */
export function allocateAttributes(values: Readonly<Record<Focus, number>>): Result<Attributes> {
  const { floor, cap } = PLAYER.creation;
  const vals = [values.fisico, values.tecnico, values.tatico, values.mental];
  let sum = 0;
  for (const v of vals) {
    if (!Number.isInteger(v) || v < floor || v > cap) {
      return fail(`cada foco deve ser inteiro em [${floor}, ${cap}]`);
    }
    sum += v;
  }
  if (sum !== CREATION_TOTAL)
    return fail(`a soma dos atributos deve ser ${CREATION_TOTAL} (é ${sum})`);
  return {
    ok: true,
    value: {
      fisico: values.fisico,
      tecnico: values.tecnico,
      tatico: values.tatico,
      mental: values.mental,
    },
  };
}

function fail(reason: string): Result<never> {
  return { ok: false, reason };
}
