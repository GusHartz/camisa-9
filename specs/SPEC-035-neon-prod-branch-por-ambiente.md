# SPEC-035 — Camada de dados 0.2 · Fatia 4: Neon (prod + branch por ambiente)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-035 |
| **Feature** | Camada de dados 0.2 · Fatia 4 — Neon (prod + branch por ambiente) — card do board |
| **Slug** | neon-prod-branch-por-ambiente |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Camada de dados 0.2 · Fatia 4 (Neon) — continuação das SPEC-013/014/015/021 |
| **Appetite** | **2 a 3 dias** (o endurecimento do driver + o split pooled/direct + o CI Neon-branch-per-PR + o runbook/ADR). |
| **Prioridade** | ALTA — é o degrau que tira o mundo do "provado só em CI" e o deixa PRONTO pra rodar em produção (destrava o deploy da SPEC-032). |
| **Criada em** | 2026-07-19 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

> **Numeração:** peguei o **035** para esta fatia (é o card em construção agora). O rótulo informal "entrada de time = SPEC-035" do DONE-034 fica **superado** — a entrada de time toma o próximo número livre quando o card for criado (mesma lógica do 028→029, quando o GTM tomou o 028).

---

## Decisões travadas com o founder (2026-07-19)

1. **CI com Neon-branch-per-PR** — o CI passa a criar um **branch Neon efêmero por PR** (create → migrate → test → delete), o "branch por ambiente" ponta-a-ponta. Exige os secrets `NEON_API_KEY` e `NEON_PROJECT_ID` no repo. **Trade-off aceito:** o CI deixa de ser secret-free (o princípio da SPEC-013 evolui — registrado no ADR-002).
2. **Prova do money path contra Neon real** — o founder provisiona um projeto Neon (free tier) e roda a suíte existente (437 testes) **uma vez** contra a `DATABASE_URL` **pooled** da Neon (`! DATABASE_URL=…-pooler… npm test`). A URL nunca é commitada. **Vira a evidência dura** do critério de aceitação (prova o `pg_advisory_xact_lock` + transação interativa sob o PgBouncer transaction-mode).
3. **Driver mantido `pg` Pool/TCP** (reafirma a SPEC-013) — o driver HTTP one-shot da Neom (`neon()`) NÃO serve (não segura transação interativa multi-statement → quebraria o money path). O `@neondatabase/serverless` (WebSocket) não é adotado (o scheduler é batch em container, não edge; adicionaria dependência sem ganho).

---

## A tese é SEGURA (verificada no repo) — por que Neon não quebra o money path

O endpoint **pooled** da Neon roda **PgBouncer em transaction-pooling mode**. Nesse modo, features de **sessão** (session advisory locks, `LISTEN/NOTIFY`, `SET SESSION`, prepared statements nomeados persistentes) **quebram**; features **transaction-scoped** funcionam (o backend fica preso à conexão pela duração da transação).

**O money path é 100% transaction-scoped — verificado por grep em `services/**`:**
- **Todos** os advisory locks são `pg_advisory_xact_lock` / `pg_try_advisory_xact_lock` / `pg_advisory_xact_lock_shared` (xact-scoped, liberados no commit): `round-repo` (publish), `turnover-repo` (rollover), `occupation-repo` (gênese, shared), `waiting-repo` (enqueue), `decision-repo` (geração), `injury-repo` (ocorrência).
- **ZERO** `pg_advisory_lock` de sessão. **ZERO** `LISTEN/NOTIFY`/`SET SESSION`. node-postgres não usa prepared statements nomeados por padrão.
- A transação interativa (`db.transaction(async tx => …)` + `onBeforeCommit`) segura UMA conexão do início ao commit → compatível com transaction pooling.

**Conclusão:** o padrão transacional já é pooler-safe **por construção**. Esta fatia **documenta esse invariante** (ADR-002), **prova-o contra Neon real** (decisão 2) e **endurece a borda** (SSL, autosuspend, split pooled/direct).

