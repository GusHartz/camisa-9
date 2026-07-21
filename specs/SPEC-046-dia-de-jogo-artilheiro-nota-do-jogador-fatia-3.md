# SPEC-046 — Dia de jogo: artilheiro, assistência + nota do jogador (fatia 3)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-046 |
| **Feature** | Dia de jogo: artilheiro, assistência + nota do jogador (fatia 3) |
| **Slug** | dia-de-jogo-artilheiro-nota-do-jogador-fatia-3 |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.1 (Dia de jogo ao vivo) — enriquece o replay; destrava o card compartilhável (4.3) |
| **Appetite** | 14 dias |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-21 |
| **Aprovada em** | {preencher após aprovação} |
| **Aprovada por** | {preencher após aprovação} |
| **Status** | Rascunho |

---

## Objetivo

A partida ganha **rosto, contribuição e nota** — e o **treino passa a importar dentro de campo**: quem
marca, quem dá a assistência e a nota de cada jogador são **ponderados pelos atributos** do atleta.
Quem sobe **Técnico** vira goleador; **Tático**, garçom; **Físico**, muralha durável; **Mental**, o Sr.
Regularidade. Assim a distribuição de atributos (SPEC-016) e o treino diário (SPEC-017/019) têm efeito
**visível e imediato** na partida — não só no `overall` agregado. Enriquece o replay (SPEC-044) e
destrava o **card compartilhável** (4.3).

---

## Contexto e motivação

A **SPEC-043** entregou a timeline de gols (minuto + lado); a **SPEC-044** a reproduz ao vivo — mas o
gol é anônimo e o jogador não recebe nota. O `GoalEvent` já declara o seam: *"o artilheiro
(`athleteId?`) e a nota entram ADITIVOS depois"*.

**A decisão de design (travada com o founder):** se um SORTEIO define quem marca/assiste, ele **tem**
que ser ponderado pelos atributos — senão o treino e a distribuição de pontos não valem nada dentro da
partida. Cada foco vira um papel:

| Foco | Papel na partida | Efeito |
|---|---|---|
| **Técnico** | finalização | mais chance de ser o **artilheiro** |
| **Tático** | visão / passe | mais chance de ser o **assistente** |
| **Físico** | marcação / porte / fôlego | **nota defensiva** (clean sheet) + **menos lesão** |
| **Mental** | consistência / frieza | **menos "dia ruim"** (menor variância da nota) |

Os atributos **vivos** do humano chegam à partida pelo **mesmo mecanismo in-memory que já leva
Forma/Moral** (a costura da SPEC-029) — então treinar Técnico → mais gols **já na próxima rodada**. Os
NPCs (sem os 4 focos — o modelo de 12 atributos é card futuro) usam um padrão por **posição ×
habilidade**. **100% servidor, score-neutral por construção** (o sorteio vive no stream `'goals'`,
disjunto do placar → **5 goldens byte-idênticos**; a nota é fn pura). **Verificável sem smoke.**

---

## Escopo — o que está DENTRO

**Engine (`packages/world-engine`, puro/guardrail — golden-safe por construção):**

- [ ] `GoalEvent.athleteId?` (artilheiro) + `GoalEvent.assistId?` (assistente) — aditivos/opcionais.
- [ ] `Athlete` ganha **afinidades de papel OPCIONAIS** `finishing?`/`playmaking?`/`durability?`
  (0..100) — hints injetáveis; ausentes no NPC (default derivado de **posição × habilidade**). NÃO é o
  modelo de 12 atributos (só 3 hints de papel; o snapshot/schema não muda).
- [ ] `match-events.ts`: `matchGoals` amostra o **artilheiro** por peso `finishing` (Técnico p/ humano,
  posição×ability p/ NPC) e a **assistência** (`assistId`, ~`assistChancePct` dos gols, do mesmo elenco
  **excluindo o artilheiro**, por peso `playmaking` [Tático]); `matchInjuries` pondera a vítima por
  **inverso de `durability`** (Físico → menos lesão). **Minutos sorteados PRIMEIRO** (idênticos à 043);
  autores/assistências DEPOIS, no mesmo stream `'goals'`. `SCORER_WEIGHTS`/`ASSIST` tunáveis.
