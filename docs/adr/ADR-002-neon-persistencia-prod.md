# ADR-002 — Persistência de produção: Neon (branch por ambiente)

| Campo | Valor |
|---|---|
| **Status** | ✅ **Aceito / Ratificado** |
| **Data** | 2026-07-19 |
| **Decisor** | Gustavo Hartz (founder / architect) |
| **SPEC** | SPEC-035 — Camada de dados 0.2 · Fatia 4 (Neon) |
| **Evidência** | Grep de `services/**` (invariante xact-lock) + prova local dos 437 testes contra a URL pooled da Neon (DONE-035) |
| **Escopo** | A camada de dados (servidor). Não toca a lógica pura (`packages/*`, OP-17) nem os 4 goldens. |
| **Relaciona** | SPEC-013/014/015 (a camada de dados); o runbook de deploy da SPEC-032 (`docs/ops/scheduler-deploy-runbook.md`) |

---

## Decisão

**Ratificamos a Neon (Postgres serverless) como o banco de produção**, com **branch por ambiente** (prod / preview-por-PR / dev), acessada pelo driver **`pg` `Pool`/TCP** (não o driver HTTP serverless), com o endpoint **pooled** para o runtime e o endpoint **direct/unpooled** para as migrations.

Ratificamos junto:

- **Driver = `pg` `Pool`/TCP** (reafirma a SPEC-013). O driver HTTP one-shot da Neon (`neon()`) **não serve** — não segura transação interativa multi-statement, e o money path (publicação atômica, gênese, viragem) **exige** transação interativa + advisory lock. O `@neondatabase/serverless` (WebSocket) **não é adotado**: o scheduler é um batch em container (não edge), e ele adicionaria dependência sem ganho.
- **Split pooled / direct.** O **runtime** usa o endpoint **pooled** (`-pooler`, PgBouncer transaction-mode) — forward-compatible com a futura API/auth de muitas conexões. As **migrations** usam o endpoint **direct** (`DATABASE_URL_UNPOOLED`) — o migrator do drizzle e o DDL não devem depender do PgBouncer.
- **SSL via `sslmode=verify-full` na URL.** O `pg` DERIVA o SSL da connection string (`Object.assign({}, config, parse(url))` → o parse vence o objeto `ssl` explícito). Por isso a URL Neon usa **`verify-full`** (verifica o certificado à prova de futuro; `require` é seguro hoje mas um bump p/ `pg` v9 o degradaria a no-verify). O objeto `ssl: {rejectUnauthorized:true}` do `buildPoolConfig` cobre só o caso host-Neon-SEM-`sslmode`. **Regra de revisão:** não degradar a URL p/ `require`/no-verify.
- **Branch por ambiente.** Um projeto Neon; `prod` = o branch default; `preview` = um branch efêmero por PR (criado/destruído pelo CI); `dev` = um branch pessoal opcional. É o "branch por ambiente" do charter.
- **O CI deixa de ser secret-free** (evolui o princípio da SPEC-013): o CI cria um branch Neon efêmero por PR (exige `NEON_API_KEY` + `NEON_PROJECT_ID`). **Fallback:** sem o secret, o CI usa o container `postgres:16` (verde na transição e em PRs de fork).

Decisão **reversível** de camada de borda: nada toca a lógica pura; reverter = `createDb` cru + CI container.

---

## Contexto

O charter sempre nomeou "Postgres (Neon), serverless, branch por ambiente". A camada de dados (SPEC-013+) foi construída **deliberadamente Neon-compatível**: `pg` `Pool`/TCP desde o início, com um comentário explícito rejeitando o driver HTTP. Faltava: **provar** que a Neon não quebra o money path, **operacionalizar** o branch por ambiente, e **endurecer** a borda (SSL, autosuspend).

O risco central: o endpoint **pooled** da Neon roda **PgBouncer em transaction-pooling mode**. Nesse modo, features de **sessão** quebram (session advisory locks, `LISTEN/NOTIFY`, `SET SESSION`, prepared statements nomeados persistentes); features **transaction-scoped** funcionam (o backend fica preso à conexão pela duração da transação).

---

## Evidência — por que o money path é pooler-safe (por construção)

**Grep de `services/**` (SPEC-035): 100% dos advisory locks são XACT-scoped.**

