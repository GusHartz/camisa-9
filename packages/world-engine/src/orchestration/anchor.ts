// Âncora de fuso SEM `Intl`/`Date` (SPEC-002). Brasil não tem DST desde 2019,
// então usamos offset FIXO UTC-3 por aritmética de epoch — determinístico e
// independente de ICU/tzdata/relógio local. O `epochMs` entra injetado.

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
const BRASILIA_OFFSET_MS = -3 * MS_PER_HOUR; // UTC-3 fixo
const MATCH_HOUR = 15; // 15h Brasília — TODO DIA (cadência diária 7/7, R4 FINAL)

export interface RoundSlot {
  /** 0=Dom .. 6=Sáb (horário de Brasília). */
  readonly dayOfWeek: number;
  readonly hour: number;
  readonly minute: number;
  /** Dias desde a época (id único do dia, independente de fuso). */
  readonly dayIndex: number;
  /** É uma janela de rodada (15h Brasília, todo dia — 7/7)? */
  readonly isMatchWindow: boolean;
}

export function resolveSlot(epochMs: number): RoundSlot {
  const local = epochMs + BRASILIA_OFFSET_MS;
  const dayIndex = Math.floor(local / MS_PER_DAY);
  // 1970-01-01 foi quinta-feira → 4 (com 0=Dom).
  const dayOfWeek = ((((dayIndex % 7) + 4) % 7) + 7) % 7;
  const msInDay = local - dayIndex * MS_PER_DAY;
  const hour = Math.floor(msInDay / MS_PER_HOUR);
  const minute = Math.floor((msInDay - hour * MS_PER_HOUR) / MS_PER_MINUTE);
  const isMatchWindow = hour === MATCH_HOUR; // 7/7: qualquer dia às 15h Brasília
  return { dayOfWeek, hour, minute, dayIndex, isMatchWindow };
}

/**
 * O maior `dayIndex` cuja rodada das 15h JÁ VENCEU no instante `epochMs` (SPEC-032). É o teto
 * do catch-up: a rodada de HOJE só está "vencida" a partir das 15h Brasília; antes disso, o
 * último dia vencido é ONTEM. Nunca publica a rodada do dia corrente antes da sua janela.
 * Puro (só aritmética de epoch, offset fixo UTC-3) — não altera `resolveSlot`.
 */
export function dueDayIndex(epochMs: number): number {
  const slot = resolveSlot(epochMs);
  return slot.hour >= MATCH_HOUR ? slot.dayIndex : slot.dayIndex - 1;
}
