// Lesões narrativas — o ARCO (SPEC-026, card 2.5) — puro/determinístico, sob o guardrail. Uma lesão
// tem gravidade → dias de recuperação; o arco é contusão → recuperando (até started+recoveryDays) →
// recuperado (a "volta por cima", um bônus DECLARADO = seam). A OCORRÊNCIA é seam (a partida rica
// injeta — card 1.1/3.2). A disponibilidade (indisponível enquanto recuperando) é DADO (o mundo lê).
// Inteiro em tudo (comparações de dia). Zero I/O.
import type { DecisionOutcome } from './decisions.js';

export type Severity = 'leve' | 'media' | 'grave';

/** Tunáveis das lesões — a calibração vive aqui (rebalanceia sem tocar lógica). */
export const INJURY = {
  /** Gravidade → dias fora (recuperação). */
  recoveryDays: { leve: 3, media: 10, grave: 30 },
  /** A "volta por cima" — bônus DECLARADO como CONSTANTE (seam; NÃO persistido aqui). A 2.3
   *  (Forma/Moral) o deriva desta constante ao detectar o evento `recovered`. Nunca punição cega. */
  comeback: { moral: 12 } as DecisionOutcome,
} as const;

export interface Injury {
  readonly severity: Severity;
  readonly startedDay: number;
  readonly recoveryDays: number;
}

export function isSeverity(v: string): v is Severity {
  return v === 'leve' || v === 'media' || v === 'grave';
}

export function recoveryDaysFor(severity: Severity): number {
  return INJURY.recoveryDays[severity];
}

/** O dia em que a recuperação termina (started + recoveryDays). */
export function injuryEndDay(injury: Injury): number {
  return injury.startedDay + injury.recoveryDays;
}

/** A fase do arco: recuperando até o fim do prazo, recuperado depois. */
export function injuryPhase(injury: Injury, currentDay: number): 'recuperando' | 'recuperado' {
  return currentDay >= injuryEndDay(injury) ? 'recuperado' : 'recuperando';
}

/** Disponível para jogar? Sem lesão ativa OU já recuperado. Enquanto recuperando = indisponível
 *  (o SEAM que o mundo/partida lê para tirar o humano do jogo). */
export function isAvailable(injury: Injury | null, currentDay: number): boolean {
  return injury === null || injuryPhase(injury, currentDay) === 'recuperado';
}

/** O outcome DECLARADO da volta por cima (constante-seam; a 2.3 o aplica no evento `recovered`). */
export function comebackOutcome(): DecisionOutcome {
  return INJURY.comeback;
}
