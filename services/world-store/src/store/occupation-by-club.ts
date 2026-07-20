// Ocupações humanas de UM clube (SPEC-038) — a faixa cruza `isHuman` do elenco sem puxar o mundo
// inteiro. Mora em arquivo próprio porque o `occupation-repo.ts` já está em 303 linhas físicas
// (OP-16); reusa o `OccupationView`/`toOccupationView` de lá.
import { and, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { worldOccupation } from '../schema/world.js';
import { toOccupationView, type OccupationView } from './occupation-repo.js';

/** As ocupações humanas de um clube específico — o subconjunto do `readWorldOccupations` filtrado
 *  por `clubId`. O agregador cruza estes `athleteId` com o `readClubSquad` para marcar `isHuman`. */
export async function readOccupationsByClub(
  db: Db,
  worldSeed: string,
  clubId: string,
): Promise<OccupationView[]> {
  const rows = await db
    .select()
    .from(worldOccupation)
    .where(and(eq(worldOccupation.worldSeed, worldSeed), eq(worldOccupation.clubId, clubId)));
  return rows.map(toOccupationView);
}
