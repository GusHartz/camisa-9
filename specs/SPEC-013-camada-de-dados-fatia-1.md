# SPEC-013 — Camada de dados 0.2 · Fatia 1: snapshot consultável do mundo semeado

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-013 |
| **Feature** | Fase 0.2 — Camada de dados + seed do mundo (Fatia 1 de 5) |
| **Slug** | fase-0-2-camada-de-dados-seed-do-mundo |
| **Card (board)** | `408c8060-da69-4b6a-9b32-8f6af6e3ea14` |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 0.2 — Camada de dados + seed do mundo (persiste o que a SPEC-002/009 provou em memória). |
| **Appetite** | **1 a 2 dias** (primeiro banco do projeto — do zero). |
| **Prioridade** | ALTA — destrava a persistência real do `WorldState`. |
| **Criada em** | 2026-07-16 |
| **Status** | **Proposta — aguardando aprovação do founder no card** |

---

## Objetivo

Introduzir o **primeiro banco do projeto** (Postgres/Neon) como uma **camada de persistência IMPURA** que materializa o `WorldState` que a SPEC-002/009 provou **só em memória** — mantendo `packages/world-engine` **100% puro** (OP-17). A Fatia 1 entrega o mínimo autocontido: um pacote `services/world-store`, um **schema com migration versionada** (OP-01), **mapeadores puros** `WorldState`↔linhas, um **writer de snapshot em uma transação** + **readers tipados**, e o **teste-âncora de reconciliação** que prova que persistir **NÃO altera os bytes** do mundo semeado (`readback === seedWorld(seed)`, consistente com o 1º hash de `world.golden.json`).

**NÃO** reivindica atomicidade de rodada, lock distribuído nem idempotência — isso é a **Fatia 2**, deliberadamente deferida.

---

## Contexto e motivação

A 0.2 é greenfield de persistência: o repo só tem `packages/world-engine`, **zero tooling de DB**, sem migrations, sem `.env`. O SDD §1 crava (decisão não-pendente) **Postgres (Neon), serverless, branch por ambiente** + **atomicidade all-or-nothing**; a memória durável registra que **atomicidade de banco, durabilidade pós-crash e lock distribuído ficaram explicitamente em aberto até a 0.2**.

**Decisões do founder (ratificadas 2026-07-16), cravadas nesta fatia:**
1. **DB real em CI** — service container `postgres:16` no GitHub Actions já na Fatia 1 (prova o dialeto real; sem cliff de re-tooling na Fatia 2).
2. **Tooling = Drizzle + drizzle-kit** — schema-em-TS com tipos inferidos (zero `any` natural, OP-14), migration SQL versionada e legível (OP-01).
3. **Novo tier `services/*`** — a borda impura mora em `services/world-store`, fora de `packages/*`.

**Fatos de código verificados (2026-07-16, `origin/main`):**
- `eslint.config.mjs`: o guardrail de determinismo é escopo **`packages/*/src/**/*.ts`** (l.83) → `services/world-store/src` fica **automaticamente fora** (pode ter `new Date()`, driver, I/O). OP-14/15/16 valem para **`**/*.ts`** (l.66) → continuam valendo em `services/*`.
- `tsconfig.json` raiz referencia só `./packages/world-engine` → adicionar `./services/world-store`.
- `.github/workflows/ci.yml`: job único `ci` que roda `lint/typecheck/test/build --if-present` → adicionar `services: postgres:16` + `DATABASE_URL` + passo de migrate.
- `WorldState` (types.ts): `world{seasonId,tiers[]}` → `Tier{tier,leagues[]}` → `League{leagueId,clubs[]}` → `WorldClub{id,name,strength(DERIVADA),archetype,weights[],roster[]}` → `Athlete{id,name,age,ability,position}`. A **seed** (string) hoje é só argumento de `seedWorld` — **não** é campo de `WorldState`.

**Estratégia de materialização (recomendação convergida — híbrido):** a `seed` é a **fonte-da-verdade** re-derivável; o snapshot materializado é **cache consultável**, reconstruível por replay, **nunca autoridade**. (Seed-only puro falha: `archetype`/`weights` são sorteados por seed na criação, não deriváveis em O(1); e o mundo joga todo dia → replay-on-read cresce sem limite.) `strength` **não** é persistida por linha (derivada via `clubStrength`).

