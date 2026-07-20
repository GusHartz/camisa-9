# Runbook — Deploy do scheduler (o tick diário 15h Brasília)

> SPEC-032. Como colocar o `services/scheduler` para rodar **1×/dia às 15h Brasília**, num relógio
> real, com **catch-up** de dias perdidos. O código está pronto e idempotente; isto é a **operação**.

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

## Deferido (cards futuros)

- Multi-seed (vários mundos): hoje `WORLD_SEED` é um; o tick já recebe `seed` como parâmetro.
- Scheduler interno always-on (quando o servidor de API existir e puder absorver o cron).
- Imagem mínima (compilar os services p/ JS, enxugar devDeps).
- Alerta ativo em falha (webhook).
