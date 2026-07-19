// Eventos da PARTIDA RICA (SPEC-031) — puros/determinísticos, sob o guardrail. Fatia 1: a LESÃO.
// A partida machuca RARAMENTE (taxa tunável): por lado, um sorteio; se sim, escolhe o atleta (do
// elenco), a gravidade (ponderada) e o minuto — tudo inteiro via `nextInt`. NÃO altera o placar (é
// narrativa; o RNG vem de um stream SEPARADO do placar, derivado no world-season). Zero I/O.
import { nextInt, type RngState } from './prng.js';
import type { Athlete, MatchEvent } from '../types.js';

/** Tunáveis dos eventos de partida — a calibração vive aqui (rebalanceia sem tocar lógica). */
export const MATCH_EVENTS = {
  /** Chance de lesão POR LADO por partida = `injuryThreshold / injuryDenom` (raro). */
  injuryDenom: 100,
  injuryThreshold: 4,
  /** Distribuição de gravidade (%): grave, depois media; o resto é leve. Soma < 100. */
  gravePct: 10,
  mediaPct: 30,
  /** Minutos possíveis (o minuto ∈ [1, matchMinutes]). */
  matchMinutes: 90,
} as const;

/** Os eventos de lesão de UMA partida (0 a 2 — um sorteio por lado). Determinístico no `rng`. */
export function matchInjuries(
  homeClubId: string,
  homeRoster: readonly Athlete[],
  awayClubId: string,
  awayRoster: readonly Athlete[],
  rng: RngState,
): MatchEvent[] {
  const events: MatchEvent[] = [];
  const home = rollInjury(homeClubId, homeRoster, rng);
  if (home) events.push(home);
  const away = rollInjury(awayClubId, awayRoster, rng);
  if (away) events.push(away);
  return events;
}

/** Sorteia UMA lesão para um lado (ou `null`). Ordem de consumo do RNG: roll → [atleta, gravidade,
 *  minuto] só se lesionou. */
function rollInjury(clubId: string, roster: readonly Athlete[], rng: RngState): MatchEvent | null {
  if (roster.length === 0) return null;
  if (nextInt(rng, MATCH_EVENTS.injuryDenom) >= MATCH_EVENTS.injuryThreshold) return null;
  const athlete = roster[nextInt(rng, roster.length)]!;
  const severity = rollSeverity(rng);
  const minute = nextInt(rng, MATCH_EVENTS.matchMinutes) + 1;
  return { kind: 'injury', clubId, athleteId: athlete.id, severity, minute };
}

/** A gravidade ponderada (leve > media > grave). */
function rollSeverity(rng: RngState): 'leve' | 'media' | 'grave' {
  const r = nextInt(rng, 100);
  if (r < MATCH_EVENTS.gravePct) return 'grave';
  if (r < MATCH_EVENTS.gravePct + MATCH_EVENTS.mediaPct) return 'media';
  return 'leve';
}
