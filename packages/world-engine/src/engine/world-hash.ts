// Impressão digital determinística do estado do mundo (SPEC-009). Reusa o cyrb128 do
// PRNG (via `createRng`) sobre a serialização canônica — só operações inteiras, então
// é estável cross-ambiente (âncora de golden/replay/auditoria). Não é criptográfica.

import type { WorldState } from '../types.js';
import { createRng } from './prng.js';

/** Hash hexadecimal de 128 bits do estado do mundo. */
export function worldHash(world: WorldState): string {
  const state = createRng(JSON.stringify(world));
  return [state.a, state.b, state.c, state.d]
    .map((x) => (x >>> 0).toString(16).padStart(8, '0'))
    .join('');
}
