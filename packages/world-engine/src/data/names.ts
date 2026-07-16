// Derivação determinística de nomes fictícios. NÃO consome o stream de geração do
// mundo: o nome do clube é função do índice global (bijeção → unicidade garantida)
// e o do atleta é função de um RNG semeado pelo próprio id (colisão de nome tolerada,
// id sempre único). Manter fora do stream deixa a ordem de sorteios do mundo estável.

import { createRng, nextInt } from '../engine/prng.js';
import { ATHLETE_FIRST, ATHLETE_LAST, CLUB_CORES, CLUB_PREFIXES } from './name-pools.js';

/**
 * Nome de clube único por índice global. Decomposição (prefixo, núcleo) =
 * (g mod P, ⌊g/P⌋): injetiva enquanto ⌊g/P⌋ < |núcleos| (P·|núcleos| = 280 combos).
 */
export function clubName(globalIndex: number): string {
  const prefix = CLUB_PREFIXES[globalIndex % CLUB_PREFIXES.length];
  const core = CLUB_CORES[Math.floor(globalIndex / CLUB_PREFIXES.length) % CLUB_CORES.length];
  return `${prefix} ${core}`;
}

/** Nome de atleta a partir de um RNG semeado pelo id (independente do stream do mundo). */
export function athleteName(id: string): string {
  const rng = createRng(id);
  const first = ATHLETE_FIRST[nextInt(rng, ATHLETE_FIRST.length)];
  const last = ATHLETE_LAST[nextInt(rng, ATHLETE_LAST.length)];
  return `${first} ${last}`;
}
