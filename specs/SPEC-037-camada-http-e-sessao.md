# SPEC-037 — Camada HTTP e sessão (Faixa: a vida no CT — Card 1 de 4)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-037 |
| **Feature** | Camada HTTP e sessão (`services/api`) — **Card 1 de 4** do card "Faixa: a vida no CT" |
| **Slug** | camada-http-e-sessao |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | **0.4 — baseline de segurança** (`roadmap.md:18`, P0, "ainda não exercida" em `vision-scope.md:64`). Card 2 = a leitura (**SPEC-038**); card 3 = **3.7**; card 4 = **3.4** + o *render* de 3.7. |
| **Appetite** | **2 a 3 dias** (servidor + sessão + suíte ao vivo + patches/ADR). ⚠️ **Re-derivado na divisão:** os 5-6 dias do documento-fonte único viraram 2-3d (SPEC-037) + 2-3d (SPEC-038) — **a ratificar na aprovação do card**. |
| **Prioridade** | ALTA — é o bloqueador escondido do primeiro card de UI: sem servidor a faixa não tem de onde ler, e sem sessão nenhuma rota pode existir. |
| **Criada em** | 2026-07-20 |
| **Status** | **APROVADA** no card (2026-07-20) — em desenvolvimento. ⚠️ **O re-shape em 4 cards foi FEITO** (cards 2-4 criados, dependências wiradas: 2→1, 3→1, 4→{2,3,número-da-camisa}). **O card 1 conserva o nome/appetite originais** — a ferramenta não permite renomear —, então **esta SPEC é a fonte de verdade do escopo dele**, não o título nem a descrição do card, que ficaram do shape antigo (inclusive o "fôlego", que a Decisão 1 corrige). |

---

## Decisões travadas com o founder (2026-07-20)

1. **Card RE-SHAPED em quatro; a ordem é server-first.** A investigação cravou: **não existe cliente** (só spikes) nem **servidor** (grep HTTP → **zero**; a única borda é o worker de cron), e a faixa exige ~7 leituras in-process que um WPF não alcança — ligar o cliente ao Postgres poria a credencial na máquina de cada jogador (morto por `sdd.md:93` + OP-12). O card carregava escondido o card inteiro da rota HTTP/auth.

   | Card | Entrega |
   |---|---|
   | **1 — esta SPEC** (0.4) | `services/api` (o servidor `node:http`, sessão opaca, `/healthz` + login + logout, rate limit, segurança). Zero cliente, zero arte. |
   | **2 — SPEC-038** (0.4) | **`readBandState` + `GET /v1/band`**: o contrato `BandState`, os readers novos (world-store + player-store), as regras puras novas (`dayPhase`, `kit`, `vacancy`, `daysLeftOf`) e o `markActive`. Consome o servidor e o middleware de sessão desta SPEC. |
   | **3 — SPEC futura** (3.7) | **Escritas de gameplay** (`POST /v1/training`, `/decisions/:id/answer`, `/purchases`, `/regen`) — as ações que os cards 1-2 só expõem como estado. ~15 linhas cada, sobre função já testada. |
   | **4 — SPEC futura** (3.4) | A faixa **visual**: WPF portando o interop de `spikes/widget-taskbar/`, as 3 alturas (64/88/110), a arte, o avatar em camadas, `appearanceFromId`. **Já nasce ACIONÁVEL**, porque o card 3 a precede. |

   A ordem segue `roadmap.md:149` (*"server-first — a UI só apresenta o que o motor já garante"*) ⇒ **a cláusula "a faixa é read-only por construção" morre**. ⚠️ **Trade-off declarado:** a arte, as 3 alturas e a verificação ao vivo do `<1% CPU` atrasam três cards — risco de **CRONOGRAMA, não de correção**.

2. **Sessão opaca server-side, SEM par access/refresh — RATIFICADA** (contra `sdd.md:80`, que está RATIFICADO e pede *"tokens de curta duração + refresh"*). Três razões: **(a)** revogação é requisito **funcional** aqui — a SPEC-023 reverte a vaga a NPC e a SPEC-022 encerra a carreira; um JWT stateless não pode ser invalidado quando o atleta que ele referencia deixa de existir; **(b)** zero dep e **um segredo a menos** (JWT exigiria `jose` + chave a rotacionar; token opaco = `node:crypto`, precedente em `team-repo.ts:5`); **(c)** o par access/refresh existe para **compensar** a irrevogabilidade de um token stateless — com sessão em tabela a linha **é** o mecanismo, e a janela curta vem do **idle TTL de 7 dias**. ⚠️ Contradiz âncora ratificada: subiu explícito e o founder **atualizou a âncora** ⇒ **P5b e ADR-003 são entregáveis obrigatórios**.

