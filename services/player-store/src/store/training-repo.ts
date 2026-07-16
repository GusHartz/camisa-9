// Progressão persistida (SPEC-017, card 13) — aplica treino e gasta ponto numa transação
// atômica. A MATEMÁTICA é da lib pura (@camisa-9/player); aqui só lê/grava + envolve na
// transação (OP-17). Erros GENÉRICOS (OP-11); a régua 0..99 tem o CHECK do banco como rede.
import { and, eq } from 'drizzle-orm';
import {
  applyPoint,
  FOCI,
  nextThreshold,
  pointsEarnedTotal,
  trainSession,
  type Attributes,
  type Focus,
  type TrainOpts,
} from '@camisa-9/player';
import type { Db } from '../client.js';
import { athlete } from '../schema/athlete.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Progress {
  readonly attributes: Attributes;
  readonly trainingXp: number;
  readonly freePoints: number;
  readonly overall: number;
  readonly nextThreshold: number;
}

interface AthleteRow {
  readonly attributes: Attributes;
  readonly trainingXp: number;
  readonly freePoints: number;
}

/** Aplica UMA sessão de treino ao atleta ATIVO: a lib recomputa barra/pontos e persiste numa
 *  transação (all-or-nothing). Atleta inexistente/inativo → erro genérico. */
export async function applyTraining(
  db: Db,
  athleteId: string,
  focus: Focus,
  opts?: TrainOpts,
): Promise<Progress> {
  return db.transaction(async (tx) => {
    const row = await loadActive(tx, athleteId);
    const r = trainSession(row, focus, opts);
    await tx
      .update(athlete)
      .set({ trainingXp: r.trainingXp, freePoints: r.freePoints })
      .where(eq(athlete.id, athleteId));
    return toProgress(row.attributes, r.trainingXp, r.freePoints);
  });
}

/** Gasta UM ponto livre (+1 no foco, teto 99) e persiste. Sem ponto ou foco em 99 → erro genérico. */
export async function spendFreePoint(db: Db, athleteId: string, focus: Focus): Promise<Progress> {
  return db.transaction(async (tx) => {
    const row = await loadActive(tx, athleteId);
    if (row.freePoints <= 0) throw new Error('sem ponto de treino disponível');
    const applied = applyPoint(row.attributes, focus);
    if (!applied.ok) throw new Error(applied.reason);
    const freePoints = row.freePoints - 1;
    await tx
      .update(athlete)
      .set({ ...applied.value, freePoints })
      .where(eq(athlete.id, athleteId));
    return toProgress(applied.value, row.trainingXp, freePoints);
  });
}

/** Progresso atual do atleta ativo (leitura p/ UI/testes). `null` se não existe/inativo. */
export async function readAthleteProgress(db: Db, athleteId: string): Promise<Progress | null> {
  const rows = await db
    .select(rowShape())
    .from(athlete)
    .where(and(eq(athlete.id, athleteId), eq(athlete.active, true)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return toProgress(toAttributes(r), r.trainingXp, r.freePoints);
}

async function loadActive(tx: Tx, athleteId: string): Promise<AthleteRow> {
  // FOR UPDATE trava a linha do atleta até o commit → serializa o read-modify-write contra um
  // escritor concorrente (mesmo padrão de integridade do publicador de rodada, SPEC-014/015).
  // Sem isso, dois applyTraining/spendFreePoint simultâneos perderiam um depósito/ponto (lost
  // update sob READ COMMITTED). loadActive só é chamado DENTRO de transação (mutações).
  const rows = await tx
    .select(rowShape())
    .from(athlete)
    .where(and(eq(athlete.id, athleteId), eq(athlete.active, true)))
    .limit(1)
    .for('update');
  const r = rows[0];
  if (!r) throw new Error('atleta não encontrado');
  return { attributes: toAttributes(r), trainingXp: r.trainingXp, freePoints: r.freePoints };
}

function rowShape() {
  return {
    fisico: athlete.fisico,
    tecnico: athlete.tecnico,
    tatico: athlete.tatico,
    mental: athlete.mental,
    trainingXp: athlete.trainingXp,
    freePoints: athlete.freePoints,
  };
}

function toAttributes(r: Record<Focus, number>): Attributes {
  return { fisico: r.fisico, tecnico: r.tecnico, tatico: r.tatico, mental: r.mental };
}

function toProgress(attributes: Attributes, trainingXp: number, freePoints: number): Progress {
  const total = FOCI.reduce((s, f) => s + attributes[f], 0);
  return {
    attributes,
    trainingXp,
    freePoints,
    overall: Math.floor(total / FOCI.length),
    nextThreshold: nextThreshold(pointsEarnedTotal(attributes, freePoints)),
  };
}
