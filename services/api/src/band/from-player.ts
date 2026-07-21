// O lado PLAYER do agregador (SPEC-038): transforma as leituras do player-store nas fatias do
// contrato. Puro — recebe valores já lidos (a orquestração das queries mora em `band-state.ts`).
import { injuryPhase, daysLeftOf, shirtNumber } from '@camisa-9/player';
import type { AthleteIdentity, InjuryState, Mood, Progress, Wallet } from '@camisa-9/player-store';
import type { BandAthlete, BandBars, BandHome, BandInjury, BandTraining } from './types.js';

/** O núcleo do atleta. `age` vem do MUNDO (o overlay tem o relógio de carreira); `null` sem vaga. */
export function buildAthlete(
  id: string,
  identity: AthleteIdentity,
  progress: Progress,
  available: boolean,
  age: number | null,
): BandAthlete {
  return {
    id,
    name: identity.name,
    position: identity.position,
    appearance: {
      skinTone: identity.appearance.skinTone,
      hairStyle: identity.appearance.hairStyle,
      hairColor: identity.appearance.hairColor,
    },
    overall: progress.overall,
    age,
    available,
    // Número da camisa DERIVADO da posição (SPEC-040) — sem escolha, sem coluna; fn pura.
    number: shirtNumber(identity.position, id),
  };
}

export function buildBars(mood: Mood): BandBars {
  return { forma: mood.forma, moral: mood.moral };
}

export function buildTraining(progress: Progress): BandTraining {
  return {
    attributes: {
      fisico: progress.attributes.fisico,
      tecnico: progress.attributes.tecnico,
      tatico: progress.attributes.tatico,
      mental: progress.attributes.mental,
    },
    trainingXp: progress.trainingXp,
    nextThreshold: progress.nextThreshold,
    freePoints: progress.freePoints,
    lastFocus: progress.lastFocus,
    focusStreak: progress.focusStreak,
    nextFocusPenaltyPct: progress.nextFocusPenaltyPct,
  };
}

export function buildHome(wallet: Wallet): BandHome {
  return {
    balance: wallet.balance,
    lifestyleTier: wallet.lifestyleTier,
    hasMothersHouse: wallet.hasMothersHouse,
    ownedItemIds: wallet.ownedItemIds,
  };
}

/** O arco da lesão. `null` quando não há lesão ativa. A fase e o `daysLeft` vêm das fns PURAS da
 *  lib (reusadas, não reimplementadas), no espaço `tickDay` (o mesmo que o passe de recuperação usa). */
export function buildInjury(state: InjuryState, tickDay: number): BandInjury | null {
  const inj = state.injury;
  if (!inj) return null;
  return {
    severity: inj.severity,
    startedDay: inj.startedDay,
    recoveryDays: inj.recoveryDays,
    phase: injuryPhase(inj, tickDay),
    daysLeft: daysLeftOf(inj.startedDay, inj.recoveryDays, tickDay),
  };
}
