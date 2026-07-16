# DONE-015 — Rodadas diárias (1.2): âncora diária + orquestrador de tick + rodada-do-mundo atômica

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-015 |
| **SPEC correspondente** | SPEC-015-rodada-diaria-orquestrador.md |
| **Feature** | Rodadas diárias (roadmap 1.2) — primeira fatia |
| **Card (board)** | `7c8c8451-e4fc-4a14-b2c2-c8c0bf7e3ccf` |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/rodadas-ter-qui-sab-15h` *(rótulo = cadência revogada; ver drift-check da SPEC)* |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado/concluído** | 2026-07-16 |
| **Dias utilizados vs appetite** | ~½ dia vs 1 a 2 dias |

---

## Resumo do que foi feito

**O primeiro batimento cardíaco do mundo.** As três peças da 0.2/engine agora se **compõem** num loop vivo: dado um `epochMs` **injetado**, o orquestrador publica a **rodada do dia de TODAS as ligas** numa **transação atômica de nível-mundo**, reusando o engine **puro e intocado** (`readWorld` + `simulateWorldSeason` — zero simulação nova, OP-17) e a mecânica transacional da Fatia 2.

- **Âncora diária (engine puro):** `anchor.ts` — `MATCH_DAYS` removido; `isMatchWindow = hour === MATCH_HOUR` (15h **todo dia**, 7/7). Alinha o código à cadência **R4 FINAL** ratificada (invertendo a antiga ter/qui/sáb — o rótulo do card). `dayOfWeek` continua exposto no `RoundSlot`. Mudança **pura** (não toca o stream do PRNG).
- **Golden aditivo:** `anchor.golden.json` regenerado por `harness/regen-anchor-golden.ts` (borda impura, com **oráculo independente** que aborta em divergência) — os **9 vetores originais byte-idênticos** + **4 novos** (dom/seg/qua/sex 15h → `isMatchWindow: true`; sob a regra antiga seriam `false`). `git diff` dos goldens = **só** `anchor.golden.json`.
- **Âncora de temporada (dados):** tabela `season(world_seed, season_id, start_day_index)` (migration aditiva `0002`, OP-01) — guarda o `dayIndex` do round 1, que o snapshot **não** tem; **input de ops** (`setSeasonAnchor`/`readSeasonAnchor`), não derivável da seed. Destrava o **Model B** (calendar-derived): `targetRound = dayIndex − start_day_index + 1`.
- **Rodada-do-mundo atômica (decisão do founder #1 — grão-MUNDO):** `publishWorldRound(db, input, onBeforeCommit?)` — **uma transação** com advisory lock world-day (`world:${seasonId}:${round}`, namespace distinto do por-liga), **INSERT multi-linha** da rodada N de todas as ligas, idempotente por `(season_id, round)`. Cumpre o charter à letra: *"nunca rodada meio-publicada — a linha do tempo do mundo é all-or-nothing."* `publishRound` (por-liga) da Fatia 2 **permanece** como primitivo.
- **Orquestrador de tick (impuro):** `runDailyRound(db, seed, epochMs)` → `DailyRoundReport`. Guarda de janela (`fora_de_janela`) → `readWorld` (`sem_mundo`) → `readSeasonAnchor` (`sem_ancora`) → boundary (`before_season` / `season_complete` **sem viragem** — seam limpo p/ Fatia 3) → publica. **Protocolo de falha (decisão do founder #2 — derivar):** publish que estoura → tx reverte → `status: 'deferred'` + log server-side **genérico** (OP-11); "deferido" = **ausência da linha**, zero estado novo.

**Verificação (contra Postgres real via Docker):** `typecheck` ✅ · `eslint` ✅ (OP-14/15/16) · **`test` 115/115 ✅** (89 do engine intactos + 2 round-trip + 10 publish + **14 novos** do tick) · `build` ✅ · prettier LF-clean ✅. Sem `DATABASE_URL`: **89 ✅ / 26 skip** — inner loop sem Docker segue verde. **Nenhum golden além de `anchor.golden.json`** (`season`/`prng`/`world` diff = 0).

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `harness/regen-anchor-golden.ts` | Regen determinística do golden da âncora com oráculo independente (aborta em divergência). |
| `services/world-store/src/schema/season.ts` | Tabela `season` (âncora de temporada) — PK `(world_seed, season_id)`, FK → `world.seed`. |
| `services/world-store/src/migrations/0002_season_anchor.sql` | Migration aditiva (só `season`) + `meta/0002_snapshot.json`. |
| `services/world-store/src/store/season-repo.ts` | `setSeasonAnchor` (upsert) + `readSeasonAnchor`. |
| `services/world-store/src/store/daily-round.ts` | `runDailyRound` + helpers (`publishTarget`/`toWorldRoundInput`/`report`) + `DailyRoundReport`/`DailyRoundStatus`. |
| `services/world-store/test/daily-round.test.ts` | 14 property tests ao vivo (gated por `DATABASE_URL`). |
| `specs/SPEC-015-*.md`, `specs/DONE-015-*.md` | SPEC (aprovada no card) + este documento. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `packages/world-engine/src/orchestration/anchor.ts` | `MATCH_DAYS` removido; `isMatchWindow = hour===15` (diário 7/7). |
| `packages/world-engine/src/orchestration/anchor.test.ts` | `it` de janela → **iff diário** (janela ⇔ `hour===15`, dia irrelevante). |
| `packages/world-engine/src/__fixtures__/anchor.golden.json` | Regen **aditiva**: 9 idênticos + 4 novos. |
| `services/world-store/src/schema/index.ts` | `export * from './season.js'`. |
| `services/world-store/src/store/round-repo.ts` | `+publishWorldRound` (1 tx world-day) + `WorldRoundInput` + helper. |
| `services/world-store/src/index.ts` | Exporta `publishWorldRound`/`WorldRoundInput`/`setSeasonAnchor`/`readSeasonAnchor`/`runDailyRound`/`DailyRoundReport`/`DailyRoundStatus`. |
| `services/world-store/drizzle.config.ts` | `schema` cobre `season.ts`. |
| `services/world-store/test/round-trip.test.ts` | `beforeEach` apaga `season` antes de `world` (FK nova). |
| `vitest.config.ts` | `fileParallelism: false` — testes de integração compartilham 1 Postgres (ver desvios). |
| `services/world-store/src/migrations/meta/_journal.json` | Entrada da migration `0002` (gerado pelo drizzle-kit). |
| `CLAUDE.md`, `docs/projeto/roadmap.md` | "Estado atual" + 1.2 primeira fatia ✅. |

**Intocado:** `simulateSeason`/`resolveMatch`/`advanceWorld`/PRNG; `season`/`prng`/`world.golden.json` (diff = 0); migrations `0000`/`0001`.

---

## Mudanças de schema aplicadas

Migration **aditiva** `0002_season_anchor.sql` (OP-01), gerada por `drizzle-kit generate` e revisada: `CREATE TABLE season` com PK `(world_seed, season_id)` e FK `world_seed → world.seed`. Não toca `0000`/`0001`. Aplicar do zero (`0000`+`0001`+`0002`) num DB limpo reproduz o schema (provado local + no CI).

## Mudanças de API entregues

`@camisa-9/world-store` ganha `publishWorldRound` + `WorldRoundInput`, `setSeasonAnchor`/`readSeasonAnchor`, e `runDailyRound` + `DailyRoundReport`/`DailyRoundStatus`. API pública do `world-engine` **inalterada** (só o valor de `isMatchWindow` mudou — mesmo contrato).

---

## Critérios de aceitação — verificação

| Critério (SPEC-015) | Status | Evidência |
|---|---|---|
| 1 — Isolamento de golden (só `anchor.golden.json`) | ✅ | `git diff --stat` dos `*.golden.json` = só `anchor.golden.json` (44 inserções, 0 remoções); `season`/`prng`/`world` = 0. |
| 2 — Golden aditivo (9 idênticos + 4 novos; oráculo concorda) | ✅ | `regen-anchor-golden.ts`: 13 vetores / 8 janelas; oráculo independente (via `new Date` no harness) não divergiu. |
| 3 — Âncora verde (janela ⇔ `hour===15`) | ✅ | `anchor.test.ts` 5/5; "14:59 sábado" segue `false`; negativos + TZ-independência intactos. |
| 4 — Publicação do dia atômica de mundo (published, 4 ligas, byte-exato) | ✅ | Teste "publica a rodada do dia de TODAS as ligas" (`leagueCount===4`) + reconciliação por liga. |
| 5 — Determinismo ponta a ponta (4×38 rodadas = engine) | ✅ | Teste "38 dias → 4×38 rodadas byte-idênticas": `count===152`; toda rodada de toda liga `toEqual` a temporada pura. |
| 6 — Idempotência (mesmo dia 2× → idempotent, count inalterado) | ✅ | Teste de idempotência: 2ª execução `idempotent`, 4 linhas. |
| 7 — All-or-nothing (falha → nada publicado, deferred; retry publica) | ✅ | (a) `publishWorldRound` + seam que estoura → 0 linhas; (b) CHECK temporária força o INSERT a estourar dentro do tick → `deferred`, 0 linhas, e o retry publica as 4. |
| 8 — Boundary (dia 39 → `season_complete`, sem viragem) | ✅ | Teste de boundary: `season_complete`, `targetRound===39`, 0 linhas (nenhum `advanceWorld`). `before_season` no dia < âncora. |
| 9 — Guarda de janela (fora das 15h → `fora_de_janela`) | ✅ | Teste de guarda: `fora_de_janela`, `complete:false`, 0 linhas. |
| 10 — OPs & gates | ✅ | `eslint` verde (OP-14/15/16); erros genéricos (OP-11); migration `0002` (OP-01); engine sem simulação nova (OP-17); `lint`/`typecheck`/`build`/`test` verdes; 89 do engine intactos. |

---

## Como testar manualmente

```
POSTGRES_PORT=5434 docker compose -f services/world-store/docker-compose.yml up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5434/camisa9_dev
npm run db:migrate -w services/world-store      # aplica 0000 + 0001 + 0002
npm run lint && npm run typecheck && npm test && npm run build   # 115/115 (14 do tick ao vivo)
# Sem Docker: unset DATABASE_URL → 89 pass / 26 skip.
```

**Dados de teste necessários:** nenhum — seed `"decada"` + `start_day_index` injetado são determinísticos.

---

## Testes automatizados

**14 testes novos** em `services/world-store/test/daily-round.test.ts` (gated por `DATABASE_URL`): guarda de janela · `sem_mundo` · `sem_ancora` · publicação atômica de mundo (4 ligas) · mapa calendário→rodada · `before_season` · `season_complete` (sem viragem) · idempotência · `locked` (advisory lock por outra sessão) · concorrência (2 ticks → 1 publica, 4 linhas) · reconciliação por liga · atomicidade de seam · **protocolo de falha (`deferred` + retry)** · determinismo de 38 dias (4×38 = engine). Total do repo: **115** (89 do engine preservados). CI roda os 14 ao vivo contra `postgres:16`.

**Comando:** `npm run lint && npm run typecheck && npm test && npm run build`

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `packages/world-engine/src/orchestration/anchor.ts` + `anchor.test.ts` | ~100% | Sim — flip p/ diário conferido; golden verificado aditivo (nenhum flip dos 9). |
| `harness/regen-anchor-golden.ts` | ~100% | Sim — oráculo independente (via `new Date`) confirmado divergir-e-abortar. |
| `services/world-store/src/schema/season.ts` + migration `0002` | ~100% (kit, revisado) | Sim — PK/FK conferidos; só `season`; `0000`/`0001` intocadas. |
| `services/world-store/src/store/season-repo.ts` + `round-repo.ts` (`publishWorldRound`) | ~100% | Sim — 1 tx world-day / lock / idempotência `(season,round)` conferidos contra a Fatia 2. |
| `services/world-store/src/store/daily-round.ts` | ~100% | Sim — fluxo/boundary/protocolo-de-falha conferidos contra a SPEC; erros genéricos (OP-11). |
| `test/daily-round.test.ts`, `test/round-trip.test.ts`, `vitest.config.ts`, wiring + `SPEC/DONE-015`, `CLAUDE.md`, `roadmap.md` | ~100% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC original?**
- [x] Sim — **dois ajustes de mecanismo de teste** (não de comportamento de produto), forçados pela evolução do schema. Ver "Desvios".

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **`vitest.config.ts` — `fileParallelism: false`** | Serializei os arquivos de teste do repo. | Os testes de `services/*` são de **integração contra UM Postgres compartilhado** e truncam tabelas comuns (`world`, `published_round`) **sem filtro**. Ao adicionar a suíte do tick (que toca `world` **e** `published_round` **e** `season`), rodar em paralelo faria uma suíte apagar as linhas da outra no meio do teste (flaky). Serial = determinístico; custo ~1s (testes puros do engine são milissegundos). **Sem** mudança de produto. |
| **`round-trip.test.ts` — apagar `season` antes de `world`** | Adicionei `delete(season)` no `beforeEach`. | A nova tabela `season` referencia `world.seed` por **FK**; a limpeza pré-existente de `round-trip` (que apaga `world`) passaria a violar a FK enquanto houver linha em `season`. Ajuste de ordem de limpeza forçado pelo schema novo; nenhum comportamento de produto muda. |
| **`world-store` segue typecheck-only** | Não virou composite/buildable (nota da memória "Fatia 2+ → converter"). | Ainda **sem consumidor runtime externo** — só os testes consomem (via alias→src). Converter quando isso surgir (dívida registrada permanece). |

**Protocolo de conflito (parar+registrar):** não acionado — a mudança de âncora ter/qui/sáb→diária **reconcilia** o código com o R4 FINAL ratificado (documentado no drift-check da SPEC, aprovado pelo founder); os desvios acima são de **mecanismo de teste**, não de escopo/OP.

---

## Limitações conhecidas

- **Snapshot imutável dentro da temporada** é invariante cravado: o tick **re-simula** a temporada do snapshot a cada dia e fatia `rounds[N−1]`. v1 é 100% NPC congelado (ok). Substituição humano↔NPC tornaria o snapshot mutável → exigirá **congelar o plano da temporada** no início (fatia futura).
- **Dia adiado = buraco na timeline** (Model B) a menos que ops **re-ancore** (`setSeasonAnchor` deliberado). "Perder a rodada vs empurrar o calendário" é ação de ops **explícita**, nunca automação silenciosa aqui.
- **Sem tabela durável de adiamento** (decisão do founder #2): "deferido" é derivado da ausência da linha + report. Ledger replayable é da **0.3** (quando houver consumidor: retry-worker/UI de reparação).
- **Quem lê o relógio** (o scheduler de produção que chama `runDailyRound` uma vez/dia) é deploy — o tick é 100% invocável/testável por injeção de `epochMs`.
- **Encaixe da Copa** no calendário diário → fatia dedicada de 1.2.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| `world-store` typecheck-only (sem `dist`) | Baixo — tipos cobertos; roda via tsx/vitest. | Ao surgir consumidor runtime externo: virar composite. |
| Congelar plano da temporada (pré-condição de humano↔NPC) | Médio — hoje mitigado pela imutabilidade NPC. | Fatia de substituição humano↔NPC. |
| Scheduler de produção (cron/worker → `runDailyRound`) | — | Deploy da 1.2 / infra. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (10/10)
- [x] Testes passando (115/115 ao vivo; 89/26-skip sem DB)
- [x] Typecheck limpo
- [x] Lint limpo (`eslint` ✅; prettier LF-normalizado ✅ — CRLF local é gotcha)
- [x] Nenhum log de debug / `any` / segredo hardcoded (log de deferimento é genérico — OP-11)
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` "Estado atual" atualizado (SPEC-015)
- [x] Este DONE está completo e commitado na branch *(commit no fluxo do PR)*

---

*DONE-015 — método H1VE. Primeira fatia de 1.2: o primeiro batimento cardíaco do mundo. Alinha a âncora à cadência diária ratificada (R4 FINAL) e compõe engine puro + store transacional num tick que publica a rodada-do-mundo numa transação atômica (charter: a linha do tempo do mundo é all-or-nothing). Viragem e Copa são fatias seguintes; o seam `season_complete` já as isola.*
