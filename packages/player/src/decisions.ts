// Motor de decisões de carreira (SPEC-025, card 2.4) — puro/determinístico, sob o guardrail. 3-5
// decisões/dia GATILHADAS por estado (condição pura sobre o `DecisionContext`), escolhidas de um
// catálogo ABERTO de forma reproduzível por `(seed, dia, atleta)`. O `outcome` de cada opção é DADO
// declarado (seam) — a aplicação real (moral) é da 2.3; a transferência é registrada (card 1.4).
// Inteiro em tudo (hash FNV via shifts, sem `Math.random`/transcendentais). Zero I/O.
import { isTransferTarget } from './transfer.js';

export type DecisionType = 'treino' | 'vida' | 'proposta';

/** Outcome DECLARADO de uma opção (seam): dado gravado no log, aplicado por outro sistema (2.3/1.4).
 *  Chaves livres (moral/fama/focusBias/transfer/…) — números OU rótulos (ex.: `transfer: 'rival'`). */
export type DecisionOutcome = Readonly<Record<string, number | string>>;

export interface DecisionOption {
  readonly id: string;
  readonly label: string;
  readonly outcome: DecisionOutcome;
  /** A opção conservadora (status-quo/baixo risco) — o agente aplica às 18h sem resposta. */
  readonly conservative?: boolean;
}

/** Os estados de GATILHO. `age` é seam (param do mundo, opcional); `moral` é seam da 2.3 (ausente
 *  hoje → gatilhos de moral ficam inertes). Os demais são locais do player-store. */
export interface DecisionContext {
  readonly overall: number;
  readonly balance: number;
  readonly lifestyleTier: number;
  readonly age?: number;
  readonly moral?: number;
  readonly injured?: boolean;
  /** Seam do MUNDO (SPEC-033): a divisão (1..4) do clube do humano — gatilha "forte para o tier". */
  readonly tier?: number;
  /** O jogador "testou o mercado" (o `explore`) → mais assediável (baixa o threshold). */
  readonly marketOpen?: boolean;
}

export interface DecisionTemplate {
  readonly id: string;
  readonly type: DecisionType;
  readonly prompt: string;
  readonly trigger: (ctx: DecisionContext) => boolean;
  readonly options: readonly DecisionOption[];
}

/** Uma decisão GERADA (instância do template para o dia). O `prompt`/`options` vêm do catálogo. */
export interface Decision {
  readonly templateId: string;
  readonly type: DecisionType;
  readonly prompt: string;
  readonly options: readonly DecisionOption[];
}

/** Quantas decisões por dia (mín..máx). */
export const DECISIONS_PER_DAY = { min: 3, max: 5 } as const;

/**
 * Catálogo ABERTO (tunável). Cada template declara seu gatilho + opções (com outcome = dado). Editar
 * aqui adiciona/ajusta decisões sem tocar lógica. Gatilhos de MORAL ficam inertes (o contexto não
 * tem moral até a 2.3): `crise-moral` usa `(moral ?? 100)` → nunca dispara hoje, ativa quando a 2.3
 * preencher o contexto. As opções `conservative` são o fallback das 18h.
 */
