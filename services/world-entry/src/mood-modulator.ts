// A costura de FORMA/MORAL na PARTIDA (SPEC-029, fatia B): produz o `WorldModulator` que o
// `runDailyRound` injeta. Lê as ocupações humanas (world-store) + forma/moral (player-store),
// projeta a ability EFETIVA (lib PURA `effectiveAbility`) a partir da base CONGELADA e aplica
// in-memory via `applyMoodToWorld`. Só leituras (sem transação cross-schema); a base congelada
// (SPEC-020) fica intacta — nada é persistido. Sem humanos → no-op (o mundo NPC fica idêntico).
import { effectiveAbility } from '@camisa-9/player';
import {
  applyMoodToWorld,
  readWorldOccupations,
  type Db as WorldDb,
  type WorldModulator,
} from '@camisa-9/world-store';
import { readMoodByIds, type Db as PlayerDb } from '@camisa-9/player-store';

/** O `WorldModulator` que o `runDailyRound` injeta: modula a ability dos humanos ocupantes por
 *  forma/moral (in-memory). A base é a ability congelada (`o.ability`); forma/moral vêm do player. */
export function moodModulator(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  worldSeed: string,
): WorldModulator {
  return async (world) => {
    const occupations = await readWorldOccupations(worldDb, worldSeed);
    if (occupations.length === 0) return world; // mundo sem humanos → no-op
    const moods = await readMoodByIds(
      playerDb,
      occupations.map((o) => o.humanAthleteId),
    );
    const abilityByAthleteId = new Map<string, number>();
    for (const o of occupations) {
      const m = moods.get(o.humanAthleteId);
      if (m) abilityByAthleteId.set(o.athleteId, effectiveAbility(o.ability, m.forma, m.moral));
    }
    return applyMoodToWorld(world, abilityByAthleteId);
  };
}
