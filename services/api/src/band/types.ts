// O CONTRATO `BandState` (SPEC-038) — o dia inteiro do atleta que a faixa desenha, numa resposta só.
// ⚠️ CONGELADO em `/v1` sob política ADITIVA-ONLY: campo novo pode aparecer; campo existente NUNCA
// muda de tipo nem some; `null` = "não se aplica", jamais "não sei". É por isso que `trainedToday`,
// `minClientVersion` e `shirtNumber` estão FORA (omitidos, não fingidos) — entram aditivamente nos
// cards seguintes sem quebrar o cliente. O `DayPhase` é reusado da lib pura (fonte única).
import type { DayPhase } from '@camisa-9/player';

export type { DayPhase };

/** O relógio do servidor — o cliente calcula a virada de fase localmente a partir do `epochMs`. */
export interface BandTime {
  readonly epochMs: number;
  readonly dayIndex: number;
  readonly brtHour: number;
  readonly brtMinute: number;
  /** A rodada do dia já liquidou? (`readTickCursor >= slot.dayIndex`). */
  readonly roundSettled: boolean;
}

/** Aparência autoritativa do humano logado (índices de paleta; o card 4 deriva as camadas). */
export interface BandAppearance {
  readonly skinTone: number;
  readonly hairStyle: number;
  readonly hairColor: number;
}

export interface BandAthlete {
  readonly id: string;
  readonly name: string;
  readonly position: string;
  readonly appearance: BandAppearance;
  readonly overall: number;
  /** `null` sem vaga no mundo (a idade é o relógio de carreira, vive no overlay do mundo). */
  readonly age: number | null;
  readonly available: boolean;
}

/** As DUAS barras persistentes do R4. ⚠️ Exatamente estas duas — nunca fôlego (cortado no R4 FINAL). */
export interface BandBars {
  readonly forma: number;
  readonly moral: number;
}

export interface BandAttributes {
  readonly fisico: number;
  readonly tecnico: number;
  readonly tatico: number;
  readonly mental: number;
}

export interface BandTraining {
  readonly attributes: BandAttributes;
  readonly trainingXp: number;
  readonly nextThreshold: number;
  readonly freePoints: number;
  readonly lastFocus: string | null;
  readonly focusStreak: number;
  /** 100 = fresco; o rendimento da próxima sessão (a cena do CT). */
  readonly nextFocusPenaltyPct: number;
}

export interface BandHome {
  readonly balance: number;
  readonly lifestyleTier: number;
  readonly hasMothersHouse: boolean;
  readonly ownedItemIds: readonly string[];
}

export interface BandInjury {
  readonly severity: 'leve' | 'media' | 'grave';
  readonly startedDay: number;
  readonly recoveryDays: number;
  readonly phase: 'recuperando' | 'recuperado';
  readonly daysLeft: number;
}

/** O uniforme do clube — DERIVADO do `clubId` (o mundo NPC não grava kit). Índices de paleta. */
export interface BandKit {
  readonly primaryColor: number;
  readonly secondaryColor: number;
  readonly crest: number;
}

/** O jogo do dia. PRÉ-JOGO: só o adversário (do fixture). PÓS-JOGO: `played` + o placar. */
export interface BandMatch {
  readonly opponentClubId: string;
  readonly opponentName: string;
  readonly isHome: boolean;
  readonly played: boolean;
  readonly goalsFor: number | null;
  readonly goalsAgainst: number | null;
}

export interface BandClub {
  readonly clubId: string;
  readonly name: string;
  readonly leagueId: string;
  readonly tier: number;
  readonly position: string;
  readonly seasonId: string;
  readonly kit: BandKit;
  /** `null` fora de temporada (antes do dia 1 ou depois da última rodada). */
  readonly round: number | null;
  readonly lastActiveDay: number | null;
  readonly frozenSinceDay: number | null;
  /** `null` se não congelado ("não se aplica"). */
  readonly daysUntilRevert: number | null;
  readonly todayMatch: BandMatch | null;
}

export interface BandMate {
  readonly athleteId: string;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly ability: number;
  readonly isHuman: boolean;
  readonly isMe: boolean;
  /** = o `athleteId` do mundo; o cliente deriva as camadas (card 4). */
  readonly avatarSeed: string;
}

export interface BandQueue {
  readonly rank: number;
  readonly total: number;
}

export interface BandState {
  readonly contractVersion: 'v1';
  readonly serverTime: BandTime;
  readonly phase: DayPhase;
  readonly athlete: BandAthlete;
  readonly bars: BandBars;
  readonly training: BandTraining;
  readonly home: BandHome;
  readonly injury: BandInjury | null;
  /** `null` = sem vaga (fila / benched / mundo ausente). */
  readonly club: BandClub | null;
  /** `[]` quando `club === null`. */
  readonly squad: readonly BandMate[];
  /** CONTAGEM (i18n: zero prosa na API). */
  readonly pendingDecisions: number;
  /** Só quando `club === null` e o atleta está na fila. */
  readonly queue: BandQueue | null;
}
