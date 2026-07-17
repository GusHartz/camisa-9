// Reatribuição atômica da vaga no Regen (SPEC-022 — card Regen). Quando uma carreira encerra e o
// atleta renasce, a MESMA vaga do mundo é reapontada ao renascido numa ÚNICA transação: reseta a
// linha do atleta-mundo (jovem, ability resetada, segue humano) e reaponta a ocupação ao novo
// humano (temporada atual, flag de regen limpa). Diferente de vacate+reoccupy, a linha de ocupação
// NUNCA é deletada — sem janela órfã entre soltar e reocupar: se algo falhar ANTES daqui, o
// candidato segue elegível (idade não-resetada) e o próximo passe o reencontra. Erros genéricos
// (OP-11); transação só-no-mundo (a costura cross-schema é sequencial na borda services/regen).
import { and, eq } from 'drizzle-orm';
import { WORLD } from '@camisa-9/world-engine';
import type { Db } from '../client.js';
import { athlete, world, worldOccupation } from '../schema/world.js';
import { publishedRound } from '../schema/round.js';
import { OccupyError } from './occupation-repo.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface ReassignInput {
  readonly worldSeed: string;
  /** A vaga (linha do atleta-mundo) que o velho ocupava — `RegenCandidate.athleteId`. */
  readonly slotAthleteId: string;
  /** O id (player-store) do renascido — vira o novo dono da ocupação. */
  readonly newHumanAthleteId: string;
  readonly humanName: string;
  readonly ability: number;
}

/** Reaponta a vaga ao renascido, numa transação all-or-nothing. Idade → 17 (relógio de carreira
 *  reiniciado → deixa de ser elegível a regen = idempotência natural do passe). */
export async function reassignSlot(db: Db, input: ReassignInput): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ seasonId: world.seasonId })
      .from(world)
      .where(eq(world.seed, input.worldSeed))
      .limit(1);
    const seasonId = rows[0]?.seasonId;
    if (seasonId === undefined) throw new OccupyError('mundo não encontrado');
    // Guarda da GÊNESE (mesmo invariante do occupyNpcSlot): o reset muta a `ability` do atleta-mundo
    // → se a temporada já publicou rodada, a re-simulação a cada tick reescreveria rounds já
    // publicados. O passe roda pós-virada (gênese) por design; guardar aqui blinda o snapshot contra
    // um scheduler futuro que chame fora de hora (falha → o candidato retenta na próxima gênese).
    await assertGenesis(tx, seasonId);
    await tx
      .update(athlete)
      .set({ name: input.humanName, ability: input.ability, age: WORLD.youthAge, isHuman: true })
      .where(and(eq(athlete.worldSeed, input.worldSeed), eq(athlete.id, input.slotAthleteId)));
    const updated = await tx
      .update(worldOccupation)
      .set({
        humanAthleteId: input.newHumanAthleteId,
        humanName: input.humanName,
        ability: input.ability,
        seasonId,
        regenRequested: false,
      })
      .where(
        and(
          eq(worldOccupation.worldSeed, input.worldSeed),
          eq(worldOccupation.athleteId, input.slotAthleteId),
        ),
      )
      .returning({ id: worldOccupation.athleteId });
    if (updated.length !== 1) throw new OccupyError('vaga de regen não encontrada');
  });
}

/** A temporada NÃO pode ter rodada publicada (senão o reset mutaria um snapshot em andamento). */
async function assertGenesis(tx: Tx, seasonId: string): Promise<void> {
  const rows = await tx
    .select({ round: publishedRound.round })
    .from(publishedRound)
    .where(eq(publishedRound.seasonId, seasonId))
    .limit(1);
  if (rows.length > 0) throw new OccupyError('temporada em andamento — regen só na gênese');
}
