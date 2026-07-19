# SPEC-030 — Scheduler de produção (o tick diário)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-030 |
| **Feature** | Scheduler de produção — card do board |
| **Slug** | scheduler-de-producao |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 1.2 (rodadas diárias) — o gatilho de produção |
| **Appetite** | **4 a 6 dias** (serviço greenfield + orquestrador + ledger de idempotência + mapeamento de prêmio + testes). |
| **Prioridade** | ALTA — a chave que faz o mundo JOGAR sozinho; paga os débitos de idempotência (SPEC-024/027). |
| **Criada em** | 2026-07-18 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-18)

1. **Tick diário COMPLETO idempotente** (fatia 1). O `runDailyTick(worldDb, playerDb, seed, epochMs)` dirige **TUDO** numa passada: `runDailyRound` (+ `moodModulator`) → os passes por-humano (accrue+mood **com ledger**, decisões/recuperação já-seguros) → regen (na virada) + vacancy; + um **entrypoint fino** que lê `Date.now()`. **Idempotente ponta a ponta** (rodar o mesmo dia 2× = no-op).
2. **Salário + prêmio** (money path completo). O accrue paga `salário f(overall)` **+ prêmio por resultado** — mapeando a rodada publicada → o jogo do clube do humano → win/draw/loss → `matchPrize`.
3. **Ledger de idempotência** (paga o débito das SPEC-024/027). `accrueRound` (sem chave) e `applyDailyMood` (sem guarda de dia) ganham um **ledger `(athlete_id, day, scope)`** (molde do `decision_one_per_day`): o INSERT com `onConflictDoNothing … returning` **é a reivindicação atômica** — 0 linhas = já rodou hoje → skip. Os demais passes já são retry-safe.
4. **1 mundo, seed fixo** (config/env). A iteração é forçada: **por seed → `readWorldOccupations` → por ocupação humana**. Multi-seed (lista de config) e o sinal de atividade (`markActive` via HTTP/login) ficam FORA.
5. **A borda impura.** O scheduler vive em `services/*` (fora do guardrail) — é o **único** lugar que lê `Date.now()`; injeta `epochMs` nos passes puros. Os testes injetam epoch (molde `epochAt` do `daily-round.test.ts`).

---

## Objetivo

Dar ao mundo o **batimento cardíaco de produção**: um worker que lê o relógio **1×/dia** e dirige, de forma **idempotente**, todos os passes que hoje só rodam em teste — a rodada do mundo (com a modulação de forma/moral), o pagamento (salário+prêmio), o decay de forma/moral, as decisões, a recuperação de lesão, a viragem/regen e a retenção. Fecha o débito honesto que venho catalogando: `accrueRound`/`applyDailyMood` **retry = pagamento/decay em dobro** → um ledger os torna seguros. Depois disso, **o mundo joga às 15h de verdade**.

---

## Contexto e motivação (fatos verificados no repo)

- **Greenfield:** não há worker/main em `services/*` (o único executável é o `harness/run-season.ts` da SPEC-002). Este card cria a borda do zero.
- **Dois handles:** `world-store` e `player-store` têm cada um seu `type Db` (schemas separados, sem FK cross-schema) — o scheduler segura os dois (molde `moodModulator`/regen).
- **O tick do mundo:** `runDailyRound(db, seed, epochMs, modulate?)` (`daily-round.ts:47`) → `DailyRoundReport { dayIndex, seasonId, targetRound, status, complete, leagueCount }`. `status ∈ {published, idempotent, locked, deferred, season_rolled, before_season, fora_de_janela, sem_mundo, sem_ancora}`. `resolveSlot(epochMs)` (`anchor.ts:22`) → `RoundSlot { dayIndex, isMatchWindow (hour===15), … }` — puro, UTC-3 fixo.
- **A costura de mood:** `moodModulator(worldDb, playerDb, seed)` → o `WorldModulator` a injetar (SPEC-029).
- **Os passes:** `runRegenPass(worldDb, playerDb, seed, canRegen?)` → nº regenerados; `runVacancyPass(worldDb, seed, currentDay, hooks?)` → `{frozen, reverted}`; `accrueRound(db, athleteId, result?)` **⚠️ SEM idempotência**; `applyDailyMood(db, athleteId, day)` **⚠️ SEM guarda de dia**; `generateForDay`/`resolveDeadline`/`advanceRecovery` **já idempotentes**.
- **A iteração:** `readWorldOccupations(worldDb, seed)` → `OccupationView[]` (traz `athleteId` [mundo] + `humanAthleteId` [player] + `clubId` + `ability`…). É a **única** lista de trabalho de humanos (não há "listar atletas ativos" global).
- **O prêmio:** `readRound(worldDb, leagueId, seasonId, round)` → `RoundResult { round, matches: MatchResult[] }`; cada `MatchResult { homeId, awayId, homeGoals, awayGoals }` (⚠️ **nome colide** com `MatchResult='win'|'draw'|'loss'` da `economy.ts` — aliasar). `matchPrize(result)` (`economy.ts:108`).
- **O molde de idempotência:** `decision_one_per_day` (UNIQUE `(athlete_id, day, template_id)` + advisory lock) e `published_round` (PK `(league_id, season_id, round)`) — o ledger espelha isso.

