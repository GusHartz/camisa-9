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
  /** Número da camisa DERIVADO da posição (SPEC-040) — 1..99, no pool da posição. Aditivo ao /v1. */
  readonly number: number;
  /** Dica de elegibilidade do regen voluntário (SPEC-045): tem vaga + idade ≥ `REGEN_AGE.voluntary`.
   *  É DICA de render (o cliente gateia o botão); a autoridade é o servidor (409 `regen_ineligible`). */
  readonly canRegen: boolean;
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

/** Um item do catálogo de compras (SPEC-045), já orientado ao atleta. `available` = pode comprar
 *  AGORA (`validatePurchase.ok`: não possuído, moradia no próximo degrau, com saldo); `affordable` =
 *  só o saldo cobre (`canAfford`). O cliente usa como DICA de render; a compra revalida no servidor. */
export interface BandPurchase {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly kind: string;
  /** O degrau da escada de moradia (1..N); `null` p/ itens que não são moradia. */
  readonly housingTier: number | null;
  readonly owned: boolean;
  readonly affordable: boolean;
  readonly available: boolean;
}

export interface BandHome {
  readonly balance: number;
  readonly lifestyleTier: number;
  readonly hasMothersHouse: boolean;
  readonly ownedItemIds: readonly string[];
  /** O catálogo ABERTO de compras (SPEC-045) — todo `PURCHASES`, cada um com o estado do atleta.
   *  Aditivo `/v1`. O `name` é conteúdo de gameplay PT-BR (o `id` viaja junto = localização-ready). */
  readonly catalog: readonly BandPurchase[];
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

/** Um gol na timeline da partida do dia (SPEC-043) — orientado ao humano (`isMine`). SPEC-046: o
 *  artilheiro/assistente (`byMe`/`scorer`/`assistByMe`/`assist`). Os NOMES só vêm p/ gols do MEU clube
 *  (a faixa não tem o elenco do adversário → `null`). Aditivo `/v1`. */
export interface BandGoal {
  readonly minute: number;
  readonly isMine: boolean;
  /** O gol foi MEU (o artilheiro sou eu). */
  readonly byMe: boolean;
  /** Nome do artilheiro — só p/ gols do meu clube; `null` p/ o adversário / desconhecido. */
  readonly scorer: string | null;
  /** A assistência foi MINHA. */
  readonly assistByMe: boolean;
  /** Nome do assistente — só p/ gols do meu clube; `null` sem assistência / adversário. */
  readonly assist: string | null;
}

/** Uma opção de uma decisão pendente (SPEC-045). O `id` responde a decisão (`optionId`); o `label`
 *  é o texto PT-BR (conteúdo de gameplay; o `id` viaja junto = localização-ready). */
export interface BandDecisionOption {
  readonly id: string;
  readonly label: string;
}

/** Uma decisão de carreira PENDENTE (SPEC-045) — o jogador responde na faixa. O `id` (uuid) é o
 *  recurso a responder; `templateId`/`options[].id` são localização-ready; `prompt`/`label` PT-BR. */
export interface BandDecision {
  readonly id: string;
  readonly templateId: string;
  readonly type: string;
  readonly prompt: string;
  readonly options: readonly BandDecisionOption[];
}

/** Uma opção de uma escolha da partida (SPEC-048/050) — `id` responde, `label` é o texto. O EFEITO
 *  (e a chance/`fail` do roll) NUNCA viajam — seam server-side. `risky`/`attr` (SPEC-050, aditivos)
 *  telegrafam o loop treino→chance: a opção é resolvida por roll ponderado pelo foco `attr`. */
export interface BandChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly risky?: boolean;
  readonly attr?: string;
}

/** Uma escolha da partida (SPEC-048/050) — ancorada num minuto da timeline. A OFERTA, anotada com a
 *  RESPOSTA quando já resolvida (`chosenOptionId`/`result`, aditivos — ausentes = pendente).
 *  `templateId`/`option.id` localização-ready; `prompt`/`label` PT-BR. */
export interface BandMatchChoice {
  readonly minute: number;
  readonly templateId: string;
  readonly type: string;
  readonly prompt: string;
  readonly options: readonly BandChoiceOption[];
  readonly chosenOptionId?: string;
  /** 'success' | 'fail' (arriscada, roll) | 'na' (determinística). Presente junto de `chosenOptionId`. */
  readonly result?: 'success' | 'fail' | 'na';
  /** A narrativa do DESFECHO (SPEC-051), hidratada do catálogo pelo `result` — headline + corpo.
   *  Presentes só com a escolha resolvida; OMITIDOS se o catálogo não declara prosa p/ o desfecho
   *  (o cliente cai no feedback genérico). O `effect` bruto e a chance do roll seguem server-side. */
  readonly resultTitle?: string;
  readonly resultBody?: string;
  /** O moral APLICADO pela escolha (o `effect.moral` gravado) — o "MORAL +6" do desfecho. Pode ser
   *  negativo (fracasso de arriscada). Omitido quando a opção não mexe na moral. */
  readonly moralDelta?: number;
}

/** O jogo do dia. PRÉ-JOGO: só o adversário (do fixture). PÓS-JOGO: `played` + o placar. */
export interface BandMatch {
  readonly opponentClubId: string;
  readonly opponentName: string;
  readonly isHome: boolean;
  readonly played: boolean;
  readonly goalsFor: number | null;
  readonly goalsAgainst: number | null;
  /** A timeline de gols (SPEC-043), cronológica. Presente (possivelmente `[]`) quando `played`
   *  (rodada liquidada); OMITIDA pré-jogo (ausente = "não se aplica"). Aditivo — o cliente antigo ignora. */
  readonly goals?: readonly BandGoal[];
  /** A minha NOTA na partida (SPEC-046), 3.0..10.0. Presente quando `played`; `null` pré-jogo. */
  readonly myRating: number | null;
  /** As escolhas da partida (SPEC-048), ancoradas na timeline. Presente (possivelmente `[]`) quando
   *  `played`; OMITIDA pré-jogo. A OFERTA — a resposta/aplicação são fatias futuras. */
  readonly choices?: readonly BandMatchChoice[];
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
  /** CONTAGEM das decisões pendentes = `decisions.length` (mantido aditivo-only p/ o cliente antigo). */
  readonly pendingDecisions: number;
  /** As decisões pendentes do dia (SPEC-045), para o jogador RESPONDER na faixa. `[]` = nenhuma. */
  readonly decisions: readonly BandDecision[];
  /** Só quando `club === null` e o atleta está na fila. */
  readonly queue: BandQueue | null;
}
