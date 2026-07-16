# DONE-016 — Conta + criação do atleta (Fase 1): conta por e-mail + atleta com atributos base

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-016 |
| **SPEC correspondente** | SPEC-016-conta-e-criacao-do-atleta.md |
| **Feature** | Conta e criação do atleta (card 22 — primeira feature da Fase 1) |
| **Card (board)** | `0126c71a-a1c9-4fa8-b5d2-d81864e77b55` |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/conta-e-criacao-do-atleta` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado/concluído** | 2026-07-16 |
| **Dias utilizados vs appetite** | ~½ dia vs 2 a 3 dias |

---

## Resumo do que foi feito

**A primeira identidade humana do projeto.** Antes desta fatia o repo era 100% mundo NPC (engine + world-store) — **nenhum humano existia**. Agora há uma **conta por e-mail** (senha argon2id) e a **criação do atleta** (nome com filtro, posição, visual pixel básico, e a distribuição livre de atributos nos 4 focos), persistidas atomicamente. Segue o padrão H1VE à risca: a **regra é lib pura** (`packages/player`, determinística, sob o guardrail); a **persistência + o hashing são serviço impuro isolado** (`services/player-store`).

- **`packages/player` (lib pura, novo workspace):** `constants` (bloco `PLAYER` tunável) · `name-filter` (`validateName` — normaliza + charset PT-BR + blocklist mínima insensível a caixa/acento/**leet**) · `attributes` (`allocateAttributes` — a **primitiva reusável**: 4 focos inteiros em `[20,50]`, soma fixa 136) · `appearance` (`validateAppearance` — índices bounded) · `password-policy` (`validatePassword` — só a política, ≥10) · `create` (`createAthlete` → `AthleteDraft` sem id/timestamps). **Standalone** (não importa o world-engine em `src`; a calibração cruza com o engine só no teste).
- **`services/player-store` (serviço impuro isolado, novo workspace):** schema Drizzle no **schema Postgres dedicado `player`** (`account` = e-mail único + `password_hash` + created_at; `athlete` = 4 focos `int CHECK 0..99`, `appearance` jsonb, `training_xp` = **o seam da barra de treino**, `active`, FK→account) + **índice único parcial `(account_id) WHERE active`** (1 atleta ativo/conta). `auth` (argon2id via `@node-rs/argon2`, baseline OWASP) · `player-repo` (`createAccountWithAthlete` numa **transação all-or-nothing**; e-mail duplicado → erro **genérico** OP-11 via walk da cadeia de causas do pg).
- **Criação calibrada para a várzea:** pool fixo → **todo atleta nasce com overall = 34** (fundo da banda tier-4 `34..66` do engine), diferindo só no formato — **propriedade de justiça deliberada**. Cruzada com a constante real `WORLD.abilityByTier[3]` em teste.

**Verificação:** `typecheck` ✅ · `eslint` ✅ (OP-14/15/16 + guardrail auto-cobre `packages/player`) · `build` ✅ · prettier LF-clean ✅ · **`test` 143/143** (115 anteriores intactos + **22 puros** do player + **6 ao vivo** do player-store). Sem `DATABASE_URL`: os 6 do player-store pulam; os 22 puros rodam sempre. `world-engine`/`world-store` **intocados**; nenhum golden regenerado (`git diff` = 0).

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `packages/player/{package.json,tsconfig.json}` | Workspace da lib pura de domínio do jogador. |
| `packages/player/src/{types,constants}.ts` | Tipos (Focus/Position/Attributes/Appearance/AthleteDraft/Result) + tunáveis `PLAYER`. |
| `packages/player/src/name-filter.ts` + `data/name-blocklist.ts` | `validateName` + blocklist mínima (canônica). |
| `packages/player/src/{attributes,appearance,password-policy,create,index}.ts` | Primitiva de alocação + validações + composição + barrel. |
| `packages/player/src/{attributes,name-filter,create,validators}.test.ts` | 22 testes puros (inclui calibração várzea cruzada com o engine). |
| `services/player-store/{package.json,tsconfig.json,drizzle.config.ts}` | Serviço impuro isolado. |
| `services/player-store/src/schema/{account,athlete,index}.ts` | Schema `player` (conta + atleta) — CHECK 0..99 + índice único parcial. |
| `services/player-store/src/migrations/0000_init_player.sql` | Migration `0000` (OP-01) — cria o schema `player` + tabelas. |
| `services/player-store/src/{client,migrate,index}.ts` | Driver pooled + aplicador (migrationsSchema `drizzle_player`) + barrel. |
| `services/player-store/src/store/{auth,player-repo}.ts` | argon2id + criação atômica de conta+atleta. |
| `services/player-store/test/player-repo.test.ts` | 6 testes ao vivo (atômico, hash, 1-ativo, CHECK, reconciliação). |
| `docs/projeto/design-atributos-e-evolucao.md` | Design record do treino/evolução (seed do card 13). |
| `specs/SPEC-016-*.md`, `specs/DONE-016-*.md` | SPEC (aprovada no card) + este documento. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `tsconfig.json` | +reference `./packages/player` (entra no `tsc -b`). |
| `tsconfig.base.json` | +path `@camisa-9/player` → src (consumidores/testes). |
| `vitest.config.ts` | +alias `@camisa-9/player` → src. |
| `.github/workflows/ci.yml` | +passo de migrate do `player-store` (mesmo `postgres:16`). |
| `package-lock.json` | Novos workspaces + `@node-rs/argon2` (com binários de todas as plataformas, incl. `linux-x64-gnu` p/ o CI). |
| `CLAUDE.md`, `docs/projeto/roadmap.md` | "Estado atual" + Fase 1 iniciada. |

**Intocado:** `packages/world-engine`, `services/world-store`, todos os goldens, migrations `0000`-`0002` do world-store.

---

## Mudanças de schema aplicadas

Migration **`0000_init_player.sql`** (OP-01), gerada por `drizzle-kit` e revisada: `CREATE SCHEMA "player"`; `player.account` (uuid PK, `email` UNIQUE, `password_hash`, `created_at`); `player.athlete` (uuid PK, FK→account, nome, posição, `appearance` jsonb, 4 focos `int` com **CHECK 0..99**, `training_xp int default 0`, `active bool default true`, `created_at`) + **índice único parcial `WHERE active`**. Tracking em schema próprio **`drizzle_player`** (não colide com o `drizzle` default do world-store no mesmo DB). Aplica do zero num DB limpo, ao lado do world-store, sem colisão (provado local + a rodar no CI).

## Mudanças de API entregues

- **`@camisa-9/player`** (novo): `createAthlete`, `allocateAttributes`, `validateName`, `validateAppearance`, `validatePassword`, `PLAYER`/`FOCI`/`POSITIONS`/`CREATION_TOTAL`, tipos.
- **`@camisa-9/player-store`** (novo): `createAccountWithAthlete`, `readAccountByEmail`, `readActiveAthlete`, `hashPassword`/`verifyPassword`, `createDb`, schema.
- `world-engine`/`world-store` inalterados.

---

## Critérios de aceitação

| Critério (SPEC-016) | Status | Evidência |
|---|---|---|
| 1 — Filtro de nome (forma + blocklist, normalizado) | ✅ | `name-filter.test.ts`: aceita/normaliza, rejeita curto/longo/charset/blocklist (incl. `Adm1n` leet). |
| 2 — Primitiva de alocação (piso/pool/teto) | ✅ | `attributes.test.ts`: aceita espalhado+focado; rejeita soma≠136, >teto, <piso, não-inteiro. |
| 3 — Calibração várzea uniforme (overall 34) | ✅ | `attributes.test.ts`: overall SEMPRE 34, `=== WORLD.abilityByTier[3].min` (34..66). |
| 3b — Visual bounded + política de senha | ✅ | `validators.test.ts`: índice fora da faixa e senha <10 rejeitados. |
| 4 — Criação atômica (rollback em falha) | ✅ | `player-repo.test.ts`: e-mail duplicado → erro genérico, 1 conta / 1 atleta (2º não órfão). |
| 5 — Senha argon2id, nunca plaintext | ✅ | hash começa com `$argon2id$`, ≠ plaintext; `verifyPassword` round-trip true/false. |
| 6 — 1 atleta ativo por conta | ✅ | 2º atleta ativo direto → índice único parcial rejeita. |
| 7 — Identidade standalone (sem FK ao world) | ✅ | schema `player.athlete` só referencia `player.account`; zero FK cross-serviço. |
| 8 — OPs & gates | ✅ | `eslint` (guardrail auto-cobre `packages/player`); funções ≤50 (repo decomposto); OP-11 no erro de e-mail; migration `0000`; params server-only. |
| 8b — Migrations coexistem | ✅ | `player` (app) + `drizzle_player` (tracking) ao lado do `drizzle`/public do world-store; ambas no CI. |
| 9 — Testes de integração serial + FK-order | ✅ | `fileParallelism:false` (herdado); `beforeEach` apaga athlete→account. |

---

## Como testar manualmente

```
POSTGRES_PORT=5434 docker compose -f services/world-store/docker-compose.yml up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5434/camisa9_dev
npm run db:migrate -w services/world-store    # public + drizzle
npm run db:migrate -w services/player-store   # player + drizzle_player
npm run lint && npm run typecheck && npm test && npm run build   # 143/143
# Sem Docker: os 6 do player-store pulam; os 22 puros do player rodam sempre.
```

**Dados de teste necessários:** nenhum — `createAthlete` + seeds fixos são determinísticos.

---

## Testes automatizados

**28 testes novos**: 22 puros em `packages/player` (nome, alocação, calibração, visual, senha) + 6 ao vivo em `services/player-store` (criação atômica, hash argon2id, invariante 1-ativo, CHECK 0..99, reconciliação com a lib). Total do repo: **143** (115 preservados). CI roda os 6 ao vivo contra `postgres:16`.

**Comando:** `npm run lint && npm run typecheck && npm test && npm run build`

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `packages/player/src/**` (regra pura) | ~100% | Sim — validações/primitiva conferidas; guardrail de determinismo verde; standalone (sem dep de build no engine). |
| `services/player-store/src/**` (schema/store/auth) | ~100% | Sim — schema `player` isolado, CHECK/índice parcial conferidos na migration; argon2id + walk da cadeia de causas do pg (fix do erro de e-mail duplicado). |
| Migration `0000_init_player.sql` | ~100% (kit, revisado) | Sim — CREATE SCHEMA player + tabelas + índice parcial; tracking em `drizzle_player`. |
| Testes (`packages/player/**`, `services/player-store/test`) | ~100% | Sim — 28 cenários (143/143). |
| Wiring (tsconfig/vitest/CI) + `SPEC/DONE-016`, design record, `CLAUDE.md`, `roadmap.md` | ~100% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC original?**
- [x] Sim — **desvios de mecanismo** (não de comportamento), documentados abaixo.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **`packages/player` NÃO importa o world-engine em `src`** | A SPEC dizia "reusa `Position` do world-engine". Redeclarei `Position` (união de 4) localmente; a calibração cruza com o engine **só no teste** (via alias vitest). | Import de tipo cross-package num pacote COMPOSITE arrisca TS6059/conflito de `paths`→src. Standalone builda limpo; o drift de `Position`/banda é coberto por teste. DRY preservado no efeito (teste pega divergência). |
| **Schema Postgres dedicado `player` + tracking `drizzle_player`** | A SPEC pedia `migrationsSchema` próprio; usei DOIS schemas: `player` (tabelas) e `drizzle_player` (tracking). | O world-store já tem `public.athlete` → colisão de nome. Schema `player` isola as tabelas. E o migrator CRIA o `migrationsSchema` antes de rodar a migration — se fosse `player`, colidiria com o `CREATE SCHEMA player` da própria migration (bug pego ao aplicar). Tracking em `drizzle_player` resolve. |
| **`@node-rs/argon2`** (napi) em vez do `argon2` (node-gyp) | Escolhi o binding Rust com binários prebuilt. | Sem compilação node-gyp (frágil no Windows); binários de todas as plataformas no lock (incl. `linux-x64-gnu` p/ CI). Default = argon2id. |
| **Sem `docker-compose.yml` próprio no player-store** | Reusa o do world-store (mesmo DB). | Player-store compartilha o Postgres; um segundo compose seria redundante. Documentado no "Como testar". |

**Protocolo de conflito (parar+registrar):** não acionado — nada de escopo/comportamento nem violação de OP; os desvios acima são de mecanismo (build/infra), consequência direta de fatos do repo.

---

## Limitações conhecidas

- **Sem rota HTTP / login / sessão / verificação de e-mail / reset** — a criação é lib+store; a superfície HTTP e a escolha de framework são fatia/ADR futura. Steam auth idem.
- **O atleta NÃO entra no mundo** — identidade standalone; ocupar vaga/substituir NPC é o **card 21** (bloqueado pelo snapshot imutável — SPEC-015).
- **Enumeração de e-mail:** "e-mail já em uso" revela existência de conta (trade-off UX × privacidade — sinalizado na SPEC; a revisar com verificação de e-mail).
- **Treino/evolução** (encher a barra `training_xp` → +1 ponto; curva; DLC) é o **card 13** (design record pronto). Esta fatia só planta o campo + a primitiva.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| `player-store` typecheck-only (sem `dist`) | Baixo — roda via tsx/vitest. | Ao surgir consumidor runtime externo (rota HTTP): virar composite. |
| Blocklist mínima (reservados) | Baixo — barra o óbvio. | Curar lista PT/EN ampla quando houver moderação real. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (10/10)
- [x] Testes passando (143/143; 22 puros sempre, 6 ao vivo com DB)
- [x] Typecheck limpo
- [x] Lint limpo (`eslint` ✅; prettier LF-normalizado ✅ — CRLF local é gotcha)
- [x] Nenhum log de debug / `any` / segredo hardcoded (senha nunca logada; params server-only)
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` "Estado atual" atualizado (SPEC-016)
- [x] Este DONE está completo e commitado na branch *(commit no fluxo do PR)*

---

*DONE-016 — método H1VE. Primeira feature da Fase 1: a identidade humana. Conta por e-mail (argon2id) + atleta com atributos base nos 4 focos (point-buy calibrado para a várzea), em lib pura + serviço isolado. Não coloca no mundo (card 21) nem implementa treino (card 13) — planta a fundação que toda a Fase 1 consome.*
