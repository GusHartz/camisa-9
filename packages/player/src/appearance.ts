// Validação do visual pixel básico (SPEC-016) — só índices bounded (0..n-1). Puro.
import { PLAYER } from './constants.js';
import type { Appearance, Result } from './types.js';

/** Aceita índices dentro da faixa de cada eixo; rejeita fora. */
export function validateAppearance(a: Appearance): Result<Appearance> {
  const { skinTone, hairStyle, hairColor } = PLAYER.appearance;
  if (!inRange(a.skinTone, skinTone)) return fail('tom de pele inválido');
  if (!inRange(a.hairStyle, hairStyle)) return fail('estilo de cabelo inválido');
  if (!inRange(a.hairColor, hairColor)) return fail('cor de cabelo inválida');
  return { ok: true, value: a };
}

function inRange(v: number, count: number): boolean {
  return Number.isInteger(v) && v >= 0 && v < count;
}

function fail(reason: string): Result<never> {
  return { ok: false, reason };
}
