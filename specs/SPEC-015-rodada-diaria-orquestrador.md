# SPEC-015 — Rodadas diárias (1.2): âncora diária + orquestrador de tick + rodada-do-mundo atômica

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-015 |
| **Feature** | Rodadas diárias (roadmap 1.2) — primeira fatia |
| **Slug** | rodadas-ter-qui-sab-15h *(rótulo do card = cadência REVOGADA; ver drift-check)* |
| **Card (board)** | `7c8c8451-e4fc-4a14-b2c2-c8c0bf7e3ccf` |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 1.2 — Agendamento oficial das rodadas + publicação atômica + protocolo de rodada falha. |
| **Appetite** | **1 a 2 dias**. |
| **Prioridade** | ALTA — o primeiro batimento cardíaco do mundo (consome o publicador da Fatia 2). |
| **Criada em** | 2026-07-16 |
| **Status** | **Proposta — aguardando aprovação do founder no card** |

---

## Drift-check obrigatório (CLAUDE.md) — leia antes de aprovar

O **título do card** é `Rodadas ter/qui/sáb 15h` — essa cadência foi **REVOGADA**. A âncora ratificada é o **R4 FINAL** (design doc v2.0, nos docs de fundação): o mundo joga **TODO DIA às 15h Brasília** (7/7, liga de 20, 38 rodadas ≈ 6 semanas). Esta SPEC implementa o **diário**, alinhando o código à âncora ratificada. Não é drift — é reconciliar o código com a decisão já registrada; o CLAUDE.md inclusive já anota "renomear o card". A regen do `anchor.golden.json` é a **mudança intencional** que reconcilia a âncora pura com a ratificada. *(O founder não consegue renomear o card na UI; o escopo real vale, não o rótulo.)*

**Decisões do founder nesta SPEC (2026-07-16):**
1. **Grão de atomicidade = MUNDO INTEIRO** — a rodada do dia de **todas** as ligas publica numa **única transação** (`publishWorldRound`, all-or-nothing). Cumpre o charter à letra: *"resultado publicado em transação única. Nunca rodada meio-publicada — a linha do tempo do mundo é all-or-nothing."*
2. **Protocolo de falha = DERIVAR** — "deferido" = ausência da linha (`readRound === null`) + **report estruturado** + log server-side genérico. **Sem** tabela de ledger nesta fatia (o durável é da 0.3, quando houver consumidor).

---

## Objetivo

Entregar o **orquestrador de tick diário** na borda impura (`services/world-store`) que, dado um `epochMs` **injetado** (o relógio nunca entra em `packages/*/src` — guardrail ESLint), publica a **rodada do dia de todas as ligas do mundo** numa transação atômica de nível-mundo, reusando o engine **puro e intocado** (`readWorld` + `simulateWorldSeason` — zero simulação nova, OP-17) e a mecânica transacional da Fatia 2. Alinha a âncora de fuso à cadência **diária 7/7** ratificada e implementa o **protocolo de rodada falha** ("adiar com transparência > publicar errado"), parando **limpo** no fim da temporada (detecção `season_complete`, **sem** viragem — seam para a Fatia 3).

---

## Contexto e motivação

As peças já existem; esta fatia as **compõe** no primeiro loop vivo:
- **Fatia 1** (`readWorld`/`writeWorld`): o `WorldState` persiste em Postgres.
- **Fatia 2** (`publishRound`, `round-repo.ts`): publicação de rodada **atômica + idempotente** (PK `(league_id, season_id, round)` + advisory lock xact-scoped + seam `onBeforeCommit`).
- **Engine puro** (`packages/world-engine`): `simulateWorldSeason(world, seed)` roda a temporada de cada liga (projeta `WorldClub → Club`, determinístico, 38 rodadas p/ liga de 20); `resolveSlot(epochMs)` dá o slot de fuso Brasília **sem** `Date`/`Intl` (offset fixo UTC-3, `epochMs` injetado).