3. **`POST /signup` fica FORA — o único risco irreversível do card.** Endpoint não-autenticado que **escreve** no mundo: via `admitOrEnqueue` consome **vagas NPC finitas** e posições de waiting-list; cadastro em massa por bot = dano irreversível ao pilar da escassez, sem reversão barata. ⇒ card próprio (invite-gating/captcha). **Custo pago, não escondido:** entra no escopo um `harness/create-account.ts` (~25 linhas sobre funções já testadas) — contas nascem por **script de operador**.

---

## Objetivo

Dar ao projeto a **primeira superfície que escuta numa porta** — a única ponte legítima entre o cliente Windows e os dois bancos. O motor está completo (36 SPECs; o mundo vira sozinho às 15h, humanos com carreira, economia, lesões, forma/moral, transferências, waiting-list), mas **nada disso é alcançável de fora do processo**: o único artefato que roda é um worker de cron. Este card entrega **`services/api`** — o servidor em `node:http` puro (**zero dep nova**) atrás de um seam de transporte, a **sessão opaca hasheada** em `player.session` (migration `0010`), as rotas `/healthz` · `POST /v1/auth/login` · `POST /v1/auth/logout`, o rate limit, e a superfície de segurança que exerce o **0.4** pela primeira vez (OP-09 imposto pelo tipo, OP-11 num único serializador, segredos só-env). Entregue sozinho, **já é útil ponta a ponta**: uma conta criada por script de operador loga, recebe um token revogável e desloga. A rota de leitura da faixa (`GET /v1/band`) e o agregador `readBandState` são o **card seguinte (SPEC-038)**, que assenta inteiro sobre este.

---

## Contexto e motivação (fatos verificados no repo)

- **Zero servidor, zero cliente.** Grep HTTP em `packages/ services/ harness/` → 0 hits; zero dep HTTP no lock. O repo tem 10 devDeps e **3 deps de terceiros**; a raiz tem 0. `sdd.md:19` nomeia *"camada de **rotas**/workers"* — só o ramo *workers* existe.
- **Auth — a lacuna é pequena:** `hashPassword`/`verifyPassword` existem (`auth.ts:10,15`, argon2id `m=19456,t=2,p=1`) e **`verifyPassword` nunca foi chamado em produção**; `readAccountByEmail` (`player-repo.ts:86`) devolve **só o id, não o hash** ⇒ o login exige um SELECT novo; `readActiveAthlete` (`:134`) é a única ponte `accountId → athleteId`. **Zero tabela de sessão.**
- **Migrations:** player-store termina em `0009` → a próxima é **`0010`**; world-store (`0008`) **não é tocado**. ⚠️ `drizzle.config.ts:7-15` tem **lista explícita** de 7 schemas — esquecer o arquivo novo gera migration **vazia em silêncio**; e um `.sql` sem entrada no `meta/_journal.json` **não é aplicado**.
- **Infra:** `services/*` é **typecheck-only** (glob, nada a editar), **nunca** em `tsc -b` (TS6310); `paths` e `alias` são **listas explícitas**; `eslint.config.mjs:83` restringe o guardrail a `packages/*/src` ⇒ `Date.now()` é legítimo em `services/api`; `vitest` roda `fileParallelism:false`; **todos os locks em `services/**` são `_xact_`** (`ADR-002:57` — a API roda no endpoint **pooled**); `client.ts:47` dá **20 conexões** totais; `runbook:25-26` fixa Railway/Render ⇒ **há proxy à frente** (e **zero precedente de derivação de IP** no repo).
- **Âncoras de doc:** `sdd.md:77` = OP-09 literal · `:84` (o ator só age sobre os próprios atletas) · `:100` (rate limit por conta **e** IP) · `:93` (a credencial de banco nunca sai do servidor); `functional-spec.md:113` (*"nunca exigir sessão longa"*).

---

## Escopo — o que está DENTRO

### A) `services/player-store` — a sessão
- [ ] **Migration `0010_session`** (OP-01) — ver SQL. **Gerada por `db:generate`**, nunca à mão, **depois** de registrar o schema.
- [ ] `schema/session.ts` + `schema/index.ts` **+ o array `schema:` do `drizzle.config.ts`** (⚠️ lista explícita).
- [ ] `store/session-repo.ts` — `authenticate` (com dummy-hash) · `createSession` (**cap de 10 na mesma tx**) · `readSessionByHash` · `touchSession` · `deleteSession` · `deleteExpiredSessions`.

