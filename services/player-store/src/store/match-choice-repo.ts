// Escolhas de partida respondidas (SPEC-050) — persistência da RESPOSTA (a oferta é recomputável,
// fn pura do engine). A PK natural `(athlete, season, round, template)` é o árbitro de TODAS as
// corridas: o `INSERT ... ON CONFLICT DO NOTHING` decide retry, double-click e responder×resolver —
// quem venceu o insert aplicou o efeito, o perdedor não aplica NADA (nenhum bump duplo). Moral =
// evento-na-fonte (`bumpMoral` na MESMA tx, SPEC-027; chaves não-numéricas/`fama`/`risco` ficam
// declaradas-inertes no jsonb, precedente das decisions). `focusBias` → `next_train_focus` SÓ
// quando o JOGADOR escolheu (viés de treino é agência — o agente do timeout nunca o seta).
// Erros genéricos (OP-11).
import { and, eq } from 'drizzle-orm';
import { isFocus } from '@camisa-9/player';
import type { Db } from '../client.js';
import { athlete } from '../schema/athlete.js';
import { matchChoice } from '../schema/match-choice.js';
import { bumpMoral } from './mood-repo.js';
import { GameplayError } from './gameplay-error.js';

/** 'success' | 'fail' (arriscada, roll) | 'na' (determinística/conservadora). */
export type ChoiceResult = 'success' | 'fail' | 'na';

/** O efeito APLICADO (snapshot) — tipo ESTRUTURAL (o player-store não depende do world-engine). */
export type ChoiceEffectData = Readonly<Record<string, number | string>>;

export interface MatchChoiceAnswer {
  readonly seasonId: string;
  readonly round: number;
  readonly templateId: string;
  readonly chosenOption: string;
  readonly result: ChoiceResult;
  readonly effect: ChoiceEffectData;
  /** O day-index da PARTIDA (tickDay na rota; day−1 no resolver do timeout). */
  readonly day: number;
  readonly resolvedBy: 'player' | 'agent';
}

export interface MatchChoiceRow {
  readonly seasonId: string;
  readonly round: number;
  readonly templateId: string;
  readonly chosenOption: string;
  readonly result: string;
  readonly effect: ChoiceEffectData;
  readonly resolvedBy: string;
  readonly day: number;
}

/** A via da ROTA (o jogador): conflito na PK → `choice_resolved` (o retry/double-click morre ANTES
 *  de qualquer efeito — a idempotência vem da PK, não do roll). */
export async function answerMatchChoice(
  db: Db,
  athleteId: string,
  answer: MatchChoiceAnswer,
): Promise<void> {
  const inserted = await insertResolved(db, athleteId, answer);
  if (!inserted) throw new GameplayError('choice_resolved', 'escolha já resolvida');
}

/** A via do RESOLVER (o timeout do tick de D+1): o conflito é BENIGNO — `{inserted:false}` e o
 *  loop continua nos DEMAIS templates (um throw aqui abandonaria os restantes para sempre). */
export async function resolveConservative(
  db: Db,
  athleteId: string,
  answer: MatchChoiceAnswer,
): Promise<{ inserted: boolean }> {
  return { inserted: await insertResolved(db, athleteId, answer) };
}

/** O miolo compartilhado: numa tx — INSERT (o claim) → venceu? → bump de moral + (só player) o
 *  viés de treino. Perdeu o insert → NENHUM efeito. */
async function insertResolved(db: Db, athleteId: string, a: MatchChoiceAnswer): Promise<boolean> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .insert(matchChoice)
      .values({
        athleteId,
        seasonId: a.seasonId,
        round: a.round,
        templateId: a.templateId,
        chosenOption: a.chosenOption,
        result: a.result,
        effect: a.effect,
        resolvedBy: a.resolvedBy,
        day: a.day,
      })
      .onConflictDoNothing()
      .returning({ athleteId: matchChoice.athleteId });
    if (claimed.length === 0) return false;
    await bumpMoral(tx, athleteId, moralOf(a.effect));
    const bias = a.effect['focusBias'];
    if (a.resolvedBy === 'player' && isFocus(bias)) {
      await tx.update(athlete).set({ nextTrainFocus: bias }).where(eq(athlete.id, athleteId));
    }
    return true;
  });
}

/** O delta de Moral declarado no efeito (0 se ausente/não-numérico — molde das decisions). */
function moralOf(effect: ChoiceEffectData): number {
  const m = effect['moral'];
  return typeof m === 'number' ? m : 0;
}

/** As respostas do atleta na rodada — a banda anota a oferta; o resolver checa as pendências. */
export async function readMatchChoices(
  db: Db,
  athleteId: string,
  seasonId: string,
  round: number,
): Promise<MatchChoiceRow[]> {
  const rows = await db
    .select({
      seasonId: matchChoice.seasonId,
      round: matchChoice.round,
      templateId: matchChoice.templateId,
      chosenOption: matchChoice.chosenOption,
      result: matchChoice.result,
      effect: matchChoice.effect,
      resolvedBy: matchChoice.resolvedBy,
      day: matchChoice.day,
    })
    .from(matchChoice)
    .where(
      and(
        eq(matchChoice.athleteId, athleteId),
        eq(matchChoice.seasonId, seasonId),
        eq(matchChoice.round, round),
      ),
    );
  return rows;
}