---

## Escopo — o que está DENTRO (fatia 1)

**A) `services/scheduler` (greenfield) — o orquestrador + a borda:**
- [ ] `runDailyTick(worldDb, playerDb, seed, epochMs): Promise<DailyTickReport>` — a ORQUESTRAÇÃO (decomposta, OP-15):
  1. `resolveSlot(epochMs)` → `dayIndex`/janela (fora da janela → report curto).
  2. `runDailyRound(worldDb, seed, epochMs, moodModulator(worldDb, playerDb, seed))` → o mundo publica/vira.
  3. Se `status === 'season_rolled'` → `runRegenPass(worldDb, playerDb, seed)`.
  4. `runVacancyPass(worldDb, seed, dayIndex)`.
  5. **Loop por-humano** (`readWorldOccupations`): para cada ocupação, `runHumanPasses` — **isolado por humano** (erro de um não aborta o tick; molde do regen).
  7. Devolve `DailyTickReport` (contadores: rodada, humanos, accrued, mood, decisões, regen, vacancy).
- [ ] `runHumanPasses(worldDb, playerDb, seed, occupation, dayIndex, round?)` — os passes por-atleta: `accrueRound(…, dayIndex, prize)` (idempotente) · `applyDailyMood(…, dayIndex)` (idempotente) · `resolveDeadline(…, dayIndex−1)` (ontem, fallback das 18h) · `generateForDay(…, dayIndex, seed, extra)` (hoje) · `advanceRecovery(…, dayIndex)`.
- [ ] `prizeForClub(roundResult, clubId): 'win'|'draw'|'loss'|undefined` — acha o jogo do clube na rodada + o resultado; `buildClubLeagueMap(world)` (clubId→leagueId, de `readWorld`) para achar a liga do humano.
- [ ] **Entrypoint** `main.ts` (a BORDA impura): lê `Date.now()` + a `seed` (env/config) + `DATABASE_URL`, cria os dois handles, chama `runDailyTick(worldDb, playerDb, seed, Date.now())`, loga o report (OP-11), fecha os pools.

**B) `services/player-store` — o LEDGER (paga o débito de idempotência):**
- [ ] **Migration aditiva `0008`** (schema `player`, OP-01): tabela **`daily_ledger`** (`athlete_id` FK, `day` int, `scope` text, `created_at`) — PK/UNIQUE **`(athlete_id, day, scope)`**.
- [ ] `accrueRound(db, athleteId, day, result?)` — ganha `day`; dentro da tx, **claim** `insert(daily_ledger {athleteId, day, 'accrue'}).onConflictDoNothing().returning()` → 0 linhas = já pago hoje → `{credited:0, balance, idempotent:true}`; senão credita + (o claim já gravou). Atômico (crash → rollback des-reivindica).
- [ ] `applyDailyMood(db, athleteId, day)` — mesmo claim com `scope='mood'` → 0 linhas = já decaiu hoje → devolve o mood atual sem re-decair.

**C) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA (futuro)

