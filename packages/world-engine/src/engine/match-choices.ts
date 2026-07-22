// Motor de ESCOLHAS na partida (SPEC-048, roadmap 3.2 fatia 1) — puro/determinístico, sob o guardrail.
// O análogo das decisões das 18h (SPEC-025), mas ANCORADO na timeline da partida (SPEC-043): 1-5
// escolhas + ≤1 intervenção por tempo, orientadas ao HUMANO (a partir da sua participação). É uma fn
// PURA (padrão `matchRating` da SPEC-046) — o agregador a computa para o humano; NUNCA roda na
// simulação, então `resolveMatch`/`simulateSeason` e os goldens ficam intocados. O `effect` de cada
// opção é DADO declarado (seam) — a APLICAÇÃO (moral/atributos) é fatia futura. Zero I/O.
import { createRng, deriveSeed, nextInt, nextUint32, type RngState } from './prng.js';
import type { Seed } from '../types.js';

/** Efeito DECLARADO de uma opção (seam) — molde do `DecisionOutcome` (SPEC-025): números (moral/fama/
 *  risco) ou rótulos (`focusBias: 'tatico'`). NÃO é aplicado aqui. */
export type ChoiceEffect = Readonly<Record<string, number | string>>;

/** O foco que pondera o roll de uma opção arriscada (SPEC-050). */
export type ChoiceAttr = 'fisico' | 'tecnico' | 'tatico' | 'mental';

export interface MatchChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly effect: ChoiceEffect;
  /** A opção de baixo risco/status-quo — o fallback se o jogador não escolher (a fatia de resposta usa). */
  readonly conservative?: boolean;
  /** Opção ARRISCADA (SPEC-050): resolvida por roll (atributo+moral) — sucesso → `effect`, falha →
   *  `fail`. Ausente = determinística. Nunca coexiste com `conservative` (invariante testada). */
  readonly risky?: { readonly attr: ChoiceAttr; readonly fail: ChoiceEffect };
}

/** Uma escolha GERADA para a partida: o minuto (na timeline) + o tempo + o template + as opções. */
export interface MatchChoice {
  readonly minute: number;
  readonly half: 1 | 2;
  readonly templateId: string;
  readonly type: string;
  readonly prompt: string;
  readonly options: readonly MatchChoiceOption[];
}

/** A participação do humano na partida (derivada da timeline publicada) — o gatilho das escolhas. */
export interface MatchChoiceContext {
  /** Minutos dos gols DO humano (comemoração). */
  readonly goalMinutes: readonly number[];
  /** Minutos dos gols SOFRIDOS pelo clube do humano (reação a provocação). */
  readonly concededMinutes: readonly number[];
  /** Minuto de uma lesão de um COMPANHEIRO (não o humano) no clube (ajudar colega), ou `null`. */
  readonly clubInjuredMinute: number | null;
  /** Resultado (V/E/D) — SEAM RESERVADO: threaded, mas nenhum template ainda o lê (um template
   *  result-gated, ex.: "perdendo no fim, arrisca tudo?", entra numa iteração futura do catálogo). */
  readonly result: 'win' | 'draw' | 'loss';
}

/** Quantas escolhas por partida (mín..máx). */
export const CHOICES_PER_MATCH = { min: 1, max: 5 } as const;
const MATCH_MINUTES = 90;

export interface ChoiceTemplate {
  readonly id: string;
  readonly type: string;
  readonly prompt: string;
  readonly options: readonly MatchChoiceOption[];
  /** Conta para o cap de ≤1 por tempo (uma intervenção tática por tempo). */
  readonly intervention: boolean;
  /** Momento SEU (gol/lesão/provocação) → prioridade no rank sobre os fillers sempre-ativos, para o
   *  payoff ("você marcou → você comemora") aparecer de forma confiável dentro do teto de 5. */
  readonly salient: boolean;
  readonly trigger: (ctx: MatchChoiceContext) => boolean;
  /** Deriva o minuto do momento (evento da timeline ou lull do tempo). */
  readonly minuteOf: (ctx: MatchChoiceContext, rng: RngState) => number;
}

