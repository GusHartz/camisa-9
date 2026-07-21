# DONE-041 — Escritas de gameplay (o Dia do Jogador acionável — card 3 de 4)

> Registro de conclusão. Par obrigatório da SPEC-041. Nenhum PR é válido sem este DONE.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-041 / DONE-041 |
| **Feature** | Escritas de gameplay — as AÇÕES que os cards 1-2 só expunham como estado (card 3 de 4 de "Faixa: a vida no CT") |
| **Slug** | escritas-de-gameplay |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap** | **3.7 — o Dia do Jogador** (as escritas precedem a faixa visual do card 4; server-first) |
| **Concluída em** | 2026-07-21 |
| **Dependência DURA** | SPEC-037/038 (mergeadas) — consome `createApiServer`/`requireAthlete`/`RouteCtx`/`respond`/`rate-limit`; os repos já testados (SPEC-017/019 treino · 024 economia · 025 decisões · 022 regen) |

---

## Resumo do que foi feito

O Dia do Jogador virou **acionável**. Os cards 1-2 entregaram o motor + a LEITURA (`GET /v1/band`); esta fatia entrega as **AÇÕES** — quatro rotas POST finas sobre funções já testadas, com o treino **reformulado no padrão idle** (decisão travada com o founder): o acúmulo de XP → pontos livres roda **sozinho no scheduler** (até offline; "ausência nunca perde"), e a **agência do jogador é ONDE gastar** o ponto. Erros do domínio agora são **TIPADOS na fonte, MAPEADOS na borda** — erro não é a mensagem (OP-11), é o `code`.

**Camadas (tudo borda + o loop idle; `packages/world-engine` e os 4 goldens INTOCADOS, `git diff` = 0; SEM MIGRATION):**
- **`packages/player` (puro):** `economy.ts` — o `PurchaseCheck` do ramo `ok:false` ganhou `code` (a autoridade da regra já é a lib; o repo repassa o `code` ao erro tipado). Sem tocar o guardrail de determinismo.
- **`services/player-store`:** nasce **`GameplayError extends Error` com `code: string`** (molde do `OccupyError`) + barrel; `spendFreePoint`/`answerDecision`/`purchaseItem` trocam `throw new Error(msg)` por `throw new GameplayError('<code>', msg)` (9 codes). **`applyTraining` ganha `day` + o claim `'train'`** no `daily_ledger` (`onConflictDoNothing().returning()`) → **treino 1×/dia** (o scope `'train'` é valor novo da coluna `text` sem CHECK → sem migration).
- **`services/scheduler`:** o **passe de treino automático** em `runHumanPasses` (`await applyTraining(playerDb, id, null, day)`, foco `null` = o técnico treina o mais baixo), **isolado** (`tryTrain`, molde do `tryInjure`) — o acúmulo alcança **todo humano, presente ou não**. Os passes por-humano foram **extraídos** para `human-passes.ts` (OP-16 — o `daily-tick.ts` passara de 300 com o passe novo).
- **`services/api` (o coração):** as 4 rotas `src/routes/{training-spend,answer-decision,purchases,regen}.ts` (cada uma: `requireAthlete` → balde por `accountId` → valida body → chama a fn → `mapDomainError`); o **mapeador** `src/http/domain-error.ts` (`GameplayError.code → (status, ErrorCode público)`; `OccupyError` → 409 `regen_ineligible`; desconhecido → RETHROW → 500+log); `ErrorCode` novos + frases em `types.ts`/`respond.ts`; wiring em `router.ts` (as 4 rotas + baldes de IP pré-auth por-rota).

**Contrato `/v1` (aditivo):** `POST /v1/training/spend {attribute}` · `/v1/decisions/answer {decisionId,optionId}` · `/v1/purchases {itemId}` · `/v1/regen` (sem body) — cada uma `200 {ok:true}` no caminho feliz (a faixa re-busca o `GET /v1/band`, fonte única) e o status/`code` certo em cada falha. **Nenhuma rota lê identificador de ator** — o `athleteId` vem SEMPRE da sessão (autorização por construção, `sdd.md:84`).