- [ ] `match-rating.ts` (novo) — `matchRating(...)`: nota **inteira em décimos** (`30..100`),
  determinística por `(…, 'rating')`, a partir de: gols/assistências DO atleta · resultado · posição ·
  gols sofridos · os 4 focos vivos (Físico→defensivo, Mental→**variância menor**, Técnico/Tático já
  entram via os eventos). `RATING` tunável. Puro/guardrail (décimos inteiros).
- [ ] `world-season.ts`: passa os elencos ao `matchGoals` (as afinidades viajam nos `Athlete` já
  injetados).
- [ ] `index.ts`: exporta `matchRating`/`RATING` (+ o tipo das afinidades).

**Costura (`services/world-entry` + `services/world-store`) — a injeção in-memory (padrão SPEC-029):**

- [ ] O modulador injetado no `runDailyRound` passa a escrever, além da ability (Forma/Moral), as
  **afinidades de papel** do humano (`finishing`=f(Técnico), `playmaking`=f(Tático),
  `durability`=f(Físico)) no `Athlete` da vaga (in-memory; base congelada da SPEC-020 intacta). Lê os
  focos vivos do player-store (batch). Sem humanos → no-op (mundo NPC idêntico).

**Servidor (`services/api` — leitura ADITIVA ao `/v1/band`, SEM migration, SEM schema):**

- [ ] `BandGoal.byMe`/`.scorer`/`.assist`/`.assistByMe` — o gol foi/assistência foi minha + os nomes
  (resolvidos do meu elenco; `null` p/ o adversário).
- [ ] `BandMatch.myRating: number | null` — a minha nota (`matchRating(meus focos vivos, …)/10`, ex.:
  `7.2`), presente quando `played`, `null` pré-jogo.
- [ ] `buildTodayMatch`/`band-state.ts` computam esses campos (o agregador passa o meu id do mundo +
  focos + posição + as partes da seed; a nota lê os focos VIVOS via `readAthleteProgress`).

**Testes:** artilheiro/assistência ∈ elenco certo; **ponderação por atributo** (um humano com Técnico
alto injetado marca MAIS que a baseline — teste estatístico determinístico); **SCORE-NEUTRAL** mantido
+ timeline SOMA o placar; `matchRating` (modelo/boundary/clamp/determinismo/consistência-por-Mental);
**5 goldens byte-idênticos** (`git diff`=0); agregador ao vivo (`byMe`/`scorer`/`assist`/`myRating`).

---

## Escopo — o que está FORA

- **Re-bake da ability no `clubStrength`** (o seu overall vivo deixar o TIME mais forte → melhores
  RESULTADOS): esta fatia faz o treino pagar nos SEUS eventos/nota (o payoff visível), mas o placar do
  clube segue pela base congelada + Forma/Moral. O re-bake é **card seguinte** (débito SPEC-021/029).
- **Modelo de 12 atributos nos NPCs** (afinidades reais para todo o mundo): os NPCs usam posição ×
  habilidade; só o humano tem os focos. O modelo completo é card futuro.
- **Assistências/desarmes como eventos MEDIDOS** (lance-a-lance): a partida é por placar; a assistência
  é um MODELO determinístico (plausível/reproduzível), não medida. Motor de partida rico = futuro.
- **Nota de TODOS os jogadores** (elenco inteiro na faixa): a fn é per-atleta e reusável, mas a fatia
  expõe só a MINHA nota. Notas do time = card compartilhável (4.3) / química.
- **Nota "ao vivo" animada** no replay (subindo): é do CLIENTE (fatia futura); aqui o servidor produz a
  nota FINAL.
- **Persistir a nota / ranking de artilheiros da liga** — a nota é fn pura recomputável; o ranking é
  agregação de temporada (futuro).
