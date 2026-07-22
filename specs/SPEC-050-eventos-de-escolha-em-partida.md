# SPEC-050 — Eventos de escolha em partida (fatias 2+3: responder ao vivo, roll por atributos e efeitos aplicados)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-050 |
| **Feature** | Eventos de escolha em partida |
| **Slug** | eventos-de-escolha-em-partida |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.2 — o "interagir" do dia de jogo (fecha o card; a fatia 1/motor foi a SPEC-048) |
| **Appetite** | 14 dias |
| **Prioridade** | MEDIUM |
| **Status** | Rascunho (aguardando aprovação no board) |

---

## Objetivo

Fechar a tríade *assistir* (SPEC-044) → *rosto/nota* (SPEC-046) → **interagir**: durante o replay
(~4 min), os **momentos de escolha da SUA partida** (SPEC-048) aparecem **no minuto em que
aconteceram**; o jogador escolhe **ao vivo**; opções **arriscadas** são resolvidas por um **roll
determinístico ponderado por atributo + moral** (sucesso/falha); os efeitos são **aplicados** —
moral **agora** (SPEC-027), viés de treino **amanhã** (Model A) — e quem não responde recebe a
**opção conservadora no tick de D+1, sem punição**. O treino passa a importar também nos MOMENTOS
(atributo alto → mais chance no roll), e o momento de hoje guia o treino de amanhã (focusBias):
o loop *treino → atributo → momento → treino* fecha.

---

## Decisões do founder (travadas nesta SPEC)

1. **Loop completo numa fatia** — servidor (persistência + rota + timeout) E cliente (apresentação
   no replay) juntos; o card 3.2 fecha inteiro.