**Fatos de código verificados (`origin/main`):**
- `anchor.ts`: a cadência vive numa **única expressão** (linha 31) — `isMatchWindow = MATCH_DAYS.includes(dayOfWeek) && hour === MATCH_HOUR`, com `MATCH_DAYS=[2,4,6]`. Diário = remover o filtro de dia. `anchor.ts` é importado só por `index.ts` e `anchor.test.ts`; **não toca o stream do PRNG**.
- **Análise do golden** (verificada vetor a vetor): flipar p/ diário **não muda nenhum** dos 9 vetores de `anchor.golden.json` — todo `true` já é 15h; todo `false` cai pela **hora**, nunca pelo dia. Logo a mudança é **aditiva** (9 idênticos + vetores novos provando o 7/7).
- O snapshot (`readWorld`) dá o **rótulo** `season_id`, mas **não** o dia-índice em que a temporada começou — necessário para mapear "dia do calendário → rodada". Daí a tabela `season` (abaixo).
- `fixtures.ts` ainda comenta o legado "10 clubes → 18 rodadas": **não hardcodar 38** — ler `result.rounds.length` (com `clubsPerLeague=20` dá 38).

**Invariante cravado (risco central):** o orquestrador **re-simula** a temporada do snapshot a cada tick e fatia `rounds[N-1]`. Isso exige que o **snapshot seja IMUTÁVEL dentro da temporada** (v1 é 100% NPC congelado — ok). Substituição de NPC por humano tornaria o snapshot mutável e quebraria a re-simulação → é fatia futura (congelar o plano da temporada no início).

---

## Escopo — o que está DENTRO

**A) Âncora diária (engine puro):**
- [ ] `anchor.ts`: remover `MATCH_DAYS`; `isMatchWindow = hour === MATCH_HOUR` (15h **todo dia**). `dayOfWeek` continua calculado e exposto no `RoundSlot` (display / Dia do Jogador / ramo de módulo negativo). Mudança **pura**.
- [ ] `anchor.test.ts`: no `it` de janela, remover `expect([2,4,6]).toContain(dayOfWeek)` e fortalecer para o **iff diário** (janela ⇔ `hour===15`, dia irrelevante). Os demais `it` (golden `toEqual`, "14:59 sábado false", negativos, TZ-independência) passam **sem edição**.
- [ ] `anchor.golden.json`: **regen aditiva** — 9 vetores atuais **byte-idênticos** + **4 vetores novos** (dom/seg/qua/sex às 15h → `isMatchWindow: true`; sob a regra antiga seriam `false`).
- [ ] `harness/regen-anchor-golden.ts` (novo; borda impura — `Date`/`fs` permitidos fora de `packages/*/src`): espelha `harness/regen-world-golden.ts`; lista curada de ISOs → `epochMs` → `resolveSlot`, com **oráculo independente** (cálculo de dia-da-semana/hora por outra via) que **aborta** se divergir (o golden não pode só ecoar o código). Escreve com `JSON.stringify(...,2)+'\n'`.

**B) Âncora de temporada (dados):**
- [ ] `schema/season.ts` (novo): `season(world_seed, season_id, start_day_index)`, **PK `(world_seed, season_id)`**, FK `world_seed → world.seed`. `start_day_index` é o `dayIndex` do round 1 — **input de ops**, não derivável da seed.
- [ ] Migration **`0002_season_anchor.sql`** (OP-01), aditiva (não toca `0000`/`0001`). `schema/index.ts` exporta `season`.
- [ ] `setSeasonAnchor(db, seed, seasonId, startDayIndex)` + `readSeasonAnchor(db, seed, seasonId)` (novo `season-repo.ts`).

