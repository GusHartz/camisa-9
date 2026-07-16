# SPEC-014 — Camada de dados 0.2 · Fatia 2: publicador de rodada transacional (Postgres)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-014 |
| **Feature** | Fase 0.2 — Camada de dados + seed do mundo (Fatia 2 de 5) |
| **Slug** | fase-0-2-fatia-2-publicador-de-rodada-transacional-postgres |
| **Card (board)** | `41a73b43-f92f-426c-958a-93cb3d7485ad` |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 0.2 — Camada de dados (Fatia 2: a joia do money path — publicação atômica durável). |
| **Appetite** | **2 a 3 dias** (primeira transação interativa real + lock de banco). |
| **Prioridade** | ALTA — coração do money path; precede as rodadas diárias (1.2). |
| **Criada em** | 2026-07-16 |
| **Status** | **Proposta — aguardando aprovação do founder no card** |

---

## Objetivo

Portar o **contrato de publicação de rodada** — hoje provado **só em memória** na SPEC-002 (`RoundStore` + `RoundPublisher`, em `packages/world-engine/src/orchestration`) — para **Postgres real** em `services/world-store`, provando a **atomicidade de BANCO** (all-or-nothing durável) que o shim in-memory deliberadamente **não** provava. A publicação de uma rodada passa a ser uma **transação interativa** (`BEGIN → stage → COMMIT`) sobre o `pg Pool` que a Fatia 1 já cravou, com:

- **idempotência durável** por `UNIQUE(league_id, season_id, round)` — re-publicar uma rodada já commitada é **no-op seguro a retry pós-crash**;
- **advisory lock do Postgres** no lugar do lock in-process (`Set`), preservando a semântica `locked` de chamadas sobrepostas;
- **preservação do seam `onBeforeCommit`** — uma falha **síncrona OU assíncrona** antes do commit **rola tudo de volta** (nada meio-publicado, no banco de verdade).

`packages/world-engine` permanece **100% intocado** (puro, OP-17). A lógica de orquestração transacional é da borda impura (`services/*`) — exatamente onde o SDD a coloca.

---

## Contexto e motivação

A memória durável do projeto registra o débito honesto: *"O spike (SPEC-002) prova o contrato do publicador (rollback total, nenhum leitor vê estado intermediário via begin/stage/commit/swap) mas **NÃO** prova atomicidade de banco. Concorrência real, durabilidade pós-crash e lock distribuído ficam **explicitamente em aberto até 0.2**."* Esta fatia **fecha esse débito**.

**O contrato in-memory a portar (verificado em `origin/main`):**

- **`RoundStore`** (`store.ts`): `begin`/`stage`/`commit`/`rollback` via staging + **swap atômico**; leitura (`has`/`get`/`size`) só enxerga o commitado. Chave = `leagueId:seasonId:round`.
- **`RoundPublisher.publish(input, onBeforeCommit?)`** (`publish.ts`) → `{ status: 'published' | 'idempotent' | 'locked', round }`:
  1. se a chave está **locked** → retorna `locked` (não bloqueia);
  2. adquire o lock → `await` (janela onde chamadas sobrepostas veem o lock);
  3. se `store.has(...)` → `idempotent` (no-op);
  4. `begin` → `stage(record)` → **`await onBeforeCommit?.()`** (ponto de injeção de falha; trabalho **assíncrono real** na 0.2) → `commit` → `published`;
  5. `catch` → `rollback` + rethrow; `finally` → libera o lock.
- **`PublishInput`** = `{ leagueId, seasonId, result: RoundResult }`; **`RoundResult`** = `{ round, matches: MatchResult[] }`; **`MatchResult`** = `{ round, homeId, awayId, homeGoals, awayGoals }` — tudo inteiro/string ⇒ round-trip `jsonb` byte-exato.

**Os 7 comportamentos que `publish.test.ts` assere in-memory** (a fatia reproduz **todos** contra Postgres real): (1) publica nova → `published` + visível; (2) idempotência sequencial → `idempotent`, tamanho 1; (3) sobrepostas na mesma chave → uma `published`, outra `locked`, 1 linha; (4) falha **síncrona** antes do commit → rollback total, nada observável; (5) falha **assíncrona** (rejeição no seam) → rollback total; (6) lock liberado após falha → retry publica; (7) rodadas distintas coexistem.

