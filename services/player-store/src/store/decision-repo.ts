// Motor de decisões persistido (SPEC-025, card 2.4). `generateForDay` gera (idempotente) o dia a
// partir do contexto dos estados LOCAIS (overall/saldo/patrimônio; `age` = seam); `answerDecision`
// grava a escolha do jogador (FOR UPDATE, valida a opção); `resolveDeadline` é o fallback das 18h
// (o agente aplica a conservadora nas PENDING, sem sobrescrever as answered); `readDecisionLog` é o
// "log no perfil". SÓ player-store (idade = param, transferência = registrada). Erros genéricos (OP-11).
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  conservativeOption,
  generateDailyDecisions,
  lifestyleTier,
  optionById,
  overall,
  templateById,
  type Decision,
  type DecisionContext,
  type DecisionOutcome,
} from '@camisa-9/player';
import type { Db } from '../client.js';
import { athlete } from '../schema/athlete.js';
import { purchase } from '../schema/purchase.js';
import { decision } from '../schema/decision.js';
import { bumpMoral } from './mood-repo.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DecisionLogEntry {
  readonly id: string;
  readonly day: number;
  readonly templateId: string;
  readonly type: string;
  readonly status: string;
  readonly chosenOption: string | null;
  readonly outcome: DecisionOutcome | null;
  readonly resolvedBy: string | null;
}

/** Gera (idempotente) as decisões do dia. Monta o contexto dos estados LOCAIS; `age` é seam (param).
 *  Se o dia já foi gerado, devolve o existente (NÃO regenera — o primeiro dia vence). */
