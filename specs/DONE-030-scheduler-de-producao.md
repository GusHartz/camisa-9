# DONE-030 — Scheduler de produção (o tick diário)

> Registro de conclusão (par do `SPEC-030`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-030 (par da SPEC-030) |
| **Feature** | Scheduler de produção — card do board |
| **Roadmap item** | 1.2 (rodadas diárias) — o gatilho de produção |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/scheduler-de-producao` |
| **Concluída em** | 2026-07-18 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## O que foi entregue

O **batimento cardíaco de produção**: um serviço greenfield `services/scheduler` com **`runDailyTick(worldDb, playerDb, seed, epochMs)`** que dirige, de forma **idempotente**, todos os passes do mundo/dos humanos numa passada — o mundo agora **joga às 15h de verdade**. E o **débito de idempotência (SPEC-024/027) foi PAGO** (`accrueRound`/`applyDailyMood` retry-safe via ledger).

### A) `services/scheduler` (greenfield) — o orquestrador + a borda
- `runDailyTick`: `runDailyRound` (+ `moodModulator`) → na virada: `runRegenPass` → `runVacancyPass` → **loop por ocupação humana** (`readWorldOccupations`): **accrue (salário+prêmio, SÓ em dia com rodada)** · mood (decay) · `resolveDeadline(ontem)` · `generateForDay(hoje)` · `advanceRecovery`. **Isolamento por-humano** (`safeHumanPasses`: um erro não aborta o tick). Decomposto (`runHumanPasses`/`prizesForRound`/`prizeForClub`/`buildClubLeagueMap`).
- **`main.ts`** = a BORDA impura (o único `Date.now()`; `services/*` está fora do guardrail): lê env, cria os handles, roda o tick, fecha. O deploy (cron) invoca `node main.js` 1×/dia. **Nada abaixo lê relógio** (`epochMs` injetado → testável).

### B) `services/player-store` — o LEDGER de idempotência (o débito pago)
- **Migration aditiva `0008`** (OP-01): tabela **`daily_ledger`** PK `(athlete_id, day, scope)`.
- `accrueRound(db, athleteId, day, result?)` e `applyDailyMood(db, athleteId, day)` ganharam o **claim** `insert(daily_ledger).onConflictDoNothing().returning()` na própria tx: 0 linhas = já rodou hoje → no-op (`idempotent`). O crédito/decay + o claim commitam JUNTOS (crash → rollback des-reivindica). **Rodar o mesmo dia 2× = no-op.**

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | O ledger (débito pago) | `economy-repo`/`mood-repo`: `accrueRound`/`applyDailyMood` 2× no mesmo dia → 1× (idempotent); concorrência → exatamente 1. |
| 2 | O tick publica e paga | `daily-tick`: numa janela 15h publica + paga salário+prêmio + decai mood + gera decisões. Ao vivo. |
| 3 | O prêmio por resultado | `prizeForClub` acha o jogo certo; win/draw/loss dão prêmios distintos (economy-repo); múltiplos humanos → cada prêmio do SEU jogo. Ao vivo. |
| 4 | Idempotência ponta a ponta | 2º tick do mesmo dia → `accrued=0`, saldo/mood/decisões inalterados. Ao vivo. |
| 5 | A virada dispara o regen | dia de fim de temporada → `season_rolled`, `runRegenPass` roda, **sem accrue** (saldo intacto). Ao vivo. |
| 6 | Isolamento | um humano cujo passe FALHA (linha do player removida) não aborta o tick; o outro é pago. Ao vivo. |
| 7 | A borda | `runDailyTick` recebe `epochMs`; só o `main.ts` lê `Date.now()`. Guardrail: scheduler fora de `packages/*`. |
| 8 | OPs & gates | sem `any` (14); ≤50/função (15); ≤300/arquivo (16); genéricos (11); migration aditiva (01); orquestração fina / regra nos repos (17); `typecheck`/`eslint`/`build`/`test`/prettier verdes; **lógica do engine + 4 goldens intocados** (`git diff` = 0); ao vivo serial + `delete(daily_ledger)` no `wipeAll` das 10 irmãs. |

**388/388 testes** (382 preservados + ~9 novos: accrue idempotente/concorrente/draw-loss, mood idempotente, o tick ponta-a-ponta + idempotente, viragem-sem-salário, deferred-retry-preserva-prêmio, múltiplos humanos, isolamento, cross-day — os 6 da revisão).

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

- **2 MAJOR reais no money path, CONFIRMED e CORRIGIDOS (raiz única): o accrue não era gated por `paid`.**
  - **(a) Salário pago em dia SEM rodada** (viragem/before-season/deferred/locked) — contradizia o §147 da SPEC. Cada humano ganhava salário num dia sem jogo.
  - **(b) Prêmio PERDIDO no deferred-retry** — o dia que DEFERE reivindicava o ledger com salário-só; o retry (que publica) achava o dia já reivindicado → o bônus de vitória sumia. (+ a variante `locked`.)
  - **Fix (um só):** o `accrueRound` **só roda quando `paid`** (`status ∈ {published, idempotent}`). Assim: nada de salário em dia sem rodada; e o dia deferido NÃO reivindica o ledger → o retry paga salário+prêmio. **+2 testes ao vivo** que provam ambos (viragem → saldo 0; deferred→retry → prêmio intacto).
- **minor CORRIGIDO:** o contador `decisionsGenerated` não era idempotência-aware (reportava o total no re-run) → renomeado `decisions` + doc honesto (é "as do dia", idempotente-estável, ≠ `accrued`); +assert de que o 2º tick não re-gera.
- **MAJOR de cobertura → +4 testes:** múltiplos humanos (roteamento do prêmio por `Map`), isolamento por-humano, prêmio draw/loss, cross-day (`resolveDeadline(ontem)`).
- **nits DEFERIDOS/notados:** o seam `age` não é wired no `generateForDay` (OccupationView não carrega idade; `veterano` não dispara via scheduler — baixo valor cedo, humanos nascem aos 17); `applyDailyMood` sem wrapper OP-11 (inalcançável — a checagem de existência precede o INSERT do ledger).
- **REFUTED** (não reproduziram): `day` global-monotônico não enforçado (é por construção); `scope` sem CHECK (typo abriria namespace — mas os literais são fixos no código).

---

## Escopo deferido (futuro)

- **A infra de cron/deploy** (o que dispara o `main` 1×/dia num relógio real) — card de **ops/deploy**.
- **Multi-seed** (uma lista de mundos) — hoje 1 seed; iterar N = config.
- **O sinal de atividade** (`markActive` via HTTP/login) — origem real do `lastActiveDay`.
- **O seam `age`** no `generateForDay` (ler a idade do world athlete) — quando os humanos envelhecerem.
- **Stamina** · os **12 atributos** · a UI/faixa/toasts.

---

## Arquivos

**Criados:** `services/scheduler/` (package.json, tsconfig, `src/daily-tick.ts`, `src/main.ts`, `src/index.ts`, `test/daily-tick.test.ts`) · `services/player-store/src/schema/daily-ledger.ts` · `services/player-store/src/migrations/0008_daily_ledger.sql` (+ meta) · `specs/SPEC-030-*.md`, `specs/DONE-030-*.md`.

**Editados:** `services/player-store/src/store/economy-repo.ts` (accrue + ledger) · `mood-repo.ts` (applyDailyMood + ledger) · `src/schema/index.ts` (+ barrel) · `drizzle.config.ts` · `tsconfig.base.json` (paths: world-entry/regen/scheduler) · `vitest.config.ts` (alias: world-entry/regen) · as 10 suítes irmãs (`delete(daily_ledger)`) · `docs/projeto/roadmap.md` · `CLAUDE.md` (Estado atual + flip SPEC-029 → PR #32).

**Intocado:** a **lógica** do `packages/world-engine` e **os 4 goldens** (`git diff` = 0 — o scheduler só orquestra); o `world-store` (só consome os repos).

---

*DONE-030 — método H1VE. O scheduler é o batimento de produção: um worker que lê o relógio 1×/dia e dirige, idempotente, todos os passes — o mundo joga sozinho, e o débito de idempotência (accrue/mood) está pago com o ledger `(athlete, dia, escopo)`. A revisão pegou 2 MAJOR reais no money path (salário sem jogo + prêmio perdido no deferred-retry), com uma raiz única (o accrue sem gate de `paid`) → corrigidos e cravados por teste. Engine e goldens intocados. A infra de cron é a próxima fatia de deploy.*
