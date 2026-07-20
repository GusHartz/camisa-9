# Runbook — Deploy do scheduler (o tick diário 15h Brasília)

> SPEC-032. Como colocar o `services/scheduler` para rodar **1×/dia às 15h Brasília**, num relógio
> real, com **catch-up** de dias perdidos. O código está pronto e idempotente; isto é a **operação**.
>
> **Também cobre a API** (SPEC-037) — ver a seção **"API (web service)"** no fim. Mesmo host, **naturezas
> diferentes**: o scheduler é um **cron job** (roda um tick e SAI), a API é um **web service** (fica viva
> escutando a porta).

## O que é

O `runDailyTick` (SPEC-030) publica a rodada do mundo, paga os humanos, decai o mood, gera decisões,
recupera lesões, vira a temporada e regenera — **idempotente**. O `main.ts` (`services/scheduler`) é a
**borda**: o único lugar que lê o relógio (`Date.now()`). Um **scheduled job** externo só precisa
invocar o container 1×/dia. O tick descobre o dia vencido (`dueDayIndex`) e faz **catch-up** de
qualquer dia perdido (ver "Catch-up" abaixo).

> **Banco:** o provisionamento da Neon (prod + branch por ambiente + os secrets do CI + a prova
> local do money path) está em **`docs/ops/neon-setup-runbook.md`** e ratificado no **ADR-002**.

## Plataforma — decisão (ratificar em ADR futuro)

**Worker em container + scheduled job da plataforma** (a resposta de ESCALA). O tick é um **batch
determinístico 1×/dia que É o money path** (publicação atômica, guardrail *uptime 100%*), não tráfego
web. Um worker dedicado em container vence: sem teto de execução (o batch cresce com o mundo — R13 /
multi-seed), conexão TCP pooled estável ao Neon, agendamento confiável, particionável depois (uma
invocação por seed), e é o **mesmo host** do futuro servidor de API/auth.

- **Default concreto:** **Railway** ou **Render** (cron job nativo, container-based).
- **Rejeitados:** GitHub Actions cron (best-effort — atrasa/pula sob carga; ok só como *smoke-test*);
  serverless functions (teto de execução + connection-storm contra o Postgres).
- **Reversível:** o `main.ts` é a borda desacoplada → o gatilho é *swappable* sem tocar o código.

## Primeira subida: semear o mundo (o PASSO ZERO)

⚠️ **Faça isto ANTES de ligar o cron ou a API.** Um mundo precisa existir para o tick ter o que
processar. Sem ele: `create-account.ts` falha (a `waiting_list` tem FK para `world.seed`) e o tick
devolve **`sem_ancora` para sempre** — o container sobe, roda e não faz nada, sem erro aparente.

Num banco novo, na ordem (SPEC-039):

```bash
# 1. Estrutura (nos DOIS stores; usa o endpoint DIRECT/unpooled — ver SPEC-035)
npm run db:migrate -w services/world-store
npm run db:migrate -w services/player-store

# 2. O mundo — determinístico por seed: a MESMA seed gera SEMPRE a mesma pirâmide
SEED=<sua-seed> DATABASE_URL=… npx tsx harness/seed-world.ts

# 3. A âncora — o dia da RODADA 1. Você escreve a DATA; o script traduz para o dayIndex
SEED=<sua-seed> START_DATE=2026-08-01 DATABASE_URL=… npx tsx harness/set-anchor.ts

# 4. As contas do beta (uma por invocação; não há signup público — decisão da SPEC-037)
WORLD_SEED=<sua-seed> DATABASE_URL=… \
  npx tsx harness/create-account.ts <email> <senha> "<nome>" <GK|DEF|MID|FWD>
```

**⚠️ Semear é irreversível na prática.** `seed-world.ts` **recusa** rodar numa seed que já tem
mundo, e isso é proposital: sobrescrever apagaria clubes, elencos, ocupações humanas e rodadas
publicadas — a carreira de todos os jogadores daquela seed. Não existe `--force`. Se a intenção for
mesmo recomeçar, apague o mundo explicitamente no banco antes.

**⚠️ Confira o `dayIndex` que o `set-anchor` reporta.** Ancorar no dia errado desloca o calendário
inteiro: a rodada 1 cai na data errada e o catch-up replaya o buraco. O script imprime a tradução
(`data → dayIndex`) exatamente para essa conferência.

**A `SEED` é a identidade do mundo** e precisa ser a MESMA em todo lugar: nos comandos acima, no
`WORLD_SEED` do scheduler e no da API. Trocar a seed = outro mundo, vazio.

## Passo a passo (Railway / Render)

1. **Build:** aponte o serviço para o `Dockerfile` em `services/scheduler/Dockerfile` com **contexto =
   raiz do repo** (`docker build -f services/scheduler/Dockerfile .`). Ele instala as deps, builda os
   pacotes composite e roda via `tsx`. O `.dockerignore` que vale é o **da raiz** (o Docker o lê da raiz
   do contexto) — ele exclui `node_modules`/`.git` e **todo `.env*`** para nenhum segredo entrar na
   imagem (OP-12). **Nunca** passe `--build-arg` com segredos; use env do runtime.