export async function generateForDay(
  db: Db,
  athleteId: string,
  day: number,
  seed: string,
  extra: { age?: number; injured?: boolean } = {},
): Promise<Decision[]> {
  return db.transaction(async (tx) => {
    // Lock advisory (athlete+dia) — serializa gerações concorrentes: a 1ª sela o dia, a 2ª relê o
    // existente (sem misturar contextos / duplicar). Fecha o TOCTOU do check-then-insert (revisão).
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`decision:${athleteId}:${day}`}, 0))`,
    );
    const existing = await tx
      .select({ templateId: decision.templateId })
      .from(decision)
      .where(and(eq(decision.athleteId, athleteId), eq(decision.day, day)))
      .orderBy(decision.ord); // reproduz a ordem de geração
    if (existing.length > 0) return existing.map((r) => hydrate(r.templateId)).filter(isDecision);
    const context = await buildContext(tx, athleteId, extra);
    const generated = generateDailyDecisions(seed, day, athleteId, context);
    if (generated.length > 0) {
      await tx.insert(decision).values(
        generated.map((d, i) => ({
          athleteId,
          day,
          ord: i, // o rank do hash — a ordem apresentada, persistida
          templateId: d.templateId,
          type: d.type,
        })),
      );
    }
    return generated;
  });
}

/** O contexto de gatilho: overall (focos) + saldo + patrimônio (locais); `age`/`injured` = seams
 *  (param do mundo/lesão, molde estabelecido — o `decision-repo` não lê o `injury-repo`). */
async function buildContext(
  db: Tx,
  athleteId: string,
  extra: { age?: number; injured?: boolean },
): Promise<DecisionContext> {
  const [row] = await db
    .select({
      fisico: athlete.fisico,
      tecnico: athlete.tecnico,
      tatico: athlete.tatico,
      mental: athlete.mental,
      balance: athlete.balance,
      moral: athlete.moral,
    })
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1);
  if (!row) throw new Error('atleta não encontrado');
  const owned = await db
    .select({ itemId: purchase.itemId })
    .from(purchase)
    .where(eq(purchase.athleteId, athleteId));
  return {
    overall: overall({
      fisico: row.fisico,
      tecnico: row.tecnico,
      tatico: row.tatico,
      mental: row.mental,
    }),
    balance: row.balance,
    lifestyleTier: lifestyleTier(owned.map((o) => o.itemId)),
    moral: row.moral, // a barra real (SPEC-027) → crise-moral e cia. deixam de ser inertes
    ...(extra.age !== undefined ? { age: extra.age } : {}), // exactOptionalPropertyTypes: só se definido
    ...(extra.injured !== undefined ? { injured: extra.injured } : {}),
  };
}

/** O jogador responde uma decisão PENDING. Valida a opção; grava o outcome declarado (seam) +
 *  status=answered. Já resolvida / inexistente / opção inválida → erro genérico (OP-11). */
export async function answerDecision(
  db: Db,
  athleteId: string,
  decisionId: string,
  optionId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: decision.status, templateId: decision.templateId })
      .from(decision)
      .where(and(eq(decision.id, decisionId), eq(decision.athleteId, athleteId)))
      .limit(1)
      .for('update');
    if (!row) throw new Error('decisão não encontrada');
    if (row.status !== 'pending') throw new Error('decisão já resolvida');
    const opt = optionById(row.templateId, optionId);
    if (!opt) throw new Error('opção inválida');
    await tx
      .update(decision)
      .set({ status: 'answered', chosenOption: opt.id, outcome: opt.outcome, resolvedBy: 'player' })
      .where(eq(decision.id, decisionId));
    await bumpMoral(tx, athleteId, moralOf(opt.outcome)); // a 2.3 APLICA o moral (SPEC-025), na mesma tx
  });
}

/** O delta de Moral declarado num outcome (0 se ausente/não-numérico). */
function moralOf(outcome: DecisionOutcome): number {
  const m = outcome['moral'];
  return typeof m === 'number' ? m : 0;
}

/** O fallback das 18h: resolve as PENDING do dia com a opção conservadora (o agente). O UPDATE
 *  condicional (`status='pending'`) NÃO sobrescreve uma answered que entrou na corrida. Devolve
 *  quantas resolveu. */
export async function resolveDeadline(db: Db, athleteId: string, day: number): Promise<number> {
  const pending = await db
    .select({ id: decision.id, templateId: decision.templateId })
    .from(decision)
    .where(
      and(eq(decision.athleteId, athleteId), eq(decision.day, day), eq(decision.status, 'pending')),
    );
  let count = 0;
  for (const p of pending) {
    const opt = conservativeOption(p.templateId);
    if (!opt) continue;
    // O UPDATE condicional + o bump de moral numa transação por decisão (atômico; o bump só entra
    // se a resolução venceu a corrida contra uma answered). A 2.3 aplica o moral da conservadora.
    const resolved = await db.transaction(async (tx) => {
      const updated = await tx
        .update(decision)
        .set({
          status: 'resolved',
          chosenOption: opt.id,
          outcome: opt.outcome,
          resolvedBy: 'agent',
        })
        .where(and(eq(decision.id, p.id), eq(decision.status, 'pending')))
        .returning({ id: decision.id });
      if (updated.length === 0) return false;
      await bumpMoral(tx, athleteId, moralOf(opt.outcome));
      return true;
    });
    if (resolved) count += 1;
  }
  return count;
}

/** O histórico (o "log no perfil"): todas as decisões, mais recentes primeiro. */
export async function readDecisionLog(db: Db, athleteId: string): Promise<DecisionLogEntry[]> {
  const rows = await db
    .select()
    .from(decision)
    .where(eq(decision.athleteId, athleteId))
    .orderBy(desc(decision.day), decision.ord); // ordem determinística (dia desc, rank de geração)
  return rows.map(toLogEntry);
}

function hydrate(templateId: string): Decision | null {
  const t = templateById(templateId);
  return t ? { templateId: t.id, type: t.type, prompt: t.prompt, options: t.options } : null;
}

function isDecision(d: Decision | null): d is Decision {
  return d !== null;
}

function toLogEntry(r: typeof decision.$inferSelect): DecisionLogEntry {
  return {
    id: r.id,
    day: r.day,
    templateId: r.templateId,
    type: r.type,
    status: r.status,
    chosenOption: r.chosenOption,
    outcome: r.outcome,
    resolvedBy: r.resolvedBy,
  };
}
