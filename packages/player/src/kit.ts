// Kit do clube derivado do id (SPEC-038) — a outra metade do avatar em camadas (a primeira é a
// `appearance` do atleta). O mundo NPC não grava kit (`WorldClub` não tem), mas a faixa precisa
// vestir os 17 companheiros de elenco. Derivar do id é determinístico, sem coluna, sem migration,
// sem golden — o mundo vê sempre o mesmo escudo para o mesmo clube.
//
// PURA, sob o guardrail: FNV-1a de 32 bits por SHIFTS (o mesmo de `decisions.ts` — o `hash32` de lá
// é privado, então é replicado aqui, não importado). `Math.imul`/float não passam no guardrail.
import { TEAM } from './constants.js';

export interface Kit {
  readonly primaryColor: number; // 0..11
  readonly secondaryColor: number; // 0..11
  readonly crest: number; // 0..15
}

/** FNV-1a 32-bit, guardrail-safe (só shifts + xor). Determinístico. */
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

/** Um passo de avalanche (xorshift) sobre um uint32 — espalha os bits antes do `%`, senão o módulo
 *  de um FNV de sufixos parecidos (`clube-1`/`clube-2`) correlaciona os canais e colide demais. */
function mix(h: number): number {
  h ^= h >>> 16;
  h = (h * 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = (h * 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Os três eixos saem de streams DESCORRELACIONADOS: um hash-base do id, rotacionado por eixo e
 *  passado pelo avalanche antes do módulo. Só shifts/mult uint32 → guardrail-safe. */
export function kitFromClubId(clubId: string): Kit {
  const base = fnv1a(clubId);
  return {
    primaryColor: mix(base ^ 0x9e3779b1) % TEAM.kit.primaryColor,
    secondaryColor: mix(base ^ 0x85ebca77) % TEAM.kit.secondaryColor,
    crest: mix(base ^ 0xc2b2ae3d) % TEAM.kit.crest,
  };
}