---

## Objetivo

Deixar a persistência **pronta para produção na Neon** e operacionalizar **branch por ambiente**, sem tocar a lógica pura nem os goldens. Concretamente: **(a)** endurecer o driver (`createDb`) para a Neon (SSL, tuning de pool para autosuspend); **(b)** separar o endpoint **pooled** (runtime) do **direct/unpooled** (migrations) — o migrator do drizzle e o DDL rodam melhor fora do PgBouncer; **(c)** mover o CI para **Neon-branch-per-PR** (com fallback ao container enquanto os secrets não existem, mantendo o CI verde na transição); **(d)** entregar o **runbook** de provisionamento + branches e o **ADR-002** que ratifica a decisão e o invariante xact-lock.

---

## Contexto e motivação (fatos verificados no repo)

- **`createDb(url)` (`world-store/src/client.ts`, `player-store/src/client.ts`):** hoje `new Pool({ connectionString: url })` cru. Sem SSL, sem tuning. O comentário já diz "Neon em produção — pooled/TCP" (SPEC-013). Precisa endurecer p/ Neon sem mudar a assinatura (todos os callers/testes passam `url`).
- **`migrate.ts` (ambos):** lê `DATABASE_URL` e roda o migrator. Sob Neon, migrations devem ir ao endpoint **direct** (o migrator/DDL não deve depender do PgBouncer).
- **CI (`.github/workflows/ci.yml`):** hoje um service container `postgres:16` efêmero, secret-free (SPEC-013), com `DATABASE_URL` apontando p/ ele; migra world-store + player-store; roda lint/typecheck/test/build.
- **`.env.example` (raiz + world-store):** já mencionam "Neon (pooled/TCP)"; faltam o exemplo Neon-shaped e o `DATABASE_URL_UNPOOLED`.
- **Runbook de deploy (SPEC-032, `docs/ops/scheduler-deploy-runbook.md`):** já cita "Neon, pooled/TCP" e reserva "ADR-002" para a **plataforma** — vou realocar: **ADR-002 = persistência Neon**; a plataforma vira ADR futuro (edito a linha).
- **Sem mudança de schema** → **sem migration** (OP-01 não se aplica; nenhuma tabela nova).
- **`.gitignore`** cobre `.env`/`.env.*` (só `.env.example` versionado) — OP-12 ok.

---

## Escopo — o que está DENTRO

1. **Endurecimento do driver** (`world-store` + `player-store`, `client.ts`): um helper **puro** `buildPoolConfig(url)` → `{ connectionString, ssl?, max, idleTimeoutMillis, connectionTimeoutMillis, keepAlive }`. SSL ligado quando a URL pede (`sslmode=require`) ou o host é Neon (`.neon.tech`); **desligado** em local (plaintext). Tuning p/ autosuspend (timeout de conexão folgado, keepAlive). `createDb(url)` **mantém a assinatura**.
2. **Split pooled/direct** (`migrate.ts` ambos): um helper **puro** `pickMigrationUrl(env)` → `DATABASE_URL_UNPOOLED ?? DATABASE_URL`. Migrations no endpoint **direct**; runtime segue no **pooled** (`DATABASE_URL`).
3. **CI Neon-branch-per-PR (híbrido, gated por secret):** o container `postgres:16` fica como **fallback**; quando `NEON_API_KEY` existe (`env: HAS_NEON`), um passo cria um **branch Neon efêmero** (`neondatabase/create-branch-action`), escreve `DATABASE_URL` (pooled) + `DATABASE_URL_UNPOOLED` (direct) no `$GITHUB_ENV`, e o migrate/test rodam contra ele; sem o secret → container (CI **verde nesta transição, sem os secrets**). + workflow `neon-cleanup.yml` (`pull_request: closed`, gated) que deleta o branch.
4. **`.env.example`** (raiz + world-store): `DATABASE_URL` (pooled, Neon-shaped) + `DATABASE_URL_UNPOOLED` (direct, p/ migrations) com comentários.
5. **Docs:** `docs/ops/neon-setup-runbook.md` (provisionar o projeto prod + branch por ambiente [prod=main branch · preview=por-PR · dev=pessoal] + pooled vs direct + o fluxo de migration + os secrets do CI + o passo de validação local) **e** `docs/adr/ADR-002-neon-persistencia-prod.md` (ratifica: Neon como DB de prod; branch por ambiente; split pooled/direct; o invariante xact-lock com a evidência; `pg` Pool > driver serverless; o CI não-mais-secret-free como trade-off aceito). Cross-link no runbook de deploy.
6. **Testes puros** (sempre rodam, sem DB): `buildPoolConfig` (Neon URL → ssl on; localhost → ssl off; tuning presente) + `pickMigrationUrl` (prefere UNPOOLED; cai em DATABASE_URL).

