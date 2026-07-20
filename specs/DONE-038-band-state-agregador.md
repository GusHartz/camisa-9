# DONE-038 — `readBandState` + `GET /v1/band` (Faixa: a vida no CT — card 2 de 4)

> Registro de conclusão. Par obrigatório da SPEC-038. Nenhum PR é válido sem este DONE.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-038 / DONE-038 |
| **Feature** | `readBandState` + `GET /v1/band` — card 2 de 4 de "Faixa: a vida no CT" |
| **Slug** | band-state-agregador |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap** | **0.4 — baseline de segurança** (fecha o item, junto da SPEC-037 que o marcou 🚧) |
| **Concluída em** | 2026-07-20 |
| **Dependência DURA** | SPEC-037 (mergeada) — consome `createApiServer`/`requireAthlete`/`RouteCtx`/`respond`/`rate-limit` + a tabela `player.session` (migration `0010`) |

---

## O que foi entregue

O projeto ganhou **de onde a faixa lê**. A SPEC-037 entregou o primeiro servidor que escuta numa porta, mas ele só sabia autenticar; o estado do dia do atleta continuava espalhado por ~7 leituras in-process. Esta fatia entrega o agregador **`readBandState`** (monta o dia inteiro numa chamada — fase, as 2 barras, treino, casa, lesão, clube, elenco, decisões, fila) e a rota **`GET /v1/band`** que o serve, com o contrato `BandState` **congelado em `/v1`** sob política **aditiva-only**. De quebra, **adota o seam órfão da SPEC-023**: `markActive` nunca era chamado em produção — agora **a faixa aberta É o sinal de presença** que o congelamento de vaga sempre esperou.

**Camadas (tudo borda + leitura; engine e os 4 goldens INTOCADOS, `git diff` = 0):**
- **`packages/player` (puro, já entregue na fatia A/B/C):** `dayPhase(hour)`, `kitFromClubId(clubId)`, `daysUntilRevert(frozen, dia, limiar)`, `daysLeftOf(...)` — 3 módulos + 1 helper aditivos, nenhum tipo/função existente alterado.
- **`services/player-store`:** `appearance` no `readAthleteIdentity`; `countPendingDecisions(db, athleteId, day)`. **Sem migration.**
- **`services/world-store`:** `readClubBrief` (join `club⋈league`), `readClubSquad` (**tipo próprio com `isHuman`** — `rowToAthlete`/`types.ts` intocados, padrão-dispatch da SPEC-036), `readLeagueClubIds`, `readOccupationsByClub`, `targetRoundFor` extraído/exportado. **Sem migration.**
- **`services/api` (o coração):** `src/band/{types,band-state,from-player,from-world}.ts` — o **CONTRATO** + o agregador de **2 ondas** (explicitamente NÃO-atômico: dois handles, zero tx cross-schema, snapshot eventualmente-consistente); `src/routes/band.ts` (o handler `(ctx, athleteId, accountId)` via `requireAthlete`); wiring em `router.ts` (`createRoutes(deps)` + a entrada `GET /v1/band` + o balde de IP pré-auth estendido), `server.ts` (`ApiDeps extends RouteDeps` com `worldDb`/`worldSeed`), `main.ts` (2º pool world-store + `WORLD_SEED` obrigatória, falha-rápido + `pool.end()` dos dois), barrel, `package.json` (+dep `@camisa-9/world-store`).

**Autorização por CONSTRUÇÃO (a decisão central):** o `GET /v1/band` **não tem path param, query param nem body** — o `athleteId` vem SEMPRE de `readActiveAthlete(session.accountId)`. Nenhuma rota aceita identificador de ator ⇒ `sdd.md:84` satisfeito por construção, não por checagem que alguém pode esquecer. Provado ao vivo (token de A + `?athleteId=B` + `X-Athlete-Id:B` → sempre o estado de A) + grep-gate.

