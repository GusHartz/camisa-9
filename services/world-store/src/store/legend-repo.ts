// Hall of Fame + elegibilidade do Regen (SPEC-022, card Regen). `archiveLegend` congela uma
// carreira encerrada (idempotente); `readLegends` lê o Hall of Fame; `readRegenEligible` lista as
// ocupações que devem renascer na virada — idade ≥ forçado (42), OU regen VOLUNTÁRIO pedido (flag)
// com idade ≥ 25. A idade é o relógio de carreira (envelhece +1/temporada, imune — SPEC-021).
import { and, desc, eq, gte, or } from 'drizzle-orm';
import type { Db } from '../client.js';
import { athlete, worldOccupation } from '../schema/world.js';
import { legend } from '../schema/legend.js';
import { REGEN_AGE } from './regen-age.js';

export interface LegendInput {
  readonly worldSeed: string;
  readonly humanAthleteId: string;
  readonly seasonEnded: string;
  readonly humanName: string;
  readonly clubId: string;
  readonly position: string;
  readonly ability: number;
  readonly age: number;
  readonly legacyPoints: number;
}

export type LegendView = typeof legend.$inferSelect;

/** Arquiva uma carreira no Hall of Fame. Idempotente: re-arquivar a mesma
 *  `(world_seed, human_athlete_id, season_ended)` é no-op (a lenda é imutável). */
export async function archiveLegend(db: Db, input: LegendInput): Promise<void> {
  await db.insert(legend).values(input).onConflictDoNothing();
}

/** O Hall of Fame de um mundo (todas as lendas, mais recente primeiro). */
export async function readLegends(db: Db, worldSeed: string): Promise<LegendView[]> {
  return db
    .select()
    .from(legend)
    .where(eq(legend.worldSeed, worldSeed))
    .orderBy(desc(legend.createdAt));
}

/** Candidato a regen: a ocupação + a idade (o relógio de carreira). */
export interface RegenCandidate {
  readonly worldSeed: string;
  readonly athleteId: string;
  readonly humanAthleteId: string;
  readonly clubId: string;
  readonly position: string;
  readonly ability: number;
  readonly humanName: string;
  readonly seasonId: string;
  readonly age: number;
}

/** As ocupações elegíveis a regen (SPEC-022): idade ≥ FORÇADO (42) OU (regen_requested E idade ≥
 *  VOLUNTÁRIO 25). Autoridade server-side; o `runRegenPass` consome pós-virada (em gênese). */
export async function readRegenEligible(db: Db, worldSeed: string): Promise<RegenCandidate[]> {
  return db
    .select({
      worldSeed: worldOccupation.worldSeed,
      athleteId: worldOccupation.athleteId,
      humanAthleteId: worldOccupation.humanAthleteId,
      clubId: worldOccupation.clubId,
      position: worldOccupation.position,
      ability: worldOccupation.ability,
      humanName: worldOccupation.humanName,
      seasonId: worldOccupation.seasonId,
      age: athlete.age,
    })
    .from(worldOccupation)
    .innerJoin(
      athlete,
      and(
        eq(athlete.worldSeed, worldOccupation.worldSeed),
        eq(athlete.id, worldOccupation.athleteId),
      ),
    )
    .where(
      and(
        eq(worldOccupation.worldSeed, worldSeed),
        or(
          gte(athlete.age, REGEN_AGE.forced),
          and(eq(worldOccupation.regenRequested, true), gte(athlete.age, REGEN_AGE.voluntary)),
        ),
      ),
    );
}