---

## Desvios da SPEC (mecanismo/drift, não de produto) — registrados

1. **Balde de IP pré-auth nas 4 rotas (a SPEC dizia para NÃO ter).** A SPEC §D (linha 71) prescrevia "sem balde de IP — são autenticadas". Isso reabriria o furo que a SPEC-038 fechou: um flood de `Bearer <lixo>` pagaria um `readSessionByHash` por request sem teto. A implementação **corretamente divergiu** e pôs o teto de IP pré-auth — e a revisão adversarial refinou o mecanismo (ver abaixo).
2. **Rate-limit ANTES da validação do body** (a SPEC §B linha 64 dizia "valida body → `hit`"). O `hit()` roda antes do parse nas 4 rotas — é **mais defensivo** (um body malformado ainda consome budget, protegendo o parse). A ordem OP-09 (auth → autz → input) segue respeitada: `requireAthlete` roda no router, ANTES do handler. Drift de texto, não de comportamento.
3. **`economy.ts` (puro) tocado além da tabela de arquivos da SPEC.** Para o `GameplayError` da compra carregar um `code`, o `PurchaseCheck` puro ganhou `code` no ramo `ok:false` (fatoração DRY — a autoridade da regra já é a lib). Sem impacto no guardrail nem em engine/golden; os callers (`economy-repo`, `economy.test`) atualizados.
4. **Contrato por-rota não enumera o 409 `conflict`.** `attribute_maxed` (gastar ponto num atributo em 99) e `housing_out_of_order` (moradia fora de ordem) mapeiam para `409 'conflict'` (genérico, coerente com a §C), mas o bloco `## Contrato` da SPEC não os lista. Comportamento correto; drift documental.

---

## Revisão adversarial (3 dimensões em paralelo · cada achado verificado ceticamente)

**Núcleo SÓLIDO — zero CRITICAL/MAJOR.** As 6 suspeitas semeadas na dimensão de correção voltaram **verificadas OK**: o scope `'train'` é distinto de `accrue`/`mood` (sem colisão de PK), o claim+crédito commitam na mesma tx (crash → rollback des-reivindica), a ordem dos passes é segura (`applyTraining` não move o `overall`), `spendFreePoint` serializa sob `FOR UPDATE`, o mapeamento de erro é completo e sem vazamento, os consumidores do `code` foram atualizados. Achados acionados:

- **1 MINOR (rate limit) — cross-confirmado por 2 dimensões (segurança + correção) e CORRIGIDO.** O balde de IP `write` **compartilhado** a 10/min ficava ABAIXO dos tetos por-conta (treino 30) → um jogador distribuindo os pontos acumulados (o **gancho central** da SPEC-041) batia **429 no 11º `spend`**, e num NAT um treino pesado starvava compra/regen dos demais. **Fix:** baldes de IP **por-rota** (sem starvation cruzada) + o **treino a 40** (> os 30 por-conta) → o por-conta volta a ser o limite efetivo. **+ 2 testes** (11 spend do mesmo IP → todos 200; o flood pré-auth movido p/ `purchases` a 10).
- **1 MINOR (robustez) — CORRIGIDO.** `answerDecision` fazia `WHERE id = <decisionId>` numa coluna `uuid` sem guarda: um `decisionId` não-UUID → `22P02` → **500** (contra o contrato, disparável por lixo do cliente — a mesma classe de bug da memória da SPEC-038). **Fix:** validar o formato UUID no `parseBody` → **400 `invalid_input`**. **+ teste.**
- **1 NIT (diagnosticabilidade) — CORRIGIDO.** Um `GameplayError` com code não mapeado caía em `return fail(500,'internal')` — um 500 **silencioso** (o `return` não aciona o `logInternal` do `server.ts`). **Fix:** `throw err` → sobe ao `server.ts` (500 genérico **+ log**). **+ teste puro** do mapeador (`domain-error.test.ts`).
- **1 MINOR (débito conhecido) — DOCUMENTADO.** `spendFreePoint` é a única escrita interativa **sem chave de idempotência**: um retry após resposta perdida gasta um 2º ponto (se um acúmulo creditou no meio). Dano **limitado** (nunca negativo, nunca além dos `freePoints`, cai no atributo escolhido); um token de dedup exigiria tabela nova (contra o "sem migration"). Registrado no código + follow-up abaixo.
- **Lacunas de cobertura dos próprios critérios 2/4/5 — FECHADAS.** +teste de **spend concorrente** (1 ponto, 2 requests → um 200/um 409, atributo sobe 1× só); +teste do **header `Retry-After`** no 429; +o teste puro do mapeador cobre o **throw inesperado → rethrow**.

