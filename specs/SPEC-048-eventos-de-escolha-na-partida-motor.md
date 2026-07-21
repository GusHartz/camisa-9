# SPEC-048 — Eventos de escolha na partida (3.2) · fatia 1: o motor

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-048 |
| **Feature** | Eventos de escolha na partida (3.2) — fatia 1: o motor |
| **Slug** | eventos-de-escolha-na-partida-3-2-fatia-1-o-motor |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.2 (Eventos de escolha + intervenção) — o "interagir" ao vivo |
| **Appetite** | 12 dias |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-21 |
| **Aprovada em** | {preencher após aprovação} |
| **Aprovada por** | {preencher após aprovação} |
| **Status** | Rascunho |

---

## Objetivo

A partida ganha **momentos de escolha SEUS**: 1-5 escolhas por jogo + uma **intervenção por tempo**,
determinísticas e ancoradas na **timeline** (SPEC-043) — "você marcou, como comemora?", "no intervalo,
o time está atrás — sua atitude?". Esta fatia entrega o **MOTOR** (server-first): a geração
determinística das escolhas com efeitos DECLARADOS, verificável sem smoke; o **cliente as apresenta** e
a **aplicação dos efeitos** vêm em fatias seguintes. Fecha a tríade *assistir* (SPEC-044) → *rosto/nota*
(SPEC-046) → **interagir**.

---

## Contexto e motivação

A régua do founder é *curtir/assistir/interagir*. A SPEC-043/044 entregou o "assistir" (a timeline e o
replay), a SPEC-046 o "rosto/nota". Falta o **interagir DENTRO da partida** — o 3.2. A SPEC-025 já provou
o motor de decisões (18h): catálogo ABERTO de templates com `outcome` declarado, geração determinística
por hash. Esta fatia é o **análogo para a PARTIDA**: escolhas ancoradas em MOMENTOS da timeline (o minuto
do seu gol, o intervalo, uma lesão), orientadas ao HUMANO.

**Server-first, 100% servidor, verificável sem smoke.** O motor é uma **fn PURA** (como o `matchRating`
da SPEC-046) que o agregador computa para o humano a partir da sua participação na timeline — **não é um
evento GENÉRICO gravado na rodada** (o engine é human-agnóstico; uma escolha "SUA" precisa saber que VOCÊ
marcou). Por isso: **`resolveMatch`/`simulateSeason`/`world-season` e os 5 goldens INTOCADOS** (o motor
nunca roda na simulação); **sem migration** (as escolhas são recomputáveis, como a nota).

---

## Escopo — o que está DENTRO

**Engine — o MOTOR (`packages/world-engine`, puro/guardrail):**

- [ ] `match-choices.ts` (novo): `MatchChoiceOption { id, label, effect }` (efeito = `Record<string,
  number>` DECLARADO — moral/fama/risco/focusBias/…, molde do `DecisionOutcome`, **aplicado por outra
  fatia**); `MatchChoice { minute, half, templateId, type, prompt, options }`; `MATCH_CHOICES` (catálogo
  ABERTO tunável, molde de `DECISIONS`).
- [ ] `matchChoices(seed, leagueId, seasonId, round, homeId, awayId, athleteId, ctx) → MatchChoice[]`:
  determinística (stream `'choices'`, disjunto), **ancorada na timeline** — `ctx` = a participação do
  humano (minutos dos SEUS gols/assistências, minuto de lesão sua/de colega, resultado). Filtra os
  templates por gatilho (evento-ligado: marcou/assistiu/lesão; intervalo-ligado: 1º/2º tempo), escolhe
  **1-5**, **≤1 intervenção por tempo**, atribui o minuto (do evento, ou de um lull determinístico no
  tempo), determinístico por hash `(seed, match, athlete)`.
- [ ] `index.ts`: exporta `matchChoices`/`MATCH_CHOICES` + tipos.

**Servidor — o read-model (`services/api`, leitura ADITIVA, SEM migration):**

- [ ] `BandMatch.choices?: readonly BandMatchChoice[]` (`{ minute, templateId, type, prompt, options:
  [{id,label}] }` — a OFERTA; o `effect` fica server-side, é seam da fatia de aplicação). Presente
  quando `played`, omitido pré-jogo (mesmo gate da timeline).
