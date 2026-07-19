# SPEC-032 — Cron / deploy do scheduler (dispara o tick 1×/dia) + catch-up completo

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-032 |
| **Feature** | Cron / deploy do scheduler (dispara o tick 1×/dia) — card do board |
| **Slug** | cron-deploy-scheduler-tick-diario |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 1.2 (motor de temporada — a infra que faz o mundo jogar às 15h SOZINHO) |
| **Appetite** | **4 a 5 dias** (o catch-up COMPLETO — cursor resumível + loop dia-a-dia + re-leitura pós-viragem — é o coração; + o Dockerfile + o runbook de deploy). |
| **Prioridade** | ALTA — sem o gatilho, o `runDailyTick` (SPEC-030) é um motor pronto que ninguém liga. Fecha o 1.2. |
| **Criada em** | 2026-07-19 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-19)

1. **Plataforma = worker em container + scheduled job** (a resposta de ESCALA — o founder pediu a lente de escalabilidade). O tick é um **batch determinístico 1×/dia que É o money path** (publicação atômica, guardrail *uptime 100%*), não tráfego web. Um **worker dedicado em container** (imagem Docker) disparado por um **scheduled job da plataforma** vence: sem teto de execução (o batch cresce com o mundo — R13/multi-seed), conexão TCP pooled estável ao Neon, agendamento confiável, particionável depois (uma invocação por seed), e é o **mesmo host** do futuro servidor de API/auth. **Default concreto: Railway ou Render cron** (`node main.js`), **reversível** (o `main.ts` já é a borda desacoplada → o gatilho é *swappable*; o vendor exato é detalhe do **runbook**, ratificável num ADR, NÃO trava o código). **Rejeitados:** GitHub Actions cron (best-effort — frágil como coração de produção; ok só como smoke-test) e serverless functions (teto de execução + connection-storm contra o Postgres).
2. **Catch-up = COMPLETO (same-day + multi-day).** O tick honra o uptime 100% até no outage >24h: **(same-day)** a janela de elegibilidade abre das 15h até a meia-noite BRT (não só na hora cheia das 15h) + o cron dispara várias vezes na janela → uma janela perdida às 15h é recuperada às 16h/17h no MESMO dia; **(multi-day)** se DIAS inteiros foram perdidos, o tick replaya as rodadas perdidas em ordem (cada uma atômica/idempotente) E roda os passes humanos de cada dia perdido (salário/moral/decisões via o ledger `daily_ledger`), re-lendo o mundo após uma viragem.
3. **Observabilidade = só logs (mínimo).** O tick loga a linha de status (stdout, OP-11 genérico); a plataforma coleta. Sem webhook/alerta ativo nesta fatia (não puxa o card de Discord/notificações).

---

## Objetivo

Ligar o motor. O `runDailyTick(worldDb, playerDb, seed, epochMs)` (SPEC-030) já dirige, idempotente, todos os passes do mundo/dos humanos numa passada — mas **ninguém o invoca num relógio real**. Esta SPEC entrega **(a)** o artefato de deploy (um container + um scheduled job que chama `node main.js` na janela das 15h BRT) e **(b)** o **catch-up completo** que torna o disparo robusto a downtime: o mundo joga TODO DIA às 15h, com ou sem o operador acordado, e se algum dia foi perdido, o próximo tick **cura o buraco** — a linha do tempo do mundo permanece inteira (o guardrail *uptime de rodada 100%*).

---

## Contexto e motivação (fatos verificados no repo)