**Fatos de infra já cravados na Fatia 1 (SPEC-013):** `pg Pool` pooled/TCP (a memória crava: *"nunca HTTP one-shot — não suporta transação interativa multi-statement"*), Drizzle + migration versionada `0000`, `services/world-store` typecheck-only (`tsconfig.typecheck.json`), CI com service container `postgres:16` + passo de migrate, `docker-compose` local. **Nada de re-tooling** — a Fatia 2 só adiciona schema + lógica.

---

## Escopo — o que está DENTRO

- [ ] **Tabela `published_round`** (nova migration versionada `0001`, OP-01): `league_id text`, `season_id text`, `round integer`, `result jsonb` (o `RoundResult` inteiro), `published_at timestamptz NOT NULL DEFAULT now()` (metadado de auditoria — insumo da 0.3; **fora** da reconciliação). **PK composta `(league_id, season_id, round)`** = a chave `UNIQUE` de idempotência durável.
- [ ] **`publishRound(db, input, onBeforeCommit?)`** em `services/world-store`, porte fiel do `RoundPublisher`: **uma transação interativa** (`db.transaction`) que (a) tenta `pg_try_advisory_xact_lock(hash(chave))` → se falha, `locked`; (b) checa existência → se existe, `idempotent`; (c) `INSERT` da rodada; (d) **`await onBeforeCommit?.()`**; (e) commit → `published`. Erro (sync/async) no seam → **rollback total** da transação + rethrow. O advisory lock é **xact-scoped** (auto-liberado no commit/rollback — sem `finally` manual, sem leak).
- [ ] **Tipos da borda** (`PublishInput`/`PublishStatus`/`PublishOutcome`) declarados no `world-store` (reutilizando `RoundResult` **exportado** do engine); **não** modificar o engine para exportar os tipos internos do publicador.
- [ ] **Reader tipado** `readRound(db, leagueId, seasonId, round): Promise<RoundResult | null>` (reconstrói o `RoundResult` do `jsonb`).
- [ ] **Teste de contrato contra Postgres real** (gate de Data): os **7 comportamentos** acima + **(8) idempotência durável** (re-publicar rodada commitada por uma NOVA chamada = `idempotent`, 1 linha, `result` inalterado — o proxy de retry pós-crash) + **(9) reconciliação** (`RoundResult` determinístico do engine → `publishRound` → `readRound` **deep-equal**). O teste `locked` é **determinístico** (segura o advisory lock numa 2ª conexão e verifica que `publishRound` recua com `locked`, sem gravar).
- [ ] **Wiring**: registrar a nova tabela no schema do Drizzle (barrel `schema/index.ts` cobrindo `world` + `round`); `client.ts` e `drizzle.config.ts` passam a enxergar as duas; `index.ts` exporta `publishRound`/`readRound`/tipos/schema.
- [ ] **Segredos/erros**: `DATABASE_URL` server-only (herdado); erros de driver/conexão **não vazam** SQL/DSN/stack (OP-11).

## Escopo — o que está FORA

- **Decompor `RoundResult` em linhas de partida** (`match_result` consultável por atleta/clube) → fatia futura; aqui o `result` é `jsonb` (porte fiel do `PublishedRound.result`, foco na atomicidade).
- **Persistência das viragens** (`advanceWorld` → nova versão de snapshot; timeline; reconciliar com os 11 hashes de `world.golden`) → **Fatia 3**.
- **Neon branch-por-ambiente + prod-fidelity** → **Fatia 4**. **Pirâmide Elástica** → **Fatia 5**.
- **Job diário 15h / orquestração de rodada** (roadmap 1.2) — a Fatia 2 entrega o **publicador**; **quem chama** o publicador todo dia é a 1.2.
- **`world_seed` na chave da rodada** — a chave é `(league_id, season_id, round)` (fiel à SPEC-002 e ao escopo do card). Unicidade cross-mundo (quando múltiplos mundos coexistirem) é evolução futura da chave, **não** desta fatia.
- **Log de auditoria replayable de toda tick** (0.3) — o `published_at` é só o carimbo por rodada, não a trilha completa.
- `packages/world-engine` — **INTOCADO** (puro, OP-17); nenhum golden regenerado.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `services/world-store/src/schema/round.ts` | criar — tabela `published_round` (PK composta + `result` jsonb + `published_at`). |
| `services/world-store/src/schema/index.ts` | criar — barrel do schema (`world` + `round`) para o driver e o drizzle-kit. |
| `services/world-store/src/migrations/0001_publish_round.sql` | criar (via `drizzle-kit generate`, revisado à mão) — migration aditiva; **não** toca a `0000`. |
| `services/world-store/src/store/round-repo.ts` | criar — `publishRound` (1 tx, advisory lock, idempotência, seam) + `readRound` + helpers (OP-15/16). |
| `services/world-store/src/store/round-types.ts` | criar — `PublishInput`/`PublishStatus`/`PublishOutcome` (reusa `RoundResult` do engine). |
| `services/world-store/src/client.ts` | modificar — `import * as schema from './schema/index.js'` (passa a incluir `round`). |
| `services/world-store/src/index.ts` | modificar — exportar `publishRound`/`readRound`/tipos/schema de rodada. |
| `services/world-store/drizzle.config.ts` | modificar — `schema` cobre `world.ts` + `round.ts`. |
| `services/world-store/test/publish.test.ts` | criar — os 9 cenários contra Postgres real (gated por `DATABASE_URL`). |
| `specs/SPEC-014-*.md`, `specs/DONE-014-*.md` | criar. |

