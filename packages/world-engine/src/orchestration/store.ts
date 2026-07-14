// Store transacional in-memory (SPEC-002): begin/stage/commit/rollback via
// staging + swap atômico. A API de LEITURA nunca expõe o staging — só estado commitado.
// Prova o CONTRATO de publicação (rollback total, nada meio-publicado observável).
// Atomicidade de BANCO real (isolamento, commit parcial) fica para a SPEC 0.2.

import type { RoundResult } from '../types.js';

export interface PublishedRound {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly round: number;
  readonly result: RoundResult;
}

export class RoundStore {
  private committed = new Map<string, PublishedRound>();
  private staged: Map<string, PublishedRound> | null = null;

  begin(): void {
    if (this.staged !== null) {
      throw new Error('RoundStore: transação já aberta');
    }
    this.staged = new Map(this.committed);
  }

  stage(round: PublishedRound): void {
    if (this.staged === null) {
      throw new Error('RoundStore: stage sem transação aberta');
    }
    this.staged.set(keyOf(round.leagueId, round.seasonId, round.round), round);
  }

  commit(): void {
    if (this.staged === null) {
      throw new Error('RoundStore: commit sem transação aberta');
    }
    this.committed = this.staged; // swap atômico — único ponto de mutação visível
    this.staged = null;
  }

  rollback(): void {
    this.staged = null;
  }

  get(leagueId: string, seasonId: string, round: number): PublishedRound | undefined {
    return this.committed.get(keyOf(leagueId, seasonId, round));
  }

  has(leagueId: string, seasonId: string, round: number): boolean {
    return this.committed.has(keyOf(leagueId, seasonId, round));
  }

  size(): number {
    return this.committed.size;
  }
}

function keyOf(leagueId: string, seasonId: string, round: number): string {
  return `${leagueId}:${seasonId}:${round}`;
}