- [ ] `buildTodayMatch`/`band-state.ts` computam as escolhas: derivam o `ctx` (participação do humano)
  dos eventos da rodada publicada (gols `byMe` da SPEC-046 + lesão) e chamam `matchChoices`.

**Testes:** determinismo (mesma entrada → mesmas escolhas); 1-5 por partida; ≤1 intervenção por tempo;
ancoragem na timeline (uma escolha de gol cai no minuto do gol; a intervenção cai no tempo certo);
efeitos declarados presentes; sem participação → só as intervenções; **5 goldens byte-idênticos**
(o motor não toca o engine); agregador ao vivo (a faixa devolve as escolhas do humano).

---

## Escopo — o que está FORA

- **A apresentação no CLIENTE** (renderizar a escolha na faixa/replay, o gesto de escolher) — fatia 2.
- **A RESPOSTA + a APLICAÇÃO dos efeitos** (persistir a escolha, aplicar moral/atributos) — fatia 3
  (como a SPEC-025 declarou o `outcome` e a 2.3 aplicou). Aqui o efeito é só DADO declarado (seam).
- **`ChoiceEvent` como MatchEvent GRAVADO na rodada** — a escolha é HUMANO-específica → fn pura
  recomputável (não vai no `events` jsonb; o engine/goldens ficam intocados). O comentário `choice
  (3.2)` no `MatchEvent` fica como aspiração; a fatia adota o padrão `matchRating` (fn pura).
- **A intervenção ao vivo que MUDA o placar** (reescreveria `resolveMatch`) — a escolha é narrativa;
  o efeito é em atributos/moral, não no resultado da partida.
- **Como os atributos entram** (respeitar o modelo de treino/XP, "nunca loja de stats" SPEC-024) — é
  decisão da fatia de APLICAÇÃO; aqui o efeito é declarado, não aplicado.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `packages/world-engine/src/engine/match-choices.ts` | criar | `matchChoices` + `MATCH_CHOICES` + `MatchChoice`/`MatchChoiceOption`. |
| `packages/world-engine/src/index.ts` | modificar | Exporta `matchChoices`/`MATCH_CHOICES` + tipos. |
| `packages/world-engine/src/engine/match-choices.test.ts` | criar | O motor (determinismo/1-5/≤1 por tempo/timeline/efeitos/boundary). |
| `services/api/src/band/types.ts` | modificar | `BandMatchChoice` + `BandMatch.choices?`. |
| `services/api/src/band/from-world.ts` | modificar | `buildTodayMatch` deriva o `ctx` e chama `matchChoices`. |
| `services/api/test/{from-world,band-state}.test.ts` | modificar | Escolhas na faixa (pura + ao vivo). |
| `specs/SPEC-048-...md` / `specs/DONE-048-...md` | criar | Esta SPEC + o DONE. |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema. As escolhas são **fn pura** recomputável (como a nota da SPEC-046) — não
persistidas nesta fatia (a resposta/persistência é a fatia de aplicação). **Sem migration.**

---

## Mudanças de API (se aplicável)

Nenhuma rota nova. Leitura **aditiva** ao `GET /v1/band` (contrato `/v1`, aditivo-only):

```
GET /v1/band  (aditivo)
  club.todayMatch.choices?: [{ minute, templateId, type, prompt, options: [{ id, label }] }]
    // presente quando `played`; omitido pré-jogo. O `effect` de cada opção NÃO é exposto (seam server-side).
```

Engine (tipos públicos, aditivos): `matchChoices`/`MATCH_CHOICES`/`MatchChoice`/`MatchChoiceOption`.

**i18n:** o `prompt`/`label` são conteúdo de gameplay PT-BR + o `templateId`/`option.id` viajam junto
(localização-ready), como a SPEC-045/046.

---

## Critérios de aceitação

**Cenário 1 — determinístico + 1-5 por partida + ≤1 intervenção por tempo**
- Dado uma participação do humano numa partida
- Quando chamo `matchChoices` duas vezes com a mesma entrada
- Então devolve as MESMAS escolhas; entre 1 e 5; no máximo 1 intervenção por tempo (1º e 2º).

**Cenário 2 — ancorado na timeline**
- Dado que o humano marcou aos 23' e 71'
- Então uma escolha de "comemoração" (se sorteada) cai no minuto de um gol dele; uma intervenção de
  intervalo cai no fim do 1º tempo / início do 2º (minuto no tempo certo).

