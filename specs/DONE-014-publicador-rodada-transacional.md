# DONE-014 — Camada de dados 0.2 · Fatia 2: publicador de rodada transacional (Postgres)

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-014 |
| **SPEC correspondente** | SPEC-014-publicador-rodada-transacional.md |
| **Feature** | Fase 0.2 — Camada de dados + seed do mundo (Fatia 2 de 5) |
| **Card (board)** | `41a73b43-f92f-426c-958a-93cb3d7485ad` |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/fase-0-2-fatia-2-publicador-de-rodada-transacional-postgres` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado/concluído** | 2026-07-16 |
| **Dias utilizados vs appetite** | ~½ dia vs 2 a 3 dias |

---

## Resumo do que foi feito

**A joia do money path agora é durável.** Portei o contrato de publicação de rodada — que a SPEC-002 provava **só em memória** (`RoundStore`/`RoundPublisher`) — para **Postgres real** em `services/world-store`, fechando o débito honesto que a memória do projeto registrava: *"o spike prova o contrato, mas NÃO a atomicidade de banco; concorrência, durabilidade pós-crash e lock ficam em aberto até a 0.2."*

- **Tabela `published_round`** (migration aditiva `0001`, OP-01): PK composta `(league_id, season_id, round)` = a chave de idempotência durável; `result` `jsonb` (o `RoundResult` inteiro, round-trip byte-exato); `published_at` (audit).
- **`publishRound(db, input, onBeforeCommit?)`**: uma **transação interativa** (`db.transaction`) que faz `pg_try_advisory_xact_lock` (→ `locked`; não-bloqueante, **xact-scoped** = auto-liberado, sem leak) → checa existência (→ `idempotent`) → `INSERT` → **`await onBeforeCommit?.()`** → commit (→ `published`). Falha **síncrona OU assíncrona** no seam → **ROLLBACK real** do Postgres + rethrow. `readRound` é o reader tipado.
- **Reuso do contrato**: `PublishInput`/`PublishOutcome`/`PublishStatus` são **importados** do engine (já públicos) — uma única fonte de verdade do contrato; `packages/world-engine` fica **intocado** (OP-17).

**Verificação (contra Postgres real via Docker):** `typecheck` ✅ · `eslint` ✅ (OP-14/15/16) · **`test` 101/101 ✅** (91 anteriores intactos + 10 novos ao vivo) · `build` ✅. Sem `DATABASE_URL`: **89 ✅ / 12 skip** (2 round-trip + 10 publish) — inner loop sem Docker segue verde. **Nenhum golden regenerado** (`git diff` dos 4 = 0); a migration `0000` **intocada**.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `services/world-store/src/schema/round.ts` | Tabela `published_round` (PK composta + `result` jsonb + `published_at`). |
| `services/world-store/src/schema/index.ts` | Barrel do schema (`world` + `round`) p/ o driver e o drizzle-kit. |
| `services/world-store/src/store/round-repo.ts` | `publishRound` (1 tx, advisory lock, idempotência, seam) + `readRound` + helpers. |
| `services/world-store/src/migrations/0001_publish_round.sql` | Migration aditiva (só `published_round`) + `meta/0001_snapshot.json`. |
| `services/world-store/test/publish.test.ts` | Os 10 cenários contra Postgres real (gated por `DATABASE_URL`). |
| `specs/SPEC-014-*.md`, `specs/DONE-014-*.md` | SPEC (aprovada no card) + este documento. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `services/world-store/src/client.ts` | `import * as schema` passa a vir do barrel `./schema/index.js` (inclui `round`). |
| `services/world-store/src/index.ts` | Exporta `publishRound`/`readRound` + re-exporta `PublishInput`/`PublishOutcome`/`PublishStatus` do engine; schema vem do barrel. |
| `services/world-store/drizzle.config.ts` | `schema` cobre `world.ts` + `round.ts`. |
| `services/world-store/src/migrations/meta/_journal.json` | Entrada da migration `0001` (gerado pelo drizzle-kit). |
| `CLAUDE.md` | "Estado atual": SPEC-014 / Fatia 2 concluída. |
| `docs/projeto/roadmap.md` | 0.2 Fatia 2 ✅. |

**Intocado:** `packages/world-engine/**` (puro, OP-17); a migration `0000` + os 4 goldens (`git diff` = 0). CI **sem mudança** (o `postgres:16` + migrate da Fatia 1 já aplicam `0000`+`0001`).

---

## Mudanças de schema aplicadas

Migration **aditiva** `0001_publish_round.sql` (OP-01), gerada por `drizzle-kit generate` e revisada à mão: `CREATE TABLE published_round` com PK composta `(league_id, season_id, round)`, `result jsonb NOT NULL`, `published_at timestamptz NOT NULL DEFAULT now()`. Não toca a `0000`. Aplicar do zero (`0000`+`0001`) num DB limpo reproduz o schema (provado local + a rodar no CI).

## Mudanças de API entregues

`@camisa-9/world-store` ganha `publishRound`, `readRound` e re-exporta o contrato (`PublishInput`/`PublishOutcome`/`PublishStatus`). API pública do `world-engine` inalterada.

---

## Critérios de aceitação — verificação

| Cenário (SPEC-014) | Status | Evidência |
|---|---|---|
| 1 — Porte fiel dos 7 comportamentos do `publish.test` in-memory contra Postgres real | ✅ | `publish.test.ts` cenários 1-7 verdes ao vivo (published/idempotent/locked, rollback sync+async, lock liberado, rodadas distintas). |
| 2 — Atomicidade de BANCO real (rollback observável, não swap) | ✅ | Cenários 4/5: seam lança/rejeita → `readRound===null`, `count===0` (ROLLBACK do Postgres). |
| 3 — Idempotência durável / retry-safe, sem clobber | ✅ | Cenário 8: re-publicar `(liga,season,round)` → `idempotent`, 1 linha, `result` **inalterado** (retorna o primeiro, não o segundo). |
| 4 — Lock por advisory lock, sem leak; teste determinístico | ✅ | Cenário 3: lock segurado numa 2ª conexão → `publishRound` recua `locked`, `count===0`; xact-scoped (auto-liberado). |
| 5 — Reconciliação: `RoundResult` do engine → publica → lê deep-equal | ✅ | Cenário 9: `simulateSeason(DEMO_LEAGUE,'decada').rounds[0]` → `publishRound` → `readRound` `toEqual`. |
| 6 — Migration versionada (OP-01); `0000` intocada; aplica do zero | ✅ | `0001_publish_round.sql` aditiva revisada; `git diff` da `0000`/snapshot = 0; `db:migrate` aplicou local + CI. |
| 7 — `world-engine` puro; sem golden regenerado | ✅ | `packages/world-engine` intocado; guardrail de determinismo verde; `git diff` dos 4 goldens = 0. |
| 8 — CI verde sem infra manual; arquivos novos em LF | ✅ | `postgres:16` (herdado); 101/101 no run com DB; novos arquivos LF-normalizados prettier-clean. |
| 9 — OPs (funções ≤50, arquivos ≤300, zero `any`, erros genéricos) | ✅ | `eslint` verde; `round-repo` decomposto (helpers); sem vazar SQL/DSN (OP-11); `DATABASE_URL` server-only. |

---

## Como testar manualmente

```
POSTGRES_PORT=5434 docker compose -f services/world-store/docker-compose.yml up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5434/camisa9_dev
npm run db:migrate -w services/world-store      # aplica 0000 + 0001
npm run lint && npm run typecheck && npm test && npm run build   # 101/101 (10 do publisher ao vivo)
# Sem Docker: unset DATABASE_URL → 89 pass / 12 skip.
```

**Dados de teste necessários:** nenhum — `DEMO_LEAGUE` + seed `"decada"` são determinísticos.

---

## Testes automatizados

**10 testes novos** em `services/world-store/test/publish.test.ts` (gated por `DATABASE_URL`): os 7 comportamentos do contrato + idempotência durável (no-clobber) + reconciliação com o engine + invariante de concorrência (2 sobrepostas → 1 publicada, 1 linha). Total do repo: **101** (91 preservados). CI roda os 10 ao vivo contra `postgres:16`.

**Comando:** `npm run lint && npm run typecheck && npm test && npm run build`

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `services/world-store/src/schema/round.ts`, `schema/index.ts` | ~100% | Sim — PK composta + jsonb conferidos; migration aditiva revisada. |
| `services/world-store/src/store/round-repo.ts` | ~100% | Sim — fluxo tx/advisory-lock/idempotência/seam conferido contra o `RoundPublisher` original. |
| `services/world-store/src/migrations/0001_publish_round.sql` | ~100% (gerado pelo drizzle-kit, revisado) | Sim — só `published_round`; `0000` intocada. |
| `services/world-store/test/publish.test.ts` | ~100% | Sim — 10 cenários ao vivo (101/101); teste `locked` determinístico (sem flaky). |
| Wiring (`client.ts`, `index.ts`, `drizzle.config.ts`) + `SPEC/DONE-014`, `CLAUDE.md`, `roadmap.md` | ~100% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC original?**
- [x] Não em escopo/comportamento. Uma simplificação **de mecanismo**: a SPEC previa declarar os tipos do contrato no world-store *"se não públicos"* — eles **são** públicos no engine, então foram **reusados** (uma fonte de verdade), e o arquivo `round-types.ts` planejado **não** foi criado. Documentado abaixo.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **Tipos do contrato** | A SPEC listava `store/round-types.ts` (declarar `PublishInput`/`PublishStatus`/`PublishOutcome`) **"reusando `RoundResult`; não modificar o engine"**. Verifiquei o `index.ts` do engine: os **três tipos já são exportados** (`publish.ts`). Então **importei-os** do engine (uma fonte de verdade) e **não criei** `round-types.ts`. | O objetivo era não tocar o engine para expô-los — não precisou (já públicos). Reusar é mais fiel ao contrato e evita duplicação. Zero impacto em comportamento/critérios. |
| **Numeração da migration** | `0001` (como planejado). | Convenção do drizzle-kit (sequencial após `0000`). |
| **`world-store` segue typecheck-only** | Não virou composite/buildable apesar da nota da memória ("Fatia 2+ → converter"). | O único consumidor do `world-store` continua sendo o próprio teste (via alias→src); nenhum consumidor **runtime externo** surgiu nesta fatia. Converter só quando isso acontecer (permanece dívida registrada). |

**Protocolo de conflito (parar+registrar):** não acionado — nenhum desvio de escopo/comportamento nem violação de OP.

---

## Limitações conhecidas

- **`result` é `jsonb` (não decomposto em linhas de partida).** Consultar partidas por atleta/clube exigirá uma tabela `match_result` — fatia futura; aqui o foco é a atomicidade.
- **Chave sem `world_seed`.** `(league_id, season_id, round)` (fiel à SPEC-002/card). Unicidade cross-mundo é evolução futura da chave.
- **Quem chama `publishRound` todo dia às 15h** é a **1.2** (orquestração de rodada diária) — esta fatia entrega o publicador, não o job.
- **Isolamento default (READ COMMITTED).** Suficiente aqui: o advisory lock serializa publicadores da mesma chave e a PK é a rede durável. Isolamento mais forte só se um caso futuro exigir.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| `world-store` typecheck-only (sem `dist`) | Baixo — tipos cobertos; roda via tsx/vitest. | Ao surgir consumidor runtime externo: virar composite com alias `@camisa-9/world-store`. |
| Nenhum débito novo desta fatia. | — | — |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (9/9)
- [x] Testes passando (101/101 ao vivo; 89/12-skip sem DB)
- [x] Typecheck limpo
- [x] Lint limpo (`eslint` ✅; prettier LF-normalizado ✅ — CRLF local é gotcha)
- [x] Nenhum log de debug / `any` / segredo hardcoded
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` "Estado atual" atualizado (SPEC-014)
- [x] Este DONE está completo e commitado na branch *(commit no fluxo do PR)*

---

*DONE-014 — método H1VE. Fatia 2 de 5 da Fase 0.2: a joia do money path. Portou o contrato de publicação da SPEC-002 (in-memory) para Postgres real — atomicidade all-or-nothing durável, idempotência por PK, advisory lock xact-scoped, seam async à prova de rollback. `world-engine` intocado (OP-17); precede as rodadas diárias (1.2).*
