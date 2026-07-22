# DONE-053 — Card de fim de temporada · fatia 1: o acumulador de temporada

> Artefato de conclusão do desenvolvimento (par da `SPEC-053`).

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-053 |
| **SPEC correspondente** | `SPEC-053-acumulador-de-temporada.md` |
| **Feature** | Acumulador de temporada — a memória durável da campanha (fatia 1 de 2) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/card-de-fim-de-temporada-fatia-1-o-acumulador` |
| **PR** | (preenchido ao abrir) |
| **Desenvolvimento iniciado** | 2026-07-22 |
| **Desenvolvimento concluído** | 2026-07-22 |
| **Dias utilizados vs appetite** | 1 dia vs 14 de appetite |
| **Selo** | `packages/world-engine` intocado; 5 goldens byte-idênticos |

---

## Resumo do que foi feito

A temporada passou a ter **memória durável**. O tick grava, dia a dia, a campanha de cada humano
(jogos, gols, assistências, a nota daquela rodada e o **overall** daquele dia) numa linha por
`(atleta, temporada)`; e um passe novo **fecha** essa linha na viragem, carimbando o desfecho do
clube — campeão · subiu · permaneceu · rebaixado. É o dado que o card de fim de temporada (fatia 2)
vai desenhar, e a razão de ele existir no servidor é que a viragem **sobrescreve** o mundo (o clube
e o tier da temporada que acabou deixam de existir) e o **overall do início** da temporada é
irrecuperável depois. O contrato `/v1/band` ganhou `lastSeason?` (aditivo, omitido quando não há).

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `services/player-store/src/schema/season-summary.ts` | Schema Drizzle da tabela `season_summary`. |
| `services/player-store/src/migrations/0012_season_summary.sql` | A tabela + 2 índices + CHECKs (OP-01). |
| `services/player-store/src/migrations/meta/0012_snapshot.json` | Snapshot do drizzle-kit. |
| `services/player-store/src/store/season-summary-repo.ts` | `accrueSeasonMatch` (claim+upsert atômico), `closeSeason`, `readOpenSeasonsBefore`, `readLastClosedSeason`, `countCareerSeasons`. |
| `services/season-summary/` (workspace novo) | `package.json`, `tsconfig.json`, `src/index.ts`, `src/close-pass.ts` (`runSeasonClosePass`), `test/close-pass.test.ts`. |
| `services/player-store/test/season-summary-repo.test.ts` | 11 casos ao vivo (idempotência provada por mutação, leitura por conta, LAST com 2 temporadas). |
| `specs/SPEC-053-…md` · `specs/DONE-053-…md` | SPEC (revisão 2) e este DONE. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `services/player-store/src/index.ts` · `schema/index.ts` · `drizzle.config.ts` | Exportam/registram o schema e o repo novos. |
| `services/player-store/src/store/player-repo.ts` | `AthleteIdentity` ganhou `accountId` (a carreira é da conta). |
| `services/scheduler/src/round-outcomes.ts` | `RoundOutcomes` ganhou `matches` (a partida já era achada e descartada) + o snapshot clube/tier. |
| `services/scheduler/src/human-passes.ts` | `trySeasonStats` isolado, com gate de entrada `dueDayIndex(occupiedAt) >= day`. |
| `services/scheduler/src/daily-tick.ts` | Passes de mundo extraídos p/ `runWorldPasses` (OP-15); wira o fecho em todo dia liquidado; totais ganham `seasonsClosed`. |
| `services/scheduler/src/main.ts` | O log do tick imprime `temporadas=N`. |
| `services/world-store/src/store/round-repo.ts` · `turnover-repo.ts` · `world-repo.ts` | `readSeasonMatches`, `readTurnoverReport` (por PK), `readCurrentSeasonId` (leve). |
| `services/api/src/band/{types,band-state,from-player}.ts` | `BandSeasonSummary` + `lastSeason?`; leitura por conta em `Promise.all`. |
| **19 suítes de teste** (`wipeAll`) | Apagam `season_summary` antes de `athlete` (FK nova). |
| `tsconfig.base.json` · `vitest.config.ts` | Registram o workspace novo. |
| `CLAUDE.md` · `docs/projeto/roadmap.md` | Estado atual + item 4.3. |

---

## Mudanças de schema aplicadas

| Migration | Descrição |
|---|---|
| `0012_season_summary.sql` | Cria `player.season_summary` (PK `(athlete_id, season_id)`; FKs → `athlete` e → `account`; snapshot `club_id/club_name/league_id/tier/position`; acúmulo em décimos inteiros; `start_overall`/`end_overall`; fecho `outcome`/`tier_after`/`closed_at`). Dois índices: parcial `(season_id) WHERE closed_at IS NULL` (lista de trabalho do fecho) e `(account_id, closed_at) WHERE closed_at IS NOT NULL` (leitura quente do `/v1/band`). CHECK de enum em `outcome` e de não-negatividade nos contadores. |

⚠️ **Sem migration no `daily_ledger`**: o escopo `'season'` é valor novo numa coluna `text` sem
CHECK (precedente `'train'`, SPEC-041). ⚠️ **Aplicar em produção** (o deploy não roda migration
automática): `npm run db:migrate -w services/player-store` no endpoint direct.

---

## Mudanças de API entregues

| Método | Endpoint | Status |
|---|---|---|
| GET | `/v1/band` | ✅ atualizado — campo **aditivo** `lastSeason?: BandSeasonSummary` (omitido quando não há temporada fechada; nenhum campo existente mudou). Nenhuma rota nova. |

---

## Critérios de aceitação — verificação

| Critério | Status | Observação |
|---|---|---|
| 1 — acúmulo diário | ✅ | `season-summary-repo.test.ts` (estreia) + o SEAM no tick. |
| 2 — idempotência | ✅ | Provado FALHANDO com o claim desarmado (`expected true to be false`). |
| 3 — a evolução é real (e o teste pode falhar) | ✅ | O caso "EVOLUÇÃO" gasta 4 pontos entre dois ticks → `end_overall` sobe, `start_overall` não. |
| 4 — o fecho | ✅ | `close-pass.test.ts` (promovido/permaneceu) + o SEAM do fecho no tick real. |
| 5 — sobrevive ao regen (e o card também) | ✅ | Leitura por conta, cravada no repo e no contrato. |
| 6 — o fecho não fica órfão | ✅ | Caso "SOBRA ÓRFÃ": 2 temporadas, cada uma fechada contra o SEU turnover. |
| 7 — nunca CAMPEÃO descendo | ✅ | Caso "1º da tabela + rebaixado → relegated". |
| 8 — admitido mid-season não herda | ✅ | Caso "GATE DE ENTRADA" (fronteira 15h); o gate era deletável sem quebrar nada antes. |
| 9 — degradação e isolamento | ✅ | `trySeasonStats` try/catch + guarda `isPosition`; um erro não starva os demais passes. |
| 10 — contrato e selo | ✅ | `band-state.test.ts` (omitido/presente/não-vaza); `git diff` engine+goldens = 0. |

---

## Como testar manualmente

```
1. Suba a stack (client/band-wpf/README.md §Bring-up) com um humano ocupando uma vaga.
2. Rode o scheduler por vários dias (cada tick avança um dia): o `season_summary`
   do humano acumula matches/goals/rating/end_overall — confira com:
     SELECT matches, goals, rating_sum, start_overall, end_overall
       FROM player.season_summary WHERE athlete_id = '<id>';
