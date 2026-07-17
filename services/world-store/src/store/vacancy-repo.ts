// Congelamento de vaga por inatividade (SPEC-023) — a máquina de estados de retenção/escassez
// sobre `world_occupation`. `markActive` grava a atividade (e descongela); `runVacancyPass` roda
// 1×/dia (molde do `runRegenPass`): congela o inativo (e-mail 1× via seam), reverte a NPC aos
// `revertAfterDays` dias, pula o não-rastreado. SÓ-MUNDO (o "benched" preserva a carreira no
// player-store — zero cross-schema). Isolamento por candidato; erros genéricos (OP-11).
//
// ⚠️ Concorrência (revisão SPEC-023): o passe lê um SNAPSHOT (readWorldOccupations, sem lock) para
// ESCOLHER a ação, mas cada mutação RE-CHECA `last_active_day` ao vivo, no próprio WHERE, dentro de
// uma transação — senão um `markActive` concorrente (humano voltando) seria atropelado (expulso do
// mundo / congelado à toa). Como `last_active_day` só CRESCE (markActive), a inatividade só diminui
// entre o snapshot e a mutação: a re-checagem transforma uma decisão obsoleta em no-op seguro. Os
// hooks (onFreeze/onThaw) disparam DENTRO da tx → uma exceção faz ROLLBACK e o próximo passe retenta.
import { and, eq, isNotNull, isNull, lt, lte } from 'drizzle-orm';
import type { Db } from '../client.js';
import { athlete, worldOccupation } from '../schema/world.js';
import { readWorldOccupations } from './occupation-repo.js';
import { VACANCY } from './vacancy-policy.js';

/** Seam de notificação (SPEC-023): default no-op — o e-mail real ("segurando sua camisa") é futuro.
 *  ⚠️ Um sender real deve usar um OUTBOX (grava na tx, envia async), não bloquear a tx com um SMTP. */
export interface VacancyHooks {
  readonly onFreeze?: (humanAthleteId: string) => void | Promise<void>;
  readonly onThaw?: (humanAthleteId: string) => void | Promise<void>;
}

export interface VacancyReport {
  readonly frozen: number;
  readonly reverted: number;
}

export interface VacancyState {
  readonly lastActiveDay: number | null;
  readonly frozenSinceDay: number | null;
}

/** O seam de atividade: grava `last_active_day = day` e DESCONGELA. Atômico (`FOR UPDATE` serializa
 *  contra `freezeOne`); se a vaga estava congelada, dispara `onThaw` dentro da tx (lança → rollback
 *  → retenta). No-op silencioso se o humano não ocupa vaga. Chamado por uma ação futura (login etc.). */
export async function markActive(
  db: Db,
  worldSeed: string,
  humanAthleteId: string,
  day: number,
  onThaw?: (humanAthleteId: string) => void | Promise<void>,
): Promise<{ thawed: boolean }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ frozenSinceDay: worldOccupation.frozenSinceDay })
      .from(worldOccupation)
      .where(byHuman(worldSeed, humanAthleteId))
      .limit(1)
      .for('update');
    const wasFrozen = rows[0]?.frozenSinceDay != null;
    await tx
      .update(worldOccupation)
      .set({ lastActiveDay: day, frozenSinceDay: null })
      .where(byHuman(worldSeed, humanAthleteId));
    if (wasFrozen) await onThaw?.(humanAthleteId);
    return { thawed: wasFrozen };
  });
}

/** O relógio de vacância de um humano (null se não ocupa). Para teste/UI ("faltam X dias"). */
export async function readVacancyState(
  db: Db,
  worldSeed: string,
  humanAthleteId: string,
): Promise<VacancyState | null> {
  const rows = await db
    .select({
      lastActiveDay: worldOccupation.lastActiveDay,
      frozenSinceDay: worldOccupation.frozenSinceDay,
    })
    .from(worldOccupation)
    .where(byHuman(worldSeed, humanAthleteId))
    .limit(1);
  const r = rows[0];
  return r ? { lastActiveDay: r.lastActiveDay, frozenSinceDay: r.frozenSinceDay } : null;
}

