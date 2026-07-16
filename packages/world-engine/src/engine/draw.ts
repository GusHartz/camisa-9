// Sorteios tipados sobre o PRNG (SPEC-009). Encapsula o acesso indexado (que é
// `T | undefined` sob noUncheckedIndexedAccess) num contrato seguro. Determinístico.

import { nextInt, type RngState } from './prng.js';

/** Escolhe um elemento do array pelo PRNG. Lança se vazio (índice sempre em faixa). */
export function pick<T>(arr: readonly T[], rng: RngState): T {
  const item = arr[nextInt(rng, arr.length)];
  if (item === undefined) {
    throw new RangeError('pick: não é possível sortear de um array vazio.');
  }
  return item;
}

/** Inteiro uniforme em [min, maxInclusive]. */
export function drawInt(rng: RngState, min: number, maxInclusive: number): number {
  return min + nextInt(rng, maxInclusive - min + 1);
}
