// Economia da carreira (SPEC-024, card 2.8) — pura/determinística, sob o guardrail. O desempenho
// vira poder de compra: salário por rodada (f(overall)) + prêmios; um catálogo ABERTO de compras
// com trade-off DECLARADO (a aplicação é da 2.3/F2 — aqui só DADO, "nunca loja de stats"); a escada
// de moradia (o patrimônio da faixa) + o marco da casa da mãe. Inteiro em tudo. Zero I/O.

export type MatchResult = 'win' | 'draw' | 'loss';

/** Perfil de trade-off DECLARADO de uma compra (seam): deltas por estado nomeado (moral/fama/
 *  quimica/risco/…). NÃO é aplicado aqui — a 2.3/F2 consome via `aggregateTradeoffs`. */
export type Tradeoff = Readonly<Record<string, number>>;

export type PurchaseKind = 'item' | 'housing' | 'milestone';

export interface Purchase {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly kind: PurchaseKind;
  /** Só p/ `housing`: o degrau (1..N) na escada. `pensao` = 0 (o começo, não é compra). */
  readonly housingTier?: number;
  readonly tradeoff: Tradeoff;
}

export type PurchaseCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: string; readonly code: string };

/** Tunáveis da economia — TODA a calibração vive aqui (rebalanceia sem tocar lógica). Inteiro. */
export const ECONOMY = {
  /** Salário/rodada = base + overall × porOverall (pingo diário; ~38 rodadas/temporada). */
  salaryBase: 5,
  salaryPerOverall: 3,
  /** Prêmio por partida (vitória > empate > derrota ≥ 0). */
  prize: { win: 200, draw: 60, loss: 0 },
} as const;

/** A escada de moradia (o patrimônio da faixa). Índice = tier; `pensao` (0) é o começo (não-compra). */
export const HOUSING_LADDER = ['pensao', 'quitinete', 'casa', 'cobertura'] as const;

/** O marco emocional (fora da escada) — comprar liga `hasMothersHouse` (o card é seam). */
export const MOTHERS_HOUSE_ID = 'casa-da-mae';

/**
 * Catálogo ABERTO (tunável). Cada item declara custo + trade-off (DADO, não aplicado — a 2.3/F2
 * aplica). Editar aqui adiciona/ajusta compras sem tocar lógica. Itens são 1× (possuir = conjunto).
 * Os trade-offs miram ESTADOS (moral/fama/quimica/risco) e podem tocar focos SÓ como trade-off
 * (com downside — ex.: academia = +fisico/−quimica); nunca um boost puro comprável.
 */
export const PURCHASES: readonly Purchase[] = [
  {
    id: 'videogame',
    name: 'Videogame',
    cost: 500,
    kind: 'item',
    tradeoff: { moral: 8, fisico: -3 },
  },
  {
    id: 'academia',
    name: 'Academia em casa',
    cost: 1500,
    kind: 'item',
    tradeoff: { fisico: 6, quimica: -5 },
  },
  {
    id: 'carro',
    name: 'Carro',
    cost: 3000,
    kind: 'item',
    tradeoff: { moral: 10, fama: 8, risco: 2 },
  },
  {
    id: 'quitinete',
    name: 'Quitinete',
    cost: 2000,
    kind: 'housing',
    housingTier: 1,
    tradeoff: { moral: 5 },
  },
  {
    id: 'casa',
    name: 'Casa',
    cost: 8000,
    kind: 'housing',
    housingTier: 2,
    tradeoff: { moral: 10 },
  },
  {
    id: 'cobertura',
    name: 'Cobertura',
    cost: 25000,
    kind: 'housing',
    housingTier: 3,
    tradeoff: { moral: 15, fama: 10 },
  },
  {
    id: MOTHERS_HOUSE_ID,
    name: 'Casa da mãe',
    cost: 15000,
    kind: 'milestone',
    tradeoff: { moral: 25 },
  },
] as const;

/** Salário de UMA rodada (inteiro; cresce com o overall). */
export function salaryPerRound(overall: number): number {
  return ECONOMY.salaryBase + Math.max(0, overall) * ECONOMY.salaryPerOverall;
}

/** Prêmio de UMA partida pelo resultado. */
export function matchPrize(result: MatchResult): number {
  return ECONOMY.prize[result];
}

/** Ganho da rodada = salário + prêmio (o resultado é opcional = seam do mundo). */
export function roundEarnings(overall: number, result?: MatchResult): number {
  return salaryPerRound(overall) + (result ? matchPrize(result) : 0);
}

export function purchaseById(id: string): Purchase | undefined {
  return PURCHASES.find((p) => p.id === id);
}

export function isHousing(id: string): boolean {
  return purchaseById(id)?.kind === 'housing';
}

/** O degrau de moradia de um item (0 se não for moradia). */
export function housingTierOf(id: string): number {
  return purchaseById(id)?.housingTier ?? 0;
}

/** O tier de patrimônio = o MAIOR degrau de moradia possuído (pensão 0 se nenhum). */
export function lifestyleTier(ownedIds: readonly string[]): number {
  let tier = 0;
  for (const id of ownedIds) tier = Math.max(tier, housingTierOf(id));
  return tier;
}

/** O marco da casa da mãe foi alcançado? */
export function hasMothersHouse(ownedIds: readonly string[]): boolean {
  return ownedIds.includes(MOTHERS_HOUSE_ID);
}

/** O agregado dos trade-offs DECLARADOS das compras possuídas — o único ponto de plugue p/ a
 *  2.3/F2 (que aplica). Aqui só SOMA o dado; nada é escrito em atributo. Inteiro. */
export function aggregateTradeoffs(ownedIds: readonly string[]): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const id of ownedIds) {
    const item = purchaseById(id);
    if (!item) continue;
    for (const [key, delta] of Object.entries(item.tradeoff)) {
      agg[key] = (agg[key] ?? 0) + delta;
    }
  }
  return agg;
}

export function canAfford(balance: number, id: string): boolean {
  const item = purchaseById(id);
  return item !== undefined && item.cost <= balance;
}

/** Validação PURA da compra: existe / não possui (1×) / moradia é o PRÓXIMO degrau / tem saldo.
 *  A borda (player-store) revalida sob `FOR UPDATE` — esta é a autoridade da regra. */
export function validatePurchase(
  balance: number,
  ownedIds: readonly string[],
  id: string,
): PurchaseCheck {
  const item = purchaseById(id);
  if (!item) return { ok: false, reason: 'item inválido', code: 'item_invalid' };
  if (ownedIds.includes(id))
    return { ok: false, reason: 'item já adquirido', code: 'already_owned' };
  if (item.kind === 'housing' && item.housingTier !== lifestyleTier(ownedIds) + 1) {
    return { ok: false, reason: 'moradia fora de ordem', code: 'housing_out_of_order' };
  }
  if (item.cost > balance)
    return { ok: false, reason: 'saldo insuficiente', code: 'insufficient_balance' };
  return { ok: true };
}
