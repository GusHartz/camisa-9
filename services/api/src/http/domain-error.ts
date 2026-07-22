// Mapeia um erro TIPADO de domínio (SPEC-041) → RouteResult. O `code` do domínio é o CONTRATO,
// nunca a mensagem (OP-11). `GameplayError` (spend/decisão/compra) vem do player-store; `OccupyError`
// (regen) do world-store. Erro DESCONHECIDO → REtHROW → o `server.ts` o vira 500 genérico.
import { GameplayError } from '@camisa-9/player-store';
import { OccupyError } from '@camisa-9/world-store';
import { fail } from './respond.js';
import type { ErrorCode, RouteResult } from './types.js';

/** `GameplayError.code` (interno) → (status HTTP, ErrorCode público). Code não mapeado → 500. */
const DOMAIN_MAP: Readonly<Record<string, { status: number; code: ErrorCode }>> = {
  no_free_points: { status: 409, code: 'no_free_points' },
  attribute_maxed: { status: 409, code: 'conflict' },
  decision_not_found: { status: 404, code: 'not_found' },
  decision_resolved: { status: 409, code: 'decision_resolved' },
  choice_resolved: { status: 409, code: 'choice_resolved' },
  choice_not_available: { status: 409, code: 'choice_not_available' },
  invalid_option: { status: 400, code: 'invalid_option' },
  item_invalid: { status: 400, code: 'invalid_input' },
  insufficient_balance: { status: 409, code: 'insufficient_balance' },
  already_owned: { status: 409, code: 'already_owned' },
  housing_out_of_order: { status: 409, code: 'conflict' },
};

/** Traduz o erro de domínio. `GameplayError` conhecido → o status/code mapeado; `OccupyError` (regen)
 *  → 409 `regen_ineligible` (grosso — poucos modos: jovem / sem vaga); code não mapeado OU erro
 *  desconhecido → RETHROW → o `server.ts` o vira 500 genérico E dispara o `logInternal` (diagnóstico).
 *  ⚠️ Não devolver `fail(500)` aqui: por retornar, o code não mapeado viraria um 500 SILENCIOSO (sem
 *  trilha server-side). O rethrow é o que garante o log — o corpo ao cliente segue genérico (OP-11). */
export function mapDomainError(err: unknown): RouteResult {
  if (err instanceof GameplayError) {
    const m = DOMAIN_MAP[err.code];
    if (m) return fail(m.status, m.code);
    throw err;
  }
  if (err instanceof OccupyError) return fail(409, 'regen_ineligible');
  throw err;
}
