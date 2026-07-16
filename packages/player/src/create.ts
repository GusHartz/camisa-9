// Composição da criação do atleta (SPEC-016) — junta as validações puras numa identidade
// validada (AthleteDraft), SEM id/timestamps (isso é do store, impuro — OP-17). Pura.
import { allocateAttributes } from './attributes.js';
import { validateAppearance } from './appearance.js';
import { validateName } from './name-filter.js';
import type { AthleteDraft, CreateAthleteInput, Result } from './types.js';

/** Valida nome + atributos + visual e devolve a identidade pronta pra persistir (ou o motivo). */
export function createAthlete(input: CreateAthleteInput): Result<AthleteDraft> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const attributes = allocateAttributes(input.attributes);
  if (!attributes.ok) return attributes;
  const appearance = validateAppearance(input.appearance);
  if (!appearance.ok) return appearance;
  return {
    ok: true,
    value: {
      name: name.value,
      position: input.position,
      appearance: appearance.value,
      attributes: attributes.value,
    },
  };
}