export const DECISIONS: readonly DecisionTemplate[] = [
  {
    id: 'treino-extra',
    type: 'treino',
    prompt: 'Treino extra hoje ou descanso?',
    trigger: () => true,
    options: [
      { id: 'extra', label: 'Puxar um treino extra', outcome: { moral: -5, focusBias: 'fisico' } },
      { id: 'descanso', label: 'Descansar', outcome: { moral: 5 }, conservative: true },
    ],
  },
  {
    id: 'foco-amanha',
    type: 'treino',
    prompt: 'Qual o foco do treino de amanhã?',
    trigger: () => true,
    options: [
      { id: 'fisico', label: 'Focar no físico', outcome: { focusBias: 'fisico' } },
      { id: 'equilibrio', label: 'Manter o equilíbrio', outcome: {}, conservative: true },
    ],
  },
  {
    id: 'imprensa',
    type: 'vida',
    prompt: 'A imprensa quer uma entrevista.',
    trigger: () => true,
    options: [
      { id: 'falar', label: 'Dar a entrevista', outcome: { fama: 5 } },
      { id: 'evitar', label: 'Evitar a imprensa', outcome: {}, conservative: true },
    ],
  },
  {
    id: 'folga',
    type: 'vida',
    prompt: 'Um tempo pra espairecer?',
    trigger: () => true,
    options: [
      { id: 'passeio', label: 'Sair pra espairecer', outcome: { moral: 6 } },
      { id: 'rotina', label: 'Manter a rotina', outcome: {}, conservative: true },
    ],
  },
  {
    id: 'noitada',
    type: 'vida',
    prompt: 'Os amigos chamaram pra sair. Vai?',
    trigger: (c) => c.balance >= 500,
    options: [
      { id: 'sair', label: 'Sair com os amigos', outcome: { moral: 8, focusBias: 'none' } },
      { id: 'ficar', label: 'Ficar em casa', outcome: {}, conservative: true },
    ],
  },
  {
    id: 'patrocinio',
    type: 'vida',
    prompt: 'Uma marca ofereceu um patrocínio pessoal.',
    trigger: (c) => c.lifestyleTier >= 1,
    options: [
      { id: 'aceitar', label: 'Aceitar o patrocínio', outcome: { fama: 10, moral: 3 } },
      { id: 'recusar', label: 'Recusar por ora', outcome: {}, conservative: true },
    ],
  },
  {
    id: 'renovar-contrato',
    type: 'proposta',
    prompt: 'O clube quer renovar seu contrato.',
    trigger: (c) => c.overall >= 45,
    options: [
      { id: 'renovar', label: 'Renovar com o clube', outcome: { moral: 4 }, conservative: true },
      { id: 'testar', label: 'Testar o mercado', outcome: { transfer: 'explore' } },
    ],
  },
  {
    id: 'proposta-clube-maior',
    type: 'proposta',
    prompt: 'Um clube de mais expressão está de olho em você.',
    // seam do MUNDO (SPEC-033): forte para o tier (o `tier` vem do scheduler); `marketOpen` = explore.
    trigger: (c) =>
      c.tier !== undefined && isTransferTarget(c.overall, c.tier, c.marketOpen === true),
    options: [
      {
        id: 'aceitar',
        label: 'Aceitar o desafio (mudar de clube)',
        outcome: { transfer: 'accept' },
      },
      { id: 'ficar', label: 'Ficar onde estou', outcome: { moral: 6 }, conservative: true },
    ],
  },
  {
    id: 'proposta-salario',
    type: 'proposta',
    prompt: 'Um rival ofereceu o DOBRO do salário.',
    trigger: (c) => c.overall >= 55,
    options: [
      { id: 'aceitar', label: 'Aceitar a proposta (2× salário)', outcome: { transfer: 'rival' } },
      { id: 'ficar', label: 'Ficar com os amigos', outcome: { moral: 10 }, conservative: true },
    ],
  },
  {
    id: 'lesao-volta',
    type: 'proposta',
    prompt: 'A lesão está quase cicatrizada. Forçar a volta?',
    trigger: (c) => c.injured === true, // seam da LESÃO (SPEC-026) — inerte sem lesão ativa
    options: [
      { id: 'forcar', label: 'Forçar a volta (arrisca recaída)', outcome: { forceReturn: 1 } },
      { id: 'respeitar', label: 'Respeitar o prazo', outcome: {}, conservative: true },
    ],
  },
  {
    id: 'veterano',
    type: 'proposta',
    prompt: 'Os anos pesam. Já pensar no pós-carreira?',
    trigger: (c) => (c.age ?? 0) >= 34, // seam da IDADE (param do mundo) — inerte sem age
    options: [
      { id: 'planejar', label: 'Começar a planejar', outcome: { moral: 5 } },
      { id: 'ignorar', label: 'Deixar pra depois', outcome: {}, conservative: true },
    ],
  },
  {
    id: 'crise-moral',
    type: 'proposta',
    prompt: 'A moral está no chão. Conversar com o técnico?',
    trigger: (c) => (c.moral ?? 100) < 30, // seam da 2.3 — INERTE até o contexto ter moral
    options: [
      { id: 'conversar', label: 'Abrir o jogo com o técnico', outcome: { moral: 15 } },
      { id: 'engolir', label: 'Engolir e seguir', outcome: {}, conservative: true },
    ],
  },
];

export function templateById(id: string): DecisionTemplate | undefined {
  return DECISIONS.find((t) => t.id === id);
}

export function optionById(templateId: string, optionId: string): DecisionOption | undefined {
  return templateById(templateId)?.options.find((o) => o.id === optionId);
}

/** A opção conservadora de um template (o fallback das 18h). Se nenhuma opção estiver MARCADA como
 *  conservadora (catálogo editado), cai na primeira — o agente NUNCA deixa uma decisão pendente. */
export function conservativeOption(templateId: string): DecisionOption | undefined {
  const t = templateById(templateId);
  if (!t) return undefined;
  return t.options.find((o) => o.conservative) ?? t.options[0];
}

/** Gera as 3-5 decisões do dia: filtra por gatilho, escolhe de forma DETERMINÍSTICA por
 *  `(seed, dia, atleta)` (hash inteiro → ordem estável + N em [min,max]). Reproduzível. */
export function generateDailyDecisions(
  seed: string,
  day: number,
  athleteId: string,
  context: DecisionContext,
): Decision[] {
  const key = `${seed}:${day}:${athleteId}`;
  const candidates = DECISIONS.filter((t) => t.trigger(context));
  const ranked = candidates
    .map((t) => ({ t, score: hash32(`${key}:${t.id}`) }))
    .sort((a, b) => a.score - b.score || (a.t.id < b.t.id ? -1 : 1));
  const span = DECISIONS_PER_DAY.max - DECISIONS_PER_DAY.min + 1;
  const n = DECISIONS_PER_DAY.min + (hash32(key) % span);
  return ranked.slice(0, n).map(({ t }) => toDecision(t));
}

function toDecision(t: DecisionTemplate): Decision {
  return { templateId: t.id, type: t.type, prompt: t.prompt, options: t.options };
}

/** Hash FNV-1a de 32 bits — a multiplicação pelo primo 16777619 é feita por SHIFTS (guardrail-safe:
 *  sem `Math.imul`, sem float; 16777619 = 2^24+2^8+2^7+2^4+2^1+1). Determinístico cross-ambiente. */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}
