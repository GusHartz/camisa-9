# SPEC-041 — Escritas de gameplay (o Dia do Jogador acionável)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada **no card**.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-041 |
| **Feature** | Escritas de gameplay — as AÇÕES que os cards 1-2 só expõem como estado (card 3 de 4) |
| **Slug** | escritas-de-gameplay |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap** | **3.7** (o Dia do Jogador). Card 3 de 4 de "Faixa: a vida no CT". |
| **Appetite** | **2 a 3 dias** (o passe de treino automático + as 4 rotas + o erro tipado/mapeamento + testes). |
| **Prioridade** | ALTA — server-first (P11): as escritas precedem a faixa visual (card 4), que por isso já nasce acionável. |
| **Criada em** | 2026-07-21 |
| **Status** | **PROPOSTA — aguardando aprovação do founder no card.** |
| **Dependência** | SPEC-037/038 (o servidor + `requireAthlete` + `RouteCtx` + `respond` + o balde de `accountId`); os repos já testados (SPEC-017/019/024/025/022). |

## Decisões travadas com o founder (2026-07-21)

1. **Treino = AUTOMÁTICO (acúmulo) + o jogador DISTRIBUI os pontos (o gancho).** O padrão idle, fiel à tese ambiente ("presença dá cor, nunca resultado" · "ausência nunca perde"). O acúmulo de XP → pontos livres roda **sozinho no scheduler** (até offline); a **agência do jogador é ONDE gastar** o ponto (`POST /v1/training/spend`). ⇒ **cai o `POST /v1/training` manual** e **cai o `trainedToday`** (redundante — o técnico sempre treina); o sinal acionável é o `freePoints`, que o `/v1/band` **já expõe**.
2. **Rota de decisão no BODY:** `POST /v1/decisions/answer` com `{ decisionId, optionId }` — o router da SPEC-037 é **exato (sem params)**; coerente com a doutrina "poucos paths exatos". (O `:id` da decisão é recurso do atleta, não ator — poderia ir no path, mas o body evita estender o router.)
3. **Erros TIPADOS na fonte, MAPEADOS na borda.** As fns de domínio lançam `Error`/`OccupyError` genérico (→ 500 hoje, errado). As 3 do player-store passam a lançar **`GameplayError(code, msg)`** (molde do `OccupyError` já existente); a borda mapeia `code → (status HTTP, ErrorCode público)`. Regen (`OccupyError`) mapeia grosso → `regen_ineligible` (409). Erro NÃO é a mensagem (OP-11) — é o `code`.
4. **Defaults:** o **dia** de toda escrita/carimbo = **`tickDay` (`dueDayIndex(ctx.epochMs)`)** — casa com o que a faixa LÊ e o scheduler carimba; **response** = `200 { ok: true }` (a faixa re-busca o `GET /v1/band`, fonte única); **rate limit** = balde por `accountId` dentro de cada rota (molde do `band.ts`); **SEM MIGRATION** (o escopo `'train'` é valor de `text` no `daily_ledger`).

---

## Objetivo

Tornar o Dia do Jogador **acionável**. Os cards 1-2 entregaram o motor + a LEITURA (`GET /v1/band`); esta fatia entrega as **AÇÕES**: o jogador **distribui** os pontos que o treino automático acumulou, **responde** decisões, **compra** itens e **pede** regen — quatro rotas POST finas sobre funções já testadas, com o treino reformulado no padrão idle (acúmulo automático + distribuição como gancho de retenção).

---

## Contexto e motivação (fatos verificados no repo)