---

## Escopo — o que está DENTRO

- [ ] **Workspace `services/world-store`** (`@camisa-9/world-store`, ESM), dependência **UNIDIRECIONAL** `store → world-engine` (nunca o contrário). Registrar `"services/*"` em `workspaces` na `package.json` raiz.
- [ ] **Tooling** = `drizzle-orm` + `drizzle-kit`, sobre **driver Postgres POOLED/TCP** (`pg` `Pool` ou `@neondatabase/serverless` com `Pool`/WebSocket — **NUNCA** o driver HTTP one-shot, que não suporta transação interativa e travaria a Fatia 2).
- [ ] **Migration versionada `0001_init_world_snapshot`** (OP-01) do snapshot: `world(seed TEXT fonte-da-verdade, season_id)`, `tiers(tier)`, `leagues(league_id)`, `clubs(id, name, archetype, weights)` com a **ORDEM canônica preservada**, `athletes(id, club_id, name, age, ability, position)`. `weights` como `int[]`/`jsonb` de inteiros (round-trip byte-exato). `strength` **NÃO** persistida por linha.
- [ ] **`seed` como coluna de 1ª classe** na borda impura (contida em `services/*` — não vaza para a lib pura).
- [ ] **Mapeadores PUROS** `WorldState`↔linhas (sem I/O, testáveis; decompostos para respeitar OP-15/16 — 5 entidades estouram 50 linhas fácil).
- [ ] **`writeWorld(seed)`**: chama `seedWorld(seed)` puro e materializa o snapshot **inteiro em UMA transação**. **`readWorld(seed)`**: reconstrói o `WorldState` do snapshot. **Readers de consulta tipados** (liga→clubes, clube→roster).
- [ ] **Segredos**: `.env.example` com `DATABASE_URL` (server-only, OP-02/OP-12); `.env*` no `.gitignore`; nenhum segredo hardcoded; erros de driver não vazam (OP-11).
- [ ] **Teste-âncora de reconciliação** (gate de Data, load-bearing): `seedWorld('decada') → writeWorld → readWorld` **deep-equals** `seedWorld('decada')` **E** `worldHash(readback) === world.golden.json.hashes[0]`.
- [ ] **CI**: adicionar `services: postgres:16` + `DATABASE_URL` + passo de migrate + rodar o teste do `world-store` no job `ci`; `docker-compose.yml` para o Postgres local; garantir que o teste entra no `npm test`.
- [ ] **Wiring TS**: `services/world-store/tsconfig.json` (extends base, reference a `world-engine`) + adicionar `./services/world-store` às `references` do `tsconfig.json` raiz.

## Escopo — o que está FORA