**C) Rodada-do-mundo atômica (dados — decisão do founder #1):**
- [ ] `publishWorldRound(db, input, onBeforeCommit?)` em `round-repo.ts`: **uma transação** que (a) `pg_try_advisory_xact_lock` de um **lock world-day** (`world:${seasonId}:${round}`, namespace distinto do lock por-liga) → se falha, `locked`; (b) checa existência da rodada-do-mundo (existe linha p/ `(season_id, round)`? → `idempotent`); (c) faz **um INSERT multi-linha** com a rodada N de **todas** as ligas; (d) `await onBeforeCommit?.()`; (e) commit → `published`. Erro (sync/async) → **ROLLBACK total** (nenhuma liga publicada) + rethrow. `input = { seasonId, round, leagues: {leagueId, result: RoundResult}[] }`. `publishRound` (por-liga) da Fatia 2 **permanece** como primitivo (Copa/ops manual).

**D) Orquestrador de tick (impuro):**
- [ ] `runDailyRound(db, seed, epochMs): Promise<DailyRoundReport>` em `daily-round.ts` (novo), **decomposto** em helpers (`resolveTarget`/`publishAll`/`buildReport`) p/ OP-15/16. Fluxo: `resolveSlot(epochMs)` guarda `isMatchWindow` (senão `fora_de_janela`) → `readWorld(seed)` → `readSeasonAnchor` (sem âncora → erro genérico) → `targetRound = slot.dayIndex - startDayIndex + 1` → guardas de boundary → `simulateWorldSeason(world, seed)` → montar o `WorldRoundInput` da rodada N → `publishWorldRound` → report.
- [ ] **Model B (calendar-derived)**: `targetRound = dayIndex - startDayIndex + 1`, clampado `[1, rounds.length]`. Idempotente-por-dia de graça pela PK; **todas as ligas em lockstep** ("o mundo joga junto"). Ler `rounds.length` do resultado (não hardcodar 38).
- [ ] **Boundary/guards**: `targetRound < 1` → `before_season` (no-op); `targetRound > rounds.length` → `season_complete` e **PARA** (não chama `advanceWorld`, não grava snapshot — seam limpo p/ Fatia 3); fora das 15h → `fora_de_janela`.
- [ ] **Protocolo de falha (decisão do founder #2)**: se `publishWorldRound` falha → a tx reverte (nada publicado) → o dia é **deferido**; `runDailyRound` captura, retorna `status: 'deferred'` + classe **genérica** de razão (`publish_failed`/`locked`/`engine_error`) e loga server-side (OP-11: nunca SQL/DSN/stack). "Deferido" é **derivado da ausência** — zero estado novo.
- [ ] `DailyRoundReport = { dayIndex, seasonId, targetRound, status, complete, leagueCount }` exportado no barrel `src/index.ts` junto de `runDailyRound`/`setSeasonAnchor`/`readSeasonAnchor`.

**E) Testes** (`daily-round.test.ts`, novo; gated por `DATABASE_URL` como os demais; service container no CI): ver Critérios.

## Escopo — o que está FORA