- **A infra de cron/deploy** (o que dispara o `main` 1×/dia num relógio real — Neon cron / host / serverless) — card de **deploy/ops**; a fatia entrega o `main` executável, não o agendamento.
- **Multi-seed** (uma lista de mundos) — o `runDailyTick` recebe UMA seed; iterar N seeds = config futura.
- **O sinal de atividade** (`markActive` via HTTP/login) — o congelamento de vaga usa o `lastActiveDay`; a origem real do sinal é fatia de HTTP.
- **Stamina** · os **12 atributos** · a UI/faixa/toasts.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `services/scheduler/` (package.json, tsconfig, src/) | criar — o serviço greenfield. |
| `services/scheduler/src/daily-tick.ts` (+ `index.ts`) | criar — `runDailyTick`/`runHumanPasses`/`prizeForClub`/`buildClubLeagueMap`. |
| `services/scheduler/src/main.ts` | criar — a BORDA (lê `Date.now()`/env, chama o tick). |
| `services/scheduler/test/daily-tick.test.ts` | criar — testes ao vivo (injeta epoch). |
| `services/player-store/src/schema/daily-ledger.ts` (+ barrel, drizzle.config) | criar — a tabela `daily_ledger`. |
| `services/player-store/src/migrations/0008_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/player-store/src/store/economy-repo.ts` | editar — `accrueRound(…, day, result?)` idempotente (ledger). |
| `services/player-store/src/store/mood-repo.ts` | editar — `applyDailyMood` idempotente (ledger `mood`). |
| `services/player-store/test/economy-repo.test.ts`, `mood-repo.test.ts` | editar — a nova assinatura + a idempotência por dia. |
| Suítes irmãs (`wipeAll`) | editar — `delete(daily_ledger)` antes de `delete(athlete)` (gotcha da tabela-filha). |
| `tsconfig`/CI | editar se preciso — incluir `services/scheduler` no typecheck (padrão `services/*`). |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 1.2 scheduler + flip SPEC-029 → PR #32. |
| `specs/SPEC-030-*.md`, `specs/DONE-030-*.md` | criar. |

**Intocado:** a **lógica** do `packages/world-engine` (só reusa os passes/tipos) e **os 4 goldens** (`git diff` = 0 — o scheduler só orquestra); o `world-store` (só consome os repos existentes).

---

## Critérios de aceitação

1. **O ledger (idempotência — o débito pago):** `accrueRound(…, day, result)` 2× no mesmo dia → credita **1×** (a 2ª é `idempotent`, saldo inalterado); `applyDailyMood(…, day)` 2× no mesmo dia → decai **1×**. Testado ao vivo.
2. **O tick publica e paga:** `runDailyTick` numa janela 15h → `runDailyRound` publica a rodada E cada humano recebe salário+prêmio (o clube que venceu → +prêmio), decai mood, gera decisões, avança recuperação. Testado ao vivo.
3. **O prêmio por resultado:** um humano cujo clube **venceu** a rodada recebe `salário + matchPrize('win')`; empate/derrota → o prêmio correto. `prizeForClub` acha o jogo certo. Testado.
4. **Idempotência ponta a ponta:** rodar o **mesmo** `(seed, epochMs)` 2× → o 2º tick é no-op (rodada `idempotent`, ledger barra o re-pagamento/re-decay, os demais passes já-seguros). Nenhum estado dobra. Testado.
5. **A virada dispara o regen:** num dia de fim de temporada, `status==='season_rolled'` → `runRegenPass` roda (as carreiras elegíveis regeneram); num dia normal, não. Testado.
6. **Isolamento:** um passe que falha para UM humano não aborta o tick (os demais processam); o report conta o que rodou. Testado.
7. **A borda:** `runDailyTick` recebe `epochMs` **injetado** (nenhum `Date.now()` no orquestrador testável); só o `main.ts` lê o relógio. Guardrail: o scheduler está fora de `packages/*` (o `Date.now()` é legítimo lá).
8. **OPs & gates:** sem `any` (14); ≤50 linhas/função (15); ≤300/arquivo (16); erros genéricos (11); migration aditiva (01); orquestração fina / regra nos repos (17); `lint`/`typecheck`/`build`/`test`/prettier verdes; **lógica do engine + 4 goldens intocados** (`git diff` = 0); ao vivo serial + `delete(daily_ledger)` no `wipeAll` das irmãs.

---

## Segurança