- **Publicador de rodada transacional** (RoundStore/RoundPublisher em Postgres real; `BEGIN`/stage/`COMMIT` numa única tx; `UNIQUE(league_id,season_id,round)` como idempotência; advisory lock no lugar do `Set` in-process; seam `onBeforeCommit`) → **Fatia 2** (a joia do money path — onde se prova a atomicidade de banco).
- **Persistência das viragens** (`advanceWorld` → nova versão de snapshot; timeline; reconciliação com os 11 hashes de `world.golden`) → **Fatia 3**.
- **Neon branch-por-ambiente + job de prod-fidelity** → **Fatia 4**.
- **Pirâmide Elástica / grupos paralelos** (múltiplas ligas por tier) → **Fatia 5** (o schema já modela `tier→[leagues]` desde v1).
- **Job diário 15h** (roadmap 1.2) e **contas humanas/sessão/auth** (roadmap 0.4) — fora da 0.2. A 0.2 é só o mundo (ligas/clubes/atletas/temporadas), **sem humanos**.
- **Forma/Moral e estado intra-partida** (R4 final) — não existem no engine ainda; **não** modelar schema especulativo.
- `packages/world-engine` — **INTOCADO** (permanece puro, OP-17); no máximo confirmar reexport de tipos já públicos.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `package.json` (raiz) | adicionar `"services/*"` a `workspaces`. |
| `services/world-store/package.json` | criar — `@camisa-9/world-store`, dep em `@camisa-9/world-engine` + `drizzle-orm` + driver `pg` pooled + dev `drizzle-kit`. |
| `services/world-store/tsconfig.json` | criar — ESM, extends do base, reference a `world-engine`. |
| `services/world-store/drizzle.config.ts` | criar — config do `drizzle-kit`. |
| `services/world-store/src/client.ts` | criar — fábrica de conexão Postgres **pooled** a partir de `DATABASE_URL` (server-only). |
| `services/world-store/src/schema/world.ts` | criar — tabelas do snapshot (world/tiers/leagues/clubs/athletes). |
| `services/world-store/src/migrations/0001_init_world_snapshot.sql` | criar — primeira migration versionada (OP-01). |
| `services/world-store/src/mapping/world-mapper.ts` | criar — `WorldState`↔linhas, funções **puras** (decompor p/ OP-15/16). |
| `services/world-store/src/store/world-repo.ts` | criar — `writeWorld` (1 tx) + `readWorld` + readers de consulta. |
| `services/world-store/src/index.ts` | criar — barrel export. |
| `services/world-store/test/round-trip.test.ts` | criar — teste-âncora de reconciliação. |
| `.env.example` | criar — `DATABASE_URL` documentada. |
| `.gitignore` | garantir `.env*` ignorado. |
| `docker-compose.yml` | criar — Postgres local p/ o inner loop do founder. |
| `.github/workflows/ci.yml` | modificar — service container `postgres:16` + migrate + teste do world-store. |
| `tsconfig.json` (raiz) | adicionar `./services/world-store` às references. |
| `vitest.config.ts` | (se necessário) incluir o teste do world-store no run raiz. |
| `specs/SPEC-013-*.md`, `specs/DONE-013-*.md` | criar. |

**Intocado:** `packages/world-engine/**` (puro, OP-17); nenhum golden regenerado.

---

## Critérios de aceitação

1. **Round-trip determinístico (gate de Data, load-bearing):** `seedWorld('decada') → writeWorld → readWorld` produz um `WorldState` **deep-equal** ao `seedWorld('decada')` in-memory, byte-a-byte, incluindo `archetype`+`weights` e a **ORDEM canônica** de tiers/leagues/clubs/athletes.
2. **Golden intacto:** `worldHash(readback) === world.golden.json.hashes[0]`; a fatia **não toca** `simulateSeason`/`resolveMatch` nem regenera nenhum golden (`git diff` dos 4 `.golden.json` = 0).
3. **Atomicidade do snapshot:** `writeWorld` persiste o mundo inteiro numa **ÚNICA transação**; falha no meio deixa o banco **sem mundo parcial** (rollback total observável em teste).
4. **Migration versionada (OP-01):** schema criado **exclusivamente** via `0001` commitada; aplicar do zero num DB limpo reproduz o schema; SQL revisado à mão.
5. **`world-engine` permanece puro:** nenhuma dependência de driver entra em `packages/world-engine`; guardrail de determinismo continua verde; a dependência é só `store → engine`.
6. **CI verde sem infra manual:** os 4 gates + o teste do `world-store` passam no Actions com o service container `postgres:16`; **nenhum secret, nenhuma rede externa** (PRs externos passam). Arquivos novos em **LF** (gotcha CRLF/prettier).
7. **Segredos:** `DATABASE_URL` só via env server-only; `.env` no `.gitignore`; `.env.example` versionado; nenhum segredo no código nem no cliente.
8. **OPs:** nenhuma função > 50 linhas (OP-15), nenhum arquivo > 300 (OP-16), zero `any` (OP-14) — mapeadores decompostos; erros genéricos (OP-11).

---

## Segurança (se aplicável)

