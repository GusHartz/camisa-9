// Narrativa de DESFECHO das escolhas de partida (SPEC-051) — pura, zero I/O, zero RNG. É a prosa
// que o handoff de design pediu para os estados "deu certo" / "não deu": o jogador não lê
// `success`, lê "A RIVAL CALOU.". Mora aqui, e não no catálogo (`match-choices.ts` está a 287 das
// 300 linhas do OP-16), e o acesso é por LOOKUP — o catálogo não é tocado, então a geração das
// escolhas fica byte-idêntica por construção (nem o `strip` do teste de regressão precisa mudar).
//
// Tom (design system): glória com deboche, segunda pessoa. No fracasso, NUNCA punir — o anti-culpa
// do charter vale aqui: "faz parte — o próximo é seu", nunca "você errou".
import { choiceTemplateById } from './match-choices.js';

/** O desfecho de uma resposta: `na` = opção determinística (sem roll). */
export type ChoiceOutcome = 'success' | 'fail' | 'na';

/** A narrativa de um desfecho — headline curta (caixa alta no render) + corpo. */
export interface ChoiceOutcomeText {
  readonly title: string;
  readonly body: string;
}

type OptionCopy = Partial<Record<ChoiceOutcome, ChoiceOutcomeText>>;

/**
 * `templateId → optionId → desfecho`. As 4 opções ARRISCADAS declaram `success` + `fail`; as 8
 * determinísticas declaram `na`. Catálogo ABERTO: acrescentar prosa aqui não toca lógica nenhuma.
 */
const CHOICE_COPY: Readonly<Record<string, Readonly<Record<string, OptionCopy>>>> = {
  comemoracao: {
    provocar: {
      success: {
        title: 'A rival calou.',
        body: 'Dancinha na cara da torcida. Golaço assinado, craque.',
      },
      fail: {
        title: 'A torcida devolveu.',
        body: 'Você provocou e o estádio inteiro respondeu — o juiz veio conversar. O gol ninguém tira.',
      },
    },
    humilde: {
      na: {
        title: 'Gol do time.',
        body: 'Você apontou pro cara que deu o passe e correu pro abraço. O vestiário viu.',
      },
    },
  },
  'pressao-tecnico': {
    obedecer: {
      na: {
        title: 'No esquema.',
        body: 'Você fez o que o quadro pedia. Desses que o técnico não esquece na hora de escalar.',
      },
    },
    'meu-jeito': {
      success: {
        title: 'Deu livro.',
        body: 'Largou o roteiro e a jogada saiu igualzinha você viu na cabeça. O banco levantou.',
      },
      fail: {
        title: 'Ficou no meio.',
        body: 'Saiu do esquema e o time ficou partido uns dez minutos. Nada que o próximo treino não arrume.',
      },
    },
  },
  'ajuste-intervalo': {
    puxar: {
      na: {
        title: 'Voz no vestiário.',
        body: 'Você puxou o grito no intervalo. Saiu todo mundo junto pro segundo tempo.',
      },
    },
    poupar: {
      na: {
        title: 'Perna guardada.',
        body: 'Segurou o motor pro fim. Quem corre os 90 sabe a hora de pisar.',
      },
    },
  },
  provocacao: {
    revidar: {
      success: {
        title: 'Calou na marra.',
        body: 'Respondeu na hora certa, sem passar do ponto. O cara sumiu do jogo depois disso.',
      },
      fail: {
        title: 'Caiu na provocação.',
        body: 'Comprou a briga e sobrou amarelo. Acontece — cabeça fria volta no próximo lance.',
      },
    },
    ignorar: {
      na: {
        title: 'Nem olhou.',
        body: 'Deixou falar sozinho e voltou pro jogo. Resposta de quem já viu esse filme.',
      },
    },
  },
  'lesao-colega': {
    ajudar: {
      na: {
        title: 'Irmandade.',
        body: 'Largou tudo e foi amparar o companheiro. O vestiário inteiro registrou.',
      },
    },
    focado: {
      na: {
        title: 'Cabeça no jogo.',
        body: 'Doeu ver, mas você manteve o time ligado enquanto o médico entrava.',
      },
    },
  },
  'chance-clara': {
    arriscar: {
      success: {
        title: 'No ângulo.',
        body: 'De primeira, sem pensar duas vezes. Dessas que o goleiro só escuta.',
      },
      fail: {
        title: 'Zagueiro voou no canto.',
        body: 'Peitou a jogada e não foi dessa vez. Faz parte — o próximo é seu.',
      },
    },
    seguro: {
      na: {
        title: 'Jogada construída.',
        body: 'Dominou, ergueu a cabeça e escolheu o certo. Nem todo lance precisa ser bonito.',
      },
    },
  },
};

/** A narrativa do desfecho de uma opção; `undefined` se o catálogo não a declara (a borda omite
 *  os campos e o cliente cai no feedback genérico — degradação prevista). */
export function choiceOutcomeText(
  templateId: string,
  optionId: string,
  result: ChoiceOutcome,
): ChoiceOutcomeText | undefined {
  return CHOICE_COPY[templateId]?.[optionId]?.[result];
}

/** Os desfechos que uma opção PODE produzir: arriscada → success/fail; demais → na. Usado pela
 *  invariante de cobertura (toda opção declara a prosa de todo desfecho que ela alcança). */
export function outcomesOf(templateId: string, optionId: string): readonly ChoiceOutcome[] {
  const opt = choiceTemplateById(templateId)?.options.find((o) => o.id === optionId);
  if (!opt) return [];
  return opt.risky ? (['success', 'fail'] as const) : (['na'] as const);
}
