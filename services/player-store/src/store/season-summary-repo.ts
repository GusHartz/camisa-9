// A campanha da temporada (SPEC-053) — acúmulo DIÁRIO no tick + fecho na viragem. Existe porque a
// viragem sobrescreve o snapshot do mundo (SPEC-021) e porque o `overall` do início da temporada é
// irrecuperável depois. Notas em DÉCIMOS inteiros (`matchRating` devolve 30..100) — dividir por 10
// é apresentação, nunca storage. SÓ player-store (zero cross-schema). Erros GENÉRICOS (OP-11).
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { athlete } from '../schema/athlete.js';
import { dailyLedger } from '../schema/daily-ledger.js';
import { seasonSummary } from '../schema/season-summary.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** O que uma partida do dia acrescenta à campanha. `rating`/`overall` são medidos AGORA (no tick),
 *  que é o ponto da fatia: depois da viragem nada disso é recomputável. */
export interface SeasonMatchInput {
  readonly seasonId: string;
  readonly round: number;
  readonly day: number;
  /** Snapshot do mundo — a viragem apaga o original. */
  readonly clubId: string;
  readonly clubName: string;
  readonly leagueId: string;
  readonly tier: number;
  readonly position: string;
  /** Do atleta NA partida. */
  readonly goals: number;
  readonly assists: number;
  /** A nota da partida, em DÉCIMOS (30..100). */
  readonly rating: number;
  /** O overall do atleta HOJE (`abilityFromFocos`) — a linha EVOLUÇÃO do card. */
  readonly overall: number;
}

export type SeasonOutcome = 'champion' | 'promoted' | 'stayed' | 'relegated';

export interface OpenSeason {
  readonly athleteId: string;
  readonly seasonId: string;
  readonly clubId: string;
  readonly leagueId: string;
}

export interface ClosedSeason {
  readonly seasonId: string;
  readonly clubName: string;
  readonly position: string;
  readonly tier: number;
  readonly tierAfter: number | null;
  readonly outcome: SeasonOutcome;
  readonly matches: number;
  readonly goals: number;
  readonly assists: number;
  readonly ratingSum: number;
  readonly ratingBest: number | null;
  readonly ratingBestRound: number | null;
  readonly firstRound: number | null;
  readonly startOverall: number;
  readonly endOverall: number;
}

/**
 * Soma a partida do dia à campanha da temporada — **1× por dia**, reivindicado pelo escopo
 * `'season'` do `daily_ledger` (a coluna `scope` é `text` livre: sem migration no ledger, molde do
 * `'train'` da SPEC-041). O claim e o upsert commitam JUNTOS, então o catch-up, um retry ou uma
 * republicação não somam um gol sequer. `counted: false` = o dia já estava contado.
 */
export async function accrueSeasonMatch(
  db: Db,
  athleteId: string,
  input: SeasonMatchInput,
): Promise<{ counted: boolean }> {
  try {
    return await db.transaction(async (tx) => {
      // FOR UPDATE serializa o read-modify-write (mesma razão do accrueRound/applyTraining) e de
      // quebra entrega o `account_id` — a carreira é da CONTA, não do atleta (o regen troca o atleta).
      const [row] = await tx
        .select({ accountId: athlete.accountId })
        .from(athlete)
        .where(eq(athlete.id, athleteId))
        .limit(1)
        .for('update');
      if (!row) throw new Error('atleta não encontrado');
      if (!(await claimSeasonDay(tx, athleteId, input.day))) return { counted: false };
      await upsertMatch(tx, athleteId, row.accountId, input);
      return { counted: true };
    });
  } catch (err) {
    // OP-11: constraint do pg vira mensagem genérica; a causa fica só para log server-side.
    if (isConstraintViolation(err)) throw new Error('não foi possível somar a partida', { cause: err });
    throw err;
  }
}

/** Reivindica o dia no ledger (escopo `'season'`). `false` = já contado → o caller faz no-op. */
async function claimSeasonDay(tx: Tx, athleteId: string, day: number): Promise<boolean> {
  const claimed = await tx
    .insert(dailyLedger)
    .values({ athleteId, day, scope: 'season' })
    .onConflictDoNothing()
    .returning({ athleteId: dailyLedger.athleteId });
  return claimed.length > 0;
}

/**
 * INSERT na estreia, incremento no conflito. As colunas de PRIMEIRA ESCRITA (clube, liga, tier,
 * posição, `start_overall`, `first_round`, `rating_first`) **não entram no `set`** — o INSERT as
 * grava uma vez e o conflito nunca as toca.
 *
 * ⚠️ Sem `excluded`: o drizzle deste repo não o expõe. Dentro de `ON CONFLICT DO UPDATE SET`,
 * `${seasonSummary.col}` resolve para o valor da linha EXISTENTE e os valores de entrada entram
 * como bound params — o idioma do `tick-progress-repo`.
 */
