// A costura da PARTIDA (SPEC-029 + SPEC-046 + SPEC-047): produz o `WorldModulator` que o `runDailyRound`
// injeta. Lê as ocupações humanas (world-store) + forma/moral + FOCOS vivos (player-store) e aplica
// in-memory: (1) a ability EFETIVA (`effectiveAbility` do overall VIVO + forma/moral) via
// `applyMoodToWorld`, e (2) as AFINIDADES de papel (SPEC-046: Técnico→finishing, Tático→playmaking,
// Físico→durability) via `applyHumanTraits`. Só leituras (sem tx cross-schema); a base congelada
// (SPEC-020) NÃO é reescrita (o re-bake é in-memory). Sem humanos → no-op (mundo NPC igual).
//
// SPEC-047 (re-bake): a base da ability deixou de ser a CONGELADA (`o.ability`) e passou a ser o overall
// VIVO (`abilityFromFocos` dos focos atuais — a mesma fn que a SPEC-020 usou para congelar) → o treino
// fortalece o TIME (clubStrength → melhores RESULTADOS), não só os eventos/nota. Fallback ao congelado
// se os focos faltarem.
import { abilityFromFocos, effectiveAbility, isPosition } from '@camisa-9/player';
import {
  applyHumanTraits,
  applyMoodToWorld,
  readWorldOccupations,
  type Db as WorldDb,
  type HumanTraits,
  type WorldModulator,
} from '@camisa-9/world-store';
import { readFocosByIds, readMoodByIds, type Db as PlayerDb } from '@camisa-9/player-store';

/** O `WorldModulator` que o `runDailyRound` injeta: modula a ability (overall VIVO + forma/moral) E as
 *  afinidades de papel (focos vivos) dos humanos ocupantes, in-memory. O treino paga na hora — nos
 *  eventos/nota (SPEC-046) E na FORÇA do clube (SPEC-047). */
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
      const f = focos.get(o.humanAthleteId);
      if (m) {
        // SPEC-047: a base é o overall VIVO (abilityFromFocos), não mais o congelado. Fallback ao
        // congelado se faltarem os focos OU a posição for corrompida (a coluna é `text` sem CHECK —
        // `isPosition` guarda em vez do cast cru, senão um valor fora do domínio derrubaria a rodada
        // do MUNDO inteira, sem isolamento). A ability efetiva ainda leva a forma/moral por cima.
        const base = f && isPosition(o.position) ? abilityFromFocos(f, o.position) : o.ability;
        abilityByAthleteId.set(o.athleteId, effectiveAbility(base, m.forma, m.moral));
      }
      if (f) {
        // Técnico→finishing, Tático→playmaking, Físico→durability (SPEC-046).
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
