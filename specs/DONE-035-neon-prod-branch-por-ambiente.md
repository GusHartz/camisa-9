# DONE-035 — Camada de dados 0.2 · Fatia 4: Neon (prod + branch por ambiente)

> Registro de conclusão (par da `SPEC-035`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-035 (par da SPEC-035) |
| **Feature** | Camada de dados 0.2 · Fatia 4 — Neon (prod + branch por ambiente) — card do board |
| **Roadmap item** | Camada de dados 0.2 · Fatia 4 (Neon) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/camada-de-dados-0-2-fatia-4-neon-prod-branch-por-ambiente` |
| **Concluída em** | 2026-07-19 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## Resumo do que foi feito

A persistência ficou **pronta para produção na Neon** e o **branch por ambiente** foi operacionalizado — **sem tocar a lógica pura nem os goldens, e sem migration** (não há schema novo). A tese central: o money path **já é pooler-safe por construção** — grep em `services/**` confirma que **todos** os advisory locks são XACT-scoped (`round`/`turnover`/`occupation`/`waiting`/`decision`/`injury`), zero lock de sessão, zero `LISTEN/NOTIFY/SET SESSION` → sobrevive ao PgBouncer transaction-mode do endpoint pooled. Esta fatia **documenta** esse invariante (ADR-002), o deixa **provável** contra Neon real (o founder roda a suíte contra a URL pooled) e **endurece a borda**.

### A) Driver endurecido (`services/world-store` + `services/player-store`, `client.ts`)
- `buildPoolConfig(url)` **puro**: liga SSL quando o host é Neon (`*.neon.tech`) ou a URL pede (`sslmode=…`); desligado em local. Tuning de autosuspend (`connectionTimeoutMillis: 10s`, `keepAlive`, `max: 10`). `createDb(url)` **mantém a assinatura** → os 437 testes passam sem edição.
- `pickMigrationUrl(env)` **puro**: migrations no endpoint **direct** (`DATABASE_URL_UNPOOLED || DATABASE_URL`) — o migrator/DDL não depende do PgBouncer.

### B) CI Neon-branch-per-PR (híbrido, gated por secret) + cleanup
- `.github/workflows/ci.yml`: quando `NEON_API_KEY` existe **e** é um PR, cria um branch Neon efêmero (`neondatabase/create-branch-action`), resolve `DATABASE_URL` (pooled) + `DATABASE_URL_UNPOOLED` (direct) via `$GITHUB_ENV`; **sem o secret → container `postgres:16`** (fallback secret-free → o PR fica verde na transição). A `DATABASE_URL` saiu do env do job (evita o gotcha de precedência job-env × `$GITHUB_ENV`).
- `.github/workflows/neon-cleanup.yml` (novo): deleta o branch `ci/pr-<n>` no fechamento do PR (gated no mesmo secret).

### C) Config + docs
- `.env.example` (raiz + world-store): pooled + `DATABASE_URL_UNPOOLED`, com `sslmode=verify-full` (à prova de futuro).
- `docs/ops/neon-setup-runbook.md` (novo): provisionar prod + branch por ambiente + os 2 secrets do CI + a prova local + o check da 1ª ativação.
- `docs/adr/ADR-002-neon-persistencia-prod.md` (novo): ratifica Neon; o invariante xact-lock; `pg` Pool > driver serverless; split pooled/direct; SSL via `verify-full`; o CI não-mais-secret-free (trade-off aceito).

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

A dimensão **CI/CD voltou LIMPA** (`findings: []` — o ponto mais crítico, já que o caminho Neon do CI não roda sem os secrets). Os **6 achados confirmados** (todos MINOR/NIT, todos no driver/docs) foram corrigidos:

- **MINOR (SSL discarded):** o `pg` faz `Object.assign({}, config, parse(url))` → o `ssl` da connection string **vence** o objeto explícito para URLs com `sslmode`. Seguro HOJE (default do Node + pg-connection-string 2.14 trata `require`≈`verify-full`), mas um bump p/ `pg` v9 o degradaria a no-verify. **Fix:** URLs de exemplo/runbook agora usam **`sslmode=verify-full`** (à prova de futuro); comentário corrigido; ADR-002 registra a regra de revisão ("não degradar p/ `require`/no-verify").
- **MINOR (cobertura):** o ramo host-Neon-SEM-`sslmode` (o único onde o objeto explícito é honrado) não tinha teste. **Fix:** +fixture `NEON_HOST_ONLY`.
- **MINOR (`??` vs `||`):** `pickMigrationUrl` com `??` deixava um `DATABASE_URL_UNPOOLED=` **vazio** abortar o migrate (contradizendo o `.env.example`). **Fix:** `||` (o vazio cai na `DATABASE_URL`) + teste.
- **NIT (regex `\b`):** `sslmode=require-foo` casava por falso-positivo. **Fix:** regex `(require|verify-ca|verify-full)(&|$)/i` + teste.
- **NIT (keepAlive):** creditado como mitigação do autosuspend, mas TCP keepAlive não impede o autosuspend (query-driven). **Fix:** comentário/ADR corrigidos (keepAlive = socket-liveness; o cold-start é coberto pelo timeout folgado).
- **NIT/PARTIAL (pool `max: 10`):** ok no scheduler sequencial atual; nota forward-looking (manter single-flight por pool) — **aceito, sem mudança**.

**+ 1 flaky pré-existente corrigido (fora do escopo, surgido na suíte cheia):** `injury-repo.test.ts` deletava `athlete` sem limpar `purchase` (FK→athlete, SPEC-024) → FK violation quando `economy-repo` rodava antes (13 falhas intermitentes). **Fix:** `delete(schema.purchase)` antes de `athlete` (o padrão dos 3 arquivos-irmãos que já o faziam).

---

## Arquivos modificados

**Editados (código):** `services/world-store/src/client.ts` · `services/player-store/src/client.ts` (buildPoolConfig + pickMigrationUrl) · `services/world-store/src/migrate.ts` · `services/player-store/src/migrate.ts` (usam pickMigrationUrl) · `services/player-store/test/injury-repo.test.ts` (fix do flaky).

**Editados (CI + env + docs):** `.github/workflows/ci.yml` · `.env.example` · `services/world-store/.env.example` · `docs/ops/scheduler-deploy-runbook.md`.

**Criados:** `.github/workflows/neon-cleanup.yml` · `docs/ops/neon-setup-runbook.md` · `docs/adr/ADR-002-neon-persistencia-prod.md` · `services/world-store/test/pool-config.test.ts` · `specs/SPEC-035-*.md` · `specs/DONE-035-*.md`.

**Intocado (o critério DURO):** `packages/world-engine`, `packages/player` e os **4 goldens** (`git diff` = 0). **Nenhuma migration.**

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | `buildPoolConfig`: Neon/`sslmode` → ssl on; local → off; host-only Neon coberto; tuning presente | `pool-config.test.ts` (14 testes) |
| 2 | `pickMigrationUrl`: prefere UNPOOLED; vazio/ausente cai na DATABASE_URL | `pool-config.test.ts` |
| 3 | `createDb(url)` mantém a assinatura → 437 preservados sem edição | 451 testes (437 + 14 puros) |
| 4 | **CI verde neste PR SEM os secrets Neon** (fallback container) | run do CI do PR #TBD |
| 5 | CI c/ secret cria+migra+testa branch Neon + deleta no close | documentado + inspeção do YAML (não roda aqui); check da 1ª ativação no runbook |
| 6 | Invariante xact-lock documentado (money-path pooler-safe) | ADR-002 (grep + tabela) |
| 7 | **Prova local: 437+ verdes contra a URL pooled da Neon** | ⏳ **passo do founder** (runbook §2) — a registrar |
| 8 | OPs & goldens | sem `any`; ≤50/função; ≤300/arquivo; sem secret no repo (OP-12); erros genéricos; engine + 4 goldens intocados (`git diff` = 0); sem migration; lint/typecheck/build/test/prettier verdes |

**451 testes** (437 preservados + 14 puros de `pool-config`), typecheck/eslint/build/prettier verdes; **engine + 4 goldens byte-idênticos**; **sem migration**.

> **Nota (critério 7):** a prova dura contra Neon real é uma ação de ops do founder (criar o projeto + rodar a suíte contra a URL pooled — runbook §2). O código está pronto; a suíte de container já prova o padrão transacional idêntico em Postgres real.

---

## Escopo deferido (cards futuros)

- **Provisionar a Neon de prod + executar o deploy** (ops — Railway/Render, runbook SPEC-032).
- **Fatia 5 — Pirâmide Elástica**; multi-seed; a **rota HTTP/auth** (o consumidor de muitas conexões que justifica o pooler + o guard atômico do teto da SPEC-034).
- **Auditoria da viragem** (ler o `published_round`) — cura o trade-off mid-season da SPEC-034 + o débito de replay da SPEC-029.
- Retry/backoff p/ cold-start de autosuspend; imagem mínima do worker; alerta ativo em falha.

---

## AI Declaration

Preenchida no card via a tool `submit_ai_declaration` (arquivos gerados/revisados + out_of_scope). Autoria: código gerado pela IA (Claude) sob direção do founder; toda a lógica de borda + a revisão adversarial (workflow de 3 dimensões) + os 6 fixes revisados por humano.

---

*DONE-035 — método H1VE. A persistência ficou pronta pra Neon (SSL/autosuspend + split pooled/direct) e o branch por ambiente operacional (CI Neon-branch-per-PR + runbook + ADR-002). O money path já era pooler-safe por construção (todos os locks xact-scoped — provado por grep); esta fatia documentou, endureceu e deixou a prova a 1 comando do founder. Engine + 4 goldens byte-idênticos; sem migration; `pg` Pool mantido.*