### B) `services/api` — o workspace novo
- [ ] `package.json` (`exports`, `start`, `test`) · `tsconfig.json` · `Dockerfile` (contexto = **raiz**).
- [ ] `src/main.ts` — a **BORDA**: env, 2 handles, `listen()`. **O único `Date.now()`.** ⚠️ **Nunca exportado pelo barrel** (o `main.ts` do scheduler auto-executa no topo — um import descuidado subiria um servidor real).
- [ ] `src/server.ts` (timeouts, dispatch, catch-all) · `src/router.ts` (`switch` em `` `${method} ${pathname}` ``; paths exatos, sem params).
- [ ] `src/http/` — `types.ts` (o seam `RouteCtx`) · `body.ts` (cap 8 KiB) · `client-ip.ts` · `respond.ts` (**o único serializador de erro**, `no-store` por default) · `rate-limit.ts` (baldes + `reset()`).
- [ ] `src/auth/session.ts` + `require.ts` — issue/resolve/revoke + o middleware OP-09.
- [ ] `src/routes/` — `health.ts` · `login.ts` · `logout.ts`. *(`band.ts` é a SPEC-038.)*
- [ ] `src/index.ts` — o barrel: exporta **`createApiServer`**, **nunca `main.ts`**.

**Stack `node:http` puro, atrás de um seam.** As rotas do v1 não justificam framework (`hono` = +2 deps e uma 2ª gramática de contrato; `fastify`/`express` = ~30 deps transitivas). **O que a torna reversível:** o handler **nunca vê `req`/`res`** — recebe `RouteCtx {method, path, query, body, ip, epochMs}` e devolve `RouteResult`; trocar por hono num card futuro toca **um arquivo** e **zero handler** (o instinto do `modulate?` da SPEC-029). **Critério estrutural:** nada fora de `src/http/`+`src/routes/` importa `node:http`.

### C) `harness`
- [ ] `harness/create-account.ts` — script de operador (~25 linhas) sobre `createAccountWithAthlete` + `admitOrEnqueue`. Sem ele, o card entrega um servidor em que ninguém entra.

### D) Infra / config
- [ ] `tsconfig.base.json` (9ª entrada em `paths`) · `vitest.config.ts` (8ª em `alias`) · `package-lock.json` (senão `npm ci` cai em `npm install` = verde com drift) · `.env.example` (+`PORT`, +`TRUST_PROXY_HOPS=1`).
- [ ] `services/scheduler/src/daily-tick.ts` — purga de sessões **1× por tick**, no **topo** do `runDailyTick`, **antes dos três early-returns** (`:72-77`) e **fora** do `runCatchUp`, **isolada** em try/catch (molde `tryInjure`). Auth **nunca** derruba a rodada das 15h.
- [ ] ⚠️ **`wipeAll` em ordem de FK:** `session` **antes de `account`** em **TODA** suíte que apaga o pai (`player-repo`, `training-repo`, `team-repo`, `economy-repo`, `decision-repo`, `injury-repo`, `regen`, `world-entry`, `scheduler`) — **não só a nova**.

### E) Docs de fundação + ADR — **entregáveis obrigatórios**
- [ ] **`docs/adr/ADR-003-camada-http-e-sessao.md`** — stack HTTP + sessão opaca (as 3 razões da Decisão 2) + a linha normativa: *"o cliente persiste o token via DPAPI (`ProtectedData`, `CurrentUser`) ou Credential Manager — nunca arquivo plano. Requisito de aceite do card 4."*
- [ ] **P5b** (`sdd.md:80`) — sem ele o código contradiz âncora ratificada. Mais **P5, P6, P8, P9** e **D1**, e o reporte de **D2/D3**.
- [ ] `docs/ops/scheduler-deploy-runbook.md` — seção "API (web service)".

### F) Testes (puros sempre; ao vivo gated por `DATABASE_URL`)
Ver Critérios. Foco: ordem OP-09, OP-11 sem vazamento, sessão (TTLs/logout/cap/hash), enumeração por timing, os baldes de auth, derivação de IP, robustez do transporte, migration real, `wipeAll` íntegro, purga isolada, grep-gates estruturais.

## Escopo — o que está FORA

- **`readBandState` e `GET /v1/band`** — o agregador, o contrato `BandState`, os readers novos de `world-store`/`player-store`, as regras puras `dayPhase`/`kit`/`vacancy`/`daysLeftOf` e o `markActive` são a **SPEC-038** (o card seguinte), que consome o servidor e o middleware de sessão daqui.
- **Cliente WPF, 3 alturas, arte, avatar em camadas, `appearanceFromId`** — **card 4**.
- **Escritas de gameplay** — **card 3**.
- **`POST /v1/auth/signup`** — card próprio com invite-gating (Decisão 3).
- **O número da camisa** — card próprio (coluna + migration + range 1-99 + unicidade no elenco + payload de criação + o `harness/create-account.ts`). ⚠️ **dependência DURA antes do card 4.**
- **`GET /v1/profile`, `/v1/team`, `/v1/legends`** — nada na faixa v1 os renderiza; `readTeam` não aceita `athleteId`.
- **Steam auth · reset de senha · verificação de e-mail** — exigem o **mesmo outbox** que a SPEC-023 deferiu. Cards próprios.
- **Refresh token** — fora **por decisão ratificada**, não por omissão · **rate limit distribuído** (gatilho: >1 instância) · **multi-seed** · **executar o deploy** (ação de ops, padrão SPEC-032).
- **`statement_timeout` por request** — ⚠️ nomeado: `persistWorldTurnover` faz DELETE+INSERT do snapshot numa tx única, e uma leitura no meio **bloqueia** nos locks de linha. `SET SESSION` é **proibido** sob o pooler ⇒ a saída (`SET LOCAL` em tx) é **card próprio**.
- **Tocar `buildPoolConfig`/`createDb`** (a SPEC-035 preservou a assinatura de propósito) · **a dívida de i18n do `decisions.ts`** — registradas, não consertadas.