- **Cliente/UI** (mostrar autor/assistência/nota no replay) — fatia de cliente futura.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `packages/world-engine/src/types.ts` | modificar | `GoalEvent.athleteId?`/`.assistId?`; `Athlete.finishing?`/`.playmaking?`/`.durability?` (opcionais). |
| `packages/world-engine/src/engine/match-events.ts` | modificar | Artilheiro por `finishing`, assistência (`assistId`) por `playmaking`, lesão por inverso de `durability`; `SCORER_WEIGHTS`/`ASSIST`; NPC default posição×ability. |
| `packages/world-engine/src/engine/match-rating.ts` | criar | `matchRating` (décimos, determinística, lê os 4 focos; Mental→variância) + `RATING`. |
| `packages/world-engine/src/engine/world-season.ts` | modificar | Passa os elencos ao `matchGoals` (afinidades viajam no `Athlete`). |
| `packages/world-engine/src/index.ts` | modificar | Exporta `matchRating`/`RATING` + tipos. |
| `services/world-entry/src/mood-modulator.ts` | modificar | Injeta as afinidades de papel (finishing/playmaking/durability) do humano, além da ability. |
| `services/world-store/src/store/mood-modulation.ts` | modificar | `applyMoodToWorld` (ou sibling) escreve as afinidades no `Athlete` (in-memory). |
| `services/player-store/src/store/*` | modificar | Reader batch dos focos vivos (se não houver) p/ a costura. |
| `services/api/src/band/types.ts` | modificar | `BandGoal.byMe`/`.scorer`/`.assist`/`.assistByMe`; `BandMatch.myRating`. |
| `services/api/src/band/from-world.ts` | modificar | Computa os campos do gol; recebe o `me` ctx. |
| `services/api/src/band/band-state.ts` | modificar | Passa o `me` ctx (id do mundo + focos vivos + posição + seed/liga/temporada); computa `myRating`. |
| `packages/world-engine/src/engine/{world-season,match-rating}.test.ts` | criar/modificar | Ponderação por atributo; score-neutral; soma; o modelo da nota. |
| `services/api/test/band-state.test.ts` | modificar | `byMe`/`scorer`/`assist`/`myRating` ao vivo. |
| `specs/SPEC-046-...md` / `specs/DONE-046-...md` | criar | Esta SPEC + o DONE. |

---

## Mudanças de schema (se aplicável)

Nenhuma. O artilheiro/assistência viajam no `published_round.result` **jsonb** (schemaless — round-trip
provado na SPEC-043). As afinidades são **in-memory** (injetadas, nunca persistidas — a base congelada
da SPEC-020 fica intacta). A nota é **fn pura** (recomputável). **Sem migration.**

---

## Mudanças de API (se aplicável)

Nenhuma rota nova. Leitura **aditiva** ao `GET /v1/band` (contrato `/v1`, aditivo-only):

```
GET /v1/band  (aditivo — campos novos)
  club.todayMatch.goals[].byMe:       boolean          // o gol foi meu
  club.todayMatch.goals[].scorer:     string | null    // nome do artilheiro (só gols do meu clube)
  club.todayMatch.goals[].assistByMe: boolean          // a assistência foi minha
  club.todayMatch.goals[].assist:     string | null    // nome do assistente (só gols do meu clube)
  club.todayMatch.myRating:           number | null     // minha nota (ex.: 7.2); null pré-jogo
```

Engine (tipos públicos, aditivos): `GoalEvent.athleteId?`/`.assistId?`; `Athlete.finishing?`/
`.playmaking?`/`.durability?`.

---

## Critérios de aceitação

**Cenário 1 — artilheiro/assistência do elenco certo, ponderados por atributo**
- Dado uma temporada simulada, e (separadamente) um humano com `finishing` alto injetado
- Então todo gol tem `athleteId` ∈ o elenco do clube que marcou, e a assistência (quando presente) ∈ o
  mesmo elenco ≠ o artilheiro; e o humano com Técnico alto é o artilheiro **mais vezes** que a baseline
  de posição (teste estatístico determinístico sobre muitas partidas).

**Cenário 2 — score-neutral (o selo)**
- Removendo os `events`, a temporada é **deep-equal** ao `simulateSeason` puro; a timeline SOMA o placar;
  os **5 goldens são byte-idênticos** (`git diff` = 0).

