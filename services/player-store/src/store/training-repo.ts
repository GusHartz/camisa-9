// Progressão persistida (SPEC-017, card 13) — aplica treino e gasta ponto numa transação
// atômica. A MATEMÁTICA é da lib pura (@camisa-9/player); aqui só lê/grava + envolve na
// transação (OP-17). Erros GENÉRICOS (OP-11); a régua 0..99 tem o CHECK do banco como rede.
import { and, eq } from 'drizzle-orm';
import {
  MOOD,
  applyPoint,
  coachFocus,
  isFocus,
  nextThreshold,
  overall,
  pointsEarnedTotal,
  repeatPenaltyPct,
  resolveFocusStreak,
  trainSession,
  type Attributes,
  type Focus,
  type TrainOpts,
} from '@camisa-9/player';
import type { Db } from '../client.js';
import { athlete } from '../schema/athlete.js';
import { dailyLedger } from '../schema/daily-ledger.js';
import { bumpForma } from './mood-repo.js';
import { GameplayError } from './gameplay-error.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Progress {
  readonly attributes: Attributes;
  readonly trainingXp: number;
  readonly freePoints: number;
  readonly overall: number;
  readonly nextThreshold: number;
  /** Estado do streak de FOCO (SPEC-019): último foco, sessões consecutivas nele, e o rendimento
   *  que a PRÓXIMA sessão teria se repetisse esse foco (100 = fresco). Só leitura (UI/testes). */
  readonly lastFocus: string | null;
  readonly focusStreak: number;
  readonly nextFocusPenaltyPct: number;
}

interface AthleteRow {
  readonly attributes: Attributes;
  readonly trainingXp: number;
  readonly freePoints: number;
  readonly lastFocus: string | null;
  readonly focusStreak: number;
  readonly nextTrainFocus: string | null;
}

/** Aplica UMA sessão de treino ao atleta ATIVO: a lib recomputa barra/pontos e persiste numa
 *  transação (all-or-nothing). `focus === null` → o técnico treina o foco mais baixo. O streak
 *  de FOCO define o rendimento decrescente (repetir decai por degraus). Inativo → erro genérico. */
export async function applyTraining(
  db: Db,
  athleteId: string,
  focus: Focus | null,
  day: number,
  opts?: TrainOpts,
): Promise<Progress> {
  return db.transaction(async (tx) => {
    const row = await loadActive(tx, athleteId);
    // 1×/dia (SPEC-041): o claim `'train'` reivindica o dia; já treinado → no-op (não re-deposita).
    if (!(await claimTrainDay(tx, athleteId, day))) {
      return toProgress(
        row.attributes,
        row.trainingXp,
        row.freePoints,
        row.lastFocus,
        row.focusStreak,
      );
    }
    // Viés de treino (SPEC-050): sem foco explícito, a escolha de partida de ONTEM guia o treino de
    // HOJE — consumido 1× (limpa junto do treino; a linha já está FOR UPDATE). Só consome quando
    // TREINA de fato (o no-op do claim acima preserva o viés). Guarda `isFocus` (lição SPEC-047).
    const bias = focus === null && isFocus(row.nextTrainFocus) ? row.nextTrainFocus : null;
    const chosen = focus ?? bias ?? coachFocus(row.attributes);
    const streak = resolveFocusStreak(row.lastFocus, row.focusStreak, chosen);
    const r = trainSession(row, chosen, {
      ...opts,
      focusRepeatPct: repeatPenaltyPct(streak.repeats),
    });
    await tx
      .update(athlete)
      .set({
        trainingXp: r.trainingXp,
        freePoints: r.freePoints,
        lastFocus: streak.lastFocus,
        focusStreak: streak.focusStreak,
        ...(bias !== null ? { nextTrainFocus: null } : {}),
      })
      .where(eq(athlete.id, athleteId));
    await bumpForma(tx, athleteId, MOOD.trainFormaBump); // treino sobe a forma (SPEC-027), na mesma tx
    return toProgress(
      row.attributes,
      r.trainingXp,
      r.freePoints,
      streak.lastFocus,
      streak.focusStreak,
    );
  });
}

/** Gasta UM ponto livre (+1 no foco, teto 99) e persiste. Sem ponto ou foco em 99 → erro genérico. */
export async function spendFreePoint(db: Db, athleteId: string, focus: Focus): Promise<Progress> {
  return db.transaction(async (tx) => {
    const row = await loadActive(tx, athleteId);
    if (row.freePoints <= 0)
      throw new GameplayError('no_free_points', 'sem ponto de treino disponível');
    const applied = applyPoint(row.attributes, focus);
    if (!applied.ok) throw new GameplayError('attribute_maxed', applied.reason);
    const freePoints = row.freePoints - 1;
    await tx
      .update(athlete)
      .set({ ...applied.value, freePoints })
      .where(eq(athlete.id, athleteId));
    return toProgress(applied.value, row.trainingXp, freePoints, row.lastFocus, row.focusStreak);
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
  return toProgress(toAttributes(r), r.trainingXp, r.freePoints, r.lastFocus, r.focusStreak);
}

/** Reivindica o dia de treino no ledger (SPEC-041). `false` = já treinado hoje → o caller faz no-op.
 *  Molde do claim de `accrueRound`/`applyDailyMood`: `onConflictDoNothing` na PK `(athlete, day, scope)`. */
async function claimTrainDay(tx: Tx, athleteId: string, day: number): Promise<boolean> {
  const claimed = await tx
    .insert(dailyLedger)
    .values({ athleteId, day, scope: 'train' })
    .onConflictDoNothing()
    .returning({ athleteId: dailyLedger.athleteId });
  return claimed.length > 0;
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
  return {
    attributes: toAttributes(r),
    trainingXp: r.trainingXp,
    freePoints: r.freePoints,
    lastFocus: r.lastFocus,
    focusStreak: r.focusStreak,
    nextTrainFocus: r.nextTrainFocus,
  };
}

function rowShape() {
  return {
    fisico: athlete.fisico,
    tecnico: athlete.tecnico,
    tatico: athlete.tatico,
    mental: athlete.mental,
    trainingXp: athlete.trainingXp,
    freePoints: athlete.freePoints,
    lastFocus: athlete.lastFocus,
    focusStreak: athlete.focusStreak,
    nextTrainFocus: athlete.nextTrainFocus,
  };
}

function toAttributes(r: Record<Focus, number>): Attributes {
  return { fisico: r.fisico, tecnico: r.tecnico, tatico: r.tatico, mental: r.mental };
}

function toProgress(
  attributes: Attributes,
  trainingXp: number,
  freePoints: number,
  lastFocus: string | null,
  focusStreak: number,
): Progress {
  return {
    attributes,
    trainingXp,
    freePoints,
    overall: overall(attributes),
    nextThreshold: nextThreshold(pointsEarnedTotal(attributes, freePoints)),
    lastFocus,
    focusStreak,
    // Rendimento que a PRÓXIMA sessão teria se repetisse `lastFocus` (repeats = focusStreak).
    nextFocusPenaltyPct: repeatPenaltyPct(focusStreak),
  };
}