---

## A superfície HTTP

Erro **sempre** `{ error, code }` — `code` é a chave **estável e não-localizável** (o cliente roteia e traduz por ela); `error` é frase genérica. **Nunca** stack, SQL ou detalhe interno (OP-11).

```
GET /healthz
  200  { "ok": true }
  ⚠️ NÃO TOCA O BANCO (com o autosuspend da Neon, um health que consultasse Postgres
     derrubaria o container em loop de restart no cold-start). Liveness, não readiness.
  ⚠️ É a ÚNICA rota SEM `Cache-Control: no-store`.

POST /v1/auth/login          body ≤ 8 KiB: { email, password }
  200  { token, expiresAt }                                    + Cache-Control: no-store
  400  invalid_input · 413 payload_too_large
  401  invalid_credentials   ⚠️ RESPOSTA E LATÊNCIA IDÊNTICAS p/ e-mail inexistente e senha errada
  429  rate_limited + retryAfter (corpo) + header `Retry-After`

POST /v1/auth/logout
  auth: header Bearer bem-formado obrigatório; a VALIDADE do token NÃO é pré-requisito.
  204  SEMPRE que o header é bem-formado — token vivo, morto ou inexistente são
       indistinguíveis: o endpoint nunca é oráculo de validade.
  401  unauthorized — SOMENTE header ausente ou malformado.
```

**Rate limit** (`sdd.md:100`): janela fixa **in-process**, **dois baldes nesta fatia** — `/v1/auth/*` por **IP (10/min)** e por **e-mail normalizado (5/min)**, o mais restritivo vence. *(O terceiro balde — `GET /v1/band` por `accountId`, 30/min — entra com a rota, na SPEC-038; o módulo `rate-limit.ts` nasce aqui preparado para ele.)* **Sem lockout de conta** (deixaria o atacante trancar a vítima). ⚠️ **Débito declarado:** in-process não sobrevive a restart nem a múltiplas instâncias — **gatilho: >1 instância**. ⚠️ Com `fileParallelism:false` o `Map` é **estado de módulo compartilhado entre suítes** ⇒ o limitador expõe **`reset()`**, chamado no `beforeEach` de toda suíte que toca rotas limitadas.

---

## Migration (OP-01)

```sql
-- services/player-store/src/migrations/0010_session.sql   (ADITIVA)
-- ⚠️ GERADA por `npm run db:generate -w services/player-store`, nunca à mão:
--    um .sql sem entrada em migrations/meta/_journal.json NÃO é aplicado pelo migrate().

CREATE TABLE "player"."session" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id"   uuid        NOT NULL,
  "token_hash"   text        NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "expires_at"   timestamptz NOT NULL,
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "player"."session" ADD CONSTRAINT "session_account_id_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "player"."account"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "session_token_hash_uq" ON "player"."session" ("token_hash");
CREATE INDEX "session_account_idx" ON "player"."session" ("account_id", "created_at" DESC);
CREATE INDEX "session_expires_idx" ON "player"."session" ("expires_at");
```

**Decisões de sessão:** token = `randomBytes(32).toString('base64url')` (256 bits CSPRNG) · em repouso **só `sha256hex(token)`** (dump vazado **não** vira sessão viva; sem KDF — o segredo já tem entropia total e argon2 em todo poll seria proibitivo) · transporte `Authorization: Bearer`, nunca cookie ⇒ **CSRF não existe por construção** · **TTL absoluto 30d** (derivado de `created_at`, sem coluna) · **TTL idle 7d** (o "curta duração" de `sdd.md:80`) · bump de `last_seen_at` **throttled a 12h** (um poll de 60s não vira 1.440 UPDATEs/dia) · logout **DELETA a linha** (dispensa `revoked_at`; é a "rotação no logout") · **cap de 10 sessões vivas por conta**, as excedentes apagadas na tx do `createSession` (senão um loop de login acumula ~7.200 linhas/dia/conta) · purga `expires_at < now()` **1× por tick, isolada**.

