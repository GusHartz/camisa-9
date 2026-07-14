/**
 * Placeholder puro e determinístico da fundação (SPEC-001).
 *
 * Existe apenas para provar o pipeline `lint → typecheck → test → build`
 * cruzando um workspace. NÃO é o `world-engine` nem regra de negócio real —
 * será substituído/removido pela primeira lib de domínio (Fase 1).
 *
 * Padrão H1VE: lib pura, sem I/O, sem estado, determinística.
 */

/**
 * Limita `value` ao intervalo fechado [min, max]. Puro e determinístico.
 *
 * @throws {RangeError} se `min` for maior que `max`.
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError('clamp: `min` não pode ser maior que `max`.');
  }
  return Math.min(Math.max(value, min), max);
}

/** Versão placeholder da fundação, até a primeira release real. */
export const FOUNDATION_VERSION = '0.0.0';
