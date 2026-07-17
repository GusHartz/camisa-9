// Forma & Moral — as DUAS barras persistentes do R4 (SPEC-027, card 2.3) — puras/determinísticas,
// sob o guardrail. Modelo "baseline + offset + evento que decai": cada barra é [0,100], baseline 50;
// os EVENTOS (decisão/comeback/treino) entram como bumps na FONTE (o repo), e o passe diário faz a
// barra DECAIR rumo ao alvo — Moral rumo a `baseline + offset do estilo de vida` (as compras
// possuídas, enquanto possuídas); Forma rumo a `baseline` (rebaixado enquanto recuperando de lesão).
// A aplicação na PARTIDA (effectiveAbility) é a fatia B (SPEC-028). Inteiro em tudo. Zero I/O.

/** Tunáveis das barras — a calibração vive aqui (rebalanceia sem tocar lógica). Inteiro. */
export const MOOD = {
  /** O centro neutro das duas barras. */
  baseline: 50,
  min: 0,
  max: 100,
  /** Passo diário rumo ao alvo (o decay). */
  decayStep: 5,
  /** Limite (±) do offset de Moral que o estilo de vida (compras) pode empurrar. */
  lifestyleClamp: 30,
  /** Quanto a lesão recuperando rebaixa o alvo da Forma. */
  injuryFormaDrag: 20,
  /** Bump de Forma por sessão de treino (evento-na-fonte). > decayStep para o treino render NET
   *  positivo mesmo num dia em que o passe roda depois (o "treino sobe forma" do R4). */
  trainFormaBump: 6,
} as const;

/** Prende um valor de barra em [min,max]. */
export function clampBar(v: number): number {
  return Math.max(MOOD.min, Math.min(MOOD.max, v));
}

/** Um passo inteiro de `current` rumo a `target` (nunca ultrapassa; alvo clampeado). Monotônico. */
export function stepToward(current: number, target: number, step: number): number {
  const t = clampBar(target);
  if (current < t) return Math.min(t, current + step);
  if (current > t) return Math.max(t, current - step);
  return current;
}

/** Aplica um delta de EVENTO (na fonte) a uma barra, clampeado. */
export function bumpBar(current: number, delta: number): number {
  return clampBar(current + delta);
}

/** O offset de Moral do estilo de vida = o componente `moral` do agregado de trade-offs das compras
 *  possuídas, LIMITADO a ±`lifestyleClamp` (comprar tudo não estoura a barra). */
export function lifestyleMoralOffset(tradeoffAgg: Record<string, number>): number {
  const raw = tradeoffAgg['moral'] ?? 0;
  return Math.max(-MOOD.lifestyleClamp, Math.min(MOOD.lifestyleClamp, raw));
}

/** O passo diário da Moral: decai rumo a `baseline + offset do estilo de vida`. Os eventos (decisão/
 *  comeback) já entraram como bumps na fonte — o passe só puxa de volta ao alvo. */
export function nextMoral(current: number, lifestyleOffset: number): number {
  return stepToward(current, MOOD.baseline + lifestyleOffset, MOOD.decayStep);
}

/** O passo diário da Forma: decai rumo a `baseline` (ou `baseline − injuryFormaDrag` enquanto
 *  recuperando de lesão — o driver da lesão). O treino entra como bump na fonte (`trainFormaBump`). */
export function nextForma(current: number, injuredRecovering: boolean): number {
  const target = MOOD.baseline - (injuredRecovering ? MOOD.injuryFormaDrag : 0);
  return stepToward(current, target, MOOD.decayStep);
}
