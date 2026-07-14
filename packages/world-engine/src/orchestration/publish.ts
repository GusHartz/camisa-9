// Publicador da rodada (SPEC-002): all-or-nothing + idempotência + lock.
// `publish` é async com um ponto de await ENTRE o check e o commit, para o lock
// não ser decorativo — duas chamadas sobrepostas colidem no lock (uma publica, a
// outra recua). Idempotência sequencial: re-publicar rodada já commitada é no-op.
// O seam de pré-commit é aguardado (suporta trabalho assíncrono) para que uma
// falha — síncrona OU assíncrona — role tudo de volta. Concorrência distribuída/
// durável (retry pós-crash) fica para a SPEC 0.2.

import type { RoundResult } from '../types.js';
import { RoundStore, type PublishedRound } from './store.js';

export interface PublishInput {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly result: RoundResult;
}

export type PublishStatus = 'published' | 'idempotent' | 'locked';

export interface PublishOutcome {
  readonly status: PublishStatus;
  readonly round: number;
}

export class RoundPublisher {
  private readonly locks = new Set<string>();

  constructor(private readonly store: RoundStore) {}

  async publish(
    input: PublishInput,
    onBeforeCommit?: () => void | Promise<void>,
  ): Promise<PublishOutcome> {
    const key = `${input.leagueId}:${input.seasonId}:${input.result.round}`;
    const round = input.result.round;
    if (this.locks.has(key)) {
      return { status: 'locked', round };
    }
    this.locks.add(key);
    try {
      await Promise.resolve(); // janela onde chamadas sobrepostas veem o lock
      if (this.store.has(input.leagueId, input.seasonId, round)) {
        return { status: 'idempotent', round };
      }
      this.store.begin();
      const record: PublishedRound = {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        round,
        result: input.result,
      };
      this.store.stage(record);
      // `await` OBRIGATÓRIO: o seam de pré-commit faz trabalho real e ASSÍNCRONO
      // (na 0.2, escritas/validações no DB). Sem o await, uma rejeição assíncrona
      // vazaria como unhandledRejection e a rodada seria commitada errada — quebrando
      // o all-or-nothing. Com await, a falha cai no catch → rollback total.
      await onBeforeCommit?.(); // ponto de injeção de falha (teste de falha parcial)
      this.store.commit();
      return { status: 'published', round };
    } catch (err) {
      this.store.rollback();
      throw err;
    } finally {
      this.locks.delete(key);
    }
  }
}