**Intocado:** `packages/world-engine/**` (puro, OP-17); a migration `0000` e os 4 goldens (`git diff` = 0). CI já tem `postgres:16` + migrate — **sem mudança** (o migrate aplica `0000`+`0001`).

---

## Critérios de aceitação

1. **Porte fiel do contrato (gate de Data, load-bearing):** os **7 comportamentos** do `publish.test.ts` in-memory passam **idênticos** contra Postgres real — `published`/`idempotent`/`locked`, rollback em falha **síncrona** e **assíncrona**, lock liberado após falha, rodadas distintas coexistem.
2. **Atomicidade de BANCO real:** em falha no seam (sync ou async), a transação faz **ROLLBACK** de verdade no Postgres — a linha **não** existe depois (`readRound === null`, `COUNT = 0`). Não é swap in-memory; é `ROLLBACK` observável.
3. **Idempotência durável / retry-safe:** publicar `(liga, season, round)` já commitado por uma **nova** chamada retorna `idempotent`, mantém **1 linha** e o `result` **inalterado** (proxy de retry pós-crash). Garantido pela PK/`UNIQUE(league_id, season_id, round)`.
4. **Lock por advisory lock, sem leak:** chamadas sobrepostas na mesma chave → uma `published`, a outra `locked`; o lock é **xact-scoped** (auto-liberado no commit/rollback). Teste `locked` **determinístico** (segurar o lock numa 2ª conexão).
5. **Reconciliação:** `RoundResult` determinístico do engine → `publishRound` → `readRound` é **deep-equal** (jsonb round-trip byte-exato de `RoundResult`/`MatchResult`).
6. **Migration versionada (OP-01):** `published_round` criada **só** via `0001` commitada; aplicar do zero (`0000`+`0001`) num DB limpo reproduz o schema; SQL revisado à mão; a `0000` **não** é tocada.
7. **`world-engine` puro:** nenhuma dependência de driver entra em `packages/world-engine`; guardrail de determinismo verde; dependência só `store → engine`; nenhum golden regenerado.
8. **CI verde sem infra manual:** os 4 gates + o teste do `world-store` passam no Actions contra `postgres:16`; sem secret/rede externa; arquivos novos em **LF**.
9. **OPs:** nenhuma função > 50 linhas (OP-15), nenhum arquivo > 300 (OP-16), zero `any` (OP-14); erros de driver genéricos, sem vazar SQL/DSN/stack (OP-11); `DATABASE_URL` server-only (OP-02/OP-12).

---

## Segurança (se aplicável)