---

## Escopo — o que está FORA

- **Provisionar o projeto Neon / o DB de prod de verdade** — ação de **ops (founder)**; a validação local (decisão 2) é o passo do founder. O card entrega código+CI+runbook.
- **Executar o deploy** (Railway/Render — ops da SPEC-032).
- **Adotar `@neondatabase/serverless`** (decidido: mantém `pg` Pool).
- **Fatia 5 — Pirâmide Elástica** (card à parte).
- **Multi-seed**; a **rota HTTP/auth** (o consumidor de muitas conexões que justifica o pooler); retry/backoff sofisticado p/ cold-start de autosuspend (além do timeout folgado) — hardening futuro se necessário.
- **Qualquer mudança de schema / migration** (nenhuma tabela nova).
- **Tocar `packages/*`** (engine/lib puros) e os **4 goldens** — zero.

---

## Arquivos que serão tocados

**Editados (código, `services/*` — fora do guardrail):**
- `services/world-store/src/client.ts` — extrai/usa `buildPoolConfig`; exporta o helper puro.
- `services/player-store/src/client.ts` — idem (helper duplicado; serviços independentes, sem import cruzado).
- `services/world-store/src/migrate.ts` + `services/player-store/src/migrate.ts` — usam `pickMigrationUrl(process.env)`.
- (barrels `index.ts` se preciso p/ exportar o helper aos testes.)

**Editados (CI + env + docs):**
- `.github/workflows/ci.yml` — o híbrido Neon-branch/container.
- `.env.example` (raiz) + `services/world-store/.env.example` — pooled + unpooled.
- `docs/ops/scheduler-deploy-runbook.md` — realoca a ref "ADR-002" + cross-link.

**Criados:**
- `.github/workflows/neon-cleanup.yml` — deleta o branch no fechamento do PR.
- `docs/ops/neon-setup-runbook.md` · `docs/adr/ADR-002-neon-persistencia-prod.md`.
- `services/world-store/test/pool-config.test.ts` (testa `buildPoolConfig` + `pickMigrationUrl`).
- `specs/SPEC-035-*.md`, `specs/DONE-035-*.md`.

**Intocado (o critério DURO):** `packages/world-engine`, `packages/player` e os **4 goldens** (`git diff` = 0). Nenhuma migration.

---

## Critérios de aceitação

| # | Critério | Evidência |
|---|---|---|
| 1 | `buildPoolConfig`: Neon/`sslmode=require` → `ssl` ligado; `localhost` → sem ssl; tuning presente | teste puro `pool-config.test.ts` |
| 2 | `pickMigrationUrl`: prefere `DATABASE_URL_UNPOOLED`, cai em `DATABASE_URL` | teste puro |
| 3 | `createDb(url)` mantém a assinatura → todos os callers/testes compilam e passam **sem edição** | 437 preservados |
| 4 | **CI verde neste PR SEM os secrets Neon** (caminho de fallback = container) | run do CI do PR |
| 5 | CI, **com** o secret, cria+migra+testa um branch Neon e o deleta no close | documentado + inspeção do YAML (não roda aqui — sem secrets); 1ª ativação = check manual do founder |
| 6 | O invariante xact-lock (money-path pooler-safe) documentado no ADR-002 com a evidência | ADR-002 |
| 7 | **A prova local contra Neon real: 437 verdes contra a URL pooled** (decisão 2) | passo do founder, registrado no DONE-035 |
| 8 | OPs & goldens | sem `any`; ≤50/função; ≤300/arquivo; **sem secrets no repo** (OP-12); erros genéricos; **engine + 4 goldens intocados** (`git diff` = 0); **sem migration**; lint/typecheck/build/test/prettier verdes |

