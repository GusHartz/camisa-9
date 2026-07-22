// O lado PLAYER do agregador (SPEC-038): transforma as leituras do player-store nas fatias do
// contrato. Puro — recebe valores já lidos (a orquestração das queries mora em `band-state.ts`).
import {
  injuryPhase,
  daysLeftOf,
  shirtNumber,
  templateById,
  PURCHASES,
  canAfford,
  validatePurchase,
} from '@camisa-9/player';
import type {
  AthleteIdentity,
  ClosedSeason,
  InjuryState,
  Mood,
  PendingDecision,
  Progress,
  Wallet,
} from '@camisa-9/player-store';
import type {
  BandAthlete,
  BandBars,
  BandDecision,
  BandHome,
  BandInjury,
  BandSeasonSummary,
  BandPurchase,
  BandTraining,
} from './types.js';

/** O núcleo do atleta. `age` vem do MUNDO (o overlay tem o relógio de carreira); `null` sem vaga.
 *  `canRegen` (SPEC-045) é DICA calculada no agregador (tem vaga + idade ≥ mínima). */
export function buildAthlete(
  id: string,
  identity: AthleteIdentity,
  progress: Progress,
  available: boolean,
  age: number | null,
  canRegen: boolean,
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
    canRegen,
  };
}

/** As decisões pendentes → o contrato (SPEC-045). Hidrata `prompt`/`options` do catálogo por
 *  `templateId` (a fonte única); uma linha cujo template não existe mais (catálogo editado) é
 *  descartada — nunca uma decisão sem texto/opções. Preserva a ordem (`ord`) do repo. */
export function buildDecisions(rows: readonly PendingDecision[]): BandDecision[] {
  const out: BandDecision[] = [];
  for (const row of rows) {
    const t = templateById(row.templateId);
    if (!t) continue;
    out.push({
      id: row.id,
      templateId: t.id,
      type: t.type,
      prompt: t.prompt,
      options: t.options.map((o) => ({ id: o.id, label: o.label })),
    });
  }
  return out;
}

/** O catálogo ABERTO orientado ao atleta (SPEC-045): todo `PURCHASES` com `owned`/`affordable`/
 *  `available`. `available` = `validatePurchase.ok` (a autoridade da regra, reusada); é DICA — a
 *  compra revalida sob `FOR UPDATE` no player-store. */
export function buildCatalog(wallet: Wallet): BandPurchase[] {
  return PURCHASES.map((p) => ({
    id: p.id,
    name: p.name,
    cost: p.cost,
    kind: p.kind,
    housingTier: p.housingTier ?? null,
    owned: wallet.ownedItemIds.includes(p.id),
    affordable: canAfford(wallet.balance, p.id),
    available: validatePurchase(wallet.balance, wallet.ownedItemIds, p.id).ok,
  }));
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
    catalog: buildCatalog(wallet),
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

/**
 * A última campanha FECHADA da conta → contrato (SPEC-053). `undefined` = nenhuma ainda, e a chave
 * simplesmente some do payload (regra aditiva-only da SPEC-038: nunca `null` fingido).
 *
 * As notas ficam em DÉCIMOS inteiros até a borda — o storage soma inteiro ao longo de 38 rodadas
 * para não acumular drift de float; dividir por 10 é apresentação, e é do cliente.
 */
export function buildLastSeason(
  row: ClosedSeason | null,
  careerSeasons: number,
): BandSeasonSummary | undefined {
  if (!row) return undefined;
  return {
    seasonId: row.seasonId,
    seasonNumber: careerSeasons,
    clubName: row.clubName,
    position: row.position,
    tier: row.tier,
    tierAfter: row.tierAfter,
    outcome: row.outcome,
    matches: row.matches,
    goals: row.goals,
    assists: row.assists,
    ratingAvg: row.matches > 0 ? Math.round(row.ratingSum / row.matches) : null,
    ratingBest: row.ratingBest,
    ratingBestRound: row.ratingBestRound,
    startOverall: row.startOverall,
    endOverall: row.endOverall,
    firstRound: row.firstRound,
    careerSeasons,
  };
}