**Login:** `authenticate` = `SELECT id, password_hash WHERE email = normalizeEmail($1)` → `verifyPassword` → `readActiveAthlete`. ⚠️ **Enumeração por timing:** e-mail inexistente retornaria **sem rodar argon2id** (~50 ms observáveis) ⇒ no ramo "não achou", rodar `verifyPassword(DUMMY_HASH, password)` e descartar. **`DUMMY_HASH` é gerado por `hashPassword(randomBytes(32).toString('hex'))`** e colado no código, garantindo parâmetros **idênticos** aos reais (`auth.ts:7`) — um dummy divergente tem custo divergente e **reabre a enumeração**. Não é segredo. `athleteId` pode ser `null` (conta mid-regen): o **login sucede**; é o `GET /v1/band` (SPEC-038) que devolve 409.

**CI: nenhuma mudança** — o workflow já roda `db:migrate -w services/player-store` (`ci.yml:127-133`).

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `services/player-store/src/schema/session.ts` · `schema/index.ts` · `drizzle.config.ts` | criar/editar — ⚠️ o config tem **lista explícita**. |
| `services/player-store/src/migrations/0010_session.sql` (+`meta/`) | criar — **via `db:generate`** (OP-01). |
| `services/player-store/src/store/session-repo.ts` · `src/index.ts` | criar/editar — `authenticate` + CRUD + purga · barrel. |
| `services/api/package.json` · `tsconfig.json` · `Dockerfile` | criar — molde `world-entry`/`scheduler` (contexto de build = **raiz**). |
| `services/api/src/main.ts` · `server.ts` · `router.ts` | criar — a BORDA (único `Date.now()`, **nunca no barrel**) + dispatch. |
| `services/api/src/http/{types,body,client-ip,respond,rate-limit}.ts` | criar — o seam `RouteCtx`; cap 8 KiB; derivação normativa de IP; o único serializador de erro; baldes + `reset()`. |
| `services/api/src/auth/{session,require}.ts` | criar — issue/resolve/revoke + o middleware OP-09. |
| `services/api/src/routes/{health,login,logout}.ts` | criar — as rotas desta fatia. |
| `services/api/src/index.ts` | criar — o barrel (`createApiServer`, **nunca `main.ts`**). |
| `services/api/test/{session,server-auth}.test.ts` | criar — servidor real em `listen(0)`. |
| `services/player-store/test/session-repo.test.ts` | criar — authenticate, TTLs, touch throttled, cap de 10, purga. |
| `harness/create-account.ts` | criar — script de operador. |
| `tsconfig.base.json` · `vitest.config.ts` · `package-lock.json` · `.env.example` | editar — listas explícitas + o lock do workspace novo. |
| `services/scheduler/src/daily-tick.ts` | editar — purga isolada no topo, antes dos early-returns, fora do `runCatchUp`. |
| `services/*/test/*.test.ts` (9 suítes) | editar — ⚠️ **`session` antes de `account` no `wipeAll`**. |
| `docs/adr/ADR-003-camada-http-e-sessao.md` · `docs/adr/README.md` | criar/editar — o ADR + o índice (⚠️ **o ADR-002 também falta lá**). |
| `docs/projeto/{sdd,vision-scope,roadmap}.md` | editar — os patches P5, P5b, P6, P8, P9. |
| `docs/ops/scheduler-deploy-runbook.md` | editar — seção "API (web service)". |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 0.4 🚧 + "Estado atual". |
| `specs/SPEC-037-camada-http-e-sessao.md`, `specs/DONE-037-camada-http-e-sessao.md` | criar. |

**Intocado (o critério DURO):** **`packages/world-engine` inteiro e os 4 goldens** (`git diff` = **0**), incl. `world-expansion.golden.json`. A fatia é **100% borda**: nenhum arquivo de `packages/*` é sequer aberto, e o world-store não é tocado.

---

## Critérios de aceitação