**Os TRÊS relógios (cravados por teste):** `phase` → `slot.hour` · `roundSettled` e `markActive` → `slot.dayIndex` (dia-calendário) · `readInjuryState`/`countPendingDecisions`/`club.round`/**o placar do `todayMatch`** → `tickDay = dueDayIndex(epochMs)`.

**`markActive` — presença, não sessão:** em `GET /v1/band` (não no login); dia = `slot.dayIndex` (senão congelaria quem abre a faixa de manhã); **throttle 1×/dia** no agregador (o `markActive` é UPDATE incondicional); **best-effort** (try/catch → um relógio de vacância que falha não devolve 500).

---

## Desvios da SPEC (mecanismo/drift, não de produto) — registrados

Um **mapa de seams** (workflow de 4 leitores paralelos) pegou vários **drifts de assinatura** da SPEC (as linhas/nomes tinham envelhecido), corrigidos na implementação:
1. **`RoundSlot` tem `hour`/`minute`, não `brtHour`/`brtMinute`** — o contrato expõe `brtHour`/`brtMinute` **mapeados de `slot.hour`/`slot.minute`**.
2. **`MatchResult` usa `homeGoals`/`awayGoals`** (não `goalsFor`/`goalsAgainst`) — `todayMatch` orienta o placar por mando.
3. **`createRoutes(db, extra)` → `createRoutes(deps)`** — decisão: `worldDb`/`worldSeed` **obrigatórios** no `ApiDeps` (via `RouteDeps`), fiéis ao tipo; as 3 chamadas de `createApiServer` no teste da SPEC-037 ganharam um handle de mundo (o `/v1/band` não é exercitado lá → sem migrar o schema do mundo).
4. **`readInjuryState` aninha em `.injury` e NÃO tem `phase`** — a fase vem da fn pura `injuryPhase`; nunca devolve `null`.
5. **`markActive` é UPDATE incondicional sem throttle interno** → o throttle 1×/dia vive no agregador.
6. **`hit` retorna `retryAfterSec` sempre** (não opcional); `rateLimited` NÃO está no barrel (import direto de `./http/respond.js`).
7. **`club.round`/`todayMatch` fora de temporada** nula com `totalRounds = 2*(leagueSize−1)` derivado do tamanho REAL da liga (a Pirâmide Elástica alarga além de 20).

---

## Revisão adversarial (workflow · 5 dimensões · cada achado verificado ceticamente)

**6 achados brutos → 5 confirmados, 1 refutado.** O núcleo (contrato, autorização, degradados, os 3 relógios de player/mundo) voltou sólido; os achados estavam concentrados num ponto:

- **1 MAJOR real, cross-confirmado por 2 dimensões independentes e CORRIGIDO** — **o gate do placar do `todayMatch` usava o relógio errado.** O placar era gateado por `roundSettled` (espaço `slot.dayIndex` = a rodada de HOJE), mas a rodada MOSTRADA é `round(tickDay)`. De manhã (hora < 15) os dois relógios divergem: a rodada de ONTEM (= tickDay) **já está publicada**, mas `roundSettled` (dia-calendário) é `false` → o jogo de ontem aparecia **`played:false`, placar `null` por ~15h todo dia** — justamente na cena de CT (manhã) cujo design é "os pontos/resultado de ontem". **Fix:** separar o gate — `serverTime.roundSettled` segue em `slot.dayIndex`; o placar do `todayMatch` gateia em `cursor >= tickDay` (a rodada MOSTRADA liquidou). **+ teste de regressão** (09h de D+1 com a rodada de D publicada → `played:true` com o placar real; antes do fix vinha `null`).
- **1 MINOR (rate-limit) CORRIGIDO** — o balde de IP pré-auth (10/min) era **compartilhado** entre `/v1/auth/*` e `/v1/band` sob a MESMA chave `ip:` → um flood de login consumiria o budget da faixa. **Fix:** baldes **separados por prefixo** (`ip:auth:` vs `ip:band:`), mesmo teto (10). ⚠️ Registrado: o balde de IP é por-IP (num NAT, contas no mesmo IP dividem os 10/min — teto coarse); o controle fino por-conta é o balde `accountId` (30/min) no handler.
- **2 MINOR (rigor de teste) CORRIGIDOS** — cross-check de `isHuman` fortalecido para **igualdade de conjunto** (humanos do elenco == ocupações; os 15 restantes NPC); **`athlete.age` agora asserido** (== o membro `isMe` do elenco == 17, SPEC-022).
- **1 REFUTADO** — sem detalhe acionável.

---

## Gates de qualidade

- **581 testes** (558 preservados + **23 novos**: 15 do agregador `band-state.test.ts` + 8 da rota `server-band.test.ts`), **rodados ao vivo contra Postgres real** (porta 5434).
- **typecheck** (`tsc -b` + typecheck.json) · **eslint** (OP-14/15/16 — `readBandState` refatorado p/ ≤50 linhas via `resolveWorldSlice`) · **build** · **prettier** verdes.
- **`packages/world-engine` e os 4 goldens INTOCADOS** (`git diff` = 0, incl. `world-expansion.golden.json`). **SEM MIGRATION** (todo campo novo sai de coluna existente, reader estreito ou fn pura).
- **grep-gates:** `src/band/**` não importa `readWorld`/`readWorldOccupations`/`readClubRoster` nem `node:http`; zero lock de sessão/`LISTEN`/`NOTIFY`/`SET SESSION` (só xact-scoped, ADR-002); **≤ 28 round-trips** por request (contador que envolve `pool.connect` e conta cada `client.query` — o `pool.query` do pg roteia por `connect`).
- **Bug de teste da fatia C corrigido de passagem:** `band-readers.test.ts` passava strings livres onde `world_occupation.human_athlete_id` é `uuid` (falha `22P02` engolida pelo catch-all do occupy) → UUIDs válidos; o `zzz-diag.test.ts` (diagnóstico temporário) **removido**.

## Patches de docs de fundação aplicados

**P1** (vision-scope: faixa em 3 alturas 64/88/110) · **P2/P3** (functional-spec/sdd: gate de screenshot na altura cena + par compacta/normal) · **P4** (sdd: avatar do atleta = camadas, nunca o mascote) · **P7** (functional-spec: `[SUPOSIÇÃO]` → RESOLVIDO — a sessão CARIMBA atividade; a vaga é do motor) · **P10** (roadmap 2.1: sinal de atividade ✅ SPEC-038) · **P11** (roadmap 3.4/3.7: dependência 3.4→0.4 + server-first) · **P12** (functional-spec: as 3 cenas são faixas horárias, não 1:1 nos beats — o jogo das 15h vive em `casa`).

---

## Escopo deferido / follow-ups (nomeados)

- **Escritas de gameplay** = card 3 (traz o `trainedToday` via escopo `'train'` no `daily_ledger`, sem migration).
- **Cliente WPF, 3 alturas, arte, avatar em camadas** = card 4.
- ⚠️ **O NÚMERO DA CAMISA** = **card próprio a CRIAR** (coluna + migration + range 1-99 + unicidade no elenco + payload de criação) — **dependência DURA antes do card 4**; entra aditivamente (`athlete.shirtNumber` fora do v1).
- ⚠️ **DEVOLUTIVA AO DESIGNER** — os relógios dos mockups 01/02 (CT 14:38 ❌ = deveria ser manhã; CASA 21:07 erra por 7min) + **a causa raiz: o `readme` do design system afirma cadência Ter/Qui/Sáb, falsa desde o R4 FINAL** (sem corrigir, os próximos mockups nascem com o mesmo drift). **A arte está certa e é aproveitável inteira** — o defeito é só a hora.
- Deferidos e nomeados: `forma`/`moral` dos colegas; classificação da liga (nenhum reader dá standings sem `readWorld`); "estou escalado hoje?" (o elenco de 16 nunca é escalado — partida rica); `statement_timeout` por request na viragem (`SET LOCAL` = card próprio); `minClientVersion`; a dívida de i18n do `decisions.ts`; **snapshot de mood por rodada** (auditoria, herdado da SPEC-029).

---

## AI declaration

Implementação conduzida por agente de IA (Claude Code / Opus 4.8) em par com o dev (gustavo-hartz), com: mapa de seams por workflow paralelo (4 leitores), implementação sequencial revisada arquivo-a-arquivo, suíte ao vivo contra Postgres real, e **revisão adversarial por workflow (5 dimensões, cada achado verificado ceticamente)** que pegou 1 MAJOR real (o gate de relógio do `todayMatch`) + 3 MINOR, todos corrigidos e cravados por teste. **Não houve revisão humana linha-a-linha do código** antes deste DONE — o rigor veio dos gates automatizados (typecheck/eslint/581 testes ao vivo/grep-gates/selo de goldens) e da revisão adversarial. Os desvios de assinatura (drift da SPEC) e as correções ao texto da SPEC estão registrados acima.

---

*DONE-038 — método H1VE. O card 2 de 4 de "Faixa: a vida no CT": o agregador que monta o dia inteiro do atleta numa chamada só, e a rota que o serve. Autorização por CONSTRUÇÃO, contrato congelado em `/v1` (aditivo-only), `markActive` adotado. SEM MIGRATION. Engine e os 4 goldens INTOCADOS.*