**Cenário 3 — efeitos declarados + a faixa expõe a oferta**
- Dado um humano cuja partida foi publicada
- Então cada `MatchChoice.options[].effect` é um `Record<string, number | string>` (seam — o `focusBias`
  é rótulo, molde da SPEC-025; corrigido de `Record<string,number>` na revisão); e `GET /v1/band`
  devolve `todayMatch.choices` (prompt + options com id/label), SEM o `effect`.

**Cenário 4 — boundary / o selo**
- Sem participação (não marcou/assistiu/lesão) → só as intervenções de tempo (≥1); pré-jogo → `choices`
  omitido; os **5 goldens byte-idênticos** (`git diff`=0), sem migration.

---

## Segurança (se aplicável)

Sem superfície nova. Leitura autorizada por construção (o `athleteId` vem da sessão). As escolhas são do
atleta da sessão. Sem input externo nesta fatia (a resposta é a fatia 3).

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| O motor tocar o engine e regenerar golden | Baixa | Fn PURA nova (nunca roda na simulação); goldens não capturam escolhas → intocados. Provar com `git diff`. |
| Escolhas parecerem aleatórias/injustas | Média | Catálogo DECLARADO/tunável (`MATCH_CHOICES`); determinístico; ancorado em momentos reais da timeline. |
| Motor sem consumidor (abstrato) | Média | A faixa expõe a oferta (verificável ao vivo); a apresentação/aplicação são as fatias 2/3 nomeadas. |
| Efeitos em ATRIBUTOS ferirem o "nunca loja de stats" | Média | O efeito é só DECLARADO aqui; COMO aplica (moral direto, atributo via XP/focusBias) é decisão da fatia 3. |

**Dependências:** SPEC-043 (a timeline) · SPEC-046 (a participação do humano na faixa: `byMe`/gols) ·
SPEC-025 (o molde do catálogo/`outcome`) — em `main`.

---

## Notas de implementação

- **Padrão `matchRating` (fn pura, human-específica):** o motor NÃO grava na rodada; o agregador o chama
  para o humano a partir da sua participação. Trivialmente score-neutral (nunca roda no `simulateSeason`).
- **`MATCH_CHOICES` (catálogo, molde de `DECISIONS`):** cada template = `{ id, type, prompt, trigger,
  moment (evento|tempo), options:[{id,label,effect}] }`. Proposta inicial (tunável): comemoração (você
  marcou), pressão do técnico (intervenção 1º tempo), ajuste de intervalo (intervenção 2º tempo), reação
  a provocação (levou gol), ajudar colega lesionado (lesão), chance clara (lull). Efeitos = `moral`/`fama`
  /`risco`/`focusBias`.
- **Geração:** filtra por gatilho (do `ctx`), rankeia por hash `(seed, match, athlete, templateId)`,
  escolhe `n ∈ [1,5]` (hash), cap ≤1 intervenção por tempo; o minuto vem do evento (gol/lesão) ou de um
  lull determinístico no tempo. Inteiro/guardrail (hash FNV-via-shifts, como a SPEC-025).
- **A faixa:** `buildTodayMatch` deriva o `ctx` dos eventos da rodada publicada (gols `byMe` + lesão do
  humano) e chama `matchChoices`; expõe a oferta (sem `effect`).
- **Revisão adversarial** por Workflow (lentes: golden-safety/determinismo do motor · o catálogo/mecânica
  · a costura na faixa), cada achado verificado.

---

## Checklist de aprovação

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora)
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas (nenhuma)
- [ ] Critérios de aceitação são testáveis
- [ ] O catálogo `MATCH_CHOICES` + a mecânica (1-5, ≤1 intervenção/tempo) estão aprovados (ou ajustados)
- [ ] A decisão fn-pura (vs `ChoiceEvent` gravado) está aceita

---

*SPEC-048 — método H1VE. O MOTOR das escolhas na partida (3.2 fatia 1): 1-5 escolhas + 1 intervenção por
tempo, determinísticas, ancoradas na timeline (SPEC-043), com efeitos DECLARADOS. Fn PURA (padrão
`matchRating`), human-específica → engine e os 5 goldens INTOCADOS, SEM migration. A apresentação no
cliente e a aplicação dos efeitos são as fatias 2/3.*
