# DONE-032 — Cron / deploy do scheduler (dispara o tick 1×/dia) + catch-up completo

> Registro de conclusão (par do `SPEC-032`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-032 (par da SPEC-032) |
| **Feature** | Cron / deploy do scheduler (dispara o tick 1×/dia) — card do board |
| **Roadmap item** | 1.2 (motor de temporada — o mundo joga às 15h SOZINHO) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/cron-deploy-do-scheduler-dispara-o-tick-1-dia` |
| **Concluída em** | 2026-07-19 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## O que foi entregue

Ligou o motor. O `runDailyTick` (SPEC-030) estava pronto e idempotente, mas ninguém o invocava num relógio real. Esta SPEC entrega **(a)** o artefato de deploy (um worker em container + um scheduled job) e **(b)** o **catch-up completo** que torna o disparo robusto a downtime — o mundo joga TODO DIA às 15h, e se um dia foi perdido, o próximo tick **cura o buraco** (guardrail *uptime de rodada 100%*).

### A) `packages/world-engine` — o mínimo puro
- `dueDayIndex(epochMs)` (novo export puro em `anchor.ts`): o maior dayIndex cuja rodada das 15h já venceu (`hour>=15 ? dayIndex : dayIndex-1`). Função NOVA → **`anchor.golden.json` byte-idêntico** (não altera `resolveSlot`).

### B) `services/world-store` — o cursor + publicar por dayIndex
- Migration **`0007_tick_progress`** (OP-01): `tick_progress(world_seed PK, last_day_index)` — o cursor resumível (o último dia cuja RODADA DO MUNDO liquidou).
- `tick-progress-repo.ts`: `readTickCursor` + `advanceTickCursor` (upsert MONOTÔNICO via `greatest` — nunca retrocede).
- `daily-round.ts`: extraído `runRoundForDay(db, seed, dayIndex, modulate?)` (o núcleo por-dia; re-lê o mundo/âncora a cada chamada → após a viragem, o dia seguinte já vê o mundo NOVO). `runDailyRound(epochMs)` preserva o comportamento antigo.

### C) `services/scheduler` — o loop de catch-up (o coração)
- `runDailyTick`: `to = dueDayIndex(epochMs)`; `from = min((cursor ?? seasonStart − 1) + 1, to)`; loop `[from..to]`, `processDay(day)` → se liquidou, avança o cursor; se DEFERE, PARA (retenta). O dia corrente é SEMPRE re-processado (idempotente); os dias perdidos ANTES dele são recuperados.
- O cursor rastreia a RODADA DO MUNDO (não o humano) → o mundo nunca trava por um humano quebrado (isolado, SPEC-030).

### D) Deploy — o artefato de produção
- `services/scheduler/Dockerfile` (node:20-slim, `npm ci && npm run build`, `CMD npm run start` via `tsx`) + **`.dockerignore` na RAIZ** (o contexto é a raiz do repo) + `docs/ops/scheduler-deploy-runbook.md` + `.env.example` (`DATABASE_URL`/`WORLD_SEED`, OP-12).
- **Gap de produção fechado:** os 4 pacotes `services/*` (world-store/player-store/world-entry/regen) ganharam `"exports":"./src/index.ts"` no package.json → resolvíveis via `tsx` em produção (antes só via alias do vitest). O `main.ts` foi **smoke-testado ao vivo** (rodou um tick real, conectou, saiu limpo).

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | `dueDayIndex` puro | `anchor.test.ts`: <15h→ontem, ≥15h→hoje, borda meia-noite; `anchor.golden.json` byte-idêntico. |
| 2 | Same-day recovery | `daily-tick.test.ts`: o tick às 20h (não 15h) ainda publica + paga (a janela larga). Ao vivo. |
| 3 | Multi-day catch-up | cursor em START, tick em START+3 → rodadas 2,3,4 publicadas + 3 accruals. Ao vivo. |
| 4 | Cross-season | o intervalo cruza a viragem → publica a 38, vira (season_rolled), o humano sobrevive. Ao vivo. |
| 5 | Resumável + deferido | um deferido no meio PARA o cursor (retenta); o retry retoma e completa. Ao vivo. |
| 6 | Idempotência | re-run do mesmo dia = no-op (accrued 0, cursor inalterado). Ao vivo. |
| 7 | Backfill do 1º tick | âncora no passado (cursor nulo) publica 1..N — nenhuma rodada pulada. Ao vivo. |
| 8 | Deploy | `Dockerfile` + runbook + `.env.example`; `main.ts` smoke-testado (`npm run start` → tick real). |
| 9 | OPs & gates | sem `any`; ≤50/função; ≤300/arquivo; guardrail verde; lint/typecheck/build/test/prettier verdes; **engine e os 4 goldens intocados** (`git diff` = 0); migration `0007` (OP-01); segredos só-env (OP-12). |

**415 testes** (388 preservados + 27 novos: 4 de `dueDayIndex`, 1 do cursor monotônico, ~7 de catch-up/backfill/regen no scheduler, + os ajustes).

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

- **Núcleo confirmado sólido:** determinismo do catch-up, re-leitura pós-viragem, cursor rastreando a rodada, idempotência — corretos.
- **1 MAJOR real corrigido (regen órfão na viragem):** o regen era gateado só em `season_rolled` (status transitório). Se a viragem committasse mas o pass falhasse (ex.: `readRegenEligible` cai por reset de conexão) e o cursor travasse, o retry via `before_season` NÃO re-rodava o regen → um humano ≥42 jogaria uma temporada a mais. **Fix:** o regen roda na JANELA DE GÊNESE (`season_rolled || before_season`) — o `before_season` (reprocesso da viragem falha) reabre a janela e auto-cura. (Descoberta na correção: o `reassignSlot` tem uma guarda de gênese que barra o regen em dia PUBLICADO — por isso o gate certo é a janela de gênese, não "todo dia".) +teste (regen processa um ≥42 real na viragem).
- **1 MAJOR real corrigido (`.dockerignore` vazava segredo):** um `.dockerignore` em `services/scheduler/` é **INERTE** quando o contexto de build é a raiz do repo (o Docker lê o da raiz do contexto) → `.env`/`node_modules`/`.git` entrariam na imagem. Além disso o padrão não cobria `.env.*` (`.env.production`/`.env.local`). **Fix:** `.dockerignore` **na raiz** cobrindo `**/.env*` (com `!.env.example`) — nenhum segredo entra na camada da imagem (OP-02/OP-12).
- **1 MINOR real corrigido (buraco silencioso no 1º tick):** com o init `to−1`, uma âncora no passado (deploy que atrasa) pularia rodadas em silêncio. **Fix:** init = `seasonStart − 1` (backfill da temporada corrente, bounded ≤38 dias) — a semântica que a SPEC já pedia; +teste de backfill.
- **Hygiene:** o `wipeAll` do teste do scheduler passou a limpar `legend` (o regen arquiva lendas) — mesmo padrão do débito de `turnover_report` da SPEC-031.

---

## Escopo deferido (cards futuros)

- Multi-seed (vários mundos); scheduler interno always-on (quando a API existir); imagem mínima (compilar os services p/ JS); alerta ativo em falha (webhook); reconciliação de passe humano com erro transitório (auditoria); snapshot de mood por rodada; **executar o deploy de fato** (ação de ops do founder — criar a conta Railway/Render, subir a imagem, semear os segredos).

---

## Arquivos

**Criados:** `services/world-store/src/schema/tick-progress.ts`, `.../store/tick-progress-repo.ts`, `.../migrations/0007_tick_progress.sql` (+ snapshot) · `services/scheduler/src/round-outcomes.ts`, `.../Dockerfile` · `.dockerignore` (raiz), `.env.example`, `docs/ops/scheduler-deploy-runbook.md` · `specs/SPEC-032-*.md`, `specs/DONE-032-*.md`.

**Editados:** `packages/world-engine/src/orchestration/anchor.ts` (+`.test.ts`) + `index.ts` · `services/world-store/src/store/daily-round.ts`, `.../index.ts`, `.../schema/index.ts`, `drizzle.config.ts`, `.../test/daily-round.test.ts` (+ os wipeAll com `tickProgress`) · `services/scheduler/src/daily-tick.ts`, `main.ts`, `package.json`, `.../test/daily-tick.test.ts` · os 4 `package.json` de `services/*` (`exports`) · `docs/projeto/roadmap.md`, `CLAUDE.md`.

**Intocado (o critério DURO):** a **lógica** do `world-engine` e os **4 goldens** (`season`/`world`/`prng`/`anchor` — `git diff` = 0; `dueDayIndex` é função nova). O catch-up é 100% borda (`services/*`).

---

*DONE-032 — método H1VE. O mundo passa a jogar às 15h SOZINHO num relógio real, e o catch-up completo garante que ele nunca perde um dia: um worker em container disparado por um scheduled job, com um cursor resumível que replaya as rodadas E os passes humanos de qualquer dia perdido — cada passo idempotente por construção. A revisão adversarial pegou 2 MAJOR reais (o regen órfão na viragem falha; um `.dockerignore` inerte que vazaria segredo) + 1 MINOR (buraco silencioso no 1º tick) — todos corrigidos. Engine e os 4 goldens intocados.*