- **O treino hoje não tem rota E ninguém o dispara** (grep: `applyTraining` só na definição + barrel + teste; o scheduler NÃO importa treino). ⇒ os `freePoints` que o `/v1/band` expõe nunca crescem. Esta fatia liga o acúmulo (scheduler) e o gasto (rota).
- **`applyTraining(db, athleteId, focus, opts?)`** (`training-repo.ts:49`) abre tx com `FOR UPDATE`, enche a barra de XP → +1 ponto livre (Model A, SPEC-017/019). ⚠️ **NÃO tem `day` nem ledger** — 2 chamadas no mesmo dia depositam 2×. Precisa do gate `'train'` (1×/dia).
- **`spendFreePoint(db, athleteId, focus)`** (`training-repo.ts:84`) gasta 1 ponto → +1 no atributo (teto 99), tx + `FOR UPDATE`; lança se `freePoints <= 0` ou foco em 99. **É o gasto — o gancho.** Não é por-dia (gasta N pontos em N chamadas).
- **`answerDecision(db, athleteId, decisionId, optionId)`** (`decision-repo.ts:119`) **verifica o dono** (`WHERE id AND athleteId`), tx + `FOR UPDATE`, aplica moral + seam de transferência na mesma tx; lança `'já resolvida'`/`'não encontrada'`/`'opção inválida'`.
- **`purchaseItem(db, athleteId, itemId)`** (`economy-repo.ts:88`) tx + `FOR UPDATE` no saldo, re-valida sob lock; barra double-buy (PK) + saldo insuficiente + moradia fora de ordem; retorna `Wallet`.
- **`requestRegen(worldDb, worldSeed, humanAthleteId)`** (`occupation-repo.ts:154`) é **CROSS-SCHEMA (world-store)** — mas o `worldDb`/`worldSeed` **já estão no `RouteDeps`** (`router.ts:38`, `worldSeed` de env). Trava idade ≥25 (`REGEN_AGE.voluntary`), lança `OccupyError`. Idempotente.
- **`daily_ledger`** (`schema/daily-ledger.ts`, PK `(athlete, day, scope)`): `scope` é **`text` livre, sem CHECK** → um `'train'` novo **não precisa de migration**. O claim `insert(...).onConflictDoNothing().returning()` (0 linhas = já reivindicado) é o padrão de `accrueRound`/`applyDailyMood`.
- **`runHumanPasses`** (`daily-tick.ts:274`) roda os passes por-humano no dia `day` (= `dueDayIndex`): accrue · mood · deadline(ontem) · generate(hoje) · recovery. **O passe de treino entra aqui.**
- **O router é exato** (`router.ts:80`, lookup `${method} ${path}`), sem params — daí a decisão 2 (id no body). Os `ErrorCode` são fechados (`types.ts:45-53`); `fail(status, code)` toma o status livre.
- **`OccupyError extends Error {}`** (`occupation-repo.ts:17`) é o precedente de erro tipado.

---

## Escopo — o que está DENTRO

### A) O treino idle — acúmulo automático + gate `'train'`
- [ ] **`services/player-store` — `applyTraining` ganha `day` + o claim `'train'`:** assinatura vira `applyTraining(db, athleteId, focus, day, opts?)`; no início da tx, `insert(dailyLedger {athleteId, day, scope:'train'}).onConflictDoNothing().returning()` — 0 linhas → **no-op** (retorna o `Progress` atual, sem re-depositar). Torna o treino **1×/dia**. (Atualiza o `training-repo.test.ts` — hoje o único caller.)
- [ ] **`services/scheduler` — o passe de treino automático:** em `runHumanPasses` (`daily-tick.ts:274`), acrescentar `await applyTraining(playerDb, id, null, day)` (foco `null` = `coachFocus`, o mais baixo — roda naturalmente, sem penalidade). Isolado (`safeHumanPasses`, como os demais). O acúmulo alcança **todo humano**, presente ou não.

### B) As 4 rotas de escrita (`services/api/src/routes/`)
- [ ] **`POST /v1/training/spend`** — `{ attribute: Focus }` → `spendFreePoint(db, athleteId, attribute)`. **O gancho** (distribuir os pontos).
- [ ] **`POST /v1/decisions/answer`** — `{ decisionId, optionId }` → `answerDecision(db, athleteId, decisionId, optionId)`.
- [ ] **`POST /v1/purchases`** — `{ itemId }` → `purchaseItem(db, athleteId, itemId)`.
- [ ] **`POST /v1/regen`** — sem body → `requestRegen(worldDb, worldSeed, athleteId)` (cross-schema; usa o `worldDb`/`worldSeed` do `RouteDeps`).
- [ ] Cada rota: `requireAthlete` → valida o body (`parseX`, molde do `parseLoginBody`) → balde `hit(\`<rota>:acct:${accountId}\`, LIMIT, ctx.epochMs)` → chama a fn → mapeia erro → responde `200 { ok: true }`.

