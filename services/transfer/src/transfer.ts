// A costura de Transferência (SPEC-033 — card 1.4, Fatia 1). Roda na JANELA DE GÊNESE (o scheduler
// chama junto do regen): para cada ocupação humana com a proposta ACEITA (`transfer_requested` no
// player-store), escolhe o destino (heurística pura, NPC-only, força VIVA) e MOVE o humano de clube
// (o primitivo atômico do world-store) — depois RACHA o quinteto. Sem candidato → limpa (não vingou).
//
// AT-MOST-ONCE (revisão): a flag é limpa ANTES do move — o move NÃO é idempotente (re-escolhe destino,
// excluindo o clube atual), então um crash entre o move e a limpeza moveria EM DOBRO; limpar antes
// troca isso por "perde a transferência num crash raro" (re-ofertada), nunca corrompe o snapshot.
// A força VIVA (o overall dos focos ATUAIS) casa com o gatilho da proposta e é gravada na nova vaga
// (a transferência reconhece o crescimento). O mundo + os slots humanos são lidos FRESCOS por-candidato.
import { abilityFromFocos, isPosition } from '@camisa-9/player';
import {
  pickTransferDestination,
  readWorld,
  readWorldOccupations,
  transferOccupation,
  type Db as WorldDb,
  type OccupationView,
} from '@camisa-9/world-store';
import {
  clearTransferRequested,
  leaveTeam,
  readAthleteIdentity,
  readTransferRequested,
  type Db as PlayerDb,
} from '@camisa-9/player-store';

/** Executa as transferências ACEITAS pendentes (pós-viragem). Devolve quantas moveram. */
export async function runTransferPass(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
): Promise<number> {
  const occupations = await readWorldOccupations(worldDb, seed);
  let count = 0;
  for (const occ of occupations) {
    try {
      if (await transferOne(worldDb, playerDb, seed, occ)) count += 1;
    } catch {
      // OP-11: log genérico. Adiado = ausência de move; a flag preservada retenta no próximo passe.
      console.error(`transferência adiada (world=${seed}) — transfer_failed`);
    }
  }
  return count;
}

/** Move UM humano se ele aceitou. Sem pendência → no-op; sem destino → limpa (não vingou). */
async function transferOne(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  occ: OccupationView,
): Promise<boolean> {
  const id = occ.humanAthleteId;
  if (!(await readTransferRequested(playerDb, id))) return false;
  const position = occ.position;
  if (!isPosition(position)) {
    await clearTransferRequested(playerDb, id);
    return false;
  }
  const identity = await readAthleteIdentity(playerDb, id);
  if (!identity) {
    await clearTransferRequested(playerDb, id);
    return false;
  }
  // a força VIVA (overall dos focos ATUAIS) — o gatilho da proposta usa isso; o destino/move também.
  const liveAbility = abilityFromFocos(identity.attributes, position);
  // mundo + slots humanos FRESCOS por-candidato (transferências anteriores no passe já contam).
  const world = await readWorld(worldDb, seed);
  if (!world) return false;
  const humanSlotIds = new Set((await readWorldOccupations(worldDb, seed)).map((o) => o.athleteId));
  const dest = pickTransferDestination(
    world,
    occ.clubId,
    position,
    liveAbility,
    id,
    seed,
    humanSlotIds,
  );
  if (dest === null) {
    await clearTransferRequested(playerDb, id); // a proposta não vingou (sem destino)
    return false;
  }
  // clear-first (AT-MOST-ONCE): nunca move em dobro. Se o move lançar, a flag já limpa → não trava.
  await clearTransferRequested(playerDb, id);
  await transferOccupation(worldDb, {
    worldSeed: seed,
    humanAthleteId: id,
    toClubId: dest,
    ability: liveAbility,
  });
  await leaveTeam(playerDb, id); // o quinteto racha, após o move (no-op se solo)
  return true;
}
