// Política de senha (SPEC-016) — SÓ a regra (tamanho). O HASH é impuro (salt aleatório
// argon2id) e vive no services/player-store, nunca aqui. Puro.
import { PLAYER } from './constants.js';
import type { Result } from './types.js';

/** Valida a política mínima da senha. Não hasheia, não persiste. */
export function validatePassword(raw: string): Result<string> {
  if (raw.length < PLAYER.password.minLen) {
    return { ok: false, reason: `senha deve ter ao menos ${PLAYER.password.minLen} caracteres` };
  }
  return { ok: true, value: raw };
}
