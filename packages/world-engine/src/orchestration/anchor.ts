// Âncora de fuso SEM `Intl`/`Date` (SPEC-002). Brasil não tem DST desde 2019,
// então usamos offset FIXO UTC-3 por aritmética de epoch — determinístico e
// independente de ICU/tzdata/relógio local. O `epochMs` entra injetado.

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
const BRASILIA_OFFSET_MS = -3 * MS_PER_HOUR; // UTC-3 fixo
const MATCH_DAYS: readonly number[] = [2, 4, 6]; // ter, qui, sáb (0=Dom)
const MATCH_HOUR = 15; // 15h Brasília

export interface RoundSlot {
  /** 0=Dom .. 6=Sáb (horário de Brasília). */
  readonly dayOfWeek: number;
  readonly hour: number;
  readonly minute: number;
  /** Dias desde a época (id único do dia, independente de fuso). */
  readonly dayIndex: number;
  /** É uma janela de rodada (ter/qui/sáb às 15h)? */
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
  const isMatchWindow = MATCH_DAYS.includes(dayOfWeek) && hour === MATCH_HOUR;
  return { dayOfWeek, hour, minute, dayIndex, isMatchWindow };
}