### C) Erros tipados + mapeamento na borda
- [ ] **`services/player-store` — `GameplayError extends Error` com `code: string`** (molde do `OccupyError`); `spendFreePoint`/`answerDecision`/`purchaseItem` trocam `throw new Error(msg)` por `throw new GameplayError('<code>', msg)`. Codes: `no_free_points`, `attribute_maxed`, `decision_not_found`, `decision_resolved`, `invalid_option`, `item_invalid`, `insufficient_balance`, `already_owned`, `housing_out_of_order`.
- [ ] **`services/api` — o mapeamento:** a borda captura `GameplayError` → `code → (status, ErrorCode público)`; `OccupyError` (regen) → 409 `regen_ineligible`; throw inesperado → 500 (o `server.ts` já faz). `ErrorCode` públicos NOVOS em `http/types.ts` + frases em `respond.ts`: `no_free_points` (409), `decision_resolved` (409), `invalid_option` (400), `insufficient_balance` (409), `already_owned` (409), `regen_ineligible` (409), `not_found` (existe). O `attribute_maxed`/`item_invalid`/`housing_out_of_order` reusam `invalid_input`/um 409 genérico.

### D) Wiring (`router.ts` / `server.ts` / barrel)
- [ ] `createRoutes` registra as 4 rotas embrulhadas em `requireAthlete`; `POST /v1/regen`/`training/spend`/`decisions/answer`/`purchases`. (Sem balde de IP pré-auth — são autenticadas; o balde de `accountId` no handler basta.)
- [ ] barrel `src/index.ts` — exportar o que for público.

### E) Docs de fundação
- [ ] `functional-spec.md` (cap. 14 "Treino & progressão diária") + `roadmap.md` (3.7) — registrar: **acúmulo automático + distribuição como a ação** (o treino manual sai); o `trainedToday` some.

## Escopo — o que está FORA

- **`POST /v1/training` manual** e o **`trainedToday`** — obsoletados pela decisão 1.
- **Preferência de FOCO do treino** (o jogador escolher a direção do acúmulo) — deferido; o técnico treina o mais baixo. Entra como lever leve depois.
- **Aplicar os efeitos** (a moral da decisão, o trade-off da compra) — já vivem nas fns de domínio (SPEC-024/025/027); esta fatia só as DISPARA.
- **`GET /v1/profile`/`/team`/`/legends`, signup público** — outras superfícies.
- **Rate limit distribuído** (o balde é in-process, débito da SPEC-037).
- **Migration** — **NENHUMA** (o `'train'` é valor de `text`; `GameplayError` é classe; as rotas são arquivos novos).

---

## Contrato — as 4 rotas (`/v1`, aditivo)

Erro **sempre** `{ error, code }` (`code` estável, não-localizável — o cliente roteia/traduz). `no-store` por default. Cada rota: **nenhum identificador de ator** no path/query/body (o `athleteId` vem da sessão).

```
POST /v1/training/spend   { attribute: 'fisico'|'tecnico'|'tatico'|'mental' }
  200 { ok: true }              · 400 invalid_input · 409 no_free_points · 401/409(no_active_athlete) · 429
POST /v1/decisions/answer { decisionId: string, optionId: string }
  200 { ok: true }              · 400 invalid_input/invalid_option · 404 not_found · 409 decision_resolved · 401/409 · 429
POST /v1/purchases        { itemId: string }
  200 { ok: true }              · 400 invalid_input · 409 insufficient_balance/already_owned · 401/409 · 429
POST /v1/regen            (sem body)
  200 { ok: true }              · 409 regen_ineligible · 401/409 · 429
```

