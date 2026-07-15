// PRNG determinístico e estável cross-plataforma (SPEC-002).
// cyrb128 (hash da seed) + sfc32 (gerador). SÓ aritmética uint32 (`>>> 0`) e
// `Math.imul` (multiplicação inteira 32-bit) — nenhuma fonte não-determinística.
// Saída uniforme = uint32 / 2^32 (exata: divisão por potência de 2).

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Deriva 4 sementes uint32 a partir de uma string (cyrb128). */
export function createRng(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return { a: h1 >>> 0, b: h2 >>> 0, c: h3 >>> 0, d: h4 >>> 0 };
}

/** Próximo uint32 (sfc32). Muta o estado (cursor). */
export function nextUint32(s: RngState): number {
  s.a >>>= 0;
  s.b >>>= 0;
  s.c >>>= 0;
  s.d >>>= 0;
  let t = (s.a + s.b) | 0;
  s.a = s.b ^ (s.b >>> 9);
  s.b = (s.c + (s.c << 3)) | 0;
  s.c = (s.c << 21) | (s.c >>> 11);
  s.d = (s.d + 1) | 0;
  t = (t + s.d) | 0;
  s.c = (s.c + t) | 0;
  return t >>> 0;
}

/** Uniforme em [0, 1) — exato (uint32 / 2^32). */
export function nextFloat(s: RngState): number {
  return nextUint32(s) / 4294967296;
}

/** Inteiro uniforme em [0, maxExclusive). Determinístico (IEEE-754 básico + floor). */
export function nextInt(s: RngState, maxExclusive: number): number {
  return Math.floor(nextFloat(s) * maxExclusive);
}

/**
 * Deriva uma sub-seed determinística (stream independente por partida/rodada).
 * Codificação com prefixo de comprimento (`len:valor`) → INJETIVA: nenhum par de
 * listas de partes distintas produz a mesma string, mesmo que um id contenha `|`
 * ou `:` (senão, ('a','b|c') e ('a|b','c') colidiriam no mesmo stream de RNG).
 */
export function deriveSeed(base: string, ...parts: ReadonlyArray<string | number>): string {
  return [base, ...parts]
    .map((p) => {
      const s = String(p);
      return `${s.length}:${s}`;
    })
    .join('|');
}
