# Runbook — Setup da Neon (prod + branch por ambiente)

> SPEC-035 / ADR-002. Como provisionar a Neon como banco de produção, ligar o **branch por
> ambiente** (prod / preview-por-PR / dev) e ativar o **CI Neon-branch-per-PR**. O código já é
> Neon-ready; isto é a **operação** (ação do founder). Nada aqui bloqueia o merge da SPEC-035
> (o CI cai no container `postgres:16` enquanto os secrets não existem).

## O modelo (o que estamos montando)

- **1 projeto Neon.** Dele saem todos os ambientes por **branch** (copy-on-write):
  - **`prod`** = o branch **default** (`main`/`production`) do projeto — o mundo real.
  - **`preview`** = um branch **efêmero por PR**, criado e destruído pelo **CI** (isolamento de dados real por PR).
  - **`dev`** = um branch pessoal opcional (seu ambiente local, sem sujar prod).
- **2 endpoints por branch:**
  - **pooled** (host com `-pooler`, PgBouncer transaction-mode) → **runtime/app** (`DATABASE_URL`).
  - **direct** (host sem `-pooler`) → **migrations** (`DATABASE_URL_UNPOOLED`).
- **Driver:** `pg` `Pool`/TCP (ADR-002) — **não** o driver HTTP. SSL é ligado automaticamente pelo
  `buildPoolConfig` quando a URL é Neon (`*.neon.tech`) ou tem `sslmode=require`.

## Por que pooled p/ runtime + direct p/ migrations

O endpoint **pooled** roda PgBouncer em transaction-mode: features de **sessão** quebram, mas
tudo do money path é **xact-scoped** (ver ADR-002 — provado por grep + a suíte contra a pooled).
As **migrations** (DDL + o migrator do drizzle) usam features que preferem uma sessão estável →
vão no **direct**. O `pickMigrationUrl` já resolve: `DATABASE_URL_UNPOOLED ?? DATABASE_URL`.

---

## Passo 1 — Criar o projeto (5 min)

1. [neon.tech](https://neon.tech) → **New Project** (free tier basta p/ começar). Escolha a região
   mais perto (ex.: `aws-us-east-2` ou `aws-sa-east-1` se disponível — menor latência ao Brasil).
2. Anote, do dashboard (**Connection Details**):
   - a connection string **Pooled** (o host contém `-pooler`),
   - a connection string **Direct** (o mesmo host **sem** `-pooler`),
   - o **Project ID** (Settings → General),
   - o **role**/usuário (default costuma ser `neondb_owner`) e o database (default `neondb`).
3. As strings da Neon vêm com `?sslmode=require`. **Troque para `?sslmode=verify-full`** — o `pg`
   deriva o SSL da própria URL, e `verify-full` garante a verificação do certificado à prova de
   futuro (o `require` é seguro hoje, mas um bump do `pg` p/ v9 o degradaria a no-verify — ver ADR-002).

## Passo 2 — Prova local do money path (a evidência dura — decisão 2 da SPEC)

Rode a suíte **uma vez** contra o endpoint **pooled** (prova que o PgBouncer transaction-mode não
quebra o money path). A URL **nunca** é commitada (só no seu shell):

```
! DATABASE_URL='postgres://…-pooler….neon.tech/neondb?sslmode=require' npm run db:migrate -w services/world-store
! DATABASE_URL='postgres://…-pooler….neon.tech/neondb?sslmode=require' npm run db:migrate -w services/player-store
! DATABASE_URL='postgres://…-pooler….neon.tech/neondb?sslmode=require' npm test
```

**437 verdes = money path OK na Neon pooled.** (No PowerShell: `$env:DATABASE_URL='…'; npm test`.)
Registre o resultado no `DONE-035` (critério de aceitação #7).

## Passo 3 — Ativar o CI Neon-branch-per-PR (os 2 secrets)

1. Crie uma **API key** na Neon: Account → **API Keys** → Create.
2. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `NEON_API_KEY` = a API key.
   - `NEON_PROJECT_ID` = o Project ID do passo 1.
3. Pronto: no próximo PR, o `ci.yml` cria um branch `ci/pr-<n>`, migra e testa contra ele, e o
   `neon-cleanup.yml` deleta o branch quando o PR fecha. Sem os secrets, o CI usa o container.

### ⚠️ Check da 1ª ativação (o CI Neon nunca rodou até você pôr os secrets)

Como esse caminho não roda sem os secrets, confira no 1º PR após ativá-los:

- A action `neondatabase/create-branch-action@v5` existe/está atual? (confira a **versão** e, se
  mudou, os nomes dos **outputs** — o `ci.yml` usa `db_url` [direct] e `db_url_with_pooler`
  [pooled]. Se os nomes divergirem, o resolver cai no container e você verá "→ container … (fallback)"
  no log em vez de "→ branch Neon efêmero".)
- O `username` no `ci.yml` (`neondb_owner`) bate com o role do seu projeto? Ajuste se diferente.
- O log do passo "Resolver DATABASE_URL" deve dizer **"→ branch Neon efêmero"**.
- Após fechar o PR, confira no dashboard da Neon que o branch `ci/pr-<n>` sumiu.

## Passo 4 — Produção (quando o deploy rodar)

Ver `docs/ops/scheduler-deploy-runbook.md` (SPEC-032). Na plataforma (Railway/Render), as env
server-only:

- `DATABASE_URL` = a string **pooled** do branch **prod**.
- `DATABASE_URL_UNPOOLED` = a string **direct** do branch **prod** (as migrations usam esta).
- `WORLD_SEED` = a seed do mundo.

Rode as migrations (`npm run db:migrate -w services/world-store` e `-w services/player-store`)
como job de release/pre-deploy **antes** do 1º tick, e semeie a âncora (`setSeasonAnchor`).

---

## Segurança (OP-02 / OP-12)

- **Nunca** commite uma connection string ou a API key. O `.gitignore` cobre `.env`/`.env.*` (só
  `.env.example` é versionado). Os segredos vivem nos **secrets do GitHub** (CI) e nas **env da
  plataforma** (prod) — server-only.
- Os secrets do CI **não** são expostos a PRs de fork (política do GitHub) → forks caem no fallback
  container. Aceitável (repo solo).

## Deferido (cards futuros)

- **Multi-seed** (vários mundos, um branch/seed?). **Data residency** BR (região). **Autoscaling**
  do compute Neon. **Alertas** de custo/uso. **PITR / backup** explícito (a Neon tem restore por
  branch nativo — documentar o RPO/RTO quando o mundo tiver dados reais).