**Response `{ ok: true }` de propósito:** a escrita CONFIRMA; a faixa re-busca o `GET /v1/band` para o estado fresco (o `freePoints` decrementa, o `pendingDecisions` cai, o `balance` muda). O agregador é a fonte única — a resposta da escrita não duplica o estado.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `services/player-store/src/store/training-repo.ts` (+`.test.ts`) | editar — `applyTraining` ganha `day` + claim `'train'`; `spendFreePoint`/erros → `GameplayError`. |
| `services/player-store/src/store/{decision-repo,economy-repo}.ts` | editar — os throws viram `GameplayError(code, …)`. |
| `services/player-store/src/store/gameplay-error.ts` · `index.ts` | criar `GameplayError` + barrel. |
| `services/scheduler/src/daily-tick.ts` (+ teste) | editar — o passe de treino automático em `runHumanPasses`. |
| `services/api/src/routes/{training-spend,answer-decision,purchases,regen}.ts` | criar — as 4 rotas. |
| `services/api/src/http/{types,respond}.ts` | editar — os `ErrorCode` novos + frases + o mapeador de `GameplayError`/`OccupyError`. |
| `services/api/src/router.ts` · `src/index.ts` | editar — registrar as 4 rotas + barrel. |
| `services/api/test/server-writes.test.ts` | criar — as 4 rotas ao vivo (sucesso + cada erro + auth + idempotência do treino). |
| `docs/projeto/functional-spec.md`, `roadmap.md` | editar — o treino idle; o `trainedToday` sai. |
| `specs/SPEC-041-…`, `specs/DONE-041-…` | criar. |

**Intocado (o critério DURO):** `packages/world-engine` inteiro e os 4 goldens (`git diff` = 0). **SEM MIGRATION.**

---

## Mudanças de schema

**Nenhuma. SEM MIGRATION.** O escopo `'train'` é um valor novo da coluna `text scope` (sem CHECK); `GameplayError` é uma classe; as rotas são arquivos novos. Nenhuma coluna/tabela/índice.

---

## Critérios de aceitação

1. **O treino idle fecha o loop** *(ao vivo)*: o passe do scheduler roda `applyTraining` **1×/dia** (2º tick no mesmo dia = no-op via o claim `'train'`, provado contando a escrita, não lendo o estado); os `freePoints` crescem para um humano **ausente** (nunca chamou rota). `POST /v1/training/spend { fisico }` decrementa `freePoints` e +1 em `fisico` (via `readAthleteProgress`); sem ponto → **409 `no_free_points`**.
2. **As 4 rotas, sucesso + erro** *(ao vivo)*: cada rota devolve `200 { ok: true }` no caminho feliz e o **status/`code` certo** em cada falha (decisão já resolvida → 409 `decision_resolved`; compra sem saldo → 409 `insufficient_balance`; item repetido → 409 `already_owned`; regen &lt;25 → 409 `regen_ineligible`; opção/atributo/item inválido → 400). Um throw inesperado ainda vira **500 genérico** (OP-11).
3. **Autorização por construção** *(ao vivo + grep)*: cada rota vem de `requireAthlete` (sem header → 401; conta mid-regen → 409 `no_active_athlete`, sem tocar o domínio); **nenhuma rota lê `athleteId` de path/query/body**; a decisão de outro atleta → **404** (o `answerDecision` filtra por dono). O regen usa o `worldSeed` do `RouteDeps`, **nunca do request**.
4. **Idempotência e concorrência** *(ao vivo)*: `POST /v1/decisions/answer` 2× na mesma decisão → o 2º é **409 `decision_resolved`** (não 500, não dupla-moral); `POST /v1/purchases` 2× no mesmo item → **409 `already_owned`** (saldo debitado 1×); dois `spend` concorrentes não fabricam atributo além dos pontos (o `FOR UPDATE` serializa).
5. **Rate limit** *(ao vivo)*: cada rota limita por `accountId` (balde próprio); estourar → **429** com `Retry-After`; o `reset()` no `beforeEach` (estado de módulo, `fileParallelism:false`).
6. **OPs & gates** *(o critério DURO)*: sem `any` (14) / ≤50 linhas por função (15) / ≤300 por arquivo (16) / erros genéricos no corpo (11) / **sem migration** (01) / `WORLD_SEED` só-env (02/12); lint/typecheck/build/test/prettier verdes; **testes preservados** (baseline `npm test` em `main` no início da fatia); **engine e os 4 goldens INTOCADOS (`git diff` = 0)**.

---

## Segurança