1. **OP-09/OP-11 — a ordem e a superfície de erro** *(ao vivo)*: o middleware `requireSession` (`src/auth/require.ts`), exercitado por um **handler `AuthedHandler` de teste** registrado **só na suíte** (via `createApiServer` + `listen(0)`, fora do router de produção — o alvo real é o `GET /v1/band` da SPEC-038, que crava a mesma matriz no seu critério 1), sem header, com header malformado, com token inexistente e com token expirado → **401** nos quatro, e um espião prova que **o handler nunca rodou**. `logout` **sem** header e com body malformado → **401**, nunca 400; com header bem-formado e token inexistente → **204**, idêntica à de token vivo. **E** erro de constraint forçado e pool derrubado no meio de um handler → corpo exatamente `{"error":"erro interno","code":"internal"}`, sem `select`/`insert`/`23505`/`at Object.`/`pg`/`player.`/`duplicate key` nem nome de coluna; `DomainError` (`team-repo.ts:36`) **permanece não exportado**.
2. **Sessão** *(ao vivo, `epochMs` injetado — zero `sleep`)*: (a) o `token_hash` no banco **não contém** o token, e o sha256 bate; (b) uso dentro da janela desliza `last_seen_at`, throttled (2 usos em 1 min = **1** UPDATE); (c) idle 8 dias → 401; (d) `created_at + 30d` → 401 mesmo com deslize; (e) pós-logout → 401; (f) a purga remove só as vencidas; (g) **12 logins → `count(*) = 10`**, e os 2 tokens mais antigos → 401.
3. **Login não enumera; os baldes limitam; o IP é derivado certo** *(ao vivo + puro)*: 20 tentativas com e-mail inexistente vs 20 com senha errada → status e corpo **byte-idênticos** e mediana dentro de ±30%; teste **puro** compara `m=`/`t=`/`p=` do `DUMMY_HASH` com `OPTS`. **E** 11 tentativas do mesmo IP em 1 min → **429** com `retryAfter` **e header `Retry-After`**; 6 tentativas do mesmo e-mail normalizado em 1 min → **429** (o balde mais restritivo vence). **E** com `TRUST_PROXY_HOPS=1`, 11 requests do **mesmo socket** variando o valor **da esquerda** de `X-Forwarded-For` → a 11ª é **429** (o cliente não troca de balde); com `=0`, o header **não altera** o balde.
4. **Robustez do transporte** *(ao vivo + puro)*: POST de 1 MiB → **413** e o servidor segue vivo; body truncado → **400** e o próximo request 200; `/healthz` com `DATABASE_URL` morto → **200**. **E** toda resposta salvo `/healthz` traz `cache-control: no-store` — **em particular a do login**. **E** zero header `access-control-*`; **e** um capture de `console.*` prova que senha e token **nunca** são logados.
5. **Grep-gates estruturais**: **zero** `pg_advisory_lock` de sessão, `LISTEN`, `NOTIFY` ou `SET SESSION` no código novo — só `_xact_`/`FOR UPDATE` (`ADR-002:57`); **nada fora de `src/http/`+`src/routes/` importa `node:http`**; o barrel de `services/api` **não exporta `main.ts`**.
6. **Migration real, `wipeAll` íntegro e a purga isolada** *(ao vivo)*: `migrate()` cria `player.session` (uma migration **vazia em silêncio reprova aqui**); a **suíte inteira** roda verde — qualquer suíte que apague `account` sem apagar `session` antes falha por FK. **E** `deleteExpiredSessions` stubado para **lançar** → a rodada do dia **publica normalmente** e o tick reporta `published`.
7. **OPs & gates** *(o critério DURO)*: sem `any` (14); ≤50 linhas/função (15); ≤300/arquivo (16); zero regra de negócio no transporte (17); erros genéricos (11); migration `0010` versionada (01); segredos só-env (02/12); `lint`/`typecheck`/`build`/`test`/prettier verdes; **467 testes preservados**; **engine e os 4 goldens INTOCADOS (`git diff` = 0)**.

---

## Segurança

> `sdd.md:77` é OP-09 literal. Esta é a **primeira superfície de entrada do projeto** — a seção é normativa.