---

## Arquivos modificados

**Novos:** `services/player-store/src/store/gameplay-error.ts` · `services/scheduler/src/human-passes.ts` · `services/api/src/http/domain-error.ts` · `services/api/src/routes/{training-spend,answer-decision,purchases,regen}.ts` · `services/api/test/{server-writes,domain-error}.test.ts` · `specs/{SPEC,DONE}-041-escritas-de-gameplay.md`.

**Editados:** `packages/player/src/{economy,economy.test}.ts` · `services/player-store/src/{index,store/training-repo,store/decision-repo,store/economy-repo}.ts` · `services/player-store/test/{training-repo,mood-repo}.test.ts` · `services/scheduler/src/daily-tick.ts` (+`test`) · `services/api/src/{router,http/types,http/respond}.ts` · `docs/projeto/{functional-spec,roadmap}.md`.

**Intocado (o critério DURO):** `packages/world-engine` inteiro e os 4 goldens (`git diff` = 0). **SEM MIGRATION.**

---

## Critérios de aceitação

Os 6 critérios da SPEC, com evidência — todos ✅ (cravados na suíte ao vivo contra Postgres real):

1. **O treino idle fecha o loop** — o passe do scheduler roda `applyTraining` **1×/dia** (2º tick no mesmo dia = no-op via o claim `'train'`); os `freePoints` crescem para um humano **ausente** (teste `daily-tick.test.ts`: nunca chamou rota, `trainingXp > 0`); `POST /v1/training/spend {fisico}` decrementa `freePoints` e +1 em `fisico`; sem ponto → **409 `no_free_points`**.
2. **As 4 rotas, sucesso + erro** — cada rota `200 {ok:true}` no caminho feliz + o status/`code` certo em cada falha (decisão resolvida → 409 `decision_resolved`; sem saldo → 409 `insufficient_balance`; item repetido → 409 `already_owned`; regen <25 → 409 `regen_ineligible`; opção/atributo/item inválido → 400); **throw inesperado → RETHROW → 500 genérico** (teste puro do `mapDomainError`).
3. **Autorização por construção** — cada rota vem de `requireAthlete` (sem header → 401; mid-regen → 409 `no_active_athlete`); nenhuma rota lê `athleteId` de path/query/body; decisão de OUTRO atleta → **404** (o `answerDecision` filtra por dono); o regen usa o `worldSeed` do `RouteDeps`.
4. **Idempotência e concorrência** — `answer` 2× → 409 `decision_resolved` (não 500, não dupla-moral); `purchases` 2× → 409 `already_owned` (saldo debitado 1×); dois `spend` concorrentes → um 200/um 409, o atributo sobe **1× só** (`FOR UPDATE`).
5. **Rate limit** — cada rota limita por `accountId`; estourar → **429 com `Retry-After`** (asserido); baldes de IP pré-auth por-rota (11 tokens inválidos → 429).
6. **OPs & gates (o critério DURO)** — sem `any` (14) / ≤50 linhas por função (15) / ≤300 por arquivo (16 — `daily-tick.ts` refatorado p/ 276) / erros genéricos (11) / **sem migration** (01) / `WORLD_SEED` só-env (02/12); lint/typecheck/build/test/prettier verdes; **engine e os 4 goldens INTOCADOS**.