- **`runDailyRound(db, seed, epochMs, modulate?)`** (`services/world-store/src/store/daily-round.ts:47`): hoje gateia em `if (!slot.isMatchWindow)` = **exatamente `hour === 15`** (`anchor.ts:30`); `targetRound = slot.dayIndex − startDayIndex + 1` (`:59`); publica UMA rodada; no fim da temporada dispara `rollover` → `persistWorldTurnover` (`:74`, `:88`). **O buraco:** se o disparo das 15h é perdido, o dia seguinte recomputa `targetRound` MAIOR → a PK `(season_id, round)` do dia perdido **nunca** é preenchida (o `targetRound` só cresce). Buraco permanente.
- **`resolveSlot(epochMs)`** (`packages/world-engine/src/orchestration/anchor.ts:22`): puro, offset FIXO UTC-3 (Brasil sem DST desde 2019 → **18:00 UTC = 15:00 BRT o ano todo**). Devolve `{ dayOfWeek, hour, minute, dayIndex, isMatchWindow }`. `MATCH_HOUR = 15` é constante privada do módulo.
- **Âncora de temporada** (`season-repo.ts`): `readSeasonAnchor(seed, seasonId) → startDayIndex | null` (semeado por ops via `setSeasonAnchor`); a viragem re-ancora a próxima temporada (`newStart = dayIndex + 1`, SPEC-021). Round N ⇒ `dayIndex = startDayIndex + N − 1`; o dia de viragem (`startDayIndex + roundsLength`) é de descanso (sem rodada).
- **`runDailyTick`** (`services/scheduler/src/daily-tick.ts:49`): chama `runDailyRound` UMA vez, depois roda regen (na viragem) + vacancy + os passes por-humano para `report.dayIndex` (HOJE): `accrue [só se paid]` · `tryInjure` · mood · `resolveDeadline(day−1)` · `generateForDay(day)` · `advanceRecovery(day)`. **Isolamento por-humano** (`safeHumanPasses`).
- **Idempotência já existente:** rodada por PK `(season_id, round)` (`published_round`); passes humanos por `daily_ledger (athlete_id, day, scope)` (SPEC-030, claim `onConflictDoNothing().returning()`). ⇒ **rodar o mesmo dia N× = no-op** — o alicerce do catch-up (replayar é seguro).
- **`main.ts`** (`services/scheduler/src/main.ts`): a BORDA — o único `Date.now()`; lê `DATABASE_URL`/`WORLD_SEED` da env; cria os 2 handles; roda 1 tick; fecha. Auto-executa como entrypoint (`node main.js`).
- **Migrations do world-store:** até `0006_vacancy_freeze` → a próxima é **`0007`**. O cursor é world-scoped ⇒ mora no world-store.
- **Guardrail:** `packages/*/src` sem `Date`/`random`/transcendentais. `services/*` está FORA do guardrail (o `main.ts` lê o relógio). O catch-up vive 100% na borda (`services/*`) ⇒ **engine e os 4 goldens intocados**.

---

## Escopo — o que está DENTRO

### A) `packages/world-engine` — o mínimo (novo export puro; goldens intocados)
- [ ] `dueDayIndex(epochMs): number` (novo, PURO, em `anchor.ts`) — o **maior dayIndex cuja rodada já venceu** = `slot.hour >= MATCH_HOUR ? slot.dayIndex : slot.dayIndex − 1`. É o teto do catch-up (nunca publica a rodada de HOJE antes das 15h). **Função NOVA** ⇒ não altera a saída de `resolveSlot` ⇒ **`anchor.golden.json` byte-idêntico**; coberta por teste unitário próprio (não entra no golden). Exporta no barrel.

### B) `services/world-store` — o cursor de progresso + publicar por dayIndex
- [ ] **Migration `0007`** (OP-01): tabela `tick_progress(world_seed text PK, last_day_index int NOT NULL)` — o cursor resumível = **o último dia cuja RODADA DO MUNDO está liquidada** (published / season_rolled / before_season).
- [ ] `tick-progress-repo.ts`: `readTickCursor(db, seed) → number | null`; `advanceTickCursor(db, seed, dayIndex)` (upsert monotônico — só avança, nunca retrocede).
- [ ] Refatorar `daily-round.ts` para expor **publicar a rodada de um `dayIndex` ALVO** (não só "agora"): extrair `publishRoundForDay(db, seed, dayIndex, world, results, startDayIndex) → DailyRoundReport` (a lógica de `publishTarget`/`rollover` já existe; só passa a receber `dayIndex`/`world`/`results` em vez de derivar de `epochMs`). O `runDailyRound(epochMs)` atual permanece como o caminho de conveniência (um dia), reusando o núcleo.

### C) `services/scheduler` — o loop de catch-up (o coração)
- [ ] `runDailyTick` vira **catch-up-aware**: computa `to = dueDayIndex(epochMs)` e `from = (readTickCursor ?? seasonStart − 1) + 1`; se `from > to` → nada a fazer (fora de janela / já em dia). Para cada `dayIndex D` em `[from..to]`, **em ordem**, `processDay(D)`:
  1. **Rodada do mundo de D** (reusa B): `targetRound = D − startDayIndex + 1`. `< 1` → `before_season` (dia sem rodada, liquidado trivialmente). Em `[1, roundsLength]` → `publishWorldRound` (atômico/idempotente; `modulate` = `moodModulator`). `> roundsLength` → **viragem** (`persistWorldTurnover`) → **re-lê `readWorld` + `readSeasonAnchor` + re-simula** para os dias seguintes do loop (o mundo e a âncora MUDAM); dispara `runRegenPass`. `deferred`/`locked` → **PARA o loop sem avançar o cursor além de D−1** (retenta no próximo tick — protocolo de falha).
  2. **Vacancy** de D (`runVacancyPass(worldDb, seed, D)`).
  3. **Passes por-humano de D** (reusa `runHumanPasses`, per-humano isolado): `accrue [só se a rodada de D foi paid]` · `tryInjure` (das `events` da rodada de D) · mood · `resolveDeadline(D−1)` · `generateForDay(D)` · `advanceRecovery(D)`. Idempotente via `daily_ledger`.
  4. Rodada de D liquidada ⇒ `advanceTickCursor(seed, D)`.
