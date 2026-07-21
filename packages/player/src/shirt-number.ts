// Número da camisa DERIVADO da posição (SPEC-040) — SEM escolha, SEM coluna, SEM migration. A faixa
// desenha o SEU número; a posição do humano é fixa na criação (SPEC-016) e o id é estável, então o
// número é ESTÁVEL por construção (recomputável, não persistido). Molde do `kitFromClubId` (SPEC-038).
//
// ⚠️ Decisão do founder (SPEC-040): o número é DERIVADO da posição, não escolhido — reverte o seletor
// 1–99 do design e a decisão da SPEC-038 ("o jogador escolhe"). Pool clássico por posição + variedade
// por hash do id: é SEMPRE um número da posição (GK baixo, 9/11 atacante…), mas nem todo atacante é #9.
//
// PURA, sob o guardrail: FNV-1a de 32 bits por SHIFTS + avalanche (o mesmo de `kit.ts`/`decisions.ts`,
// cujos hashes são privados → replicado aqui, não importado, como a `kit.ts` fez).
import { isPosition } from './team.js';

/** Os pools de números por posição (tunável — ratificado no card) + o fallback. */
export const SHIRT = {
  pools: {
    GK: [1, 12],
    DEF: [2, 3, 4, 5, 6],
    MID: [8, 10, 14, 16, 18, 20],
    FWD: [7, 9, 11, 19, 21],
  },
  /** Posição desconhecida — não deve ocorrer (a criação valida via `isPosition`). */
  fallback: 9,
} as const;

/** FNV-1a 32-bit, guardrail-safe (só shifts + xor). Determinístico. */
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

/** Avalanche (xorshift) sobre um uint32 — espalha os bits antes do `%`, senão ids parecidos colidem. */
function mix(h: number): number {
  h ^= h >>> 16;
  h = (h * 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = (h * 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** O número da camisa derivado de `(position, seed=athleteId)`: determinístico, position-tied, 1..99.
 *  Posição inválida (não deve ocorrer — a coluna é `text` sem CHECK) → `SHIRT.fallback`. */
export function shirtNumber(position: string, seed: string): number {
  if (!isPosition(position)) return SHIRT.fallback;
  const pool = SHIRT.pools[position];
  return pool[mix(fnv1a(seed)) % pool.length]!;
}
