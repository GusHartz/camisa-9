// A costura do Regen (SPEC-022, card Regen). Roda PÓS-VIRADA (a temporada nova nasce em gênese):
// para cada carreira elegível (idade ≥42, ou regen voluntário ≥25), encerra → arquiva a lenda no
// Hall of Fame → renasce no MESMO clube (reset de atributos + nome novo + banco de legado). Borda
// IMPURA, sem transação cross-schema (sequencial best-effort idempotente): o player renasce, o
// mundo reatribui a MESMA vaga numa ÚNICA transação (sem janela órfã — a ocupação nunca é
// deletada). O gate de compra é um SEAM (`canRegen`, default permitido). A viragem da SPEC-021
// fica intocada (decouple). Erros GENÉRICOS, sem SQL/stack (OP-11).
import {
  abilityFromFocos,
  isPosition,
  CREATION_TOTAL,
  FOCI,
  type Attributes,
} from '@camisa-9/player';
import { athleteName } from '@camisa-9/world-engine';
import {
  archiveLegend,
  reassignSlot,
  readRegenEligible,
  type Db as WorldDb,
  type LegendInput,
  type RegenCandidate,
} from '@camisa-9/world-store';
import { rebirthAthlete, type Db as PlayerDb } from '@camisa-9/player-store';

/** O reset: o renascido nasce jovem, overall uniforme. Deriva da lib (CREATION_TOTAL/FOCI) — UMA
 *  fonte de verdade com a criação: um rebalanceio da criação arrasta o reset junto (sem drift). */
const RESET_FOCO = Math.floor(CREATION_TOTAL / FOCI.length);
const RESET_ATTRIBUTES: Attributes = {
  fisico: RESET_FOCO,
  tecnico: RESET_FOCO,
  tatico: RESET_FOCO,
  mental: RESET_FOCO,
};

/** Seam de FOMO/compra (SPEC-022): decide se um humano PODE regenerar. Default = sempre permitido
 *  (grátis) — a cobrança real (Steam/entitlement) é fatia futura, sem churn de callers. */
export type RegenGate = (candidate: RegenCandidate) => boolean;
const allowAll: RegenGate = () => true;

export type RegenOutcome = 'regenerated' | 'skipped';

/**
 * Renascimento de UMA carreira. Recuperável por passe: se falhar ANTES do reassign, o candidato
 * segue elegível (idade não-resetada) e o próximo passe o reencontra; rebirth/archive/reassign são
 * idempotentes (rebirth devolve o ativo se o velho já é inativo; archive é no-op por PK; reassign
 * reseta a idade → deixa de ser elegível). Sem janela órfã: a ocupação nunca é deletada.
 */
export async function regenAthlete(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  candidate: RegenCandidate,
  canRegen: RegenGate = allowAll,
): Promise<RegenOutcome> {
  if (!canRegen(candidate)) return 'skipped';
  const position = candidate.position;
  if (!isPosition(position)) throw new Error('posição inválida na ocupação');
  const newName = athleteName(`${candidate.humanAthleteId}:${candidate.seasonId}`);
  // 1) player: velho → inativo (a lenda), nasce o novo ativo com o banco de legado.
  const { newAthleteId, legacyPoints } = await rebirthAthlete(
    playerDb,
    candidate.humanAthleteId,
    newName,
    RESET_ATTRIBUTES,
  );
  // 2) mundo: congela a lenda (idempotente por PK).
  await archiveLegend(worldDb, legendOf(candidate, legacyPoints));
  // 3) mundo: reatribui a MESMA vaga ao renascido numa ÚNICA transação (sem janela órfã).
  await reassignSlot(worldDb, {
    worldSeed: candidate.worldSeed,
    slotAthleteId: candidate.athleteId,
    newHumanAthleteId: newAthleteId,
    humanName: newName,
    ability: abilityFromFocos(RESET_ATTRIBUTES, position),
  });
  return 'regenerated';
}

/** Congela a carreira ENCERRADA (dados do velho) no Hall of Fame. */
function legendOf(candidate: RegenCandidate, legacyPoints: number): LegendInput {
  return {
    worldSeed: candidate.worldSeed,
    humanAthleteId: candidate.humanAthleteId,
    seasonEnded: candidate.seasonId,
    humanName: candidate.humanName,
    clubId: candidate.clubId,
    position: candidate.position,
    ability: candidate.ability,
    age: candidate.age,
    legacyPoints,
  };
}

/** Passe de Regen PÓS-VIRADA: regenera todas as carreiras elegíveis. Devolve quantas regeneraram.
 *  Idempotente no nível do passe (re-rodar não acha elegíveis já processados). Isolamento por
 *  candidato: um regen que falha NÃO aborta o passe (best-effort) — a ocupação antiga sobrevive,
 *  o candidato segue elegível, o próximo passe reencontra. */
export async function runRegenPass(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  canRegen: RegenGate = allowAll,
): Promise<number> {
  const eligible = await readRegenEligible(worldDb, seed);
  let count = 0;
  for (const c of eligible) {
    try {
      if ((await regenAthlete(worldDb, playerDb, c, canRegen)) === 'regenerated') count += 1;
    } catch {
      // OP-11: log GENÉRICO, sem SQL/DSN/stack. Adiado = ausência de mutação; retenta no próximo passe.
      console.error(`regen adiado (world=${seed}) — regen_failed`);
    }
  }
  return count;
}