- **OP-02/OP-12:** `DATABASE_URL` é o primeiro segredo do projeto — **só** em env server-only; `.env*` no `.gitignore`; `.env.example` com placeholder. Nada hardcoded, nada no cliente.
- **OP-11:** erros de driver/conexão retornam mensagem genérica; sem vazar SQL/stack/DSN.
- **Superfície:** o `world-store` é biblioteca de servidor (sem rota HTTP nesta fatia) — auth/autorização entram com o servidor real (0.4). Menor privilégio: escrita no snapshot é da store, não do cliente.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| Snapshot **diverge** do seed (duas fontes da verdade) | O teste-âncora (crit. 1+2) prova `snapshot === seedWorld === golden` a cada run; divergência = build vermelho. `seed` é a autoridade; snapshot é cache. |
| Driver errado (HTTP one-shot) travaria a Fatia 2 | Cravar **pooled/TCP** já na Fatia 1 (decisão do founder); a Fatia 1 não usa tx interativa, mas a escolha é durável. |
| Migration/SQL gerado pelo Drizzle incorreto | SQL versionado **revisado à mão** (crit. 4); aplicar do zero num DB limpo é critério. |
| `world-engine` contaminado por I/O | Dependência **unidirecional** `store → engine`; guardrail de determinismo (packages/*/src) continua verde (crit. 5). |
| CI quebra ao adicionar Postgres | Service container oficial `postgres:16`, sem secret/rede externa; healthcheck antes do migrate; testado no PR. |
| Lint local falha por **CRLF** no Windows | Não é regressão; CI (LF) é a fonte da verdade; `prettier --write` nos arquivos novos antes do push. |

**Dependências:** SPEC-002 (contrato transacional em memória — vira Postgres na Fatia 2) e SPEC-009/012 (`WorldState` + tunáveis 16/10) são a base. **Precede** a Fatia 2 (publicador transacional), que é a joia do money path.

---

## Notas de implementação

- **Drizzle:** schema em TS (`schema/world.ts`) → `drizzle-kit generate` emite o SQL da `0001` (revisar à mão antes de commitar). Tipos inferidos do schema (sem `any`).
- **`writeWorld`:** `const w = seedWorld(seed)` (puro) → abrir tx → inserir world/tiers/leagues/clubs/athletes na ordem canônica → commit. Rollback total em erro.
- **`readWorld`:** SELECTs ordenados (tier, leagueId, club index, athlete index) → remontar `WorldState`; `strength` recomputada por `clubStrength(roster)` na leitura (não lida do banco).
- **Ordem canônica:** persistir/ler preservando a ordem de `seedWorld` (tiers 1..N; clubes por `globalIndex`; atletas por POSITIONS × squadShape) — é o que faz o `worldHash` bater.
- **CI:** `services.postgres` (`postgres:16`, env `POSTGRES_PASSWORD`), `DATABASE_URL=postgres://postgres:postgres@localhost:5432/camisa9_test`, passo de migrate antes do `npm test`. Healthcheck do container antes de rodar.
- **`docker-compose.yml`:** um serviço `postgres:16` mapeando 5432, com a mesma `DATABASE_URL` do `.env.example` — o inner loop do founder no Windows.
- **Fecho do DONE:** atualizar o "Estado atual" do CLAUDE.md (SPEC-013 / Fatia 1 da 0.2) e corrigir a nota "SPEC-012 (PR pendente)" → "(Mergeado #15)".

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (Fatia 1 autocontida; atomicidade/viragens/Neon/Pirâmide/job/auth fora — em fatias nomeadas)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudanças de schema documentadas (migration `0001` versionada — OP-01)
- [x] Critérios de aceitação testáveis (round-trip determinístico + golden + `git diff` + CI)
- [x] Riscos avaliados (divergência snapshot↔seed e driver são os centrais — mitigados)
- [x] Appetite razoável (1 a 2 dias — primeiro banco)
- [ ] **Aprovada** — *aguardando o founder/architect no card `408c8060`*

---

*SPEC-013 — método H1VE. Fatia 1 de 5 da Fase 0.2. Primeiro banco do projeto; `world-engine` fica puro (OP-17); a atomicidade do money path é a Fatia 2, isolada de propósito. Decisões do founder: Postgres real em CI · Drizzle · `services/*`.*
