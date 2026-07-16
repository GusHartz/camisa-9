# DONE-013 — Camada de dados 0.2 · Fatia 1: snapshot consultável do mundo semeado

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-013 |
| **SPEC correspondente** | SPEC-013-camada-de-dados-fatia-1.md |
| **Feature** | Fase 0.2 — Camada de dados + seed do mundo (Fatia 1 de 5) |
| **Card (board)** | `408c8060-da69-4b6a-9b32-8f6af6e3ea14` |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/fase-0-2-camada-de-dados-seed-do-mundo` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado/concluído** | 2026-07-16 |
| **Dias utilizados vs appetite** | ~½ dia vs 1 a 2 dias |

---

## Resumo do que foi feito

**Primeiro banco do projeto.** Nasceu o tier `services/*` (borda impura) com o workspace **`@camisa-9/world-store`**: a camada que materializa em **Postgres** o `WorldState` que a SPEC-002/009/012 provava **só em memória** — mantendo `packages/world-engine` **100% puro** (OP-17). A dependência é **unidirecional** `store → engine`.

Entregue, autocontido, como a SPEC-013 pediu:

- **Schema do snapshot** em Drizzle (schema-em-TS, tipos inferidos → zero `any` natural) com **migration SQL versionada** (OP-01): `world` (a **`seed` é a fonte-da-verdade**, coluna de 1ª classe) → `world_tier` → `league` → `club` (`archetype` + `weights` jsonb) → `athlete`. A **ordem canônica** das listas é preservada por coluna `ord`; `strength` **não** é persistida (é **derivada** por `clubStrength` na leitura).
- **Mapeadores PUROS** `WorldState`↔linhas (`world-mapper.ts`, sem I/O, decompostos p/ OP-15/16).
- **`writeWorld(seed)`**: `seedWorld` puro → materializa o snapshot **inteiro numa ÚNICA transação** (all-or-nothing). **`readWorld(seed)`** reconstrói o `WorldState`; **`readClubRoster`** é o reader de consulta tipado. `writeWorldState` exposto p/ o teste de atomicidade.
- **Teste-âncora de reconciliação** (gate de Data, load-bearing): `seedWorld('decada') → writeWorld → readWorld` é **deep-equal** ao mundo in-memory **E** `worldHash(readback) === world.golden.json.hashes[0]`. + **teste de atomicidade**: uma gravação que falha no meio (PK duplicada de clube) deixa o banco **sem mundo parcial** (rollback total observável).
- **Postgres real em CI** (service container `postgres:16`, sem secret/rede externa) + passo de migrate + `docker-compose.yml` p/ o inner loop local (Windows). Driver **pooled/TCP** (`pg` `Pool`) — nunca o HTTP one-shot, que travaria a Fatia 2.
- **Segredos**: `DATABASE_URL` server-only (OP-02/OP-12); `.env` já ignorado; `.env.example` versionado; erros de driver genéricos (OP-11).

**Verificação local (contra Postgres real via Docker):** `typecheck` ✅ · `eslint` ✅ (OP-14/15/16; guardrail de determinismo segue verde e não alcança `services/*`) · **`test` 91/91 ✅** (89 do world-engine **intactos** + 2 novos do world-store, rodando **ao vivo**) · `build` ✅. Sem `DATABASE_URL`, a suíte do world-store **pula** graciosamente (89 ✅ / 2 skip) — o inner loop sem Docker fica verde.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `services/world-store/package.json` | `@camisa-9/world-store` (ESM); deps `drizzle-orm` + `pg` + `@camisa-9/world-engine`; dev `drizzle-kit` + `@types/pg`. |
| `services/world-store/tsconfig.json` | Config de type-check (não-composite; ver **Desvios**). |
| `services/world-store/drizzle.config.ts` | Config do `drizzle-kit` (gera a migration). |
| `services/world-store/src/schema/world.ts` | Tabelas do snapshot (world/tier/league/club/athlete) — PKs compostas + FKs. |
| `services/world-store/src/migrations/0000_init_world_snapshot.sql` | Migration versionada (OP-01) + `meta/` do drizzle. |
| `services/world-store/src/client.ts` | Fábrica de conexão Postgres **pooled** a partir de `DATABASE_URL` (server-only). |
| `services/world-store/src/mapping/world-mapper.ts` | `WorldState`↔linhas — funções **puras** (decompostas). |
| `services/world-store/src/store/world-repo.ts` | `writeWorld`/`writeWorldState` (1 tx) + `readWorld` + `readClubRoster`. |
| `services/world-store/src/migrate.ts` | Aplicador de migrations (drizzle migrator; via `tsx`). |
| `services/world-store/src/index.ts` | Barrel export. |
| `services/world-store/test/round-trip.test.ts` | Teste-âncora de reconciliação + atomicidade. |
| `services/world-store/.env.example` | `DATABASE_URL` documentada. |
| `services/world-store/docker-compose.yml` | Postgres local (`postgres:16`); porta override `POSTGRES_PORT`. |
| `specs/SPEC-013-*.md`, `specs/DONE-013-*.md` | SPEC (aprovada no card) + este documento. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `package.json` (raiz) | `"services/*"` adicionado a `workspaces`. |
| `package-lock.json` | Resolução de `drizzle-orm`/`pg`/`drizzle-kit`/`@types/pg` + link do workspace. |
| `tsconfig.typecheck.json` | `include` estendido: `services/*/src`, `services/*/test`, `services/*/*.ts` (gate de tipos autoritativo do world-store). |
| `vitest.config.ts` | `resolve.alias` `@camisa-9/world-engine`→src (CI roda `test` antes de `build`) + `include` do teste de `services/*`. |
| `.github/workflows/ci.yml` | Service container `postgres:16` + `DATABASE_URL` (job env) + passo de migrate antes das verificações. |
| `.prettierignore` | Ignora `services/*/src/migrations/` (SQL + meta JSON gerados pelo drizzle — ele é dono do formato). |
| `CLAUDE.md` | "Estado atual": SPEC-013 concluída; SPEC-012 mergeada (#15); próximo = Fatia 2. |
| `docs/projeto/roadmap.md` | 0.2 marcada em andamento (Fatia 1 concluída). |

**Intocado:** `packages/world-engine/**` (puro, OP-17); **nenhum golden regenerado** (`git diff` dos 4 `.golden.json` = 0). `tsconfig.json` raiz **sem diff** (a reference foi adicionada e revertida — ver Desvios).

---

## Mudanças de schema aplicadas

**Primeira migration do projeto** (OP-01): `0000_init_world_snapshot.sql`, criada por `drizzle-kit generate` a partir do schema-em-TS e **revisada à mão**. Cria as 5 tabelas + PKs compostas (`(world_seed, …)`) + FKs via `ALTER TABLE` (independente de ordem). Aplicar do zero num DB limpo reproduz o schema (provado local + CI). `weights` = `jsonb` de inteiros (round-trip byte-exato). `strength` **não** existe como coluna (derivada).

## Mudanças de API entregues

Novo pacote `@camisa-9/world-store`: `createDb`, `writeWorld`, `writeWorldState`, `readWorld`, `readClubRoster`, mapeadores puros + `schema`. Nenhuma mudança na API pública do `world-engine`.

---

## Critérios de aceitação — verificação

| Cenário (SPEC-013) | Status | Evidência |
|---|---|---|
| 1 — Round-trip determinístico: `writeWorld → readWorld` **deep-equal** ao `seedWorld('decada')` (archetype+weights+ordem) | ✅ | `round-trip.test.ts` `toEqual(seedWorld('decada'))` verde ao vivo contra Postgres. |
| 2 — Golden intacto: `worldHash(readback) === world.golden.json.hashes[0]`; nenhum golden regenerado | ✅ | Assert do hash `b9d56bdb…` verde; `git diff` dos 4 goldens = 0. |
| 3 — Atomicidade: falha no meio deixa o banco **sem mundo parcial** | ✅ | Teste com PK de clube duplicada → `rejects.toThrow()` + `readWorld === null`. |
| 4 — Migration versionada (OP-01); aplica do zero num DB limpo | ✅ | `0000_init_world_snapshot.sql` revisada; `db:migrate` aplicou local + CI. |
| 5 — `world-engine` permanece puro; dependência só `store → engine` | ✅ | `packages/world-engine` intocado; guardrail de determinismo (escopo `packages/*/src`) verde. |
| 6 — CI verde sem infra manual; sem secret/rede externa; arquivos novos em LF | ✅ | `postgres:16` service container; 4 gates + teste do world-store no job `ci`; novos arquivos LF-normalizados prettier-clean. |
| 7 — Segredos: `DATABASE_URL` server-only; `.env` ignorado; `.env.example` versionado | ✅ | `.env.example` criado; `.gitignore` já cobria `.env*`; nada hardcoded. |
| 8 — OPs: nenhuma função > 50 linhas, nenhum arquivo > 300, zero `any`; erros genéricos | ✅ | `eslint` verde (OP-14/15/16); mapeadores decompostos; `migrate.ts` sem vazar SQL/stack (OP-11). |

---

## Como testar manualmente

```
# 1. Subir o Postgres local (se a porta 5432 estiver ocupada, use POSTGRES_PORT):
POSTGRES_PORT=5434 docker compose -f services/world-store/docker-compose.yml up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5434/camisa9_dev