| Repo | Lock | Escopo |
|---|---|---|
| `round-repo` (publish da rodada) | `pg_try_advisory_xact_lock` | xact ✓ |
| `turnover-repo` (viragem) | `pg_try_advisory_xact_lock` | xact ✓ |
| `occupation-repo` (gênese) | `pg_advisory_xact_lock_shared` | xact ✓ |
| `waiting-repo` (enfileirar) | `pg_advisory_xact_lock` | xact ✓ |
| `decision-repo` (geração) | `pg_advisory_xact_lock` | xact ✓ |
| `injury-repo` (ocorrência) | `pg_advisory_xact_lock` | xact ✓ |

- **ZERO** `pg_advisory_lock` de sessão. **ZERO** `LISTEN/NOTIFY` / `SET SESSION`. `node-postgres` não usa prepared statements nomeados por padrão.
- A transação interativa (`db.transaction(async tx => …)` + o seam `onBeforeCommit`) segura **uma** conexão do início ao commit → compatível com transaction pooling.

**Prova dura (DONE-035):** a suíte inteira (437 testes — que exercitam publish atômico, gênese, viragem, idempotência, concorrência) roda **verde** contra a `DATABASE_URL` **pooled** da Neon. O padrão transacional sobrevive ao PgBouncer.

**Invariante que fica:** *todo lock no money path é `_xact_` (liberado no commit).* Um `pg_advisory_lock` de sessão introduzido no futuro **quebraria** silenciosamente sob o pooler → é uma regra de revisão.

---

## Candidatos avaliados (driver)

| Driver | Transação interativa | Advisory lock | Veredito |
|---|---|---|---|
| **`pg` `Pool`/TCP** | ✅ sim (multi-statement) | ✅ xact-scoped ok no pooler | **ESCOLHIDO** — já é o driver; money path preservado |
| **`@neondatabase/serverless` (WebSocket `Pool`)** | ✅ sim | ✅ | Rejeitado — sem ganho p/ um batch em container; +dependência |
| **`@neondatabase/serverless` (HTTP `neon()`)** | ❌ **não** (one-shot) | ❌ | Rejeitado — **quebraria** o money path |

---

## Consequências

**Positivas**
- Persistência pronta p/ prod na Neon (SSL + tuning de autosuspend + split pooled/direct) sem tocar a lógica pura.
- Branch por ambiente operacional: um branch Neon efêmero por PR dá isolamento real de dados no CI (o "branch por ambiente" ponta-a-ponta).
- Forward-compatible: o endpoint pooled já é o do runtime → a futura API/auth de muitas conexões herda a config.

**Negativas / custos aceitos**
- **O CI deixa de ser secret-free** (exige `NEON_API_KEY` + `NEON_PROJECT_ID`). Mitigado pelo fallback container (verde sem o secret; PRs de fork caem nele).
- **Autosuspend cold-start:** a 1ª conexão acorda o compute (segundos) → mitigado por `connectionTimeoutMillis` folgado (`keepAlive` protege o socket em uso contra NAT/middlebox, mas **não** impede o autosuspend, que é por ausência de query); retry profundo é hardening futuro.
- **Débito de replay (herdado da SPEC-029):** uma rodada humana publicada não é recomputável só dos inputs (forma/moral mutam in-place) — ortogonal a este ADR; o card de auditoria da viragem endereça.

**Requisitos que esta decisão cria**
- **Provisionamento (ops):** um projeto Neon + os 2 secrets do CI + a semente da âncora — ver `docs/ops/neon-setup-runbook.md`.
- **Regra de revisão:** nenhum `pg_advisory_lock` de sessão no money path (só `_xact_`).

---

## Reversibilidade & gatilhos de revisão

**Reversível** — camada de borda (OP-17). Reverter = `createDb` cru + CI container.

**O que reverteria/revisaria:**
- A prova local (437 contra a pooled) **falhar** num comportamento transacional → investigar o modo do pooler ou mover o runtime p/ o endpoint direct.
- A futura API/auth precisar de features de **sessão** (LISTEN/NOTIFY p/ realtime) → rever pooled × direct por consumidor.
- A Neon deixar de servir escala/custo → o `pg` `Pool`/TCP torna a migração p/ outro Postgres gerenciado barata (só a connection string).

---

## Referências

- **SPEC-035 / DONE-035** — esta fatia (`specs/SPEC-035-neon-prod-branch-por-ambiente.md`).
- **`docs/ops/neon-setup-runbook.md`** — provisionamento + branch por ambiente + os secrets do CI + a prova local.
- **`docs/ops/scheduler-deploy-runbook.md`** — o deploy do worker (SPEC-032) que consome esta persistência.
- **CLAUDE.md** — "Persistência: Postgres (Neon), serverless, branch por ambiente" + OP-17.

---

*ADR-002 — método H1VE. Registro de decisão durável; ver `docs/adr/README.md` para o fluxo de ADRs.*