2. **Segredos** (Settings → Variables — server-only, OP-12, **nunca** no repo — ver `.env.example`):
   - `DATABASE_URL` = a connection string **pooled** do Postgres (Neon, `-pooler`, runtime).
   - `DATABASE_URL_UNPOOLED` = a string **direct** (sem `-pooler`) — as migrations usam esta (SPEC-035).
   - `WORLD_SEED` = a seed do mundo que este scheduler dirige.
3. **Schedule (cron):** configure o job para disparar **`0,30 18-23 * * *` (UTC)**.
   - `18:00 UTC = 15:00 BRT` o ano todo (Brasil sem DST desde 2019 → offset fixo UTC-3).
   - De meia em meia hora, das 15h às ~20h30 BRT: **dispara VÁRIAS vezes na janela** → se a execução
     das 15h falhar (deploy ruim, restart), a das 15h30/16h **recupera no mesmo dia** (o tick é
     idempotente; rodar de novo = no-op se já publicou). Escolha a frequência conforme o vendor.
4. **Migrations:** garanta que o banco está migrado antes do 1º tick
   (`npm run db:migrate -w services/world-store` e `-w services/player-store`), ou rode como job de
   release/pre-deploy.
5. **Âncora de temporada:** o tick exige a âncora semeada (`setSeasonAnchor`) — é **input de ops**.
   Semeie o `start_day_index` da temporada corrente (o dayIndex do round 1) antes do 1º tick.

## Catch-up (por que o mundo nunca perde um dia)

- **Same-day:** a janela de elegibilidade é das **15h até a meia-noite BRT** (não só a hora cheia das
  15h). Uma janela perdida às 15h é recuperada por qualquer disparo ≥15h do mesmo dia.
- **Multi-day:** um **cursor** (`tick_progress`) guarda o último dia liquidado; o próximo tick replaya,
  em ordem, **as rodadas E os passes humanos** de cada dia perdido (cada passo idempotente:
  `published_round` PK + `daily_ledger`). Um dia que **defere** (falha de publish) **para** o cursor —
  o próximo tick retenta daquele dia (protocolo de falha: adiar com transparência).
- **1º tick (sem cursor):** processa só o dia vencido corrente (não faz backfill retroativo da
  pré-história). Semeie a âncora para alinhar o início do mundo ao 1º deploy.

## Observabilidade

- O tick loga uma linha de status em stdout (a plataforma coleta): `day / status / dias / humanos /
  pagos / decisões / lesões / recuperados / regen / vacancy`. Erros são genéricos (OP-11).
- **Alerta ativo (webhook Discord/e-mail)** = **fora de escopo** desta fatia (decisão "só logs");
  quando entrar, o gatilho é o `status=deferred` (a rodada adiada).

## Verificar

- Rode uma vez manualmente (`npm run start -w services/scheduler` com as env) e confira a linha de log.
- Rodar 2× no mesmo dia deve dar `pagos=0` no 2º (idempotência).

## API (web service)

> SPEC-037. O `services/api` é a **primeira superfície do projeto que escuta numa porta** — a ponte
> entre o cliente Windows e os dois bancos (a credencial de Postgres **nunca** sai do servidor).

**A diferença fundamental para o resto deste runbook:** o scheduler é um **cron job** — a plataforma o
invoca, ele roda um tick e **sai** (exit 0). A API é um **web service** — o processo fica **vivo**,
escutando a porta, e a plataforma o mantém de pé (restart em crash, healthcheck periódico). **Mesmo
host, dois tipos de serviço**: no Railway/Render são **duas entradas distintas** apontando para o mesmo
repositório, com Dockerfiles diferentes. Nunca configure a API como cron (ela nunca termina) nem o
scheduler como web service (ele sai e a plataforma o lê como crash em loop).

1. **Build:** aponte o serviço para o `Dockerfile` em `services/api/Dockerfile` com **contexto = raiz do
   repo** (`docker build -f services/api/Dockerfile .`) — igual ao do scheduler, e pela mesma razão: o
   `.dockerignore` que vale é o **da raiz** (o Docker o lê da raiz do contexto), e é ele que exclui
   `node_modules`/`.git` e **todo `.env*`** para nenhum segredo entrar na imagem (OP-12). Um
   `.dockerignore` dentro de `services/api/` seria **inerte**. O entrypoint é
   `npm run start -w services/api` → `tsx src/main.ts` (o processo que fica vivo).
2. **Env** (Settings → Variables — server-only, OP-12, **nunca** no repo — ver `.env.example`):
   - `DATABASE_URL` = a mesma connection string **pooled** do scheduler (Neon, `-pooler`). Seguro sob o
     PgBouncer transaction-mode porque **todos** os locks de `services/**` são xact-scoped (ADR-002).
   - `PORT` = **a plataforma injeta**; o `main.ts` a lê de `process.env.PORT` (default local `3000`).
     Não a fixe à mão.
   - `TRUST_PROXY_HOPS` = **`1` no Railway/Render** (há exatamente um proxy da plataforma à frente).
