// A costura da PARTIDA (SPEC-029 + SPEC-046): produz o `WorldModulator` que o `runDailyRound` injeta.
// Lê as ocupações humanas (world-store) + forma/moral + FOCOS vivos (player-store) e aplica in-memory:
// (1) a ability EFETIVA (`effectiveAbility` da base CONGELADA + forma/moral) via `applyMoodToWorld`, e
// (2) as AFINIDADES de papel (SPEC-046: Técnico→finishing, Tático→playmaking, Físico→durability) via
// `applyHumanTraits` — o que pondera o sorteio de gol/assistência/lesão pelos atributos. Só leituras
// (sem tx cross-schema); a base congelada (SPEC-020) fica intacta. Sem humanos → no-op (mundo NPC igual).
import { effectiveAbility } from '@camisa-9/player';
import {
  applyHumanTraits,
  applyMoodToWorld,
  readWorldOccupations,
  type Db as WorldDb,
  type HumanTraits,
  type WorldModulator,
} from '@camisa-9/world-store';
import { readFocosByIds, readMoodByIds, type Db as PlayerDb } from '@camisa-9/player-store';

/** O `WorldModulator` que o `runDailyRound` injeta: modula a ability (forma/moral) E as afinidades de
 *  papel (focos vivos) dos humanos ocupantes, in-memory. A base da ability é a congelada (`o.ability`);
 *  as afinidades vêm dos focos VIVOS (o treino paga na hora, sem re-bake da força). */
export function moodModulator(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  worldSeed: string,
): WorldModulator {
  return async (world) => {
    const occupations = await readWorldOccupations(worldDb, worldSeed);
    if (occupations.length === 0) return world; // mundo sem humanos → no-op
    const humanIds = occupations.map((o) => o.humanAthleteId);
    const [moods, focos] = await Promise.all([
      readMoodByIds(playerDb, humanIds),
      readFocosByIds(playerDb, humanIds),
    ]);
    const abilityByAthleteId = new Map<string, number>();
    const traitsByAthleteId = new Map<string, HumanTraits>();
    for (const o of occupations) {
      const m = moods.get(o.humanAthleteId);
      if (m) abilityByAthleteId.set(o.athleteId, effectiveAbility(o.ability, m.forma, m.moral));
      const f = focos.get(o.humanAthleteId);
      if (f) {
        // Técnico→finishing, Tático→playmaking, Físico→durability. A ability já leva a forma/moral.
        traitsByAthleteId.set(o.athleteId, {
          finishing: f.tecnico,
          playmaking: f.tatico,
          durability: f.fisico,
        });
      }
    }
    return applyHumanTraits(applyMoodToWorld(world, abilityByAthleteId), traitsByAthleteId);
  };
}
