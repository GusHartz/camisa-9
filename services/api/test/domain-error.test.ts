// mapDomainError (SPEC-041) — o mapeador de erro tipado → RouteResult, PURO (sem DB, sem servidor).
// Prova: cada code de domínio conhecido → (status, ErrorCode público) certo; OccupyError (regen) → 409;
// e o crucial (Critério 2 / OP-11) — um code NÃO mapeado E um Error comum RELANÇAM (→ o server.ts os
// vira 500 genérico + logInternal), nunca um 500 SILENCIOSO, e a mensagem interna nunca vaza no corpo.
import { describe, expect, it } from 'vitest';
import { GameplayError } from '@camisa-9/player-store';
import { OccupyError } from '@camisa-9/world-store';
import { mapDomainError } from '../src/http/domain-error.js';

describe('mapDomainError — erro tipado → RouteResult (SPEC-041)', () => {
  it('GameplayError conhecido → (status, code público) mapeado', () => {
    expect(mapDomainError(new GameplayError('no_free_points', 'x'))).toMatchObject({
      status: 409,
      body: { code: 'no_free_points' },
    });
    expect(mapDomainError(new GameplayError('decision_not_found', 'x'))).toMatchObject({
      status: 404,
      body: { code: 'not_found' },
    });
    // code INTERNO mapeia p/ um público genérico — o interno nunca chega ao cliente
    expect(mapDomainError(new GameplayError('attribute_maxed', 'x'))).toMatchObject({
      status: 409,
      body: { code: 'conflict' },
    });
    expect(mapDomainError(new GameplayError('item_invalid', 'x'))).toMatchObject({
      status: 400,
      body: { code: 'invalid_input' },
    });
  });

  it('OccupyError (regen) → 409 regen_ineligible', () => {
    expect(mapDomainError(new OccupyError('qualquer'))).toMatchObject({
      status: 409,
      body: { code: 'regen_ineligible' },
    });
  });

  it('code NÃO mapeado → RELANÇA (server.ts → 500 + log), nunca um 500 silencioso', () => {
    expect(() => mapDomainError(new GameplayError('code_futuro_desconhecido', 'x'))).toThrow();
  });

  it('Error comum (throw inesperado) → RELANÇA (→ 500 genérico)', () => {
    expect(() => mapDomainError(new Error('boom'))).toThrow();
  });

  it('a mensagem interna NUNCA aparece no corpo mapeado (OP-11)', () => {
    const r = mapDomainError(new GameplayError('insufficient_balance', 'SALDO SECRETO 42'));
    expect(JSON.stringify(r)).not.toContain('SALDO SECRETO');
  });
});
