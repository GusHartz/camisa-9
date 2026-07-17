// Transferências NPC placeholder (SPEC-009): `transfersPerLeague` trocas por liga,
// SEMPRE entre atletas da MESMA posição — preserva o tamanho e a formação de cada
// elenco (a invariante rosterSize sobrevive à viragem). Mercado real = card 1.4.

import { POSITIONS, WORLD } from '../constants.js';
import type { Athlete, Position, WorldClub } from '../types.js';
import { nextInt, type RngState } from './prng.js';
import { pick } from './draw.js';

/**
 * Aplica as trocas de mercado da liga sobre cópias mutáveis dos elencos. `immuneIds` (SPEC-021):
 * uma troca que MOVERIA um imune é suprimida (sem efeito) — mas os saques do PRNG já
 * aconteceram, então o stream é preservado. Set vazio ⇒ nunca suprime ⇒ byte-idêntico.
 */
export function runTransfers(
  clubs: readonly WorldClub[],
  rng: RngState,
  immuneIds: ReadonlySet<string> = new Set(),
): WorldClub[] {
  if (clubs.length < 2) return clubs.map((c) => ({ ...c }));
  const rosters = new Map<string, Athlete[]>(clubs.map((c) => [c.id, [...c.roster]]));
  const ids = clubs.map((c) => c.id);
  for (let t = 0; t < WORLD.transfersPerLeague; t += 1) {
    const [idA, idB] = pickTwoDistinct(ids, rng);
    swapSamePosition(rosters, idA, idB, pick(POSITIONS, rng), rng, immuneIds);
  }
  return clubs.map((c) => ({ ...c, roster: rosters.get(c.id) ?? [...c.roster] }));
}

/** Dois índices distintos: sorteia j em [0, n-1) e desloca para pular i. */
function pickTwoDistinct(ids: readonly string[], rng: RngState): readonly [string, string] {
  const i = nextInt(rng, ids.length);
  let j = nextInt(rng, ids.length - 1);
  if (j >= i) j += 1;
  const a = ids[i];
  const b = ids[j];
  if (a === undefined || b === undefined) {
    throw new RangeError('pickTwoDistinct: índice de clube inválido.');
  }
  return [a, b];
}

/** Troca um atleta da posição `position` entre dois elencos (mutação in-place). */
function swapSamePosition(
  rosters: Map<string, Athlete[]>,
  idA: string,
  idB: string,
  position: Position,
  rng: RngState,
  immuneIds: ReadonlySet<string>,
): void {
  const a = rosters.get(idA);
  const b = rosters.get(idB);
  if (a === undefined || b === undefined) return;
  const ai = pickPositionIndex(a, position, rng);
  const bi = pickPositionIndex(b, position, rng);
  const fromA = a[ai];
  const fromB = b[bi];
  if (fromA === undefined || fromB === undefined) return; // sem candidato na posição
  // Imunidade (SPEC-021): os saques acima já rodaram (stream preservado); só o SWAP é
  // suprimido se um imune seria movido. Set vazio ⇒ nunca suprime ⇒ byte-idêntico ao golden.
  if (immuneIds.has(fromA.id) || immuneIds.has(fromB.id)) return;
  a[ai] = fromB;
  b[bi] = fromA;
}

/** Índice de um atleta da posição pedida; -1 (fora de faixa) se não houver. */
function pickPositionIndex(roster: readonly Athlete[], position: Position, rng: RngState): number {
  const indices: number[] = [];
  for (let i = 0; i < roster.length; i += 1) {
    if (roster[i]?.position === position) indices.push(i);
  }
  if (indices.length === 0) return -1;
  return indices[nextInt(rng, indices.length)] ?? -1;
}