- [ ] **Simular por temporada, não por dia:** `simulateWorldSeason` gera TODAS as rodadas da temporada de uma vez → simula 1× por temporada e reusa `rounds[targetRound−1]` para cada dia daquela temporada; re-simula só ao cruzar uma viragem. (Eficiência + o `modulate` aplica o mood ATUAL — ver Riscos.)
- [ ] **Inicialização do cursor (1º tick):** ausente ⇒ `seasonStart − 1` (o 1º deploy faz backfill da temporada corrente desde a rodada 1 — o mundo "já devia" ter jogado esses dias). Documentado.

### D) Deploy — o artefato + o runbook (config/ops)
- [ ] **`services/scheduler/Dockerfile`** (multi-stage, vendor-agnóstico): build TS → runtime Node ≥20 slim → `CMD ["node", "dist/main.js"]`. `.dockerignore`.
- [ ] **`docs/ops/scheduler-deploy-runbook.md`** (pasta nova `docs/ops/`): a estratégia de scheduled job (default **Railway/Render cron**), a **cron expression** (`0,30 18-23 * * *` UTC = de meia em meia hora das 15h às 20h BRT — dispara várias vezes na janela para o same-day self-heal; o tick é idempotente), o modelo de **segredos** (`DATABASE_URL`/`WORLD_SEED` via env server-only, OP-12), e a nota de **reversibilidade** (o gatilho é swappable — GH Actions como smoke-test alternativo). Registra a decisão de plataforma para virar **ADR-002** na ratificação.
- [ ] **`.env.example`** (raiz ou service): documenta as vars sem valores (OP-02/12).

### E) Testes (puros sempre; ao vivo gated por `DATABASE_URL`)
Ver Critérios de aceitação. Foco: same-day recovery, multi-day catch-up (rodadas + passes por dia), cross-season (re-leitura pós-viragem), resumabilidade do cursor (crash no meio), idempotência (re-run = no-op), before-season skip, dia deferido PARA o cursor.

## Escopo — o que está FORA (fatias/cards futuros)

