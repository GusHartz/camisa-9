// Identidade e elenco do time (SPEC-018, card R14) — a regra pura do quinteto. Valida
// nome/camisa/código (forma), calcula vagas por posição e marcos. Determinística (guardrail):
// a geração ALEATÓRIA do código e a persistência vivem no serviço, NUNCA aqui.
import { POSITIONS, TEAM } from './constants.js';
import { validateNameWith } from './name-filter.js';
import type { ClaimedByPosition, Kit, Position, Result, TeamDraft } from './types.js';

/** Nome do time — reusa o núcleo do filtro de nome (charset + blocklist), com limites do time. */
export function validateTeamName(raw: string): Result<string> {
  return validateNameWith(raw, TEAM.name);
}

/** Camisa: índices bounded por eixo (espelha `validateAppearance`). */
export function validateKit(kit: Kit): Result<Kit> {
  const bounds: ReadonlyArray<readonly [keyof Kit, number]> = [
    ['primaryColor', TEAM.kit.primaryColor],
    ['secondaryColor', TEAM.kit.secondaryColor],
    ['crest', TEAM.kit.crest],
  ];
  for (const [key, n] of bounds) {
    const v = kit[key];
    if (!Number.isInteger(v) || v < 0 || v >= n) {
      return { ok: false, reason: `camisa: ${key} fora da faixa` };
    }
  }
  return {
    ok: true,
    value: { primaryColor: kit.primaryColor, secondaryColor: kit.secondaryColor, crest: kit.crest },
  };
}

/** A string é uma das 4 posições? Guarda o override de posição vindo da borda (JSON não é tipado). */
export function isPosition(raw: string): raw is Position {
  return (POSITIONS as readonly string[]).includes(raw);
}

/** Forma do código (comprimento + alfabeto). Normaliza p/ caixa alta. A unicidade é do store. */
export function validateCodeFormat(raw: string): Result<string> {
  const value = raw.trim().toUpperCase();
  if (value.length !== TEAM.code.len) return { ok: false, reason: 'código inválido' };
  for (const ch of value) {
    if (!TEAM.code.alphabet.includes(ch)) return { ok: false, reason: 'código inválido' };
  }
  return { ok: true, value };
}

/** Vagas HUMANAS livres por posição = `squad[pos] − ocupadas`. */
export function slotsRemaining(claimed: ClaimedByPosition): Record<Position, number> {
  return {
    GK: TEAM.squad.GK - claimed.GK,
    DEF: TEAM.squad.DEF - claimed.DEF,
    MID: TEAM.squad.MID - claimed.MID,
    FWD: TEAM.squad.FWD - claimed.FWD,
  };
}

/** Há vaga humana livre naquela posição? */
export function canClaim(claimed: ClaimedByPosition, position: Position): boolean {
  return claimed[position] < TEAM.squad[position];
}

/** Total de humanos no elenco. */
export function humanCount(claimed: ClaimedByPosition): number {
  return POSITIONS.reduce((n, p) => n + claimed[p], 0);
}

/** Marco ATINGIDO pelo elenco: elenco completo (≥16) / primeiro onze (≥11) / nenhum. */
export function milestone(count: number): 'primeiro_onze' | 'elenco_completo' | null {
  if (count >= TEAM.fullSquad) return 'elenco_completo';
  if (count >= TEAM.firstEleven) return 'primeiro_onze';
  return null;
}

/** Compõe a identidade validada do time (sem id/código/timestamps — isso é do store). */
export function createTeam(input: {
  name: string;
  kit: Kit;
  captainPosition: Position;
}): Result<TeamDraft> {
  if (!isPosition(input.captainPosition)) return { ok: false, reason: 'posição inválida' };
  const name = validateTeamName(input.name);
  if (!name.ok) return name;
  const kit = validateKit(input.kit);
  if (!kit.ok) return kit;
  return {
    ok: true,
    value: { name: name.value, kit: kit.value, captainPosition: input.captainPosition },
  };
}