- **OP-11:** erros de conexão/driver retornam mensagem genérica; nunca expõem SQL, DSN ou stack. O erro do seam `onBeforeCommit` é **propagado ao chamador** (é a falha de negócio dele, não um vazamento de infra) — mas o rollback acontece antes.
- **OP-02/OP-12:** `DATABASE_URL` server-only (herdado da Fatia 1). Nada hardcoded, nada no cliente.
- **Superfície:** `world-store` é biblioteca de servidor (sem rota HTTP nesta fatia). A escrita da rodada é da store, não do cliente — anti-fraude 100% server-side é servido por esta camada ser autoridade da linha do tempo.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| Teste de concorrência **`locked`** vira flaky (corrida de timing) | Tornar **determinístico**: segurar o `pg_advisory_xact_lock` numa 2ª conexão e verificar que `publishRound` recua com `locked` sem gravar — sem corrida. O teste de "2 sobrepostas → 1 linha" assere a **invariante** (nunca dupla-publicação), não o status do perdedor. |
| Advisory lock **vaza** (fica preso) | Usar a variante **xact-scoped** (`pg_try_advisory_xact_lock`) — auto-liberada no commit/rollback pelo próprio Postgres; sem unlock manual. |
| Seam assíncrono não rola de volta (regressão do bug da SPEC-002) | `await onBeforeCommit?.()` **dentro** do `db.transaction`; rejeição → a transação do Drizzle faz ROLLBACK e o erro re-propaga (critério 1+2, testes sync **e** async). |
| `drizzle-kit generate` emite SQL errado / mexe na `0000` | Migration **aditiva** revisada à mão; `git diff` da `0000`/meta = 0; aplicar do zero num DB limpo é critério (6). |
| Driver HTTP one-shot travaria a tx interativa | Já mitigado na Fatia 1 (`pg Pool`); a Fatia 2 é o primeiro **uso** real da tx interativa que a escolha destravou. |
| Lint local falha por **CRLF** no Windows | Não é regressão; CI (LF) é a fonte da verdade; validar arquivos novos LF-normalizados antes do push. |

**Dependências:** **SPEC-013** (Fatia 1 — `pg Pool`, Drizzle, migration, CI Postgres) é a base direta. **SPEC-002** (contrato in-memory) é o que se porta. **Precede** a 1.2 (rodadas diárias — quem chama o publicador) e a Fatia 3 (viragens).

---

## Notas de implementação

- **Fluxo do `publishRound` (Drizzle):**
  ```
  return db.transaction(async (tx) => {
    if (!(await tryAdvisoryXactLock(tx, key))) return { status: 'locked', round };
    if (await roundExists(tx, leagueId, seasonId, round)) return { status: 'idempotent', round };
    await tx.insert(publishedRound).values(record);
    await onBeforeCommit?.();            // throw/reject → Drizzle faz ROLLBACK e re-propaga
    return { status: 'published', round };
  });
  ```
  Retorno normal ⇒ COMMIT (para `locked`/`idempotent` a tx é vazia — commit inócuo, lock liberado). Exceção ⇒ ROLLBACK + rethrow.
- **Advisory lock:** `pg_try_advisory_xact_lock(hashtextextended($key, 0))` com `$key = leagueId:seasonId:round` (bigint estável, PG 11+). Não-bloqueante → mapeia o `locked` do `Set` in-process; xact-scoped → mapeia o `finally { locks.delete }`.
- **Idempotência:** PK composta `(league_id, season_id, round)`. A checagem de existência (SELECT) dentro da tx, sob o lock, evita corrida check→insert; a PK é a rede de segurança durável (violação = já publicado).
- **`onBeforeCommit`:** mantém a assinatura `() => void | Promise<void>` e o `await` obrigatório (a regressão da SPEC-002: sem `await`, rejeição async vazaria como `unhandledRejection` e commitaria errado).
- **Reconciliação:** gerar um `RoundResult` determinístico via o engine (`simulateSeason(...).rounds[k]` ou `resolveMatch`), publicar, ler de volta, `toEqual`. Prova que o `jsonb` preserva `RoundResult`/`MatchResult` byte-a-byte.
- **`published_at`:** `DEFAULT now()` no banco (impuro, permitido em `services/*`); a reconciliação compara **só** `result`, nunca o carimbo.
- **Fecho do DONE:** atualizar "Estado atual" do CLAUDE.md (SPEC-014 / Fatia 2 concluída) e o `docs/projeto/roadmap.md` (0.2 Fatia 2 ✅).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (Fatia 2 autocontida; decomposição de partidas/viragens/Neon/Pirâmide/job fora — em fatias nomeadas)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudanças de schema documentadas (migration `0001` aditiva versionada — OP-01)
- [x] Critérios de aceitação testáveis (7 comportamentos portados + atomicidade real + idempotência durável + reconciliação)
- [x] Riscos avaliados (flaky de concorrência e leak de lock são os centrais — mitigados)
- [x] Appetite razoável (2 a 3 dias — 1ª tx interativa + lock de banco)
- [ ] **Aprovada** — *aguardando o founder/architect no card `41a73b43`*

---

*SPEC-014 — método H1VE. Fatia 2 de 5 da Fase 0.2: a joia do money path. Porta o contrato de publicação da SPEC-002 (provado in-memory) para Postgres real, fechando o débito honesto de atomicidade de banco/durabilidade/lock deixado em aberto até a 0.2. `world-engine` intocado (OP-17); precede as rodadas diárias (1.2).*