/** Escolhe um minuto de uma lista não-vazia (ou um lull no range, se vazia). */
function pickMinute(
  minutes: readonly number[],
  fallbackLo: number,
  fallbackHi: number,
  rng: RngState,
): number {
  if (minutes.length > 0) return minutes[nextInt(rng, minutes.length)]!;
  return fallbackLo + nextInt(rng, fallbackHi - fallbackLo + 1);
}

/**
 * Catálogo ABERTO (tunável, molde de `DECISIONS`). Cada template declara gatilho + momento + opções
 * (com `effect` = dado). Editar aqui adiciona/ajusta escolhas sem tocar lógica. As duas INTERVENÇÕES
 * (uma por tempo) disparam sempre → garantem ≥1 escolha mesmo sem participação.
 */
export const MATCH_CHOICES: readonly ChoiceTemplate[] = [
  {
    id: 'comemoracao',
    type: 'comemoracao',
    prompt: 'Você marcou! Como comemora?',
    intervention: false,
    salient: true, // momento SEU (você marcou)
    trigger: (c) => c.goalMinutes.length > 0,
    minuteOf: (c, rng) => pickMinute(c.goalMinutes, 1, MATCH_MINUTES, rng),
    options: [
      {
        id: 'provocar',
        label: 'Provocar a torcida rival',
        effect: { moral: 5, fama: 8, risco: 3 },
        risky: { attr: 'mental', fail: { moral: -3 } },
      },
      {
        id: 'humilde',
        label: 'Comemoração humilde, com o time',
        effect: { moral: 5 },
        conservative: true,
      },
    ],
  },
  {
    id: 'pressao-tecnico',
    type: 'intervencao',
    prompt: 'O técnico manda pressionar mais alto. Você?',
    intervention: true,
    salient: false, // intervenção sempre-ativa
    trigger: () => true,
    minuteOf: (_c, rng) => 20 + nextInt(rng, 20), // lull do 1º tempo (20..39)
    options: [
      {
        id: 'obedecer',
        label: 'Obedecer o esquema',
        effect: { focusBias: 'tatico' },
        conservative: true,
      },
      {
        id: 'meu-jeito',
        label: 'Jogar do meu jeito',
        effect: { moral: 4, risco: 4 },
        risky: { attr: 'tatico', fail: { moral: -4 } },
      },
    ],
  },
  {
    id: 'ajuste-intervalo',
    type: 'intervencao',
    prompt: 'No intervalo, o time precisa reagir. Sua atitude?',
    intervention: true,
    salient: false, // intervenção sempre-ativa
    trigger: () => true,
    minuteOf: () => 46, // o intervalo (início do 2º tempo)
    options: [
      { id: 'puxar', label: 'Puxar o time pra cima', effect: { moral: 6 } },
      {
        id: 'poupar',
        label: 'Poupar energia p/ o fim',
        effect: { focusBias: 'fisico' },
        conservative: true,
      },
    ],
  },
  {
    id: 'provocacao',
    type: 'reacao',
    prompt: 'Um adversário te provoca depois do gol deles. Responde?',
    intervention: false,
    salient: true, // momento SEU (levou gol/provocação)
    trigger: (c) => c.concededMinutes.length > 0,
    minuteOf: (c, rng) => pickMinute(c.concededMinutes, 46, MATCH_MINUTES, rng),
    options: [
      {
        id: 'revidar',
        label: 'Revidar na cara dele',
        effect: { risco: 5, moral: 3 },
        risky: { attr: 'mental', fail: { moral: -5 } },
      },
      { id: 'ignorar', label: 'Ignorar e focar no jogo', effect: { moral: 4 }, conservative: true },
    ],
  },
  {
    id: 'lesao-colega',
    type: 'lesao',
    prompt: 'Um companheiro caiu machucado. Você?',
    intervention: false,
    salient: true, // momento SEU (colega caiu)
    trigger: (c) => c.clubInjuredMinute !== null,
    minuteOf: (c, rng) => c.clubInjuredMinute ?? pickMinute([], 1, MATCH_MINUTES, rng),
    options: [
      { id: 'ajudar', label: 'Ir amparar o colega', effect: { moral: 6 } },
      {
        id: 'focado',
        label: 'Seguir concentrado no jogo',
        effect: { moral: 2 },
        conservative: true,
      },
    ],
  },
  {
    id: 'chance-clara',
    type: 'lance',
    prompt: 'Chance clara na sua frente: chuta de primeira ou domina?',
    intervention: false,
    salient: false, // filler sempre-ativo
    trigger: () => true,
    minuteOf: (_c, rng) => 1 + nextInt(rng, MATCH_MINUTES),
    options: [
      {
        id: 'arriscar',
        label: 'Chutar de primeira',
        effect: { risco: 4, focusBias: 'tecnico' },
        risky: { attr: 'tecnico', fail: { moral: -4 } },
      },
      {
        id: 'seguro',
        label: 'Dominar e jogar seguro',
        effect: { focusBias: 'tatico' },
        conservative: true,
      },
    ],
  },
];