---

## Gates de qualidade

- **605 testes** (os de `main` preservados + os desta fatia: **22 novos** nas suítes brand-new `server-writes.test.ts` (17 — as 4 rotas ao vivo: sucesso + cada erro + auth + concorrência + rate limit) e `domain-error.test.ts` (5 — o mapeador puro) + a idempotência do treino no `scheduler`/`training-repo`), **rodados ao vivo contra Postgres real** (porta 5434).
- **typecheck** (`tsc -b` + typecheck.json) · **eslint** (OP-14/15/16 — passes por-humano extraídos p/ `human-passes.ts`) · **build** · **prettier** verdes.
- **`packages/world-engine` e os 4 goldens INTOCADOS** (`git diff` = 0). **SEM MIGRATION** (o scope `'train'` é valor da coluna `text` sem CHECK; `GameplayError` é classe; as rotas são arquivos novos).

---

## Escopo deferido / follow-ups (nomeados)

- ⚠️ **Token de idempotência do `spend`** (o débito at-least-once acima) — precisa de dedup persistido (tabela + migration); a faixa reconcilia relendo `/v1/band` por ora. **Card a criar** quando a fatia justificar a migration.
- **Preferência de FOCO do treino** (o jogador escolher a direção do acúmulo) — deferido; hoje o técnico treina o mais baixo. Lever leve depois.
- **Aplicar os efeitos** (moral da decisão, trade-off da compra) — já vivem nas fns de domínio (SPEC-024/025/027); esta fatia só as DISPARA.
- **`GET /v1/profile`/`/team`/`/legends`, signup público, Steam auth** — outras superfícies. **Rate limit distribuído** (o balde é in-process, débito da SPEC-037).
- **A faixa visual WPF** = card 4 (server-first: a faixa já nasce acionável). ⚠️ **O NÚMERO DA CAMISA** (SPEC-040, mergeada) já destravou a dep DURA.
- Drift documental do contrato (o 409 `conflict` não enumerado) — corrigir no `functional-spec` quando a superfície da API ganhar sua própria doc.

---

## AI declaration

Implementação conduzida por agente de IA (Claude Code / Opus 4.8) em par com o dev (gustavo-hartz), com: redesenho do treino para o modelo idle travado com o founder, implementação sequencial revisada arquivo-a-arquivo, suíte ao vivo contra Postgres real, e **revisão adversarial por 3 agentes paralelos (correção/concorrência · segurança da API · escopo/OPs), cada achado verificado ceticamente** — que confirmou o núcleo sólido (zero CRITICAL/MAJOR) e pegou 2 MINOR reais (o balde de IP que mascarava o gancho de distribuição de pontos; o `decisionId` não-UUID → 500) + 1 débito documentado (o `spend` at-least-once) + lacunas de cobertura dos próprios critérios, todos corrigidos/registrados e cravados por teste. **Não houve revisão humana linha-a-linha do código** antes deste DONE — o rigor veio dos gates automatizados (typecheck/eslint/605 testes ao vivo/selo de goldens) e da revisão adversarial. Os desvios da SPEC estão registrados acima.

---

*DONE-041 — método H1VE. O card 3 de 4 de "Faixa: a vida no CT": as AÇÕES do Dia do Jogador — o treino vira idle (acúmulo automático + o jogador distribui os pontos = o gancho), + responder/comprar/regen, 4 rotas finas com erro tipado mapeado na borda. SEM MIGRATION. Engine e os 4 goldens INTOCADOS.*