# 2. Aplicar a migration e rodar os gates:
npm run db:migrate -w services/world-store
npm run lint && npm run typecheck && npm test && npm run build   # 91/91 (2 do world-store ao vivo)

# 3. Sem Docker (inner loop rápido): unset DATABASE_URL → 89 pass / 2 skip.
```

**Dados de teste necessários:** nenhum — determinístico por seed `"decada"`.

---

## Testes automatizados

**2 testes novos** em `services/world-store/test/round-trip.test.ts** (gated por `DATABASE_URL`): (1) round-trip determinístico + golden hash; (2) atomicidade (rollback total). Total do repo: **91** (89 do world-engine preservados). CI roda ambos ao vivo contra o service container `postgres:16`.

**Comando:** `npm run lint && npm run typecheck && npm test && npm run build`

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `services/world-store/src/**` (schema, client, mapper, repo, migrate, index) | ~100% | Sim — schema/FKs/PKs conferidos; mapeadores puros e decompostos; verbatimModuleSyntax OK. |
| `services/world-store/src/migrations/0000_*.sql` | ~100% (gerado pelo `drizzle-kit`, revisado à mão) | Sim — 5 tabelas + FKs via ALTER; aplicado do zero local + CI. |
| `services/world-store/test/round-trip.test.ts` | ~100% | Sim — round-trip + atomicidade; rodou ao vivo (91/91). |
| Wiring (`package.json`, `tsconfig.typecheck.json`, `vitest.config.ts`, `ci.yml`, `.prettierignore`, `docker-compose.yml`, `.env.example`) | ~100% | Sim — gates verdes; ver **Desvios** p/ o tsconfig. |
| `specs/SPEC-013`, `specs/DONE-013`, `CLAUDE.md`, `roadmap.md` | ~100% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC original?**
- [x] Não em escopo/comportamento. Duas realizações **de mecanismo** divergiram da tabela "Arquivos" da SPEC (numeração da migration e o wiring do tsconfig) — ambas documentadas em **Desvios**, sem alterar o que foi construído nem os critérios de aceitação.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **Wiring do tsconfig** (o mais relevante) | A SPEC listava "adicionar `./services/world-store` às `references` do `tsconfig.json` raiz" + reference a `world-engine`. Em vez disso, o world-store é **type-checked via `tsconfig.typecheck.json`** (padrão do `harness/`), **fora** do grafo `tsc -b`. | `tsc -b --noEmit` (1ª metade do gate `typecheck`) **proíbe** um projeto referenciado de desabilitar emit (**TS6310**) — e um projeto composite que referencia outro composite exige exatamente isso. O `world-engine` só funcionava com `--noEmit` por ser **folha**; esta é a 1ª reference cruzada do repo. Preservar a semântica "typecheck não emite" (decisão da SPEC-001) → world-store fica typecheck-only, rodado via `tsx`/`vitest` (é borda I/O, como o harness). **Mesmo objetivo** (world-store type-safe, engine puro, gates verdes), mecanismo diferente. Quando um consumidor em runtime aparecer (Fatia 2+), vira composite com alias próprio. |
| **Numeração da migration** | SPEC dizia `0001_init_world_snapshot`; o `drizzle-kit` numera a partir de **`0000`**. | Convenção do tooling (Drizzle); o conteúdo/OP-01 são idênticos. |
| **`docker-compose` porta override** | Adicionado `POSTGRES_PORT` (default 5432) no compose + nota no `.env.example`. | A máquina de dev já tem outro Postgres em 5432 (`colosseum`) — o override destrava o inner loop sem conflito, mantendo 5432 como default limpo. Validado localmente na 5434. |
| **DB local vs CI** | Local usa `camisa9_dev` (compose); CI usa `camisa9_test` (service container). | Ambientes distintos; sem impacto (URL server-only em cada). |
| **`.gitignore`** | Não modificado. | Já cobria `.env`/`.env.*` com `!.env.example` — o critério de segredos já estava satisfeito. |