/**
 * Gera as escolhas da partida para o HUMANO. Determinística por `(seed, liga, temporada, rodada, casa,
 * fora, atleta, 'choices')` — stream próprio, disjunto do placar/eventos. 1-5 escolhas, ≤1 intervenção
 * por tempo, cada uma ancorada num minuto da timeline (ou lull do tempo). Cronológica.
 */
export function matchChoices(
  seed: Seed,
  leagueId: string,
  seasonId: string,
  round: number,
  homeId: string,
  awayId: string,
  athleteId: string,
  ctx: MatchChoiceContext,
): MatchChoice[] {
  const base = deriveSeed(seed, leagueId, seasonId, round, homeId, awayId, athleteId, 'choices');
  const rng = createRng(base);
  const candidates = rankByScore(
    MATCH_CHOICES.filter((t) => t.trigger(ctx)),
    base,
  );
  const n =
    CHOICES_PER_MATCH.min + (nextUint32(rng) % (CHOICES_PER_MATCH.max - CHOICES_PER_MATCH.min + 1));
  return select(candidates, n, ctx, rng).sort((a, b) => a.minute - b.minute);
}

/** Rank ESTÁVEL: momentos SEUS (`salient`) primeiro, depois por score (`deriveSeed(base, id)`) — o
 *  score é independente da ordem do catálogo; a salience garante que a comemoração do SEU gol não seja
 *  espremida pelos fillers dentro do teto de 5. Determinístico. */
function rankByScore(templates: readonly ChoiceTemplate[], base: string): ChoiceTemplate[] {
  return templates
    .map((t) => ({ t, score: nextUint32(createRng(deriveSeed(base, t.id))) }))
    .sort(
      (a, b) =>
        Number(b.t.salient) - Number(a.t.salient) ||
        a.score - b.score ||
        (a.t.id < b.t.id ? -1 : 1),
    )
    .map((x) => x.t);
}

/** Seleciona até `n` respeitando ≤1 intervenção por tempo; materializa o minuto/tempo. */
function select(
  ranked: readonly ChoiceTemplate[],
  n: number,
  ctx: MatchChoiceContext,
  rng: RngState,
): MatchChoice[] {
  const chosen: MatchChoice[] = [];
  const interventionHalves = new Set<number>();
  for (const t of ranked) {
    if (chosen.length >= n) break;
    const minute = t.minuteOf(ctx, rng);
    const half: 1 | 2 = minute <= 45 ? 1 : 2;
    if (t.intervention) {
      // ⚠️ cap LATENTE (forward-safety): hoje as 2 intervenções ocupam tempos disjuntos (pressao-
      // tecnico=1º, ajuste-intervalo=2º) → este `continue` só dispara se o catálogo ganhar 2
      // intervenções no MESMO tempo. Não coberto por teste até então.
      if (interventionHalves.has(half)) continue;
      interventionHalves.add(half);
    }
    chosen.push({
      minute,
      half,
      templateId: t.id,
      type: t.type,
      prompt: t.prompt,
      options: t.options,
    });
  }
  return chosen;
}

export function choiceTemplateById(id: string): ChoiceTemplate | undefined {
  return MATCH_CHOICES.find((t) => t.id === id);
}