- **Viragem / rollover** (`advanceWorld` → snapshot versionado + `turnoverReport` persistido) → **Fatia 3**. Esta fatia entrega só a **detecção** `season_complete`.
- **Tabela durável de adiamento** (`round_deferral`/`tick_ledger`) → **0.3** (log replayable de tick), quando houver consumidor (retry-worker/UI de reparação). Decisão do founder: derivar agora.
- **Scheduler de produção** (cron/timer/worker que lê `Date.now()` **uma** vez e chama `runDailyRound`) → deploy; o tick é 100% invocável/testável por injeção de `epochMs`.
- **Encaixe da Copa** no calendário diário → fatia dedicada de 1.2.
- **Re-âncora automática** por dia adiado → é **ação de ops explícita** (`setSeasonAnchor` deliberado), nunca silenciosa.
- **Beats do Dia do Jogador** (treino/foco/escalação), **contas humanas**, **substituição de NPC por humano** (tornaria o snapshot mutável e quebraria a re-simulação) → v1 é 100% NPC congelado.
- `packages/world-engine` — **só** a âncora muda (A); `simulateSeason`/`resolveMatch`/`advanceWorld`/PRNG **intocados**; nenhum golden além de `anchor.golden.json` regenerado.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/world-engine/src/orchestration/anchor.ts` | editar — remover `MATCH_DAYS`; `isMatchWindow = hour===15`. |
| `packages/world-engine/src/orchestration/anchor.test.ts` | editar — iff diário (remover assert de dia). |
| `packages/world-engine/src/__fixtures__/anchor.golden.json` | regen **aditiva** — 9 idênticos + 4 novos. |
| `harness/regen-anchor-golden.ts` | criar — regen determinística com oráculo independente. |
| `services/world-store/src/schema/season.ts` | criar — tabela `season` (âncora de temporada). |
| `services/world-store/src/schema/index.ts` | editar — `export * from './season.js'`. |
| `services/world-store/src/migrations/0002_season_anchor.sql` | criar (drizzle-kit, revisado) — aditiva. |
| `services/world-store/src/store/season-repo.ts` | criar — `setSeasonAnchor`/`readSeasonAnchor`. |
| `services/world-store/src/store/round-repo.ts` | editar — `+publishWorldRound` (1 tx world-day). |
| `services/world-store/src/store/daily-round.ts` | criar — `runDailyRound` + helpers + `DailyRoundReport`. |
| `services/world-store/src/index.ts` | editar — exportar o novo público. |
| `services/world-store/test/daily-round.test.ts` | criar — property tests live. |
| `specs/SPEC-015-*.md`, `specs/DONE-015-*.md` | criar. |

**Intocado:** `season`/`prng`/`world.golden.json`, `simulateSeason`/`resolveMatch`/`advanceWorld`/PRNG, migrations `0000`/`0001`.

---

## Critérios de aceitação

1. **Isolamento de golden:** `git diff --name-only` dos `*.golden.json` lista **só** `anchor.golden.json`; `season`/`prng`/`world.golden` com diff = 0 (bit-idênticos).
2. **Golden aditivo:** os 9 vetores originais permanecem **byte-a-byte**; exatamente **4 novos** (dom/seg/qua/sex 15h, `isMatchWindow: true`); `harness/regen-anchor-golden.ts` reproduz o arquivo e o **oráculo concorda** (senão aborta).
3. **Âncora verde:** `anchor.test.ts` passa com janela ⇔ `hour===15` (dia irrelevante); "14:59 sábado" segue `false`; negativos e TZ-independência intactos.
4. **Publicação do dia (atômica de mundo):** `runDailyRound` no `epochMs` do round N (dia = `startDayIndex + N - 1`, 15h) publica a rodada N de **todas** as ligas numa **única transação**; `readRound(cada liga, seasonId, N) === simulateWorldSeason(world,seed).leagues[i].result.rounds[N-1]` byte-exato; `status: 'published'`, `complete: true`.
5. **Determinismo ponta-a-ponta:** rodar dia 1..38 publica **4×38** rodadas; a tabela final de cada liga em `published_round` bate com `simulateWorldSeason(...).leagues[i].result.table`.
6. **Idempotência:** o mesmo `epochMs` 2× → 2ª execução `idempotent`, `count(published_round)` inalterado.
7. **Atomicidade all-or-nothing (falha):** com falha injetada (`onBeforeCommit`) → **nenhuma** liga publicada (todas `readRound === null`), `status: 'deferred'`; o retry (sem falha) publica o dia inteiro. Prova o grão-mundo (não há mundo-parcial).
8. **Boundary:** `epochMs` do dia 39 (`targetRound > rounds.length`) → `season_complete`; `advanceWorld` **não** é chamado; count/hash do snapshot idêntico ao pré-tick.
9. **Guarda de janela:** `epochMs` fora das 15h → `fora_de_janela`, nada publicado.
10. **OPs & gates:** sem `any` (OP-14); funções ≤50 linhas (OP-15); arquivos ≤300 (OP-16); erros genéricos sem SQL/stack no report/log (OP-11); migration `0002` versionada (OP-01); zero simulação nova no engine (OP-17). `lint`/`typecheck`/`build`/`test` verdes; 89 testes do engine intactos (fora a âncora).

---

## Segurança (se aplicável)

- **OP-11:** o `DailyRoundReport` e o log de deferimento usam **classe genérica** de razão (`publish_failed`/`locked`/`engine_error`) — nunca SQL/DSN/stack. O erro do seam propaga ao chamador após o rollback.
- **OP-02/OP-12:** `DATABASE_URL` server-only (herdado). Nada hardcoded.
- **Superfície:** o tick é biblioteca de servidor (sem rota HTTP). A escrita da rodada é da store, autoridade da linha do tempo — anti-fraude server-side.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Snapshot mutável** quebra a re-simulação | Cravar o invariante "snapshot imutável dentro da temporada" (v1 100% NPC congelado). Substituição humano↔NPC = fatia futura (congelar o plano da temporada). |
| **Dia adiado = rodada perdida** (Model B) | Um dia caído vira buraco na timeline a menos que ops re-ancore (`setSeasonAnchor` deliberado). "Perder a rodada vs empurrar o calendário" é **ação de ops explícita**, nunca automação silenciosa aqui. |
| `start_day_index` não semeado | Guarda "sem âncora" → erro genérico (OP-11); o passo de ops que grava `setSeasonAnchor` é **pré-condição** do tick. |
| `season_id` órfão na viragem | Hoje `published_round.season_id === world.season_id` (consistente). Quando a Fatia 3 trocar o `season_id` do snapshot, o seam `season_complete` já isola a transição (política de rollover é da Fatia 3). |
| Regen do golden só ecoa o código | `harness/regen-anchor-golden.ts` cruza com **oráculo independente** e aborta em divergência. |
| Hardcode de rodadas | Ler `result.rounds.length` (não 38); guarda de boundary `[1, rounds.length]`. |
| Lint local por **CRLF** no Windows | Não é regressão; CI (LF) é a fonte da verdade; validar LF antes do push. |

**Dependências:** SPEC-013 (Fatia 1) + SPEC-014 (Fatia 2) são a base direta; SPEC-002/009 (engine) é intocado. **Precede** a Fatia 3 (viragem) e o encaixe da Copa.

---

## Notas de implementação

- **`publishWorldRound`:** reusa a mecânica da Fatia 2 (advisory xact lock + PK idempotência + seam awaited), mas **1 lock world-day** + **1 INSERT multi-linha** de todas as ligas + **1 COMMIT**. Idempotência: `SELECT 1 FROM published_round WHERE season_id=? AND round=? LIMIT 1` (grão-mundo é all-or-nothing → uma linha existe ⇔ todas existem).
- **Impureza:** `Date.now()` **não** entra aqui — o chamador (futuro scheduler) lê o relógio e injeta `epochMs`. Os testes injetam `epochMs` calculado de `startDayIndex + N - 1`.
- **`simulateWorldSeason` é determinístico e stateless** — re-simular a cada tick e fatiar `rounds[N-1]` é seguro enquanto o snapshot for imutável na temporada (invariante acima).
- **Reconciliação:** o teste compara `readRound` com `simulateWorldSeason(...).rounds[N-1]` (mesma fonte pura) — prova que o tick publica exatamente o que o engine produz, sem deriva.
- **Fecho do DONE:** atualizar "Estado atual" do CLAUDE.md (SPEC-015 / 1.2 primeira fatia) e `roadmap.md` (1.2 🚧 com a primeira fatia ✅).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (âncora diária + tick + rodada-do-mundo atômica; viragem/Copa/scheduler/ledger fora — em fatias nomeadas)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudanças de schema documentadas (migration `0002` aditiva — OP-01)
- [x] Critérios de aceitação testáveis (âncora + publicação atômica + determinismo + idempotência + boundary + guarda)
- [x] Riscos avaliados (snapshot mutável e dia-adiado são os centrais — mitigados/cravados)
- [x] Decisões do founder registradas (grão-mundo #1 · derivar #2)
- [ ] **Aprovada** — *aguardando o founder/architect no card `7c8c8451`*

---

*SPEC-015 — método H1VE. Primeira fatia de 1.2. Alinha a âncora à cadência diária ratificada (R4 FINAL; o título do card é a cadência revogada) e entrega o tick diário que publica a rodada-do-mundo numa transação atômica (charter: a linha do tempo do mundo é all-or-nothing), reusando o engine puro intocado. Viragem e Copa são fatias seguintes; o seam `season_complete` já as isola.*