3. **⚠️ `TRUST_PROXY_HOPS=1` não é cosmético.** A API deriva o IP do cliente com `clientIp(req, hops)`,
   que toma o **n-ésimo valor a partir da DIREITA** do `X-Forwarded-For` (o mais à direita é o que o
   proxy imediato escreveu — o único que o cliente não controla). Os dois erros têm consequência real:
   - **Baixo demais (`0` atrás de um proxy):** o header é ignorado e o IP vira o do **socket**, que é
     sempre o do proxy. **Todos** os clientes caem no **mesmo balde** de rate limit → um único usuário
     esgota o teto de 10/min e derruba o login de todo mundo. **Auto-DoS.**
   - **Alto demais (mais hops do que existem):** a derivação escorrega para uma posição **escrita pelo
     próprio cliente** no header → o balde vira **forjável** (basta variar o valor a cada request) e o
     limite por IP simplesmente **deixa de existir**. O balde por e-mail (5/min) ainda segura o
     password-spraying contra uma conta, mas a defesa por origem some.

   Regra prática: `TRUST_PROXY_HOPS` = **quantos proxies confiáveis** existem entre a internet e o
   container. Trocou de plataforma ou pôs um CDN na frente? **Recontar.**
4. **Healthcheck:** `GET /healthz` → **200 `{"ok":true}`**. Ele **NÃO toca o banco**, de propósito. Com o
   **autosuspend da Neon**, um health que consultasse Postgres acordaria o banco a cada probe e, pior,
   **falharia durante o cold-start** → a plataforma leria "unhealthy" e reiniciaria o container em
   **loop**. É **liveness** ("o processo está de pé?"), não readiness ("as dependências respondem?").
   É também a **única** rota sem `Cache-Control: no-store` (todas as outras o trazem por default —
   `respond.ts` é o único serializador).
5. **Migrations:** `npm run db:migrate -w services/player-store` aplica a **`0010_session`** (a tabela
   `player.session`). Como qualquer migration do projeto, roda no endpoint **DIRECT/unpooled**
   (`DATABASE_URL_UNPOOLED`, SPEC-035) — o DDL não deve depender do PgBouncer. Sem ela a API sobe, mas
   todo login falha.
6. **Criar contas — não existe signup público nesta fatia.** É **decisão deliberada** (SPEC-037,
   Decisão 3), não omissão: uma rota não-autenticada que escreve consumiria **vagas NPC finitas** via
   `admitOrEnqueue`, e cadastro em massa por bot seria dano **irreversível** ao pilar da escassez. O
   cadastro público volta como card próprio, com invite-gating. Enquanto isso, as contas do beta nascem
   por **script de operador**, rodado da raiz do repo:

   ```
   DATABASE_URL=... WORLD_SEED=... npx tsx harness/create-account.ts <email> <senha> <nome> <POS>
   ```

   `POS ∈ GK | DEF | MID | FWD`. Ele cria a conta + o atleta e o admite no mundo (entra imediato se há
   vaga sob o teto, senão entra na waiting-list — SPEC-034).

### Verificar (API)

- `curl $URL/healthz` → `{"ok":true}`, **mesmo com o banco suspenso**.
- Login de uma conta criada pelo script → `200 { token, expiresAt }`, com `cache-control: no-store` na
  resposta; senha errada → `401` genérico; 11 tentativas do mesmo IP em 1 min → `429` com `Retry-After`.
- Logout com o token → `204`. ⚠️ Repetir o logout com o **mesmo** token devolve `204` de novo, **de
  propósito**: o endpoint nunca é oráculo de validade — token vivo, morto ou inventado são
  indistinguíveis; só header ausente ou malformado dá `401`. A prova de que a linha foi **deletada**
  é a suíte ao vivo (critério 2e da SPEC-037); em produção ela fica observável quando existir a
  primeira rota protegida (`GET /v1/band`, SPEC-038).

### ⚠️ Nota de escala (gatilho de revisão declarado)

O rate limit é **in-process** (um `Map` na memória do processo). Isso é **correto hoje** — **uma**
instância de API — e **deixa de valer** assim que houver **mais de uma**: cada instância passa a ter o
próprio balde, e o teto efetivo vira `limite × nº de instâncias`. Ele também não sobrevive a restart.
**Gatilho explícito:** ao escalar para **>1 instância**, mover os baldes para **tabela ou Redis** antes
de subir a segunda réplica. Até lá, escale **verticalmente** (mais CPU/RAM no mesmo container).

## Deferido (cards futuros)

- Multi-seed (vários mundos): hoje `WORLD_SEED` é um; o tick já recebe `seed` como parâmetro.
- Scheduler interno always-on (quando o servidor de API existir e puder absorver o cron).
- Imagem mínima (compilar os services p/ JS, enxugar devDeps).
- Alerta ativo em falha (webhook).