- **OP-09 imposto pelo TIPO.** **(1)** O **roteador** resolve `Bearer → sha256 → sessão viva` **antes** de invocar o handler; rota protegida tem tipo `AuthedHandler` e sem sessão o handler **não roda**. **(2)** `athleteId` vem **exclusivamente** de `readActiveAthlete(session.accountId)` — **nenhum endpoint aceita identificador de ator** ⇒ `sdd.md:84` satisfeito **por construção**, não por checagem que alguém pode esquecer. **(3)** Parse na primeira linha do handler, via lib pura → `Result<T>`, com narrowing no molde de `isRecord` (`player-repo.ts:270`, **privado — replicar, não importar**). **Nada de `zod`**.
- **OP-11:** `http/respond.ts` é o **único** serializador; **nunca** propaga `err.message` — mapeia por outcome explícito, e throw inesperado vira `500 internal` + `requestId` no log.
- **OP-12/02:** `DATABASE_URL`, `WORLD_SEED`, `PORT`, `TRUST_PROXY_HOPS` **só de `process.env`**; o `.dockerignore` da raiz já cobre `**/.env*`. **Zero segredo novo** — a vantagem concreta do token opaco sobre JWT.
- **Derivação do IP (normativa).** `clientIp(req, hops)`: com `TRUST_PROXY_HOPS` (env, **default `0`**) `= n > 0`, tomar o **n-ésimo valor a partir da DIREITA** de `X-Forwarded-For` (o mais à direita é o que o proxy imediato escreveu e o cliente não controla); com `n === 0`, usar `req.socket.remoteAddress` e **ignorar o header**. **Nunca** o valor mais à esquerda. Sem isto, atrás do proxy o limite é **bypassável** (XFF cru) ou **auto-DoS** (todos num balde).
- **CORS: nenhum header emitido** — cliente WPF; sem `Access-Control-Allow-Origin` nenhuma página web **lê** a resposta. Risco reduzido a custo zero. TLS terminado pela plataforma.
- **Transporte:** body cap 8 KiB (413 sem bufferizar) · `requestTimeout` 10s · `headersTimeout` 8s · `clientError` tratado · `unhandledRejection` logado sem matar · **`no-store` é o DEFAULT de `respond.ts`**, em toda resposta (incl. o login, que carrega o token, e todo 4xx/5xx); única exceção `/healthz`.
- **Escrita no mundo:** esta fatia **não escreve em lugar nenhum do world-store** — a única escrita nova é `player.session`. O limite explícito da API sobre o snapshot (e o `markActive`, a única escrita tolerada no overlay) é normativo na **SPEC-038**, que o entrega.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| ~~`sdd.md:80` pede "refresh"~~ · ~~appetite de 14 dias~~ | **✅ RESOLVIDOS (founder, 2026-07-20).** ⚠️ **Linha de corte pré-aprovada, nesta ordem:** (1) `markActive` + P10; (2) `queue`; (3) `athlete.appearance` — os três pertencem ao escopo da **SPEC-038**. **`club.todayMatch` NÃO se corta** (é o único conteúdo da véspera), nem as rotas, a sessão, as duas barras, `phase`, `squad`. |
| **CRONOGRAMA: a validação visual atrasa três cards** | Trade-off **aceito e classificado**: nenhum invariante depende dele e nada que o card 4 descubra invalida o servidor (contrato aditivo-only). ⚠️ Se a CPU medir acima do orçamento, o retrabalho é **no cliente** — a evidência da SPEC-003 (0,249%) sustenta a aposta. |
| **`wipeAll` quebra 9 suítes** (o gotcha da SPEC-024/`purchase` e SPEC-031/`turnover_report`) | `session` **antes de `account`** em todas; checklist explícito e a suíte **inteira** verde como critério. Risco **alto e conhecido** — mitigação é checklist, não esperança. |
| **Migration vazia em silêncio** (lista explícita no `drizzle.config.ts`) | Registrar `session.ts` **antes** do `db:generate`; o teste ao vivo **reprova** se a tabela não existir. |
| **A API vira a 2ª borda de relógio** | `api/src/main.ts` é a **segunda e última**; `epochMs` **injetado** em `RouteCtx` e na sessão. Atualizar o comentário do scheduler. |
| **`main.ts` importado por engano sobe um servidor real** | O `main.ts` do scheduler **auto-executa no topo** — o barrel exporta **`createApiServer`** e nunca `main.ts`; os testes sobem via `createApiServer` + `listen(0)`. Vira grep-gate (critério 5). |
| **`npm run lint` vermelho local no Windows** (CRLF vs LF) | ⚠️ é a SPEC com **mais arquivos novos desde a SPEC-001** ⇒ o falso vermelho vem em massa e **parece defeito**. Não é regressão; o CI é verde. |

**Dependências:** SPEC-016 (auth/`readActiveAthlete`, `createAccountWithAthlete`) · 030/032 (Dockerfile/runbook, o tick onde a purga se pluga) · 034 (`admitOrEnqueue`, no harness de operador) · 035 (ADR-002 — locks xact-scoped, endpoint pooled).

**Depende (fora desta fatia):** o **card do número da camisa** — não bloqueia esta fatia nem o card 3, mas é **pré-requisito DURO do card 4**.

**Precede:** a **SPEC-038** (`readBandState` + `GET /v1/band`) — que consome diretamente o servidor, o seam `RouteCtx` e o middleware de sessão entregues aqui —, o **card 3** (3.7), o **card 4** (3.4) e **todo** card de escrita de gameplay (~15 linhas de rota cada). Também destrava o **painel de auditoria interno (roadmap 1.5)** — o segundo consumidor natural da mesma API.

---

## Patches de docs de fundação

| # | `file:line` | De → **para** |
|---|---|---|
| **P5** | `sdd.md:81` | `[SUPOSIÇÃO]` → **RATIFICADO**: sessão server-side em `player.session`, token opaco 256 bits, só o sha256 persistido, `Bearer`. Ver ADR-003. |
| **P5b** | `sdd.md:80` | **OBRIGATÓRIO** (Decisão 2): *"tokens de curta duração + refresh"* → **"sessões de curta duração por inatividade (idle 7d) com renovação deslizante + teto absoluto (30d); rotação (destruição) no logout — o par access/refresh era artefato do ramo JWT, subsumido pela sessão server-side revogável (ADR-003)."** |
| **P6** | `sdd.md:155` | `[SUPOSIÇÃO]` → **EXERCIDO**: "conta A não acessa dados de conta B" é gate real desde a SPEC-037 (cravado por teste no critério 1 da SPEC-038). |
| **P8** | `vision-scope.md:64` | *"baseline de segurança … ainda não exercida"* → **exercida na SPEC-037**: auth → autorização → input em toda rota, sessão opaca revogável, erros genéricos, segredos em env. |
| **P9** | `roadmap.md:18` (0.4) | marcar 🚧 e **nomear o transporte** → **"Servidor HTTP (`services/api`), sessão, auth, autorização por recurso, validação de input, rate limiting, segredos em env."** ⚠️ **o servidor HTTP não tinha item numerado em roadmap nenhum.** |
| **D1** | `docs/adr/README.md:26-28` | ⚠️ drift pré-existente: **o ADR-002 não está no índice** — corrigir de passagem ao adicionar o ADR-003. |
| **D2/D3** | `sdd.md:167-168` · `vision-scope.md:91` | ⚠️ **os dois arquivos terminam TRUNCADOS no meio de uma linha** (o SDD para em "…Regra NUNCA nº 1 auditada" sem fechar a tabela de riscos; o vision-scope em "toda lógica no"). **Reportar ao founder no DONE — NÃO inventar o conteúdo faltante.** |