- **Autorização por CONSTRUÇÃO** (herdada da SPEC-038): o `athleteId` só vem de `requireAthlete`; nenhuma rota aceita identificador de ator. A decisão/compra/spend são keyed pelo atleta da sessão; `answerDecision` já filtra por dono (decisão de B → 404 para A).
- **OP-09 (auth → autz → input):** `requireAthlete` (401/409) roda ANTES da validação do body (400). O throw do domínio nunca vaza mensagem (OP-11) — a borda mapeia o `code`, o `respond` serializa genérico.
- **Escrita no mundo:** `POST /v1/regen` só liga a flag `regenRequested` numa linha do overlay (selecionada pela sessão); o motor decide o renascimento pós-viragem. A sessão nunca vira posse.
- **i18n:** o `code` é chave estável; zero prosa localizável na API.

---

## Riscos e dependências

| Risco | Prob. | Mitigação |
|---|---|---|
| **Mudar `applyTraining` (N×→1×/dia) quebra o teste** | Alta | O único caller é o teste; atualizá-lo é parte da fatia. O no-op no 2º call devolve o `Progress` atual (não lança). |
| **Ordem tick×spend** (o técnico "reivindica o dia" antes do jogador) | Baixa | O acúmulo é do TÉCNICO (foco automático); o jogador não escolhe foco de treino (só gasta). Sem conflito de foco — a decisão 1 removeu o foco-do-jogador. |
| **Mapeamento de erro incompleto** (um code novo cai em 500) | Média | Teste cobre CADA falha das 4 rotas (critério 2); o default do mapeador é 500 genérico (seguro), não vazamento. |
| **Regen mapeado grosso** (409 `regen_ineligible` cobre "jovem" e "sem vaga") | Baixa | Aceito — regen tem poucos modos; o cliente mostra "não é possível renascer agora". Refinar = evoluir o `OccupyError` (deferido). |

**Dependências:** SPEC-037/038 (servidor + middleware + `respond`/`rate-limit`); os repos (SPEC-017/019 treino, 024 economia, 025 decisões, 022 regen). **Precede:** o **card 4** (a faixa visual — server-first: a faixa já nasce acionável).

---

## Notas de implementação

- **O dia da escrita = `tickDay = dueDayIndex(ctx.epochMs)`** (molde do `band-state.ts:76`) — o `spend` não usa dia (gasta ponto), mas o **passe de treino** do scheduler já roda no `day` do loop (= `dueDayIndex`); a leitura de `freePoints` na faixa é o mesmo espaço. Consistente.
- **`GameplayError`** segue o `OccupyError` (classe vazia + `code`): `class GameplayError extends Error { constructor(readonly code: string, message: string) { super(message); } }`. A borda: `catch (e) { if (e instanceof GameplayError) return fail(MAP[e.code]?.status ?? 500, MAP[e.code]?.code ?? 'internal'); if (e instanceof OccupyError) return fail(409, 'regen_ineligible'); throw e; }`.
- **Rate limit:** o balde de `accountId` por rota (molde `band.ts:20-25`); o `reset()` da SPEC-037 no `beforeEach` de `server-writes.test.ts`.
- **`fileParallelism:false` + limpeza em ordem de FK** (a nova suíte apaga na ordem canônica do `wipeAll`).
- **⚠️ Ritual do board:** `h1ve spec --from …` + aprovação no card + `h1ve done --doc` antes do PR.
- **⚠️ CI (SPEC-166 + prettier):** o DONE precisa de `## Resumo do que foi feito` · `## Arquivos modificados` · `## Critérios de aceitação` · `## AI Declaration`; `prettier --write` em **TODOS** os arquivos tocados antes do push (os 2 gates rápidos mordem antes da suíte).

---

## Checklist de aprovação

- [ ] Objetivo claro e verificável
- [ ] Escopo delimitado (treino idle + 4 rotas + erro tipado; manual/trainedToday/foco-do-jogador FORA)
- [ ] Decisões do founder registradas (treino automático + distribuição; decisão no body; erros tipados; dia=tickDay)
- [ ] **Sem mudança de schema** — nenhuma migration
- [ ] Critérios testáveis (6, incl. o selo de goldens)
- [ ] Riscos avaliados (mudança do `applyTraining`; mapeamento de erro)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-041 — método H1VE. As AÇÕES do Dia do Jogador: o treino vira idle (acúmulo automático + o jogador distribui os pontos = o gancho), + responder/comprar/regen — 4 rotas finas sobre funções testadas, com erro tipado mapeado na borda. SEM MIGRATION. Engine e os 4 goldens INTOCADOS.*