3. Distribua um ponto de treino no meio → o end_overall do próximo tick sobe,
   o start_overall NÃO.
4. Avance até a viragem (dia 38 a partir da âncora): o log do tick mostra
   `temporadas=1`, e a linha ganha outcome/closed_at.
5. GET /v1/band do atleta → o campo `lastSeason` aparece com a campanha fechada.
```

**Dados de teste necessários:** um mundo semeado + âncora de temporada; uma conta+atleta ocupando
uma vaga de entrada; o scheduler rodando dia a dia.

---

## Testes automatizados

| Arquivo de teste | O que cobre |
|---|---|
| `services/player-store/test/season-summary-repo.test.ts` | Estreia, **idempotência** (falha sem o claim), recorde, evolução, snapshot imutável, fecho 1×, lista de trabalho, carreira por conta, **LAST com 2 temporadas**, sem-vazamento. |
| `services/season-summary/test/close-pass.test.ts` | Ainda-não-virou, promovido, permaneceu, campeão, **nunca-campeão-descendo**, idempotência, **sobra órfã**, temporada corrente. |
| `services/scheduler/test/daily-tick.test.ts` | **SEAM** (o tick grava com os dados reais), SEAM idempotente, **EVOLUÇÃO** ponta-a-ponta, **GATE DE ENTRADA** (fronteira 15h), **NÚMEROS** (gols/assist/nota vs oráculo, pega troca de campo), **SEAM do FECHO** pelo tick real. |
| `services/api/test/band-state.test.ts` | `lastSeason` omitido/presente (nota média em décimos)/não-vaza-entre-contas. |

**Comando:** `npm test` (gated por `DATABASE_URL`). **744 testes ao vivo.**

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| Todos os arquivos da feature | 100% (Claude Code / Fable 5) | não (pendente QA) — mas passaram por **pré-mortem adversarial** (8 agentes, antes do código) e **revisão adversarial** (4 lentes + verificação cética, depois) |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → A **pré-mortem provou a justificativa da SPEC-053 (revisão 1) FALSA**: `matchRating`
  quase não responde ao treino (Técnico/Tático nem entram; Mental só estreita a variância). A linha
  EVOLUÇÃO foi trocada de **nota** para **overall** (decisão do founder), e a SPEC reescrita
  (revisão 2). Nada disso toca `packages/`.

---

## Desvios em relação à SPEC

| Item da SPEC (revisão 2) | O que foi feito | Motivo |
|---|---|---|
| `totalRounds` no contrato | Exposto **`lastRound`** em vez de `totalRounds` | O engine não define "total de rodadas da liga"; `firstRound`+`lastRound` deixam a fatia 2 derivar "X de N" sem outra rodada de servidor. |
| `seasonNumber` no contrato | **Removido** | Era, por construção, sempre igual a `careerSeasons` — dois campos idênticos num contrato aditivo-only (do qual nada some) é dívida. |

Fora isso, seguiu a SPEC revisão 2.

---

## Limitações conhecidas

- **Backfill impossível**: o dado nunca existiu; o card vale da próxima temporada fechada em
  diante. Sem jogadores em produção, custo zero — mas é escolha declarada.
- **Nota no catch-up**: no primeiro tick pós-deploy (cursor nulo) o scheduler replaya a temporada
  inteira com os focos **de hoje**; idem para um dia deferido retentado ~24h depois. As notas
  desses dias não são "os focos daquele dia". Declarado no §Escopo FORA da SPEC.
- **Divergência de nota faixa × registro**: o `/v1/band` recomputa `myRating` dos focos vivos; o
  registro grava o valor do tick. Para GK/DEF que gastam Físico depois do jogo, diferença de ~0,1.
- **Mundo-único por banco**: `season_summary` não tem `world_seed` (o `season_id` é contador
  global). Documentado no schema; vira obrigatório se houver multi-seed no mesmo Postgres.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Snapshot de nota/mood por RODADA (débito de replay das SPEC-029/046/047) | Médio | Card próprio; esta fatia pagou só o eixo da temporada. |
| Nota do catch-up com focos de hoje | Baixo | Junto do snapshot por rodada. |
| `world_seed` na tabela (multi-seed) | Baixo | Quando/se houver multi-mundo por banco. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (1-10)
- [x] Testes criados e passando (744 ao vivo; o de idempotência falha sem o claim)
- [x] Typecheck limpo
- [x] Lint limpo — **eslint E prettier** (a lição desta entrega: o commit inicial tinha prettier
      vermelho porque rodei só o eslint; verificado contra os blobs LF que o CI lê)
- [x] Nenhum log de debug em produção
- [x] Nenhum `any` introduzido
- [x] Nenhum segredo hardcoded
- [x] AI Declaration preenchida
- [x] `CLAUDE.md` "Estado atual" atualizado
- [x] `docs/projeto/roadmap.md` item 4.3 atualizado
- [x] `packages/world-engine` intocado; 5 goldens byte-idênticos
- [x] Migration `0012` documentada (aplicar manual em produção)
- [x] Este DONE completo e commitado na branch

---

*DONE-053 — método H1VE. A temporada virou memória durável: uma linha por atleta, acumulada dia a
dia com o overall e a nota de cada dia, e fechada na viragem com o desfecho do clube. A linha
EVOLUÇÃO mostra o overall — o número que o treino move — depois que a pré-mortem provou que a nota
quase não responde ao treino. `packages/world-engine` e os 5 goldens intocados. O card desenhado é
a fatia 2.*