/** O passe diário: congela o inativo (e-mail 1×) e reverte a NPC aos `revertAfterDays`. Devolve a
 *  contagem. O DESCONGELAR é do `markActive`. Isolamento por candidato: uma falha (inclusive um hook
 *  que lança → rollback) NÃO aborta o passe — a ocupação sobrevive e o próximo passe reencontra. */
export async function runVacancyPass(
  db: Db,
  worldSeed: string,
  currentDay: number,
  hooks: VacancyHooks = {},
): Promise<VacancyReport> {
  const occupations = await readWorldOccupations(db, worldSeed);
  const report = { frozen: 0, reverted: 0 };
  for (const o of occupations) {
    if (o.lastActiveDay === null) continue; // não rastreado → nunca congela
    const inactive = currentDay - o.lastActiveDay;
    if (inactive < 1) continue; // ativo (ou relógio não-avançado) → nada (o thaw é do markActive)
    try {
      if (inactive >= VACANCY.revertAfterDays) {
        if (await revertIfStale(db, worldSeed, o.athleteId, currentDay)) report.reverted += 1;
      } else if (await freezeOne(db, worldSeed, o.athleteId, currentDay, o.humanAthleteId, hooks)) {
        report.frozen += 1;
      }
    } catch {
      // OP-11: log GENÉRICO, sem SQL/stack. Adiado = sem mutação (rollback); o próximo passe retenta.
      console.error(`vacância adiada (world=${worldSeed}) — vacancy_failed`);
    }
  }
  return report;
}

/** Congela a vaga SE ainda não congelada E ainda inativa ao vivo (fire-once + anti-TOCTOU: `frozen
 *  IS NULL AND last_active_day < currentDay`). `onFreeze` dispara na tx → lança faz ROLLBACK. */
async function freezeOne(
  db: Db,
  worldSeed: string,
  athleteId: string,
  currentDay: number,
  humanAthleteId: string,
  hooks: VacancyHooks,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(worldOccupation)
      .set({ frozenSinceDay: currentDay })
      .where(
        and(
          eq(worldOccupation.worldSeed, worldSeed),
          eq(worldOccupation.athleteId, athleteId),
          isNull(worldOccupation.frozenSinceDay),
          isNotNull(worldOccupation.lastActiveDay),
          lt(worldOccupation.lastActiveDay, currentDay),
        ),
      )
      .returning({ id: worldOccupation.athleteId });
    if (rows.length === 0) return false;
    await hooks.onFreeze?.(humanAthleteId);
    return true;
  });
}

/** Reverte a vaga a NPC SE ainda inativa ao vivo (anti-TOCTOU: `last_active_day <= currentDay −
 *  revertAfterDays`). Deleta a ocupação + `is_human=false` numa tx; um `markActive` concorrente
 *  (humano voltou) invalida o WHERE → no-op (o humano NÃO é expulso). "Benched": não toca o player. */
async function revertIfStale(
  db: Db,
  worldSeed: string,
  athleteId: string,
  currentDay: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(worldOccupation)
      .where(
        and(
          eq(worldOccupation.worldSeed, worldSeed),
          eq(worldOccupation.athleteId, athleteId),
          isNotNull(worldOccupation.lastActiveDay),
          lte(worldOccupation.lastActiveDay, currentDay - VACANCY.revertAfterDays),
        ),
      )
      .returning({ id: worldOccupation.athleteId });
    if (deleted.length === 0) return false;
    await tx
      .update(athlete)
      .set({ isHuman: false })
      .where(and(eq(athlete.worldSeed, worldSeed), eq(athlete.id, athleteId)));
    return true;
  });
}

function byHuman(worldSeed: string, humanAthleteId: string) {
  return and(
    eq(worldOccupation.worldSeed, worldSeed),
    eq(worldOccupation.humanAthleteId, humanAthleteId),
  );
}