2. **Roll por atributos+moral** — ⚠️ **revisão deliberada da âncora SPEC-048** ("efeito declarado,
   sem roll"). A descrição original do card ("resolvidos por atributos+moral") prevalece: opções
   **arriscadas** ganham resolução sucesso/falha ponderada por atributo+moral. As opções seguras
   (incl. toda `conservative`) permanecem **determinísticas** (efeito declarado como na 048). O
   roll **NUNCA muda o placar** (âncora da 048 mantida — a partida já foi publicada às 15h; a
   escolha é narrativa/carreira).
3. **focusBias APLICADO** — a opção escolhida com `focusBias` define o **foco do treino idle do
   DIA SEGUINTE** (viés de TAXA de XP, canal do `applyTraining`/Model A — **nunca escreve
   atributo**). Dá moeda própria à opção segura (evolução amanhã vs moral/fama agora).
   O `focusBias` das **decisions** (SPEC-025) permanece inerte — unificação = card futuro.
4. **Janela = o replay** — no cliente, a escolha só é oferecida **durante o replay** (no minuto);
   o re-assistir (↻) re-oferece as não-respondidas. O **servidor** aceita respostas até o tick de
   D+1 (o backstop técnico — ele não tem como saber quando o replay local rodou); no tick de D+1
   as pendentes resolvem com a **conservadora** (molde `resolveDeadline`, SPEC-025), sem punição.
   **Tensão com o pilar ambiente REGISTRADA e aceita:** é o primeiro mecanismo que recompensa
   estar presente num momento específico — mas a janela ao vivo é agência de **UPSIDE apenas**:
   quem não assiste recebe a conservadora sem punição (moral ≥ 0, cravado no Cenário 4) e pode
   re-assistir até o tick; **ausência continua sem perder nada**.

---

## Contexto e motivação

A SPEC-048 entregou o motor: `matchChoices` (fn pura human-específica, stream `'choices'`) gera
1-5 escolhas determinísticas ancoradas na timeline, com efeitos **declarados** (seam) e exatamente
**1 opção `conservative` por template**; a faixa expõe a OFERTA (`todayMatch.choices`, sem o
`effect`). Mas hoje **ninguém pode responder**: não há persistência, rota, aplicação nem UI — as
opções seguras não fazem nada e o "interagir" não existe. Esta SPEC entrega o resto do card,
reusando os moldes prontos: `answerDecision` (rota+tx+erro tipado, SPEC-041), `bumpMoral`
evento-na-fonte (SPEC-027), `resolveDeadline(day-1)` (timeout sem punição, SPEC-025), o Popup de
decisão + `BandActions` (SPEC-045) e o `Frame` do replay (SPEC-044).

---

## Escopo — o que está DENTRO

### A. Engine (`packages/world-engine` — puro; a simulação NÃO é tocada)

- **`MatchChoiceOption.risky?`** (aditivo): `{ readonly attr: ChoiceAttr; readonly fail: ChoiceEffect }`
  com `ChoiceAttr = 'fisico' | 'tecnico' | 'tatico' | 'mental'`. Opção **sem** `risky` =
  determinística (efeito declarado aplica direto). Opção **com** `risky` = roll: sucesso → `effect`;
  falha → `risky.fail`. Nenhuma opção `conservative` ganha `risky` (invariante, provada por teste).
- **Catálogo**: as 4 opções de risco ganham `risky` (calibração inicial; `fail.moral = −risco`
  declarado): `comemoracao/provocar` → `mental`, fail `{moral:-3}` · `pressao-tecnico/meu-jeito` →
  `tatico`, fail `{moral:-4}` · `provocacao/revidar` → `mental`, fail `{moral:-5}` ·
  `chance-clara/arriscar` → `tecnico`, fail `{moral:-4}`. As chaves declaradas existentes
  (`moral`/`fama`/`risco`/`focusBias`) não mudam.
- **`match-choice-roll.ts`** (arquivo novo — `match-choices.ts` está a 266 linhas, OP-16):
  `resolveChoiceRoll(input: RollInput): { success: boolean; chance: number }`, com `RollInput`
  readonly `{seed, leagueId, seasonId, round, homeId, awayId, athleteId, templateId, optionId,
  attr, moral}` (objeto de input, molde `RatingInput` do `matchRating` — 11 posicionais seriam
  troca-silenciosa de args do mesmo tipo) — stream próprio
  `deriveSeed(seed, leagueId, seasonId, round, homeId, awayId, athleteId, 'choice-roll')` +
  sub-seed `(templateId, optionId)` (disjunto de `'choices'`/`'goals'`/`'events'`/`'rating'`);
  `chance = clamp(50 + trunc((attr−50)·3/5) + trunc((moral−50)·2/5), 15, 85)` (peso 60/40
  atributo/moral, eco do `effectiveAbility`; clamp [15,85] = nunca certo, nunca sem esperança;
  inteiro/guardrail-safe); `success = nextUint32(rng) % 100 < chance`.
- **Helpers puros** (em `match-choices.ts`, aditivos): `choiceOptionById(templateId, optionId)`,
  `conservativeChoiceOption(templateId)` (a marcada `conservative`, fallback `options[0]` — molde
  `conservativeOption` das decisions) e **`choiceContextFrom(match: MatchResult, clubId: string,
  meWorldId: string): MatchChoiceContext`** — a derivação events→ctx EXTRAÍDA do `buildChoices`
  do agregador (self-exclusion da lesão incluída) para ser a **fonte única** de api E scheduler.
- **Barrel**: exportar `ChoiceTemplate` (tipo), `ChoiceAttr`, `resolveChoiceRoll`,
  `choiceOptionById`, `conservativeChoiceOption`, `choiceContextFrom` (tudo aditivo).
- **Selo golden**: `resolveMatch`/`simulateSeason`/`world-season` **INTOCADOS**; os 5 goldens
  byte-idênticos (`git diff` = 0). O motor/roll **nunca roda na simulação**. A geração da OFERTA
  não muda **módulo o campo novo**: mesmos templates, minutos, half, ordem e n (`risky` é dado
  carregado nas opções; trigger/rank/minuteOf/consumo de RNG não iteram sobre o conteúdo delas).
  Como `matchChoices` embute as opções do catálogo por referência, o teste de regressão compara a
  saída **com o `risky` REMOVIDO** (strip, molde do teste SCORE-NEUTRAL da SPEC-031/043) — uma
  igualdade byte-a-byte crua contra a 048 seria insatisfazível por construção.

### B. Persistência (`services/player-store` — migration `0011`, OP-01)

- **Tabela `player.match_choice`**: `athlete_id` uuid FK→athlete · `season_id` text · `round` int
  · `template_id` text · `chosen_option` text · `result` text (`'success' | 'fail' | 'na'`; na =
  opção sem roll) · `effect` jsonb (o efeito **APLICADO**, snapshot — auditável mesmo se o
  catálogo mudar, molde `decision.outcome`) · `resolved_by` text (`'player' | 'agent'`) · `day`
  int · `created_at` timestamptz defaultNow. **PK composta `(athlete_id, season_id, round,
  template_id)`** = idempotência natural (a oferta é recomputável; o cliente referencia por
  `templateId` — não precisa de uuid próprio). **Semântica do `day`: o day-index da PARTIDA**
  (`tickDay` na rota; `day−1` no resolver) — consistente com a chave lógica `(season, round)`.
- **Coluna `athlete.next_train_focus`** text NULL + CHECK
  `IN ('fisico','tecnico','tatico','mental')` (e guarda `isFocus` na leitura — lição SPEC-047:
  coluna text load-bearing ganha guarda dupla). **`isFocus(v): v is Focus` é exportada de
  `@camisa-9/player`** (deriva de `FOCI`; hoje é helper PRIVADO da rota `training-spend`, que o
  player-store não pode importar — a rota passa a reusar o export).
- **`match-choice-repo.ts`** (novo):
  - `answerMatchChoice(db, athleteId, {seasonId, round, templateId, chosenOption, result, effect,
    day, resolvedBy})`: **uma tx** — `INSERT … onConflictDoNothing().returning()` (0 linhas →
    `GameplayError('choice_resolved')`) → `bumpMoral(tx, athleteId, moralOf(effect))` (molde
    SPEC-027, `moralOf` ignora chaves não-numéricas) → se `resolvedBy === 'player'` e
    `isFocus(effect.focusBias)` → `UPDATE athlete.next_train_focus`. `fama`/`risco` ficam
    **declarados-inertes** no jsonb (precedente decisions; documentado, não é bug).
  - `resolveConservative(db, athleteId, {…})` — a **variante sem-throw** da mesma tx (retorna
    `{inserted: boolean}` no conflito, compartilha o miolo com `answerMatchChoice`): a via do
    RESOLVER, onde o conflito é a resolução **benigna** da corrida (a rota usa
    `answerMatchChoice`, que lança `choice_resolved` → 409 — as duas semânticas são deliberadas,
    não contradição).
  - `readMatchChoices(db, athleteId, seasonId, round)` → as linhas (banda anota a oferta; resolver
    checa pendências).
- **`training-repo.ts`**: `applyTraining(…, focus = null)` passa a **consumir o viés dentro da
  própria tx** — se `focus` é null, lê `next_train_focus` (a linha já está `FOR UPDATE`), usa-o
  como foco se `isFocus`, e **limpa a coluna** (one-shot). Chamada com foco explícito não consome.
  O claim `'train'` do ledger continua mandando (2ª chamada no dia = no-op, viés preservado —
  só consome quando treina de fato).

### C. API (`services/api` — aditivo ao `/v1`)

- **Rota `POST /v1/matches/choices/answer`** — body `{ round: number, templateId: string,
  optionId: string }` (inteiro + strings não-vazias; `seasonId`/`athleteId` derivados no servidor —
  **nenhum identificador de ator no body**, autorização por construção). Fluxo (molde
  `answer-decision`): `IP_BUCKETS` novo `[' /v1/matches/', 'matches', 40]` — teto ALTO como o do
  treino (lição SPEC-041/regra do router: o replay **sincroniza** as respostas pós-15h; um
  quinteto num NAT são 5 contas × até 5 escolhas na mesma janela de 1 min — 10 daria 429 no
  gancho central do "interagir") → `requireAthlete` →
  `hit('match-choice:acct:'+accountId, 30)` → parse → orquestração
  (`gameplay/match-choice.ts`, novo módulo fino):
  1. resolve ocupação + rodada mostrada (mesmos readers do band); **gates**: rodada liquidada
     (`cursor >= tickDay`) E `round === round(tickDay)` E ainda não resolvida — senão
     `GameplayError('choice_not_available')` → **409**;
  2. **recomputa a oferta** (`choiceContextFrom` + `matchChoices` — zero confiança no cliente) e
     valida `templateId`+`optionId` contra ela → senão `invalid_option` → 400;
  3. lê moral + focos vivos do atleta; se a opção é `risky` → `resolveChoiceRoll(…, focos[attr],
     moral)` → `result`/`effect` (sucesso→`effect`, falha→`risky.fail`); senão `result='na'`,
     `effect` declarado;
  4. `answerMatchChoice(…)` (a tx de B). **Retry-safe por construção — pela PK, não pelo roll**:
     qualquer segunda escrita (retry de rede, double-click, outra opção) morre no gate
     "ainda não resolvida"/no conflito da PK (409 `choice_resolved`) **antes de aplicar efeito** —
     nenhum bump duplo (sem o débito do `spendFreePoint`). O roll é determinístico DADOS
     `(templateId, optionId, attr, moral)`; como attr/moral são VIVOS, computações concorrentes
     podem divergir — o que persiste é o roll do **vencedor do INSERT** (aceito; classe dos
     inputs vivos, ver Riscos).
- **IDs, explícito** (o erro clássico a evitar): `choiceContextFrom`/`matchChoices`/
  `resolveChoiceRoll` usam o **id do MUNDO** (`occupation.athleteId` — o espaço dos streams
  `'choices'`/`'rating'` e do `byMe` dos eventos); `match_choice.athlete_id`, `bumpMoral` e
  `next_train_focus` usam o **id do PLAYER** (da sessão na rota; `occ.humanAthleteId` no
  resolver — molde SPEC-031 id-do-mundo→id-do-player). Passar o id errado ao `matchChoices`
  faz a oferta recomputada divergir da mostrada → toda resposta válida cairia em
  `invalid_option`.
- **Codes novos** (`ErrorCode` + `MESSAGE` + `DOMAIN_MAP`): `choice_not_available` (409),
  `choice_resolved` (409). `invalid_option` reusado (400).
- **Band aditivo** (`types.ts`/`from-world.ts`/`band-state.ts`): `BandChoiceOption` ganha
  `risky?: boolean` e `attr?: string` (telegrafa o loop treino→chance; `effect`/`fail`/chance
  **continuam server-side**); `BandMatchChoice` ganha `chosenOptionId?: string` e
  `result?: 'success' | 'fail' | 'na'` (a banda lê `readMatchChoices` e anota a oferta
  recomputada). `buildChoices` refatora para usar `choiceContextFrom` (fonte única).
  **Consequência declarada do ciclo de vida:** a anotação só é observável enquanto a rodada
  anotada é a mostrada (o dia do jogo + a manhã de D+1); a resolução do **agente** (tick de D+1)
  **nunca aparece no band** — a rodada mostrada vira no MESMO tick. A superfície de história
  (jornal/perfil) é card futuro.

### D. Scheduler (`services/scheduler` — o timeout)

- **Mecanismo — o passe NÃO abre leituras próprias do mundo:** o `processDay` **pré-computa** um
  mapa `athleteId(mundo) → {match, leagueId, seasonId, round}` da rodada **PUBLICADA de day-1**
  (reusa `readRound` + o mapa clube→liga **extraído/exportado de `round-outcomes.ts`** — hoje o
  `RoundOutcomes` descarta o `MatchRecord`; o helper novo o expõe) e o **injeta** em
  `runHumanPasses`/`safeHumanPasses` (a assinatura interna muda; `daily-tick.ts` é tocado —
  `safeHumanPasses` hoje não recebe `worldDb`, e não passa a receber: recebe o DADO).
- **`tryResolveChoices(playerDb, seed, occ, day, yesterday?)`** (wrapper `tryX`, isolamento
  best-effort — molde `tryInjure`), posicionado em `runHumanPasses` **ao lado do
  `resolveDeadline(day-1)`** ("resolve ONTEM, gera HOJE"): recomputa a oferta de `day-1`
  (`choiceContextFrom(match, clubId, occ.athleteId)` + `matchChoices`) e, para cada template
  **sem linha** em `match_choice`, insere a **conservadora** via
  **`resolveConservative(…, resolvedBy: 'agent')`** (a variante sem-throw de B) — `result='na'`,
  efeito declarado da conservadora, **moral aplicado** (toda conservadora tem `moral ≥ 0` ou só
  `focusBias` — "sem punição" é propriedade do catálogo, **cravada por teste**), **focusBias NÃO
  aplicado** pelo agente (viés de treino é agência do jogador — o repo gateia por `resolvedBy`).
  O conflito é **benigno POR TEMPLATE**: `{inserted:false}` → continua o loop — a corrida
  responder×resolver se resolve no INSERT (quem chegou primeiro venceu, nenhum bump duplo) **e os
  demais templates ainda recebem a conservadora** (um throw no meio do loop os abandonaria para
  sempre — o resolver só olha day-1).
- **Gate de ENTRADA (lição SPEC-034):** pula a ocupação que **entrou depois de day-1** — a borda
  converte `occupiedAt` → day-index e só resolve se `entryDay ≤ day-1`. Sem isso, todo admitido
  mid-season (que entra no FIM do `processDay` justamente para NÃO herdar a rodada já publicada)
  ganharia **escolhas-fantasma + moral** de uma partida que não jogou — a mesma classe que a
  SPEC-034 corrigiu para prêmio/lesão. O reset de `occupiedAt` na viragem
  (`reapplyOccupations`) é inócuo: o resolver já pula a janela de gênese.
- **Gates de rodada**: só roda quando a rodada de `day-1` existe e está publicada (mesma classe do
  gate `paid`, lição SPEC-030); humano **sem partida** em day-1 (sem fixture na rodada) → pula sem
  erro; **pula na janela de gênese** (pós-viragem a liga antiga não é derivável da ocupação atual —
  as escolhas do último dia da temporada expiram sem resolver: limitação conhecida, documentada,
  sem efeito no money path).

### E. Cliente (`client/band-wpf` — apresentação ao vivo)

- **Espelho** (lição da memória — junto, não depois): `BandChoiceOption(string Id, string Label,
  bool Risky = false, string? Attr = null)`; `BandMatchChoice(int Minute, string TemplateId,
  string Type, string Prompt, IReadOnlyList<BandChoiceOption> Options, string? ChosenOptionId =
  null, string? Result = null)`; `BandMatch.Choices` (`IReadOnlyList<BandMatchChoice>? = null`,
  tolerante).
- **`BandApiClient.AnswerMatchChoiceAsync(round, templateId, optionId)`** (molde `WriteAsync`) +
  **`BandActions.AnswerMatchChoiceAsync`** (molde `Run`: Ok/Conflict → Feedback + `RefreshNow()`;
  401 → reauth) + codes novos no `MapCode` (`choice_not_available`/`choice_resolved`).
- **`BandViewModel`**: no handler de `Frame` existente (**zero timer novo** — sem entrada nova no
  Cleanup), com as escolhas não-respondidas ordenadas por minuto: `f.Minute >= choice.Minute`
  (o relógio PULA minutos — `>=`, nunca `==`) abre `CurrentMatchChoice` (Popup overlay, molde
  exato do popup de decisão da SPEC-045; `StaysOpen`; `e.Handled` nos cliques). **Uma por vez**:
  a chegada do minuto da próxima substitui a anterior não-respondida (o momento passou). Clique
  numa opção → POST → feedback pelo `Result` reconciliado ("deu certo"/"não deu" — texto PT-BR do
  cliente, roteado pelo code/result, nunca pela frase). Fim do replay (`Ended`/`StopReplay`) →
  fecha o overlay; **fora do replay não há affordance de escolha** (decisão 4); **↻ re-assistir**
  re-oferece **só as não-respondidas** (as respondidas vêm anotadas do servidor via
  `ChosenOptionId`). Guard contra a reconciliação: o `Apply` no meio do replay **não reseta** o
  overlay em curso (diff por identidade `TemplateId`, molde `CurrentDecision`-por-Id) e o guard
  `ReplayActive` do `MatchLine` permanece.
- **Render estrutural** (OP-17): opção arriscada com marcador visual + o atributo abreviado
  (TEC/TAT/FIS/MEN) — zero regra de jogo no cliente (o `risky`/`attr` vêm do contrato; a chance é
  segredo do servidor).

---

## Escopo — o que está FORA

- **Roll que muda o PLACAR** — âncora da 048 mantida (a partida publicada é imutável; reescrever
  `resolveMatch` está fora).
- **Aplicar `fama`/`risco`** — seams de F2, ficam declarados-inertes no jsonb (precedente
  decisions/compras).
- **Unificar o `focusBias` das decisions** (SPEC-025) no mesmo canal — card futuro.
- **Template result-gated** (o seam `MatchChoiceContext.result`) e **novos templates** — o
  catálogo só ganha `risky` nas 4 opções existentes.
- **Persistir a OFERTA** — segue recomputável (fn pura); só a RESPOSTA persiste. Deploy que mude o
  catálogo entre oferta e resposta → `invalid_option` (aceitável; catálogo estável nesta fatia).
- **Resolver as escolhas do último dia da temporada** na janela de gênese (expiram sem
  conservadora — limitação documentada em D).
- **Chance exibida ao jogador / preview de efeito** — o cliente vê `risky`+`attr`, nunca números.
- **Toasts** do momento de escolha; história no jornal/perfil; localização EN (ids prontos).

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição |
|---|---|---|
| `packages/world-engine/src/engine/match-choices.ts` | modificar | `risky?` no tipo/catálogo; `choiceOptionById`/`conservativeChoiceOption`/`choiceContextFrom`. |
| `packages/world-engine/src/engine/match-choice-roll.ts` | criar | `resolveChoiceRoll` (stream `'choice-roll'`, 60/40, clamp [15,85]). |
| `packages/world-engine/src/engine/match-choice*.test.ts` | modificar/criar | Regressão da oferta byte-idêntica; propriedades do roll; invariantes do catálogo. |
| `packages/world-engine/src/index.ts` | modificar | Exports aditivos. |
| `services/player-store/src/schema/match-choice.ts` (+`index.ts`, `athlete.ts`) | criar/modificar | Tabela `match_choice` + `athlete.next_train_focus`. |
| `services/player-store/src/migrations/0011_*` | criar | Migration (OP-01). |
| `services/player-store/src/store/match-choice-repo.ts` | criar | `answerMatchChoice`/`resolveConservative`/`readMatchChoices` (tx + bumps + gate `resolvedBy`). |
| `services/player-store/src/store/training-repo.ts` | modificar | `applyTraining` consome/limpa `next_train_focus` na própria tx. |
| `services/api/src/routes/answer-match-choice.ts` + `src/gameplay/match-choice.ts` (diretório novo) | criar | A rota + a orquestração (gates → recompute → roll → repo). |
| `services/api/src/router.ts` · `http/types.ts` · `http/respond.ts` · `http/domain-error.ts` | modificar | Rota + IP bucket `matches` 40; codes `choice_not_available`/`choice_resolved`. |
| `services/api/src/routes/training-spend.ts` | modificar | Troca o helper local por `isFocus` de `@camisa-9/player`. |
| `services/api/src/band/types.ts` · `from-world.ts` · `band-state.ts` | modificar | Contrato aditivo (`risky`/`attr`/`chosenOptionId`/`result`); `choiceContextFrom` como fonte única. |
| `packages/player/src/constants.ts` (ou `types.ts`) | modificar | Exporta `isFocus(v): v is Focus` (deriva de `FOCI`). |
| `services/scheduler/src/daily-tick.ts` | modificar | `processDay` pré-computa o mapa da rodada de day-1 e o injeta nos passes por-humano. |
| `services/scheduler/src/round-outcomes.ts` | modificar | Expõe o `MatchRecord`+liga por clube (o helper do mapa de ontem). |
| `services/scheduler/src/human-passes.ts` | modificar | `tryResolveChoices(day-1)` ao lado do `resolveDeadline` (assinatura interna recebe o dado de ontem). |
| `services/player-store/test/match-choice-repo.test.ts` | criar | Cenários 1/3/4/5 no nível do repo (ao vivo). |
| `services/player-store/test/training-repo.test.ts` | modificar | Consumo/limpeza do `next_train_focus`. |
| `services/api/test/server-writes.test.ts` · `domain-error.test.ts` · `band-state.test.ts` · `from-world.test.ts` | modificar | Rota + codes + anotação + refactor do `buildChoices`. |
| `services/scheduler/test/daily-tick.test.ts` | modificar | Timeout/gates do resolver (Cenário 4). |
| `client/band-wpf/Api/BandState.cs` · `BandApiClient.cs` | modificar | Espelho + POST. |
| `client/band-wpf/State/BandActions.cs` · `View/BandViewModel.cs` · `MainWindow.xaml(.cs)` | modificar | Ação + overlay no replay + popup. |
| `specs/SPEC-050…md` / `specs/DONE-050…md` | criar | Esta SPEC + o DONE. |

---

## Mudanças de schema

**Migration `0011` (player-store, aditiva, OP-01):** tabela `player.match_choice` (PK composta
`(athlete_id, season_id, round, template_id)`) + coluna `player.athlete.next_train_focus` text
NULL com CHECK. Nenhuma mudança no world-store; **nenhum golden regenerado**.

---

## Mudanças de API

**Aditivas ao `/v1` (política aditiva-only respeitada):** rota nova `POST
/v1/matches/choices/answer`; `BandChoiceOption.risky?`/`attr?`;
`BandMatchChoice.chosenOptionId?`/`result?`. Campos existentes intocados. Codes novos:
`choice_not_available`, `choice_resolved`.

---

## Critérios de aceitação

**Cenário 1 — responder (determinística):** rodada liquidada, oferta com `pressao-tecnico`;
`POST … {round, templateId:'pressao-tecnico', optionId:'obedecer'}` → 200; linha
`(athlete, season, round, template)` com `result='na'`, `resolved_by='player'`, `effect`
`{focusBias:'tatico'}`; `next_train_focus='tatico'`; moral inalterada (sem chave moral); o
`GET /v1/band` anota `chosenOptionId`/`result`. 2ª resposta → **409 `choice_resolved`**, nenhuma
mudança de estado (nenhum bump duplo).

**Cenário 2 — o roll:** determinismo (mesmos inputs → mesmo `{success, chance}`, cross-run);
monotonia (attr 90 → chance > attr 30, moral fixa; idem moral); clamp [15,85] nos extremos;
streams disjuntos (o roll não desloca a oferta nem a nota). **End-to-end com focos assimétricos**
(lição 029→046→047): responder `chance-clara/arriscar` → `result` persistido + o efeito CERTO
aplicado (sucesso → `effect` declarado; falha → `moral` CAI conforme `risky.fail`) e visível no
`/v1/band`.

**Cenário 3 — focusBias fecha o loop:** resposta do jogador com `focusBias` → `next_train_focus`
setado → o tick do dia seguinte treina ESSE foco (não o do técnico) e **limpa** a coluna; treino
com foco explícito não consome; agente (`resolved_by='agent'`) **nunca** seta o viés.

**Cenário 4 — timeout sem punição:** dia vira sem resposta → o tick de D+1 insere a conservadora
(`resolved_by='agent'`, moral ≥ 0 aplicado); **resolução PARCIAL**: oferta com ≥3 escolhas e o
jogador respondeu 1 → o resolver insere conservadoras **só nas restantes** (N−1 linhas novas; a
linha do jogador intacta, nenhum bump duplo); corrida responder×resolver → exatamente 1 linha,
1 bump, **e uma corrida num template do MEIO não impede a conservadora dos demais** (conflito
benigno por template); **humano admitido no fim de day-1 → o resolver NÃO insere nada para
day-1** (gate de entrada, lição SPEC-034); humano sem partida em day-1 → pula sem erro; janela
de gênese → pula sem erro; **após o tick de D+1** o `GET /v1/band` mostra a rodada NOVA
(pré-jogo, sem `choices`) e nada quebra (a resolução do agente não é visível — consequência
declarada em C); **teste-trava do catálogo**: toda opção `conservative` tem `moral ≥ 0` (ou sem
chave moral) e **nunca** `risky`.

**Cenário 5 — travas e segurança:** responder escolhas **NUNCA toca os 4 focos** (análogo ao
teste nunca-loja-de-stats — `services/player-store/test/economy-repo.test.ts:115` — provado por
teste próprio; o focusBias muda o RITMO do treino, não escreve atributo);
OP-09 por construção (athleteId só da sessão; body de outro atleta é impossível — não existe
campo); `round` errado/rodada não liquidada → 409 `choice_not_available`; `templateId`/`optionId`
fora da oferta recomputada → 400 `invalid_option`; rate limits (IP `matches` 40/min,
conta 30/min); OP-11 (codes, zero prosa interna).

**Cenário 6 — cliente:** `dotnet build` 0 avisos; payload sem `choices` → nada quebra (espelho
tolerante); no replay a escolha abre em `f.Minute >= Minute`, a próxima substitui a anterior,
`Ended`/`StopReplay` fecham o overlay; ↻ re-oferece só não-respondidas; a reconciliação no meio
do replay não resseta o overlay em curso; fora do replay não há affordance.

**Cenário 7 — o selo:** `resolveMatch`/`simulateSeason`/`world-season` e os **5 goldens
byte-idênticos** (`git diff` = 0); a oferta da 048 preservada **módulo `risky`** (teste de
regressão por strip — mesmos templates/minutos/half/ordem/n); gates TS verdes; `client/` fora de
prettier/eslint.

---

## Segurança

A resposta é a **primeira superfície de escrita das escolhas** (a 048 antecipou): validação por
**recomputação server-side** da oferta (zero confiança em `minute`/`prompt`/opções do cliente);
autorização por construção (nenhum identificador de ator na rota); erros só por code (OP-11); o
`effect`/`fail`/chance **nunca viajam** ao cliente; rate limit em duas camadas (molde SPEC-041).
O roll é server-side — não há vantagem em replay de request: a segunda escrita morre no
gate/conflito da PK (409) **antes** de qualquer efeito.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Roll com inputs VIVOS (focos/moral no momento da resposta) → não-recomputável a posteriori | Certa (design) | A linha persistida (`result`+`effect`) é a verdade durável — classe SPEC-029/046 do débito de replay, documentada; snapshot por rodada segue como card de auditoria futuro. |
| Catálogo evoluir entre oferta e resposta (deploy no meio do dia) | Baixa | Recompute → `invalid_option`; catálogo estável nesta fatia; versionamento = futuro. |
| Resolver do timeout precisa da rodada de ONTEM (cross-season) | Média | Gate publicado + pula na janela de gênese (limitação documentada; sem efeito no money path). |
| Overlay × reconciliação no replay (Apply resseta estado) | Média | Diff por identidade `TemplateId` (molde `CurrentDecision`), guard `ReplayActive`, cravado no Cenário 6. |
| `next_train_focus` corrompido vira crash no tick | Baixa | CHECK na coluna + guarda `isFocus` na leitura (lição SPEC-047, dupla defesa). |
| Calibração do roll (15-85, 60/40) desequilibrar | Média | Tunáveis num bloco const; smoke do founder + ajuste barato. |

**Dependências:** SPEC-048 (motor, em `main`) · SPEC-044/045 (replay + escritas do cliente, em
`main`) · SPEC-041 (moldes de rota) · SPEC-027 (bumps). Sem dependência de ops.

---

## Notas de implementação

- **Ordem de construção** (server-first dentro da fatia): engine (roll+helpers) → migration+repo →
  rota+band → scheduler → cliente.
- **Gates de entrega parcial** (pré-combinados, se o appetite de 14 dias estourar): **GATE 1** =
  A+B+C+D (servidor completo — responder via API + timeout D+1 funcionando: o jogo se resolve
  sozinho, sem regressão); **GATE 2** = E (o overlay ao minuto no replay). **Corte pré-aprovado:**
  o cliente degrada para um popup ÚNICO de escolhas não-respondidas ao FIM do replay (reuso
  direto do popup da SPEC-045), com o overlay ao-minuto virando follow-up.
- O módulo de orquestração da rota (`gameplay/match-choice.ts`) mantém o handler fino (OP-15/16);
  reusa os readers que o `band-state.ts` já usa (ocupação, rodada, cursor).
- `moralOf` reusado do decision-repo (extrair helper comum se fizer sentido — sem duplicar).
- O resolver do scheduler consome o mapa de ontem **pré-computado no `processDay`** (`readRound`
  + clube→liga extraído de `round-outcomes.ts`); nunca re-simula nada e o passe isolado não abre
  leituras próprias do mundo.
- Testes ao vivo contra Postgres real (memória: typecheck não prova relógio/ordem/socket);
  baseline atual **672 testes** — todos preservados.
- Cliente: nenhum timer novo; contagem/gatilho 100% derivados do `Frame` existente; qualquer
  estado novo de replay zerado no `StopReplay` (gotcha do timer zumbi da SPEC-044).

---

## Checklist de aprovação

- [ ] Objetivo claro e verificável
- [ ] Escopo bem delimitado (dentro e fora)
- [ ] Arquivos listados corretos e completos
- [ ] Mudanças de schema documentadas (migration `0011`)
- [ ] Critérios de aceitação testáveis
- [ ] **Decisão: loop completo (servidor+cliente) numa fatia** — aceita
- [ ] **Decisão: roll por atributos+moral (revisão da âncora 048; placar intocado)** — aceita
- [ ] **Decisão: focusBias aplicado como viés do treino do dia seguinte (Model A)** — aceita
- [ ] **Decisão: janela = replay no cliente; backstop conservador no tick D+1** — aceita

---

*SPEC-050 — método H1VE. O "interagir" fecha o dia de jogo: escolhas ao vivo no replay, roll
determinístico por atributo+moral (o treino importa nos momentos), moral agora + viés de treino
amanhã, conservadora sem punição para quem não estava. Engine de simulação e os 5 goldens
intocados; migration 0011; contrato /v1 aditivo.*