- **Idempotência = a trava do money path:** o ledger garante que um retry (o cron re-disparando, um crash-recovery) **não paga/decai em dobro**. O claim é atômico (INSERT-onConflict dentro da tx do accrue/mood) — crash antes do commit des-reivindica.
- **Determinismo preservado:** o scheduler injeta `epochMs`; os passes puros (`runDailyRound`/`resolveSlot`/`moodModulator`) seguem determinísticos e auditáveis. O relógio fica só na borda (`main.ts`).
- **Isolamento por humano:** um erro num atleta não derruba o mundo (o `runDailyRound` é atômico por si; os passes por-humano são isolados + idempotentes → o retry recupera).
- **OP-11:** os logs do tick/main são genéricos (sem SQL/DSN/stack).
- **Sem segredo hardcoded (OP-12):** `DATABASE_URL`/`seed` vêm de env.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Pagamento/decay em dobro** (o débito) | O ledger `(athlete_id, day, scope)` + o claim atômico (INSERT-onConflict na tx) — molde `decision_one_per_day`. Testado com 2× no mesmo dia. |
| **Tick grande / review pesado** | Decomposto (`runDailyTick`/`runHumanPasses`/`prizeForClub`), cada função ≤50 linhas; a idempotência é o núcleo (testada isolada). |
| **Mapeamento prêmio→humano errado** | `prizeForClub` testado (win/draw/loss); `buildClubLeagueMap` do `readWorld` (a fonte da liga do clube). |
| **Um humano quebra o tick** | Isolamento por-humano (try/catch por atleta, molde do regen); o report conta; o retry recupera (idempotente). |
| **Tocar o engine/golden** | Zero: o scheduler só orquestra repos existentes; engine/goldens intocados. |
| **`Date.now()` no caminho testável** | `runDailyTick` recebe `epochMs`; só o `main.ts` lê o relógio (a borda). |

**Dependências:** SPEC-015 (`runDailyRound`/`resolveSlot`), SPEC-029 (`moodModulator`), SPEC-021/022 (`persistWorldTurnover`/`runRegenPass`), SPEC-023 (`runVacancyPass`), SPEC-024 (`accrueRound`/`matchPrize`), SPEC-025 (`generateForDay`/`resolveDeadline`), SPEC-026 (`advanceRecovery`), SPEC-027 (`applyDailyMood`), SPEC-020 (`readWorldOccupations`). **Precede:** a infra de cron/deploy; multi-seed; o sinal de atividade.

---

## Notas de implementação

- **A iteração é forçada pela `world_occupation`:** o player-store não enumera seus humanos; a lista de trabalho é `readWorldOccupations(seed)` → `humanAthleteId`. Limpo (a vaga no mundo É o "quem processar").
- **O ledger é a única mudança de schema:** os passes já-idempotentes (decisão/recuperação) não precisam dele; só `accrue`/`mood`. O claim (`onConflictDoNothing().returning()`) é a reivindicação — sem check-then-insert (sem TOCTOU).
- **A ordem do dia:** publica a rodada → paga (salário+prêmio da rodada) → decai mood → resolve ONTEM (18h) → gera HOJE → avança recuperação → (virada→regen) → vacancy. O accrue só em dia com rodada publicada (não na virada/antes da temporada).
- **`main.ts` é a única borda:** lê `Date.now()` uma vez; tudo abaixo recebe `epochMs`. O deploy (cron) só precisa invocar o `main` 1×/dia.
- **Fecho do DONE:** "Estado atual" (SPEC-030, flipar SPEC-029 → PR #32) + `roadmap.md` (1.2 scheduler).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (tick completo + ledger + entrypoint; cron/multi-seed/atividade fora)
- [x] Arquivos listados corretos (verificados no repo, com linhas)
- [x] Mudança de schema documentada (migration aditiva `daily_ledger` — OP-01)
- [x] Critérios testáveis (ledger, tick paga, prêmio, idempotência ponta-a-ponta, regen na virada, isolamento, borda)
- [x] Riscos avaliados (dobro, review, prêmio, isolamento, engine/golden, relógio)
- [x] Decisões co-desenhadas registradas (tick completo, salário+prêmio, ledger, single-seed, borda)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-030 — método H1VE. O scheduler é o batimento de produção: um worker que lê o relógio 1×/dia e dirige, idempotente, todos os passes do mundo/dos humanos — a rodada (com forma/moral), o pagamento (salário+prêmio), o decay, as decisões, a recuperação, a viragem/regen e a retenção. Paga o débito de idempotência (`accrueRound`/`applyDailyMood`) com um ledger `(athlete, dia, escopo)`. A infra de cron é o próximo passo de deploy; aqui nasce o `main` executável. Engine e goldens intocados.*