*(P1, P2, P3, P4, P7, P10, P11 e P12 são entregáveis da **SPEC-038**.)*

---

## Notas de implementação

- **⚠️ `services/*` é typecheck-only** — entra pelo **glob** do `tsconfig.typecheck.json` e **NUNCA** nas references do `tsc -b` (TS6310); mas precisa de `tsconfig.json` próprio + `paths` + alias (**listas explícitas**).
- **⚠️ `fileParallelism: false`** — as suítes dividem **um** Postgres **e o mesmo processo Node**: (a) limpeza em ordem de FK; (b) **estado de módulo é compartilhado entre arquivos** ⇒ o rate-limiter precisa de `reset()` no `beforeEach`.
- **⚠️ Ordem canônica do `wipeAll`:** `session → injury → decision → purchase → dailyLedger → athlete → account`.
- **⚠️ Locks xact-scoped obrigatórios** (`ADR-002:57`) — a API roda no endpoint **pooled**. Vira grep-gate (critério 5): é o tipo de coisa que entra sem ninguém notar.
- **⚠️ Guardrail em `packages/*`** — em `services/api` o guardrail não se aplica, mas o rigor se mantém: **um único `Date.now()`**, na borda (`main.ts`), injetado como `epochMs`.
- **⚠️ `main.ts` não pode ser importado** (o do scheduler auto-executa no topo). O barrel exporta **`createApiServer`**; os testes sobem via `createApiServer` + `listen(0)`.
- **Zero dep nova:** `node:http` + `node:crypto` + `@node-rs/argon2`/`pg`/`drizzle-orm` + `tsx`, todos já instalados.
- **Reversível:** a API é aditiva e **desligável** — parar o container remove a superfície inteira sem tocar mundo, motor ou tick. A migration é aditiva. A escolha `node:http` é reversível em **um arquivo** graças ao seam `RouteCtx`.
- **⚠️ Ritual do board H1VE — o passo mais fácil de esquecer** (a SPEC-030 ficou **presa em `spec`** por isso): escrever o arquivo **não** publica. Rodar **`h1ve spec --from specs/SPEC-037-camada-http-e-sessao.md`**, obter a **aprovação no próprio card**, e no fim **`h1ve done --doc`** antes do PR. "Aprovado no chat" ≠ clique no board.
- **Fecho do DONE:** "Estado atual" do `CLAUDE.md` + `roadmap.md` (0.4 🚧) + ADR-003 + os patches P5/P5b/P6/P8/P9 + D1 + **reportar D2/D3** (os docs truncados) + os follow-ups desta fatia (rate limit distribuído, signup com invite-gating, `statement_timeout` na viragem, i18n do `decisions.ts`) + **abrir o card do NÚMERO DA CAMISA** (⚠️ antes do card 4).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (card 1 de 4; o agregador `readBandState`/`GET /v1/band` é a SPEC-038; cliente/arte, escritas de gameplay, signup e número da camisa fora)
- [x] Arquivos listados corretos (verificados no repo, com linhas)
- [x] Mudança de schema COM migration (`0010_session`, OP-01)
- [x] Critérios testáveis (7, incl. grep-gates e o selo de goldens)
- [x] Riscos e superfície de segurança avaliados (primeira superfície de entrada do projeto)
- [x] Decisões co-desenhadas registradas (3, todas de 2026-07-20)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-037 — método H1VE. O **card 1 de 4** de "Faixa: a vida no CT": a primeira superfície do projeto que escuta numa porta, com sessão opaca revogável e a segurança do 0.4 exercida pela primeira vez. A decisão central é **autorização por CONSTRUÇÃO** — nenhuma rota aceita identificador de ator; o `athleteId` só vem da sessão. Os trade-offs aceitos: o signup fica fora (pago com um script de operador) e a validação visual atrasa três cards — o preço declarado da ordem **server-first**. **Engine e os 4 goldens INTOCADOS**: a fatia é 100% borda.*