**Cenário 3 — a minha nota reflete os meus atributos**
- Dado um humano cuja partida foi publicada
- Então `myRating ∈ [3.0, 10.0]`, é **determinística**, sobe com gols/assistências meus, com Físico em
  clean sheet, e tem **menor variância** quanto maior o Mental; `byMe`/`assistByMe`/`scorer`/`assist`
  batem com os meus eventos.

**Cenário 4 — pré-jogo / degradado**
- Pré-jogo → `myRating:null`; sem afinidades injetadas (mundo NPC) → tudo cai no default posição×ability,
  sem crash.

---

## Segurança (se aplicável)

Sem superfície nova. Leitura **autorizada por construção** (o `athleteId`/focos vêm da sessão; nenhuma
rota aceita id de ator). Sem input novo.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| A ponderação/assistência desloca o stream `'goals'` e muda algum golden | Média | Minutos-primeiro; stream `'goals'` disjunto do placar; goldens all-NPC (sem injeção) → default estável. Provado (score-neutral + soma + git diff). |
| A nota parecer injusta/arbitrária | Média | Modelo DECLARADO/tunável (`RATING`); determinística; cada foco tem papel legível. |
| Injetar afinidades acopla demais a costura | Média | Reusa o padrão SPEC-029 (in-memory, no-op sem humano); afinidades opcionais no `Athlete` (NPC não muda). |
| Escopo cresceu vs a fatia original | Média | O re-bake do `clubStrength` e os 12 atributos ficam FORA (cards seguintes); a fatia entrega o payoff VISÍVEL (eventos + nota). |

**Dependências:** SPEC-043 (timeline) · SPEC-029 (a costura de injeção) · SPEC-038 (o agregador) — em `main`.

---

## Notas de implementação

- **Golden-safe por construção:** events não são golden-captured; a ponderação é mais consumo do stream
  `'goals'`; goldens all-NPC (afinidades ausentes → default) → byte-idênticos. Provar com `git diff` + SCORE-NEUTRAL.
- **Afinidades:** `finishing=f(Técnico)`, `playmaking=f(Tático)`, `durability=f(Físico)` (mapa simples,
  ex.: o próprio valor 0..99). NPC default: `SCORER_WEIGHTS[pos] × (ability/…)`. Pick ponderado por
  `nextInt` sobre o peso total (cumulativo). Roster/peso zero → autor omitido (graceful).
- **`matchRating` (proposta, tunável):** base `60` + gols×`9` + assist×`6` + `V:+5/D:−5` + (GK/DEF:
  clean sheet `+5 + Físico/20` / sofridos ≥3 `−8`) + variância `±(12 − Mental/12)` décimos (Mental
  encolhe o swing → consistência), clamp `[30,100]`. A nota lê os focos VIVOS (o treino paga na hora).
- **A costura** estende o `moodModulator`: além de `effectiveAbility` (ability), escreve as afinidades
  do humano no `Athlete` da vaga (in-memory). NPCs intocados.
- **Revisão adversarial** por Workflow (lentes: golden-safety/score-neutral + ponderação · o modelo da
  nota · a costura de injeção · a faixa), cada achado verificado.

---

## Checklist de aprovação

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora)
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas (nenhuma)
- [ ] Critérios de aceitação são testáveis
- [ ] Riscos e superfície de segurança foram avaliados
- [ ] Appetite é razoável para o escopo definido
- [ ] O mapa focos→papel + os pesos (`RATING`/`SCORER_WEIGHTS`/`ASSIST`) estão aprovados (ou ajustados)

---

*SPEC-046 — método H1VE. A partida ganha rosto, contribuição e nota, PONDERADOS pelos atributos: o
treino paga em campo (Técnico→gol, Tático→assistência, Físico→defesa/lesão, Mental→consistência). Os
focos vivos entram in-memory (padrão SPEC-029); o artilheiro/assistência são amostrados score-neutral;
a nota é fn pura. 100% servidor, SEM migration, engine e os 5 goldens INTOCADOS. O re-bake do
`clubStrength` e os 12 atributos ficam para cards seguintes.*
