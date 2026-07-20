// Conversão data → dayIndex para os scripts de operador (SPEC-039).
//
// O `startDayIndex` da âncora é "dias desde a época" — um número que ninguém calcula de cabeça e
// no qual um erro de 1 desloca o calendário inteiro do mundo. O operador escreve `2026-08-01`; aqui
// a data vira `dayIndex`.
//
// ⚠️ A aritmética de fuso NÃO é reimplementada: montamos o instante das **15h de Brasília** daquele
// dia (= 18:00 UTC, o offset fixo UTC-3 do projeto) e deixamos o `resolveSlot` do engine derivar o
// `dayIndex`. Se duplicássemos essa conta, o mundo poderia jogar num dia e o tick esperar outro.
// Usamos 15h e não meia-noite de propósito: é a hora do jogo, longe de qualquer borda de dia.
import { resolveSlot } from '@camisa-9/world-engine';

/** 15h de Brasília em UTC (o projeto usa offset FIXO −3; o Brasil não tem DST desde 2019). */
const MATCH_HOUR_UTC = 18;

export class OpsDateError extends Error {}

/**
 * `YYYY-MM-DD` → o `dayIndex` da rodada 1. Estrito: rejeita formato diferente e **data que não
 * existe** (`2026-02-30` não vira 2 de março em silêncio).
 */
export function dayIndexFromDate(startDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate.trim());
  if (!m) {
    throw new OpsDateError(`data inválida: "${startDate}" — use o formato YYYY-MM-DD`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const epochMs = Date.UTC(year, month - 1, day, MATCH_HOUR_UTC, 0, 0, 0);
  // O `Date.UTC` normaliza silenciosamente (2026-02-30 → 2026-03-02). Conferimos o round-trip para
  // que uma data inexistente FALHE em vez de ancorar o mundo num dia que o operador não pediu.
  const back = new Date(epochMs);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    throw new OpsDateError(`data inexistente: "${startDate}"`);
  }
  return resolveSlot(epochMs).dayIndex;
}
