// Transferência do humano (SPEC-033, card 1.4 — Fatia 1). Dois pedaços de borda:
//  (1) `transferOccupation` — o MOVE ATÔMICO: numa ÚNICA transação ocupa a vaga do NPC mais fraco
//      da posição no clube-alvo E reverte a vaga de ORIGEM a NPC. SEM janela órfã (a lição da
//      SPEC-022): se o occupy no destino falha, o rollback devolve tudo (o humano fica). Roda na
//      JANELA DE GÊNESE (guarda de gênese) — molde do regen. Carrega a IDADE de carreira (≠ regen,
//      que reseta a 17). Reusa os helpers do occupation-repo (uma corrida serializada pela vaga).
//  (2) `pickTransferDestination` — a heurística PURA de destino: um clube de tier melhor-ou-igual
//      (≠ o atual) que PRECISA da posição (a vaga mais fraca lá é mais fraca que o humano), escolhido
//      DETERMINISTICAMENTE por seed. Sem candidato → null (a proposta "não vinga").
import { and, eq } from 'drizzle-orm';
import { WORLD, type Position, type WorldState } from '@camisa-9/world-engine';
import { isPosition } from '@camisa-9/player';
import type { Db } from '../client.js';
import { athlete, worldOccupation } from '../schema/world.js';
import {
  OccupyError,
  acquireSeasonStartLock,
  assertGenesis,
  isUniqueViolation,
  weakestNpcSlotAt,
  worldSeasonId,
} from './occupation-repo.js';

export interface TransferInput {
  readonly worldSeed: string;
  readonly humanAthleteId: string;
  readonly toClubId: string;
  /** A ability VIVA a gravar na nova vaga (SPEC-033 fix): a transferência reconhece o crescimento —
   *  o overall dos focos ATUAIS, não a ability congelada da entrada. Consistente com o gatilho da
   *  proposta (que usa o overall vivo). */
  readonly ability: number;
}