---

## Riscos e dependências

- **O caminho Neon do CI não roda aqui (sem secrets)** → mitigado pelo **fallback container** (verde agora) + o founder adiciona os secrets p/ ativar. RISCO: um bug no YAML Neon só aparece quando os secrets chegarem → mitigação: passos mínimos com as actions oficiais `neondatabase/*` + um check manual documentado na 1ª ativação.
- **Neon pooled (PgBouncer transaction-mode) × money path** → o de-risk central; mitigado pelo invariante all-xact-lock (verificado) + a prova local do founder (437 contra a URL pooled).
- **Migrator do drizzle no PgBouncer** → mitigado rodando migrations no endpoint **direct** (`DATABASE_URL_UNPOOLED`).
- **Autosuspend cold-start** (1ª conexão lenta) → mitigado por `connectionTimeoutMillis` folgado + `keepAlive`; retry profundo deferido.
- **Secrets indisponíveis a PRs de fork** (política do GitHub) → notado; repo solo, aceitável (fork → cai no fallback container).
- **Dependência de ops:** a ativação (projeto Neon + secrets + a prova local) é passo do **founder**; o card entrega o código+CI+runbook prontos.

---

## Notas de implementação

- **`buildPoolConfig` (heurística):** `ssl: { rejectUnauthorized: true }` se a URL contém `sslmode=require` OU o host termina em `.neon.tech`; senão `ssl` ausente (local plaintext — Neon usa CA real, `rejectUnauthorized:true` é seguro). Pool: `max: 10`, `idleTimeoutMillis: 30_000`, `connectionTimeoutMillis: 10_000`, `keepAlive: true`. Helper **puro**, testável sem DB.
- **`pickMigrationUrl(env)`** puro: `env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL` (ou `undefined` → a CLI de migrate mantém o erro genérico atual).
- **Helper duplicado** nos dois `client.ts` (serviços independentes; um import cruzado world↔player criaria acoplamento indevido — é glue de config, ~12 linhas, não regra de domínio).
- **CI híbrido:** `env: HAS_NEON: ${{ secrets.NEON_API_KEY != '' }}` a nível de job; o service container fica (fallback); "Setup Neon branch" `if: env.HAS_NEON == 'true'` escreve as URLs no `$GITHUB_ENV` (têm precedência); migrate usa `DATABASE_URL_UNPOOLED` (direct), test usa `DATABASE_URL` (pooled → prova o pooler no CI também). Cleanup em workflow separado gated no mesmo `HAS_NEON`.
- **ADR-002 = persistência Neon**; a ratificação da **plataforma** de deploy vira ADR futuro (edito a linha do runbook de deploy que reservava "ADR-002").
- **Reversível:** tudo é borda/config; nada toca a lógica pura. Reverter = voltar o `createDb` cru + o CI container.

---

*SPEC-035 — método H1VE. Deixa a persistência PRONTA para a Neon em produção (SSL + autosuspend + split pooled/direct) e operacionaliza branch por ambiente (CI Neon-branch-per-PR + runbook). O money path já é pooler-safe por construção (todos os locks são xact-scoped — verificado); esta fatia documenta, prova (contra Neon real) e endurece. Engine e os 4 goldens intocados; sem migration; `pg` Pool mantido.*
