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
| **Branch** | `feat/gustavo-hartz/rodadas-ter-qui-sab-15h` *(rótulo = cadência REVOGADA; o escopo é o diário 7/7 — ver drift-check da SPEC)* |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado/concluído** | 2026-07-16 |
| **Dias utilizados vs appetite** | ~½ dia vs 1 a 2 dias |

---

## Resumo do que foi feito

**O primeiro batimento cardíaco do mundo.** Compus as peças da Fatia 1 (`readWorld`) e da Fatia 2 (`publishRound`) no primeiro loop vivo: um **orquestrador de tick diário** que, dado um `epochMs` **injetado**, publica a **rodada do dia de TODAS as ligas** numa **única transação de nível-mundo** (all-or-nothing, à letra do charter), reusando o engine **puro e intocado** (OP-17). Alinhei a âncora de fuso à cadência **diária 7/7** ratificada (R4 FINAL) e implementei o **protocolo de rodada falha** ("adiar com transparência > publicar errado"), parando **limpo** no fim da temporada (`season_complete`, **sem** viragem — seam para a Fatia 3).

- **Âncora diária (engine puro):** `anchor.ts` perdeu `MATCH_DAYS` — `isMatchWindow = hour === 15` (15h **todo dia**). `dayOfWeek` segue exposto no `RoundSlot`. `anchor.golden.json` **regen aditiva**: os 9 vetores originais **byte-idênticos** + **4 novos** (dom/seg/qua/sex 15h → `isMatchWindow: true`; sob a regra antiga seriam `false`). `harness/regen-anchor-golden.ts` reproduz o arquivo com **oráculo independente** (aborta se divergir).
- **Âncora de temporada (dados):** tabela `season(world_seed, season_id, start_day_index)` (migration aditiva `0002`, OP-01) — o `start_day_index` é o `dayIndex` do round 1, **input de ops** (não derivável da seed), que destrava o mapa **calendário→rodada** (`targetRound = dayIndex - start_day_index + 1`). `setSeasonAnchor`/`readSeasonAnchor`.
- **Rodada-do-mundo atômica (decisão do founder #1):** `publishWorldRound` — **uma** transação com advisory lock **world-day** (`world:${seasonId}:${round}`, namespace distinto do lock por-liga), **um INSERT multi-linha** de todas as ligas, idempotência por `(season_id, round)`. Falha (sync/async) → **ROLLBACK total** (nenhuma liga publicada). `publishRound` por-liga (Fatia 2) **permanece** como primitivo.
- **Orquestrador (impuro):** `runDailyRound(db, seed, epochMs)` → `resolveSlot` (guarda `fora_de_janela`) → `readWorld` (`sem_mundo`) → `readSeasonAnchor` (`sem_ancora`) → `targetRound` → guardas de boundary (`before_season`/`season_complete`) → `simulateWorldSeason` → `publishWorldRound` → `DailyRoundReport`. **Protocolo de falha (decisão do founder #2):** publish que estoura → `deferred` (derivado da **ausência** da linha) + log server-side **genérico** (OP-11), zero estado novo.

**Verificação (contra Postgres real via Docker):** `typecheck` ✅ · `eslint` ✅ (OP-14/15/16 + guardrail de determinismo) · `build` ✅ · **`test` 115/115 ✅** (101 anteriores intactos + 14 novos ao vivo). Sem `DATABASE_URL`: **89 ✅ / 26 skip** — inner loop sem Docker segue verde. **Isolamento de golden:** `git diff` dos `*.golden.json` lista **só** `anchor.golden.json` (+44 aditivas); `season`/`prng`/`world.golden` diff = 0.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `harness/regen-anchor-golden.ts` | Regen determinística do `anchor.golden.json` com **oráculo independente** (borda impura; `Date`/`fs` permitidos fora de `packages/*/src`). |
| `services/world-store/src/schema/season.ts` | Tabela `season` (âncora de temporada; PK `(world_seed, season_id)`, FK `world_seed → world.seed`). |
| `services/world-store/src/store/season-repo.ts` | `setSeasonAnchor` (upsert) + `readSeasonAnchor`. |
| `services/world-store/src/store/daily-round.ts` | `runDailyRound` + helpers + `DailyRoundReport`/`DailyRoundStatus`. |
| `services/world-store/src/migrations/0002_season_anchor.sql` | Migration aditiva (só `season`) + `meta/0002_snapshot.json`. |
| `services/world-store/test/daily-round.test.ts` | 14 cenários ao vivo contra Postgres real (gated por `DATABASE_URL`). |
| `specs/SPEC-015-*.md`, `specs/DONE-015-*.md` | SPEC (aprovada no card) + este documento. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `packages/world-engine/src/orchestration/anchor.ts` | Remove `MATCH_DAYS`; `isMatchWindow = hour === 15` (diário 7/7). Mudança **pura**. |
| `packages/world-engine/src/orchestration/anchor.test.ts` | `it` de janela → **iff diário** (janela ⇔ `hour===15`, dia irrelevante). |
| `packages/world-engine/src/__fixtures__/anchor.golden.json` | Regen **aditiva**: 9 idênticos + 4 novos (+44 linhas, 0 remoções). |
| `services/world-store/src/schema/index.ts` | `export * from './season.js'`. |
| `services/world-store/src/store/round-repo.ts` | `+publishWorldRound` (1 tx world-day, INSERT multi-linha) + `WorldRoundInput` + helper. |
| `services/world-store/src/index.ts` | Exporta `publishWorldRound`/`WorldRoundInput`/`setSeasonAnchor`/`readSeasonAnchor`/`runDailyRound`/`DailyRoundReport`/`DailyRoundStatus`. |
| `services/world-store/drizzle.config.ts` | `schema` cobre também `season.ts` (o kit lê os arquivos explicitamente, não o barrel). |
| `services/world-store/src/migrations/meta/_journal.json` | Entrada da migration `0002` (gerado pelo drizzle-kit). |
| `services/world-store/test/round-trip.test.ts` | `beforeEach` apaga `season` **antes** de `world` (ripple da nova FK). |
| `vitest.config.ts` | `fileParallelism: false` (suítes de integração compartilham UM Postgres e truncam tabelas comuns — ver Desvios). |
| `CLAUDE.md` | "Estado atual": SPEC-015 / 1.2 primeira fatia. |
| `docs/projeto/roadmap.md` | 1.2 🚧 com a primeira fatia ✅. |

**Intocado:** `simulateSeason`/`resolveMatch`/`advanceWorld`/PRNG do engine; migrations `0000`/`0001`; `season`/`prng`/`world.golden.json` (diff = 0).

---

## Mudanças de schema aplicadas

Migration **aditiva** `0002_season_anchor.sql` (OP-01), gerada por `drizzle-kit generate` e revisada: `CREATE TABLE season` com PK composta `(world_seed, season_id)`, `start_day_index integer NOT NULL`, FK `world_seed → world.seed`. Não toca `0000`/`0001`. Aplicar do zero (`0000`+`0001`+`0002`) num DB limpo reproduz o schema (provado local + a rodar no CI via `postgres:16`).

## Mudanças de API entregues

`@camisa-9/world-store` ganha `runDailyRound`/`DailyRoundReport`/`DailyRoundStatus` (orquestrador), `publishWorldRound`/`WorldRoundInput` (publicador grão-mundo) e `setSeasonAnchor`/`readSeasonAnchor` (âncora). API pública do `world-engine` **inalterada** exceto a semântica de `isMatchWindow` (agora 7/7) — assinatura de `resolveSlot`/`RoundSlot` idêntica.

---

## Critérios de aceitação — verificação

| Critério (SPEC-015) | Status | Evidência |
|---|---|---|
| 1 — Isolamento de golden (só `anchor.golden.json`) | ✅ | `git diff --stat` dos fixtures: só `anchor.golden.json` (+44); `season`/`prng`/`world.golden` diff = 0. |
| 2 — Golden aditivo (9 idênticos + 4 novos; oráculo concorda) | ✅ | Regen por `harness/regen-anchor-golden.ts` (oráculo independente aborta em divergência); 13 vetores / 8 janelas. |
| 3 — Âncora verde (janela ⇔ `hour===15`; "14:59" false; TZ-indep.) | ✅ | `anchor.test.ts` 5/5; iff diário + negativos + independência de fuso intactos. |
| 4 — Publicação do dia atômica de mundo (todas as ligas, 1 tx) | ✅ | Teste "publica a rodada do dia de TODAS as ligas" (`published`, `complete`, `leagueCount===4`, 4 linhas) + reconciliação por rodada. |
| 5 — Determinismo ponta-a-ponta (38 dias → 4×38 = tabela do engine) | ✅ | Teste "38 dias → 4×38 rodadas byte-idênticas": toda rodada de toda liga `toEqual` `simulateWorldSeason(...).rounds[N-1]` (a tabela deriva das rodadas). |
| 6 — Idempotência (mesmo `epochMs` 2× → 2ª `idempotent`) | ✅ | Teste de idempotência: 2ª execução `idempotent`, `count` inalterado (4). |
| 7 — Atomicidade all-or-nothing + retry | ✅ | (a) seam `onBeforeCommit` lança → `publishWorldRound` ROLLBACK, `count===0`; (b) CHECK temporária força o publish a estourar → `runDailyRound` retorna `deferred`, `count===0`, e o **retry publica o dia inteiro**. |
| 8 — Boundary `season_complete` sem viragem | ✅ | Dia 39 → `season_complete`, `targetRound===39`, `count===0`; `advanceWorld` **não** chamado. |
| 9 — Guarda de janela | ✅ | `epochMs` às 10h → `fora_de_janela`, nada publicado. |
| 10 — OPs & gates | ✅ | `eslint` verde (OP-14/15/16); `daily-round.ts`/`round-repo.ts` decompostos; erros genéricos sem SQL/DSN/stack (OP-11); migration `0002` versionada (OP-01); zero simulação nova no engine (OP-17); `lint`/`typecheck`/`build`/`test` verdes; 89 testes do engine intactos (fora a âncora). |

---

## Como testar manualmente

```
POSTGRES_PORT=5434 docker compose -f services/world-store/docker-compose.yml up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5434/camisa9_dev
npm run db:migrate -w services/world-store          # aplica 0000 + 0001 + 0002
npm run lint && npm run typecheck && npm test && npm run build   # 115/115 (14 do tick ao vivo)
# Sem Docker: unset DATABASE_URL → 89 pass / 26 skip.
```

**Dados de teste necessários:** nenhum — seed `"decada"` (mundo de 4 divisões × 20 clubes) + `start_day_index` arbitrário são determinísticos.

---

## Testes automatizados

**14 testes novos** em `services/world-store/test/daily-round.test.ts` (gated por `DATABASE_URL`): guarda de janela, `sem_mundo`, `sem_ancora`, publicação atômica de mundo (4 ligas), mapa calendário→rodada, `before_season`, `season_complete` (sem viragem), idempotência, `locked` (lock segurado em 2ª conexão — determinístico), concorrência (2 ticks → 1 publica, 4 linhas), reconciliação grão-mundo, atomicidade do seam, `deferred` + retry, determinismo de 38 dias (4×38 byte-idêntico ao engine). Total do repo: **115** (101 preservados). CI roda os 14 ao vivo contra `postgres:16`.

**Comando:** `npm run lint && npm run typecheck && npm test && npm run build`

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `packages/world-engine/src/orchestration/anchor.ts` + `anchor.test.ts` | ~100% | Sim — flip diário conferido; golden regen aditiva provada vetor a vetor. |
| `harness/regen-anchor-golden.ts` | ~100% | Sim — oráculo independente (outra via de cálculo) que aborta em divergência. |
| `services/world-store/src/schema/season.ts` + `store/season-repo.ts` | ~100% | Sim — PK/FK e upsert conferidos; migration aditiva revisada. |
| `services/world-store/src/store/round-repo.ts` (`publishWorldRound`) | ~100% | Sim — grão-mundo (1 lock world-day + INSERT multi-linha + seam) conferido contra o `publishRound` por-liga. |
| `services/world-store/src/store/daily-round.ts` | ~100% | Sim — fluxo/guardas/protocolo de falha conferidos contra a SPEC; OP-11/15/16. |
| `services/world-store/test/daily-round.test.ts` | ~100% | Sim — 14 cenários ao vivo (115/115); `locked` determinístico; `deferred` via CHECK temporária restaurada no `finally`. |
| Wiring (`index.ts`, `schema/index.ts`, `drizzle.config.ts`) + `SPEC/DONE-015`, `CLAUDE.md`, `roadmap.md`, `vitest.config.ts`, `round-trip.test.ts` | ~100% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC original?**
- [x] Nada de escopo/comportamento. **Dois ajustes de mecanismo fora da lista de arquivos da SPEC**, ambos consequência direta da própria SPEC (a nova FK `season → world` e a nova suíte de integração): `vitest.config.ts` (`fileParallelism: false`) e `round-trip.test.ts` (apagar `season` antes de `world`). Detalhados abaixo.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **Serialização dos testes** (`vitest.config.ts`) | `fileParallelism: false` — **fora** da lista de arquivos da SPEC. | As 3 suítes de `services/*` são de **integração contra UM Postgres** e truncam tabelas comuns (`world`, `published_round`) **sem filtro**. Antes eram disjuntas (round-trip=world, publish=published_round). A nova `daily-round` toca **ambas** → em paralelo uma suíte apagaria as linhas da outra no meio do teste (flaky). Serial = determinístico; custo ~1s nos testes puros do engine. Correção de infra, não de escopo. |
| **Ripple da FK** (`round-trip.test.ts`) | `beforeEach` passa a apagar `season` **antes** de `world` — **fora** da lista da SPEC. | A tabela `season` (criada por esta SPEC) referencia `world.seed`. O `delete(world)` do round-trip passou a violar a FK enquanto houvesse `season`. Ordem FK-child→parent. Zero mudança de comportamento do teste. |
| **`drizzle.config.ts`** | Adicionado `season.ts` à lista `schema`. | O drizzle-kit lê os arquivos de schema **explicitamente** (não o barrel), então o `generate` não via `season` até incluí-lo. A SPEC listava só o barrel `schema/index.ts`. Mecanismo. |
| **Nomes dos helpers** | `publishTarget`/`toWorldRoundInput`/`report` (a SPEC sugeria `resolveTarget`/`publishAll`/`buildReport`). | Decomposição equivalente (OP-15/16); nomes ajustados ao fluxo real. Sem impacto. |
| **Tipos do engine reusados** | `WorldSeasonResult`/`PublishOutcome`/`RoundResult` importados do engine (já públicos), sem novos tipos no store. | Uma fonte de verdade do contrato; engine intocado (OP-17). |

**Protocolo de conflito (parar+registrar):** não acionado — nenhum desvio de escopo/comportamento nem violação de OP. Os dois itens acima são custo mecânico da própria SPEC (FK + suíte live) e estão sinalizados ao founder no fecho.

---

## Limitações conhecidas

- **Re-simula a temporada a cada tick** e fatia `rounds[N-1]`. Seguro **enquanto o snapshot for imutável dentro da temporada** (v1 = 100% NPC congelado). Substituição humano↔NPC tornaria o snapshot mutável → fatia futura (congelar o plano da temporada no início).
- **Model B (calendar-derived):** um dia caído vira **buraco** na timeline a menos que ops **re-ancore** (`setSeasonAnchor` deliberado). "Perder a rodada vs empurrar o calendário" é **ação de ops explícita**, nunca automação silenciosa aqui.
- **`start_day_index` é pré-condição:** sem `setSeasonAnchor`, o tick recua `sem_ancora`. O passo de ops que ancora a temporada é da 1.2 (encaixe da Copa) / da viragem (Fatia 3).
- **Sem scheduler de produção:** quem lê `Date.now()` **uma** vez e chama `runDailyRound(epochMs)` é deploy. O tick é 100% testável por injeção.
- **`season_complete` só detecta:** a viragem (`advanceWorld` → snapshot versionado + `turnoverReport` persistido) é a **Fatia 3**.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Título do card = cadência revogada (`ter/qui/sáb`) | Cosmético — o escopo entregue é o diário 7/7 ratificado. | Higiene de board do founder (renomear/mover na UI). |
| `MATCH_DAYS` removido (só `MATCH_HOUR`) | Nenhum — cadência diária é a ratificada. | — |
| `world-store` typecheck-only (herdado) | Baixo — sem consumidor runtime externo ainda. | Quando surgir consumidor runtime: virar composite. |
| Cards das Fatias 3-5 (0.2) e do encaixe da Copa (1.2) | Board incompleto. | Founder cria na UI H1VE. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (10/10)
- [x] Testes passando (115/115 ao vivo; 89/26-skip sem DB)
- [x] Typecheck limpo
- [x] Lint limpo (`eslint` ✅; prettier LF-normalizado ✅ — CRLF local é gotcha conhecida)
- [x] Nenhum log de debug / `any` / segredo hardcoded
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` "Estado atual" atualizado (SPEC-015)
- [x] `docs/projeto/roadmap.md` atualizado (1.2 primeira fatia)
- [x] Este DONE está completo e commitado na branch *(commit no fluxo do PR)*

---

*DONE-015 — método H1VE. Primeira fatia de 1.2: o primeiro batimento cardíaco do mundo. Alinha a âncora à cadência diária ratificada (R4 FINAL) e entrega o tick que publica a rodada-do-mundo numa transação atômica (charter: a linha do tempo do mundo é all-or-nothing), reusando o engine puro intocado (OP-17). Viragem (Fatia 3), Copa e scheduler são fatias seguintes; o seam `season_complete` já as isola.*