export interface TransferResult {
  readonly fromSlotAthleteId: string;
  readonly toSlotAthleteId: string;
  readonly clubId: string;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type OccupationRow = typeof worldOccupation.$inferSelect;

/** Move o humano da vaga atual para o clube-alvo, numa transação all-or-nothing (sem janela órfã). */
export async function transferOccupation(db: Db, input: TransferInput): Promise<TransferResult> {
  try {
    return await db.transaction(async (tx) => {
      const seasonId = await worldSeasonId(tx, input.worldSeed);
      await acquireSeasonStartLock(tx, seasonId);
      await assertGenesis(tx, seasonId); // só na gênese (o snapshot é imutável na temporada)
      const occ = await lockOrigin(tx, input);
      const toSlotId = await weakestNpcSlotAt(tx, input.worldSeed, input.toClubId, occ.position);
      await applyMove(tx, input, occ, toSlotId, seasonId);
      return {
        fromSlotAthleteId: occ.athleteId,
        toSlotAthleteId: toSlotId,
        clubId: input.toClubId,
      };
    });
  } catch (err) {
    if (err instanceof OccupyError) throw err;
    if (isUniqueViolation(err)) throw new OccupyError('destino já ocupado');
    throw new OccupyError('não foi possível transferir');
  }
}

/** Trava e valida a ocupação de ORIGEM (FOR UPDATE). Destino igual / posição inválida → erro. */
async function lockOrigin(
  tx: Tx,
  input: TransferInput,
): Promise<OccupationRow & { position: Position }> {
  const [occ] = await tx
    .select()
    .from(worldOccupation)
    .where(
      and(
        eq(worldOccupation.worldSeed, input.worldSeed),
        eq(worldOccupation.humanAthleteId, input.humanAthleteId),
      ),
    )
    .limit(1)
    .for('update');
  if (!occ) throw new OccupyError('ocupação de origem não encontrada');
  if (occ.clubId === input.toClubId) throw new OccupyError('destino igual à origem');
  if (!isPosition(occ.position)) throw new OccupyError('posição inválida na ocupação');
  return { ...occ, position: occ.position };
}

/** As 4 escritas do MOVE (na tx): ocupa o destino (carregando a idade de carreira — NÃO reseta como
 *  o regen), reverte a origem a NPC, e move a linha de ocupação (dropa a antiga, insere a nova). */
async function applyMove(
  tx: Tx,
  input: TransferInput,
  occ: OccupationRow,
  toSlotId: string,
  seasonId: string,
): Promise<void> {
  const [fromRow] = await tx
    .select({ age: athlete.age })
    .from(athlete)
    .where(and(eq(athlete.worldSeed, input.worldSeed), eq(athlete.id, occ.athleteId)))
    .limit(1);
  const careerAge = fromRow?.age ?? WORLD.youthAge; // a idade de carreira segue com o humano
  await tx
    .update(athlete)
    .set({ name: occ.humanName, ability: input.ability, isHuman: true, age: careerAge })
    .where(and(eq(athlete.worldSeed, input.worldSeed), eq(athlete.id, toSlotId)));
  // reverte a ORIGEM a NPC (identidade de NPC restaurada na próxima viragem — como o vacateSlot)
  await tx
    .update(athlete)
    .set({ isHuman: false })
    .where(and(eq(athlete.worldSeed, input.worldSeed), eq(athlete.id, occ.athleteId)));
  await tx
    .delete(worldOccupation)
    .where(
      and(
        eq(worldOccupation.worldSeed, input.worldSeed),
        eq(worldOccupation.athleteId, occ.athleteId),
      ),
    );
  await tx.insert(worldOccupation).values({
    worldSeed: input.worldSeed,
    athleteId: toSlotId,
    humanAthleteId: input.humanAthleteId,
    seasonId,
    clubId: input.toClubId,
    position: occ.position,
    humanName: occ.humanName,
    ability: input.ability,
    regenRequested: occ.regenRequested,
    lastActiveDay: occ.lastActiveDay,
    frozenSinceDay: occ.frozenSinceDay,
  });
}

/**
 * Escolhe o clube-alvo (determinístico por seed) — um clube de tier melhor-ou-igual (≠ o atual) que
 * PRECISA da posição (a vaga mais fraca lá é mais fraca que o humano → ele melhora o destino). Puro.
 * Sem candidato → null. (A disponibilidade real de vaga NPC é garantida no `transferOccupation`.)
 */
export function pickTransferDestination(
  world: WorldState,
  fromClubId: string,
  position: Position,
  humanAbility: number,
  humanAthleteId: string,
  seed: string,
  humanSlotIds: ReadonlySet<string>,
): string | null {
  const fromTier = tierOfClub(world, fromClubId);
  if (fromTier === null) return null;
  const eligible: string[] = [];
  for (const t of world.tiers) {
    if (t.tier > fromTier) continue; // só melhor-ou-igual (nº menor de tier = divisão melhor)
    for (const l of t.leagues) {
      for (const c of l.clubs) {
        if (c.id === fromClubId) continue;
        // a vaga NPC mais fraca (exclui slots HUMANOS) — casa com o `weakestNpcSlotAt` do move, que
        // só troca NPC. Sem isso, o pick contaria um humano fraco e o move enfraqueceria o destino
        // (trocando um NPC forte) ou LANÇARIA (sem vaga NPC) deixando a proposta presa (revisão MAJOR).
        const weakest = weakestNpcAbilityAt(c.roster, position, humanSlotIds);
        if (weakest !== null && weakest < humanAbility) eligible.push(c.id);
      }
    }
  }
  if (eligible.length === 0) return null;
  return eligible.reduce((best, id) =>
    hash(`${seed}:${humanAthleteId}:${id}`) < hash(`${seed}:${humanAthleteId}:${best}`) ? id : best,
  );
}

function tierOfClub(world: WorldState, clubId: string): number | null {
  for (const t of world.tiers) {
    for (const l of t.leagues) {
      for (const c of l.clubs) if (c.id === clubId) return t.tier;
    }
  }
  return null;
}

function weakestNpcAbilityAt(
  roster: WorldState['tiers'][number]['leagues'][number]['clubs'][number]['roster'],
  position: Position,
  humanSlotIds: ReadonlySet<string>,
): number | null {
  let min: number | null = null;
  for (const a of roster) {
    if (a.position !== position || humanSlotIds.has(a.id)) continue; // só vagas NPC da posição
    if (min === null || a.ability < min) min = a.ability;
  }
  return min;
}

/** Hash determinístico de string (borda; fora do guardrail). Só p/ desempate estável do destino. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}