**Protocolo de conflito (parar+registrar):** não acionado — nenhum desvio de **escopo/comportamento** nem violação de OP; apenas escolhas de mecanismo abaixo do limiar de drift, registradas aqui para transparência.

---

## Limitações conhecidas

- **Sem atomicidade de rodada / lock / idempotência** — deferido para a **Fatia 2** (a joia do money path: `RoundStore`/`RoundPublisher` em Postgres, `UNIQUE(league_id,season_id,round)`, advisory lock). Esta fatia prova a atomicidade **de uma gravação de snapshot**, não de rodada.
- **Snapshot é cache, não timeline** — só o mundo semeado; persistir **viragens** (`advanceWorld` → nova versão) é a **Fatia 3**.
- **Neon branch-por-ambiente** — Fatia 4 (aqui é Postgres genérico via `pg`).
- **world-store sem build p/ `dist`** — roda via `tsx`/`vitest` (typecheck-only). Quando um consumidor em runtime existir, promover a composite buildable.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| world-store fora do `tsc -b` (typecheck-only) | Baixo — tipos cobertos pelo `tsconfig.typecheck.json`; sem `dist`. | Ao surgir consumidor runtime (Fatia 2+): virar composite com alias `@camisa-9/world-store`. |
| 4 vulnerabilidades `moderate` (transitivas do `drizzle-kit`, dev-only) | Baixo — ferramenta de dev, não entra em runtime. | Monitorar em bump do `drizzle-kit`. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (8/8)
- [x] Testes passando (91/91 ao vivo; 89/2-skip sem DB)
- [x] Typecheck limpo
- [x] Lint limpo (`eslint` ✅; prettier LF-normalizado ✅ — CRLF local é gotcha)
- [x] Nenhum log de debug / `any` / segredo hardcoded
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` "Estado atual" atualizado (SPEC-013)
- [x] Este DONE está completo e commitado na branch *(commit no fluxo do PR)*

---

*DONE-013 — método H1VE. Fatia 1 de 5 da Fase 0.2: primeiro banco do projeto; `world-engine` permanece puro (OP-17); a atomicidade do money path é a Fatia 2, isolada de propósito. Postgres real em CI · Drizzle · tier `services/*`.*
