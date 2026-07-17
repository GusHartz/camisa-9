// Economia persistida (SPEC-024, card 2.8) — o saldo + a posse. `accrueRound` credita o ganho da
// rodada (salário f(overall) + prêmio, o prêmio via PARAM = seam do resultado do mundo); `purchaseItem`
// é a compra ATÔMICA (`FOR UPDATE`: valida via lib + deduz saldo + grava posse, all-or-nothing);
// `readWallet` lê o estado (saldo/posse/moradia/marco/agregado dos trade-offs). SÓ player-store (zero
// cross-schema). Erros GENÉRICOS (OP-11). Trava anti-dinheiro-real: o saldo SÓ cresce por `accrueRound`.
import { eq } from 'drizzle-orm';
import {
  aggregateTradeoffs,
  hasMothersHouse,
  lifestyleTier,
  overall,
  purchaseById,
  roundEarnings,
  validatePurchase,
  type MatchResult,
} from '@camisa-9/player';
import type { Db } from '../client.js';
import { athlete } from '../schema/athlete.js';
import { purchase } from '../schema/purchase.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Wallet {
  readonly balance: number;
  readonly ownedItemIds: readonly string[];
  readonly lifestyleTier: number;
  readonly hasMothersHouse: boolean;
  readonly tradeoffs: Record<string, number>;
}

/** Credita o ganho da rodada (salário do overall + prêmio opcional). O `result` é o SEAM do
 *  resultado da partida (o caller futuro lê o mundo). `FOR UPDATE` serializa créditos concorrentes. */
export async function accrueRound(
  db: Db,
  athleteId: string,
  result?: MatchResult,
): Promise<{ credited: number; balance: number }> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          fisico: athlete.fisico,
          tecnico: athlete.tecnico,
          tatico: athlete.tatico,
          mental: athlete.mental,
          balance: athlete.balance,
        })
        .from(athlete)
        .where(eq(athlete.id, athleteId))
        .limit(1)
        .for('update');
      if (!row) throw new Error('atleta não encontrado');
      const credited = roundEarnings(
        overall({
          fisico: row.fisico,
          tecnico: row.tecnico,
          tatico: row.tatico,
          mental: row.mental,
        }),
        result,
      );
      const balance = row.balance + credited;
      await tx.update(athlete).set({ balance }).where(eq(athlete.id, athleteId));
      return { credited, balance };
    });
  } catch (err) {
    // OP-11: um erro de constraint do pg (overflow etc.) vira genérico; o de domínio já é genérico.
    // A causa fica só p/ log server-side (a resposta ao cliente sanitiza na borda HTTP futura).
    if (isConstraintViolation(err)) throw new Error('não foi possível creditar', { cause: err });
    throw err;
  }
}

/** Compra ATÔMICA (`FOR UPDATE`): revalida via lib sob o lock, deduz o custo e grava a posse na
 *  MESMA transação. Saldo insuficiente / item inválido / já possui / moradia fora de ordem → erro
 *  genérico, NADA muda. Autoridade server-side (o cliente nunca força uma compra sem fundos). */
export async function purchaseItem(db: Db, athleteId: string, itemId: string): Promise<Wallet> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ balance: athlete.balance })
        .from(athlete)
        .where(eq(athlete.id, athleteId))
        .limit(1)
        .for('update');
      if (!row) throw new Error('atleta não encontrado');
      const owned = await readOwnedIds(tx, athleteId);
      const check = validatePurchase(row.balance, owned, itemId);
      if (!check.ok) throw new Error(check.reason); // a mensagem já é genérica (OP-11)
      const item = purchaseById(itemId);
      if (!item) throw new Error('item inválido');
      const balance = row.balance - item.cost;
      await tx.update(athlete).set({ balance }).where(eq(athlete.id, athleteId));
      await tx.insert(purchase).values({ athleteId, itemId });
      return walletOf(balance, [...owned, itemId]);
    });
  } catch (err) {
    // OP-11: o CHECK (saldo<0) / PK (posse dup) do pg viram genéricos; o de domínio já é genérico.
    // A causa fica só p/ log server-side (a resposta ao cliente sanitiza na borda HTTP futura).
    if (isConstraintViolation(err))
      throw new Error('não foi possível concluir a compra', { cause: err });
    throw err;
  }
}

/** O estado financeiro do atleta (null se não existe). */
export async function readWallet(db: Db, athleteId: string): Promise<Wallet | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ balance: athlete.balance })
      .from(athlete)
      .where(eq(athlete.id, athleteId))
      .limit(1);
    if (!row) return null;
    return walletOf(row.balance, await readOwnedIds(tx, athleteId));
  });
}

async function readOwnedIds(tx: Tx, athleteId: string): Promise<string[]> {
  const rows = await tx
    .select({ itemId: purchase.itemId })
    .from(purchase)
    .where(eq(purchase.athleteId, athleteId));
  return rows.map((r) => r.itemId);
}

function walletOf(balance: number, ownedItemIds: readonly string[]): Wallet {
  return {
    balance,
    ownedItemIds,
    lifestyleTier: lifestyleTier(ownedItemIds),
    hasMothersHouse: hasMothersHouse(ownedItemIds),
    tradeoffs: aggregateTradeoffs(ownedItemIds),
  };
}

/** Constraint do pg (unique 23505 / check 23514 / fk 23503 / overflow 22003) — o Drizzle envelopa,
 *  então o `code` fica na cadeia de causas. Narrow sem `any` (OP-14). */
function isConstraintViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && isRecord(cur); i++) {
    const code = cur['code'];
    if (code === '23505' || code === '23514' || code === '23503' || code === '22003') return true;
    cur = cur['cause'];
  }
  return false;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