async function upsertMatch(
  tx: Tx,
  athleteId: string,
  accountId: string,
  i: SeasonMatchInput,
): Promise<void> {
  // O `case when` do recorde precisa comparar contra o MESMO valor antigo nas duas colunas; dentro
  // do SET todas as expressões enxergam a linha pré-update, então nota e rodada ficam coerentes.
  const isRecord = sql`${seasonSummary.ratingBest} is null or ${i.rating} > ${seasonSummary.ratingBest}`;
  await tx
    .insert(seasonSummary)
    .values({
      athleteId,
      accountId,
      seasonId: i.seasonId,
      clubId: i.clubId,
      clubName: i.clubName,
      leagueId: i.leagueId,
      tier: i.tier,
      position: i.position,
      matches: 1,
      goals: i.goals,
      assists: i.assists,
      ratingSum: i.rating,
      ratingBest: i.rating,
      ratingBestRound: i.round,
      ratingFirst: i.rating,
      ratingLast: i.rating,
      firstRound: i.round,
      lastRound: i.round,
      startOverall: i.overall,
      endOverall: i.overall,
    })
    .onConflictDoUpdate({
      target: [seasonSummary.athleteId, seasonSummary.seasonId],
      set: {
        matches: sql`${seasonSummary.matches} + 1`,
        goals: sql`${seasonSummary.goals} + ${i.goals}`,
        assists: sql`${seasonSummary.assists} + ${i.assists}`,
        ratingSum: sql`${seasonSummary.ratingSum} + ${i.rating}`,
        ratingBest: sql`case when ${isRecord} then ${i.rating} else ${seasonSummary.ratingBest} end`,
        ratingBestRound: sql`case when ${isRecord} then ${i.round} else ${seasonSummary.ratingBestRound} end`,
        ratingLast: i.rating,
        lastRound: i.round,
        endOverall: i.overall, // reescrito todo dia de jogo: o fecho não tem de onde recalcular
      },
    });
}

/**
 * As campanhas que ainda não fecharam e **não são a temporada corrente** — a lista de trabalho do
 * passe de fecho. Dirigida pela LINHA (não pelas ocupações, que o regen troca; nem pelo `seasonId`
 * do tick, que significa coisas opostas em `season_rolled` e `before_season`).
 */
export async function readOpenSeasonsBefore(
  db: Db,
  currentSeasonId: string,
): Promise<readonly OpenSeason[]> {
  return db
    .select({
      athleteId: seasonSummary.athleteId,
      seasonId: seasonSummary.seasonId,
      clubId: seasonSummary.clubId,
      leagueId: seasonSummary.leagueId,
    })
    .from(seasonSummary)
    .where(and(isNull(seasonSummary.closedAt), ne(seasonSummary.seasonId, currentSeasonId)));
}

/** Fecha a campanha. Idempotente por construção: só toca linha com `closed_at IS NULL`. */
export async function closeSeason(
  db: Db,
  athleteId: string,
  seasonId: string,
  result: { outcome: SeasonOutcome; tierAfter: number | null },
): Promise<{ closed: boolean }> {
  const rows = await db
    .update(seasonSummary)
    .set({ outcome: result.outcome, tierAfter: result.tierAfter, closedAt: new Date() })
    .where(
      and(
        eq(seasonSummary.athleteId, athleteId),
        eq(seasonSummary.seasonId, seasonId),
        isNull(seasonSummary.closedAt),
      ),
    )
    .returning({ athleteId: seasonSummary.athleteId });
  return { closed: rows.length > 0 };
}

/** A última campanha FECHADA da CONTA (não do atleta: depois do regen o atleta ativo é outro, e a
 *  carreira anterior é justamente a que o card quer contar). */
export async function readLastClosedSeason(
  db: Db,
  accountId: string,
): Promise<ClosedSeason | null> {
  const [r] = await db
    .select()
    .from(seasonSummary)
    .where(and(eq(seasonSummary.accountId, accountId), sql`${seasonSummary.closedAt} is not null`))
    .orderBy(desc(seasonSummary.closedAt))
    .limit(1);
  if (!r || !isOutcome(r.outcome)) return null;
  return {
    seasonId: r.seasonId,
    clubName: r.clubName,
    position: r.position,
    tier: r.tier,
    tierAfter: r.tierAfter,
    outcome: r.outcome,
    matches: r.matches,
    goals: r.goals,
    assists: r.assists,
    ratingSum: r.ratingSum,
    ratingBest: r.ratingBest,
    ratingBestRound: r.ratingBestRound,
    firstRound: r.firstRound,
    startOverall: r.startOverall,
    endOverall: r.endOverall,
  };
}

/** Quantas temporadas a CONTA já fechou — o "3ª TEMPORADA" do card, através dos renascimentos. */
export async function countCareerSeasons(db: Db, accountId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasonSummary)
    .where(and(eq(seasonSummary.accountId, accountId), sql`${seasonSummary.closedAt} is not null`));
  return r?.n ?? 0;
}

function isOutcome(v: string | null): v is SeasonOutcome {
  return v === 'champion' || v === 'promoted' || v === 'stayed' || v === 'relegated';
}

/** Constraint do pg — o Drizzle envelopa, então o `code` fica na cadeia de causas (OP-14: sem `any`). */
function isConstraintViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && isRecordLike(cur); i++) {
    const code = cur['code'];
    if (code === '23505' || code === '23514' || code === '23503' || code === '22003') return true;
    cur = cur['cause'];
  }
  return false;
}

function isRecordLike(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