- **Scheduler interno always-on** (um processo Node com cron em memória) — faz sentido quando o servidor de API/auth existir e puder absorver o agendamento; hoje um scheduled job externo é mais barato (job 1×/dia não justifica uma máquina always-on).
- **Multi-seed** (config de vários mundos) — o `main.ts` lê um `WORLD_SEED`; particionar por seed é card futuro (o tick já recebe `seed`).
- **Reconciliação de passe humano com erro transitório** — o cursor rastreia a RODADA DO MUNDO (liveness: o mundo nunca trava por um humano quebrado). Um passe humano que LANÇA num dia recuperado é logado/isolado (idempotente via ledger) mas não é auto-retentado pelo cursor; a reconciliação (replayar dias sem claim no ledger a partir das rodadas duráveis) é o **card de auditoria** (mesmo território do débito de replay das SPEC-029/030). Ver Riscos.
- **Snapshot de mood por rodada** (o débito de replay da SPEC-029) — o catch-up aplica o mood ATUAL às rodadas replayadas (não há histórico por dia). Card de auditoria.
- **Webhook/alerta em falha** (Discord/e-mail) — decisão "só logs".
- **Executar o deploy de fato** (criar a conta Railway/Render, subir a imagem, semear os segredos) — **ação de ops do founder**; esta SPEC entrega o artefato + o runbook, não a infra provisionada.
- **Encaixe da Copa** no calendário — card próprio.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/world-engine/src/orchestration/anchor.ts` (+ barrel `index.ts`) | editar — `dueDayIndex` (puro, novo export). |
| `packages/world-engine/src/orchestration/anchor.test.ts` | editar — testes de `dueDayIndex` (hora <15 → ontem; ≥15 → hoje; borda meia-noite). |
| `services/world-store/src/migrations/0007_tick_progress.sql` (+ meta) | criar (OP-01) — `tick_progress`. |
| `services/world-store/src/schema/tick-progress.ts` | criar — schema Drizzle. |
| `services/world-store/src/store/tick-progress-repo.ts` | criar — `readTickCursor`/`advanceTickCursor`. |
| `services/world-store/src/store/daily-round.ts` | editar — extrair `publishRoundForDay(dayIndex, world, results, startDayIndex)` (núcleo por-dia; o caminho `epochMs` reusa). |
| `services/world-store/src/index.ts` | editar — exportar as peças novas. |
| `services/scheduler/src/daily-tick.ts` | editar — o loop de catch-up (`from..to`), `processDay`, re-leitura pós-viragem, cursor. |
| `services/scheduler/Dockerfile`, `.dockerignore` | criar. |
| `docs/ops/scheduler-deploy-runbook.md`, `.env.example` | criar. |
| `services/world-store/test/*`, `services/scheduler/test/daily-tick.test.ts` | criar/editar — os cenários de catch-up. |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 1.2 (o tick liga) + flip SPEC-031 → PR #34. |
| `specs/SPEC-032-*.md`, `specs/DONE-032-*.md` | criar. |

**Intocado (o critério DURO):** a **lógica** de `resolveSlot`/`simulateWorldSeason`/`resolveMatch`/`advanceWorld` e os **4 goldens** (`season`/`world`/`prng`/`anchor` — `git diff __fixtures__/` = 0; `dueDayIndex` é função NOVA, não altera vetor existente). O catch-up é 100% borda (`services/*`).

---

## Critérios de aceitação

1. **`dueDayIndex` (puro):** `hour < 15` → `dayIndex − 1`; `hour >= 15` → `dayIndex`; determinístico; borda da meia-noite correta. `anchor.golden.json` byte-idêntico. Testado puro.
2. **Same-day recovery:** a janela das 15h foi "perdida" (o tick não rodou às 15h) e roda às 16h do MESMO dia → a rodada do dia É publicada e os humanos SÃO pagos por esse dia; um 2º disparo no mesmo dia = no-op (idempotente). Ao vivo.
3. **Multi-day catch-up:** o cursor está em `D−3`; o tick roda no dia `D` → as rodadas de `D−2, D−1, D` são publicadas EM ORDEM (cada `published_round` presente) E os passes humanos de cada um dos 3 dias rodam (3 accruals no ledger, moral decai 3×, decisões geradas p/ os 3 dias). Ao vivo.
4. **Cross-season catch-up:** o intervalo de catch-up CRUZA o fim da temporada → as rodadas até `roundsLength` publicam, a viragem dispara (`season_rolled` + regen), e os dias SEGUINTES usam o mundo/âncora NOVOS (re-lidos). A ocupação humana sobrevive (imune). Ao vivo.
5. **Resumabilidade (crash no meio):** o catch-up processa `D−2` (cursor→`D−2`), "crasha" antes de `D−1` → o próximo tick retoma de `D−1` (não re-processa `D−2` além do idempotente; o cursor não retrocede). Ao vivo.
6. **Idempotência ponta-a-ponta:** rodar o tick 2× seguidas (mesmo `epochMs`) → o 2º é no-op total (`accrued=0`, cursor inalterado, nenhuma rodada/claim novos). Ao vivo.
7. **Before-season + dia deferido:** `targetRound < 1` → dia liquidado sem rodada (cursor avança, sem accrue); uma rodada que DEFERE (publish falha) → o cursor PARA em `D−1` (retenta no próximo tick), o loop não pula o buraco. Ao vivo.
8. **Deploy:** o `Dockerfile` builda (`docker build` verde em CI ou local) e `node dist/main.js` sobe, lê as env, e sai limpo; o runbook documenta a cron expression + os segredos + a reversibilidade.
9. **OPs & gates:** sem `any` (14); ≤50 linhas/função (15) — o `processDay`/loop decompostos; ≤300/arquivo (16); regra na borda, sem lógica de negócio nova no engine (17); segredos só-env (12); erros genéricos (11); `lint`/`typecheck`/`build`/`test`/prettier verdes; **a lógica do engine e os 4 goldens intocados** (`git diff` = 0).

---

## Segurança

- **Determinismo (money path):** o catch-up replaya `simulateWorldSeason(seed)` — byte-idêntico ao vivido; cada `publishWorldRound` é atômico (all-or-nothing) e idempotente. Replayar NUNCA corrompe (a PK barra o duplo).
- **OP-12/02:** `DATABASE_URL`/`WORLD_SEED` só via env server-only; `.env.example` sem valores; nada hardcoded; nenhum segredo no Dockerfile/runbook.
- **OP-11:** o tick loga status genérico (sem SQL/DSN/stack); o protocolo de falha (deferido) é a ausência da linha.
- **Liveness vs. correção:** o cursor rastreia a RODADA DO MUNDO ⇒ um humano quebrado não trava o mundo (o batimento continua); o passe humano é idempotente e reconciliável (card futuro) a partir das rodadas duráveis.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Mass-replay assustador no 1º deploy** | O cursor inicializa em `seasonStart − 1` (backfill só da temporada corrente, não da pré-história); documentado no runbook. |
| **Cross-season: usar o mundo velho após a viragem** | O loop **re-lê `readWorld`+âncora e re-simula** ao cruzar `roundsLength` (a viragem muda o mundo e a âncora). Testado (critério 4). |
| **Mundo trava por um humano quebrado** | O cursor rastreia a rodada do MUNDO (avança no settle da rodada), não o humano; o passe humano é isolado/idempotente (SPEC-030). Reconciliação = card de auditoria. |
| **Mood do replay ≠ mood do dia real** | Conhecido (débito de replay SPEC-029 — mood mutado in-place, sem histórico). O catch-up aplica o mood ATUAL; aceitável p/ downtime curto; snapshot por rodada = card de auditoria. |
| **Cron do vendor atrasa/dispara múltiplo** | Por design: dispara VÁRIAS vezes na janela (idempotência absorve); a janela é 15h–meia-noite BRT (elegibilidade larga) → tolera atraso. |
| **Colisão de `MatchResult` (engine vs economy)** | Já resolvido no scheduler (alias `MatchRecord`, SPEC-030/031). |

**Dependências:** SPEC-030 (`runDailyTick`/`daily_ledger`), SPEC-015 (`runDailyRound`/âncora), SPEC-021 (`persistWorldTurnover`/re-âncora), SPEC-029 (`moodModulator`), SPEC-031 (`events`/lesão). **Precede:** multi-seed; a reconciliação de auditoria; o encaixe da Copa.

---

## Notas de implementação

- **O alicerce é a idempotência já paga:** `published_round` (PK) + `daily_ledger` (SPEC-030) tornam replayar SEGURO. O catch-up é "avance um cursor, replaye os dias faltantes, cada passo já é no-op se repetido".
- **Cursor = RODADA DO MUNDO liquidada**, não "humano processado" — a escolha que mantém o mundo VIVO (liveness) sem sacrificar a correção humana (idempotente + reconciliável).
- **Decompor p/ OP-15/16:** `runDailyTick` = orquestra o loop; `processDay` = um dia (rodada + vacancy + humanos + cursor); helpers de world-round/human isolados. O `daily-round.ts` extrai o núcleo por-dayIndex.
- **Fecho do DONE:** "Estado atual" (SPEC-032 + flip SPEC-031 → PR #34) + `roadmap.md` (1.2 — o tick liga) + o ADR-002 (plataforma) na ratificação.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (deploy + catch-up completo; multi-seed / reconciliação / webhook / encaixe-da-Copa fora)
- [x] Arquivos listados corretos (verificados no repo, com linhas)
- [x] Mudança de schema COM migration (`0007_tick_progress`, OP-01)
- [x] Critérios testáveis (dueDayIndex puro, same-day, multi-day, cross-season, resumável, idempotente, before-season/deferido, Dockerfile)
- [x] Riscos avaliados (mass-replay, cross-season, world-halt, mood-replay, cron-atraso, colisão de nome)
- [x] Decisões co-desenhadas registradas (plataforma=container+scheduled job, catch-up=completo, obs=logs)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-032 — método H1VE. O mundo passa a jogar às 15h SOZINHO num relógio real, e o catch-up completo garante que ele NUNCA perde um dia: um worker em container disparado por um scheduled job da plataforma (a resposta de escala, reversível via a borda já desacoplada), com um cursor resumível que replaya as rodadas E os passes humanos de qualquer dia perdido — cada passo já idempotente por construção (published_round PK + daily_ledger). Engine e os 4 goldens intocados: o catch-up é 100% borda. O guardrail uptime-de-rodada-100% deixa de ser aspiração e vira código.*
