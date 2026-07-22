# SPEC-053 — Card de fim de temporada · fatia 1: o acumulador de temporada (servidor)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.
>
> **Revisão 2 (2026-07-22)** — reescrita após a pré-mortem adversarial (8 agentes) achar que a
> motivação da revisão 1 era **factualmente falsa** e que o desenho do fecho tinha 5 defeitos MAJOR.
> As mudanças estão marcadas com **[R2]**. A decisão do founder nº 3 é nova.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-053 |
| **Feature** | Acumulador de temporada — a memória durável da sua campanha (fatia 1 de 2) |
| **Slug** | acumulador-de-temporada |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 4.3 (Card compartilhável) — a metade "fim de temporada" |
| **Appetite** | 14 dias (estimativa de trabalho: ~5-7 dias) |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-22 |
| **Aprovada em** | 2026-07-22 (revisão 1) · **revisão 2 pendente de re-aprovação** |
| **Aprovada por** | gustavo-hartz (founder) |
| **Status** | Em desenvolvimento (card em `dev`) — revisão 2 do texto |

---

## Objetivo

A temporada passa a ter **memória**. Hoje o mundo vira e **apaga**: o snapshot é sobrescrito
in-place (SPEC-021) e nada registra o que **você** fez nos 38 jogos. Esta fatia grava, dia a dia, a
sua campanha — jogos, gols, assistências, a nota de cada rodada e **o seu overall** — e a **fecha na
viragem** com o desfecho do clube (campeão · subiu · permaneceu · rebaixado). É o dado que o card
de fim de temporada (fatia 2) vai desenhar.

---

## Contexto e motivação

O Claude Design entregou o handoff do card de fim de temporada (projeto `96a89e25`): irmão do card
de partida da SPEC-049 — 1080×1080, mesmos tokens, cinco estados. O card de partida foi **100%
cliente** porque o `/v1/band` já entregava tudo. **Este não é.**

**O que já é durável.** O `published_round` guarda o `RoundResult` inteiro em jsonb, com
`athleteId`/`assistId` por gol (SPEC-043/046) → **jogos, gols e assistências** são deriváveis. O
`turnover_report` guarda `promoted`/`relegated` como `ClubMove {clubId, fromTier, toTier}` →
**subiu/rebaixou** é derivável. `computeStandings` existe → **campeão** é derivável.

**[R2] O que NÃO é durável — e a correção do erro da revisão 1.** A revisão 1 justificava o
acumulador dizendo que a nota da rodada 1, recomputada no fim, sairia igual à do fim, e que a linha
`EVOLUÇÃO` daria `+0.0` para todo mundo. **As duas afirmações eram falsas**, e a leitura de
`packages/world-engine/src/engine/match-rating.ts:70-97` mostra por quê:

- **Técnico e Tático não entram na nota.** O comentário do próprio arquivo (linhas 11-12) declara:
  *"Técnico/Tático já entram via os EVENTOS (gols/assistências)"*. Eles agem fazendo você marcar
  mais — e gols/assistências **já estão persistidos**.
- **Físico** entra só para GK/DEF, só em clean sheet, como `floor(fisico/20)`: de +0,0 a +0,4.
- **Mental** só estreita a variância (`half = 12 − floor(mental/12)`): de Mental 40 para 99 o
  balanço cai de ±0,9 para ±0,4. Te deixa **constante**, não melhor.
- E cada rodada tem **seed própria** (`deriveSeed(..., 'rating')`), então duas rodadas quaisquer já
  dão notas diferentes — mesmo sem treino nenhum.

Ou seja: gravar a nota diariamente **não** torna a linha `nota início → nota fim` verdadeira; ela
mediria ruído. **A justificativa honesta do acumulador é outra, e continua de pé:**

1. **O `overall` no início da temporada é irrecuperável.** Ele é o número que o treino move de
   verdade (`abilityFromFocos`), e ninguém o registra por temporada. Sem snapshot, a curva de
   carreira não existe.
2. **A viragem apaga o mundo.** Clube, liga e tier em que você jogou deixam de existir quando a
   temporada acaba (o `turnover_report` guarda só o diff de NPC). Um card que leia o mundo ao vivo
   renderiza a temporada **seguinte**.
3. **A nota de GK/DEF** responde ao Físico de verdade, e a média/melhor da temporada só são
   fiéis se medidas quando aconteceram.

**[R2] Consequência: a linha EVOLUÇÃO passa a ser `startOverall → endOverall`** (decisão 3). A nota
continua no card como **NOTA MÉD.**, que é onde ela pertence — uma das quatro estatísticas grandes
que o próprio handoff já desenhou.

---

## Decisões do founder (TRAVADAS — 2026-07-22)

1. **A campanha é MEDIDA no tick** (não recomputada no fecho) — pelos três motivos honestos acima:
   o `start_overall`, o snapshot do mundo e a fidelidade da nota de GK/DEF.
2. **Fatiar em 2** — esta SPEC é o **servidor**. O **card desenhado** é a fatia 2, e reusa o
   `MatchCardShare` da SPEC-049.
3. **[R2] A linha EVOLUÇÃO mostra o OVERALL** (`ENTRADA 41 → FIM 58, +17`), não a nota. É o número
   que o treino move; a nota fica em NOTA MÉD. Escala diferente da do mockup — a fatia 2 ajusta.

---

## Escopo — o que está DENTRO

**A. A tabela (`services/player-store`)**

- [ ] Migration **`0012_season_summary.sql`** (OP-01): tabela `season_summary`, **PK natural
      `(athlete_id, season_id)`** — a chave é a idempotência (molde `match_choice`, SPEC-050).
- [ ] **Snapshot do mundo** (porque a viragem apaga o original): `club_id`, `club_name`,
      `league_id`, `tier`, e **[R2] `position`**.
- [ ] **Acúmulo**: `matches`, `goals`, `assists`, `rating_sum`, `rating_best`, `rating_best_round`,
      `rating_first`, `rating_last`, `first_round`, `last_round`. **Notas em DÉCIMOS inteiros** —
      `matchRating` devolve 30..100; somar inteiro elimina drift ao longo de 38 rodadas.
- [ ] **Evolução**: `start_overall` (gravado na estreia) e **[R2] `end_overall` (reescrito a CADA
      dia de jogo)** — nunca no fecho. No fecho o atleta pode não ter mais ocupação (regen, vaga
      revertida) e `abilityFromFocos` exige a posição; escrever diário elimina a dependência.
- [ ] **[R2] `account_id`** — gravado na estreia. A carreira é da CONTA: depois do regen o atleta
      ativo é outro, e ler por `athlete_id` esconderia o card justamente de quem acabou de encerrar
      uma carreira.
- [ ] **Fecho**: `outcome`, `tier_after`, `closed_at` — `NULL` enquanto a temporada corre.
      `closed_at IS NULL` **é** o gate de idempotência do fecho.

**B. O acumulador diário**

- [ ] `season-summary-repo.ts`: `accrueSeasonMatch(db, athleteId, input)` — **claim + upsert na
      MESMA transação**. Claim = `daily_ledger` com o escopo novo **`'season'`** (`scope` é `text`
      livre sem CHECK → **sem migration no ledger**, precedente `'train'` da SPEC-041). Molde
      literal: o helper `claimTrainDay` do `training-repo.ts:134`.
- [ ] `RoundOutcomes` ganha `matches: Map<athleteId, RoundMatch>` — o `roundOutcomes` **já acha** o
      `MatchRecord` (`matchOf`) e hoje o **descarta**; carregá-lo evita uma segunda leitura.
- [ ] `trySeasonStats` em `human-passes.ts` — **isolado** (molde `tryInjure`, slug
      `season_stats_failed`), logo após o `accrueRound`, sob o gate `paid`, só com partida do clube.
- [ ] **[R2] Gate de ENTRADA** (a lição da SPEC-034/050): pular se a rodada do dia **já tinha
      vencido** quando o humano entrou na vaga — `dueDayIndex(occ.occupiedAt) >= day`. Sem isso, um
      admitido mid-season herda como suas as partidas que o NPC jogou.
- [ ] Upsert incremental **sem `excluded`** (não existe no drizzle 0.45.2 deste repo): o idioma é
      `set: { goals: sql\`${seasonSummary.goals} + ${input.goals}\` }` — precedente
      `tick-progress-repo.ts:20-26`. As colunas de primeira-escrita **não entram no `set`**.
- [ ] Na **primeira** escrita: `start_overall` = `abilityFromFocos(focos, position)` com guarda
      `isPosition` e **fallback** à `occ.ability` congelada (lição SPEC-047), mais `account_id`,
      `position`, `first_round`, `rating_first` e o snapshot de clube/liga/tier.

**C. [R2] O fecho (`services/season-summary`, workspace novo)**

- [ ] `runSeasonClosePass(worldDb, playerDb, seed)` — **roda em TODO dia liquidado**, não só na
      janela de gênese. A janela dura **um dia** (`turnover-repo.ts:69` semeia a âncora nova como
      `dia+1`), e o pass é best-effort por linha: um erro engolido lá dentro significaria que
      aquela temporada **nunca** fecha. Rodar todo dia é idempotente (`closed_at IS NULL`) e no-op
      barato quando não há o que fechar.
- [ ] **A lista de trabalho é dirigida pela LINHA**: `closed_at IS NULL AND season_id <> <seasonId
      corrente do mundo>`. Não pelas ocupações (o regen troca o humano da vaga) e não pelo
      `seasonId` do tick — que em `season_rolled` é a temporada que **acabou** e no reprocesso
      `before_season` é a **nova**, ou seja, significa coisas opostas nos dois status.
- [ ] Para cada linha, o `turnover_report` é buscado **por PK** `(world_seed, from_season_id =
      row.season_id)`. Ausente = aquela temporada ainda não virou → **pula** (não é erro).
- [ ] Desfecho: **`promoted`/`relegated`** se o `ClubMove` lista o clube; senão **`stayed`**.
      **[R2] `champion` exige DUAS condições**: ser o 1º do `computeStandings` das rodadas
      publicadas **E** não estar em `relegated`. Motivo: a tabela das rodadas publicadas e a
      re-simulação da viragem são **simulações diferentes** (a modulação de forma/moral muda todo
      dia, SPEC-029/047; um humano admitido mid-season joga as rodadas 1..19 na re-simulação e não
      nas publicadas). Sem a guarda, o card pode dizer **CAMPEÃO com a seta para baixo**.
- [ ] Os `clubIds` da liga saem da **união dos `homeId`/`awayId` das rodadas publicadas** — não do
      snapshot, já sobrescrito (`computeStandings` ignora clube fora da lista: `applySide` retorna
      cedo).
- [ ] Fecha gravando `outcome`, `tier_after` (do `ClubMove`) e `closed_at`. `end_overall` já está
      lá desde o último dia de jogo.

**D. O contrato (aditivo, `services/api`)**

- [ ] `BandState.lastSeason?: BandSeasonSummary` — a última temporada **fechada**, omitida enquanto
      não houver nenhuma (política aditiva-only do `/v1`, SPEC-038).
- [ ] **[R2] Leitura por CONTA**, não por atleta: `readLastClosedSeason(db, accountId)` e
      `countCareerSeasons(db, accountId)`. É o que faz o card sobreviver ao regen.
- [ ] Campos: `seasonId`, `seasonNumber`, `clubName`, `position`, `tier`, `tierAfter`, `outcome`,
      `matches`, `goals`, `assists`, `ratingAvg`, `ratingBest`, `ratingBestRound`, `startOverall`,
      `endOverall`, `firstRound`, `totalRounds`, `careerSeasons`.
- [ ] **Nenhuma rota nova** — autorização por construção (o `athleteId`/`accountId` vêm da sessão).

---

## Escopo — o que está FORA

- **O CARD desenhado** (5 estados, render 1080×1080, share) — **fatia 2**.
- **A variação Story 1080×1350** — mesma decisão da SPEC-049.
- **Backfill de temporadas passadas** — o dado nunca existiu. O card vale da próxima temporada
  fechada em diante.
- **[R2] A fidelidade da nota num catch-up.** No primeiro tick após um deploy (cursor nulo) o
  scheduler replaya a temporada inteira numa passada (`daily-tick.ts:79`), e todos os dias são
  gravados com a leitura de focos **de hoje**; idem para um dia `deferred` retentado ~24h depois.
  As notas desses dias não são "os focos daquele dia". Limitação **declarada**; a correção real é
  snapshotar os 4 focos por rodada — o débito das SPEC-029/046/047, que esta fatia **não** paga.
- **[R2] A divergência de nota entre a faixa e o registro.** O `/v1/band` recomputa `myRating` dos
  focos vivos a cada leitura (`from-world.ts:224-227`, débito já declarado lá); o acumulador grava
  o valor do tick. Para GK/DEF que gastam um ponto em Físico depois do jogo, os dois números podem
  diferir em ~0,1. Reconciliar é card próprio.
- **O snapshot de nota/mood POR RODADA** (o débito de replay) — segue aberto.
- **Card de time / de liga / de carreira inteira**; a nota "ao vivo" animada; a Share UI nativa.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `services/player-store/src/schema/season-summary.ts` | criar | Schema Drizzle da tabela. |
| `services/player-store/src/migrations/0012_season_summary.sql` | criar | Gerada por `db:generate` (OP-01). |
| `services/player-store/src/schema/index.ts` | modificar | Barrel. |
| `services/player-store/drizzle.config.ts` | modificar | ⚠️ lista EXPLÍCITA de arquivos — esquecer aqui gera migration vazia **sem erro**. |
| `services/player-store/src/store/season-summary-repo.ts` | criar | `accrueSeasonMatch`, `closeSeason`, `readOpenSeasonsBefore`, `readLastClosedSeason`, `countCareerSeasons`. |
| `services/player-store/src/index.ts` | modificar | Exporta o repo novo. |
| `services/scheduler/src/round-outcomes.ts` | modificar | `RoundOutcomes` ganha `matches`. |
| `services/scheduler/src/human-passes.ts` | modificar | `trySeasonStats` isolado + gate de entrada. |
| `services/scheduler/src/daily-tick.ts` | modificar | Wira o `runSeasonClosePass` em **todo dia liquidado**. ⚠️ 237/300 efetivas. |
| `services/season-summary/*` | criar | Workspace novo (molde `services/regen`): `package.json`, `tsconfig.json`, `src/index.ts`, `src/close-pass.ts`, `test/`. ⚠️ registrar também em `tsconfig.base.json` (`paths`) e `vitest.config.ts` (`resolve.alias`). |
| `services/api/src/band/types.ts` | modificar | `BandSeasonSummary` + `lastSeason?`. |
| `services/api/src/band/band-state.ts` | modificar | Lê por conta. ⚠️ 255/300 efetivas. |
| `specs/SPEC-053-…md` · `specs/DONE-053-…md` | criar | SPEC e DONE. |

⚠️ **`packages/world-engine` INTOCADO** — `matchRating` e `computeStandings` são consumidos como
estão; os **5 goldens ficam byte-idênticos**.

---

## Mudanças de schema

Migration **`0012_season_summary.sql`**, gerada por `npm run db:generate -w services/player-store`
(escreve o `.sql`, o `meta/0012_snapshot.json` e o entry no `_journal.json`).

Colunas: `athlete_id` (FK), `account_id` (FK), `season_id`, `club_id`, `club_name`, `league_id`,
`tier`, `position`, `matches`, `goals`, `assists`, `rating_sum`, `rating_best`,
`rating_best_round`, `rating_first`, `rating_last`, `first_round`, `last_round`, `start_overall`,
`end_overall`, `outcome`, `tier_after`, `closed_at`, `created_at`.
PK `(athlete_id, season_id)`; índice parcial em `(season_id) WHERE closed_at IS NULL`; CHECK de
enum em `outcome`; CHECK de não-negatividade nos contadores.

⚠️ **FK nova → varrer o `wipeAll`.** Toda suíte que apaga `player.athlete` precisa apagar
`season_summary` antes. É o gotcha que já quebrou o projeto na SPEC-024 e na SPEC-050. ⚠️ Atenção:
existem **duas** tabelas `athlete` (`player.athlete` e a do world-store) — só a primeira importa.

**Sem migration no `daily_ledger`**: `'season'` é valor novo numa coluna `text` sem CHECK.

---

## Mudanças de API

```
GET /v1/band   (ADITIVO — nenhuma rota nova, nenhum campo existente muda)
  lastSeason?: {
    seasonId, seasonNumber, clubName, position, tier, tierAfter,
    outcome: 'champion'|'promoted'|'stayed'|'relegated',
    matches, goals, assists,
    ratingAvg, ratingBest, ratingBestRound,
    startOverall, endOverall,          // ← a linha EVOLUÇÃO
    firstRound, totalRounds, careerSeasons
  }
```

Omitido (não `null`) enquanto não houver temporada fechada.

---

## Critérios de aceitação

**Cenário 1 — o acúmulo diário**
- Dado um humano cujo clube joga a rodada publicada do dia, com 1 gol e 1 assistência dele
- Quando o tick roda
- Então a linha existe com `matches=1`, `goals=1`, `assists=1`, `rating_first == rating_last`, e
  `start_overall == end_overall == abilityFromFocos(focos de hoje, posição)`.

**Cenário 2 — idempotência**
- Dado o mesmo dia processado duas vezes (retry, catch-up, republicação)
- Quando o tick roda de novo
- Então **nada** é somado. ⚠️ O teste deve **falhar** se o claim for removido.

**Cenário 3 — [R2] a evolução é real e o teste pode falhar**
- Dado um humano que joga, **distribui um ponto de treino**, e joga de novo
- Quando comparo a linha
- Então `end_overall > start_overall`, e `start_overall` é o overall **da estreia** (não o de
  agora). *(A revisão 1 pedia `rating_first != rating_last`, que passa mesmo com zero treino —
  critério vacuoso, corrigido.)*

**Cenário 4 — o fecho**
- Dado uma temporada terminada com o `turnover_report` gravado
- Quando o tick roda **em qualquer dia** depois disso
- Então a linha fecha com `outcome`, `tier_after` e `closed_at`; rodar de novo é no-op.

**Cenário 5 — [R2] o fecho sobrevive ao regen, e o card também**
- Dado um humano que **renasce** na viragem
- Quando leio `GET /v1/band` **do renascido**
- Então `lastSeason` mostra a temporada que acabou (a carreira é da conta) e `careerSeasons` **não**
  volta a zero. *(A revisão 1 provava só que a linha fechava — o contrato não a alcançava.)*

**Cenário 6 — [R2] o fecho não fica órfão**
- Dado uma linha que não fechou no dia da viragem (falha transitória)
- Quando o tick roda nos dias seguintes
- Então ela fecha — e é fechada contra o `turnover_report` da **própria** temporada dela, não da
  virada mais recente.

**Cenário 7 — [R2] nunca CAMPEÃO descendo**
- Dado um clube 1º na tabela das rodadas publicadas mas presente em `relegated`
- Quando o fecho roda
- Então o `outcome` é `relegated`, nunca `champion`.

**Cenário 8 — [R2] o admitido mid-season não herda partidas**
- Dado um humano admitido na vaga depois da rodada do dia já ter vencido
- Quando o tick roda
- Então a rodada **não** é contada para ele.

**Cenário 9 — degradação e isolamento**
- Dado um humano sem partida, com `position` corrompida, ou com o acumulador lançando
- Quando o tick roda
- Então os demais passes rodam normalmente e o tick não aborta (log genérico OP-11).

**Cenário 10 — o contrato e o selo**
- Dado um atleta sem temporada fechada e outro com
- Quando chamo `GET /v1/band`
- Então o primeiro **não tem** a chave `lastSeason`; e os gates fecham verdes com
  **`packages/world-engine` e os 5 goldens byte-idênticos** (`git diff` = 0).

---

## Segurança

- **Autorização por construção** — nenhuma rota nova; `accountId`/`athleteId` vêm sempre da sessão.
  ⚠️ **[R2]** a leitura passa a ser por CONTA: o filtro `account_id = session.accountId` é o que
  impede ler a temporada de outro jogador, e **precisa de teste** (é a superfície que mudou).
- **Sem input não-confiável** — o acumulador roda no worker, sobre dados que o servidor publicou.
- **OP-11** — erros logados genéricos (`season_stats_failed`), sem SQL nem stack.
- **Money path intocado** — não toca saldo, atributo, ability nem placar; escopo de ledger próprio
  (`'season'`), separado de `'accrue'`. Nada aqui pode pagar duas vezes.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Contar o mesmo dia duas vezes (catch-up, retry, republicação) | Alta sem cuidado | Claim `'season'` na mesma tx do upsert. Critério 2, com prova de que falha sem o claim. |
| **[R2] Fecho órfão** — a janela de gênese dura 1 dia e o pass é best-effort | **Alta** | Rodar em todo dia liquidado, dirigido pela linha. Critério 6. |
| **[R2] `champion` contradizendo o tier** (duas simulações) | Média | Guarda dupla no `champion`. Critério 7. |
| **[R2] Card invisível para quem regenerou** | **Alta** | Leitura por conta + `account_id` na linha. Critério 5. |
| **[R2] `end_overall` incalculável no fecho** (sem ocupação/posição) | Alta | Escrito no acumulador diário; `position` snapshotada. |
| **[R2] Partidas-fantasma do admitido mid-season** | Média | Gate `dueDayIndex(occupiedAt) >= day`. Critério 8. |
| FK nova quebrando suítes | **Alta** (2× no histórico) | Varredura do `wipeAll` antes de rodar. |
| OP-16 em `band-state.ts` (255/300) / `daily-tick.ts` (237/300) | Média | Reader/módulo próprio (precedente SPEC-051). |

**Dependências** (em `main`): SPEC-043/046 (eventos de gol + `matchRating`), SPEC-030/032 (tick e
catch-up), SPEC-021 (viragem e `turnover_report`), SPEC-038 (contrato), SPEC-002
(`computeStandings`). Handoff do Claude Design — projeto `96a89e25`.

---

## Notas de implementação

- **Ordem:** schema → repo (teste de idempotência PRIMEIRO) → passe no tick → fecho → contrato.
- **Notas em décimos, sempre.** Nenhum `float` na coluna.
- **Idioma do claim:** helper booleano `claimSeasonDay(tx, athleteId, day)` no molde do
  `claimTrainDay` (`training-repo.ts:134`) — mantém a fn principal sob os 50 do OP-15. Ordem dentro
  da tx: `FOR UPDATE` na linha do atleta → claim → `if (!claimed) return` → computa → upsert.
- **`await db.transaction(...)` dentro do `try`** quando houver catch OP-11 — sem o `await` a
  promise escapa e o catch vira código morto (`economy-repo.ts:45`).
- **Sem `excluded`** (não existe no drizzle deste repo): incremento por
  `sql\`${col} + ${valor}\``; `target: [seasonSummary.athleteId, seasonSummary.seasonId]`.
- **`primaryKey({ name: 'season_summary_pk', ... })`** — a forma nomeada; sem `name` o drizzle gera
  outro identificador.
- **Não reabrir leitura do mundo dentro do passe por-humano** — pré-computar no `processDay` e
  injetar, como `roundOutcomes`/`yesterdayFor` já fazem.
- **Teste do seam, não das metades.** É a **quarta vez** que este projeto aprende isso (SPEC-029 →
  046 → 047): um teste ao vivo que roda o tick de verdade por 2+ dias, gasta um ponto no meio, e
  prova que a linha reflete o que aconteceu. O molde está em
  `services/scheduler/test/daily-tick.test.ts` (o caso de catch-up de 3 dias).
- **Prove que cada teste falha com o bug presente** — foi assim que a pré-mortem reprovou o critério
  3 da revisão 1.

---

## [R2] Decisões de conteúdo tomadas aqui (não vão ao designer)

O handoff mostra coisas que não existem no jogo. Em vez de devolver perguntas, decidimos:

- **`GOAT-2049` sai** — não há ano in-world nem handle de jogador.
- **Nomes de divisão**: **Elite · Nacional · Regional · Várzea**, presos ao índice do tier. Andares
  novos criados pela Pirâmide Elástica (SPEC-036) nascem embaixo: tier 4 = **Várzea II**, tier 5 =
  **Várzea III** — assim ninguém é renomeado porque o mundo cresceu por baixo. O contrato manda
  **número**; nomear é render (fatia 2).
- **Número da temporada**: derivado (`seasonNumber` = quantas temporadas o atleta já teve + 1).
- **"MELHOR FASE"** = a rodada da melhor nota (`rating_best_round`).
- **Estado "pouca participação"**: quem estreia tarde conta a história da **estreia**, não da
  eficiência — o charter proíbe punir o fracasso.
- **A 3ª barra (FÔLEGO)**, o **seletor de camisa 1-99** e **`ESCALAR ⚡`** não existem e não entram.

**Ao designer vai só o que é pixel**: a paleta de kit indexada (12+12), os 16 escudos, as cenas de
quitinete e apê — e a correção da cadência "Tue/Thu/Sat" no `readme` do design system, que é
diária 7/7 desde o R4 FINAL e reaparece pela quarta vez.

---

## Checklist de aprovação

- [x] Objetivo está claro e verificável
- [x] Escopo está bem delimitado (dentro e fora)
- [x] Arquivos listados estão corretos e completos
- [x] Mudanças de schema estão documentadas (migration `0012`)
- [x] Critérios de aceitação são testáveis **e podem falhar** (corrigido na R2)
- [x] Riscos e superfície de segurança foram avaliados
- [x] Appetite é razoável para o escopo definido
- [x] Não há conflito com SPECs abertas em paralelo
- [x] Decisão 1 — a campanha é **medida no tick**
- [x] Decisão 2 — **fatiar em 2**
- [x] **[R2] Decisão 3 — a linha EVOLUÇÃO mostra o OVERALL**, não a nota
- [x] **Card criado no board** e esta SPEC publicada nele
- [x] **Aprovação no card (`spec → dev`)** — concedida; a revisão 2 é correção da âncora, não
      ampliação de escopo (mesmos arquivos, mesma migration, mesmo appetite)

---

*SPEC-053 — método H1VE, revisão 2. A temporada ganha memória: uma linha por atleta, acumulada dia
a dia e fechada com o desfecho do clube. A linha EVOLUÇÃO mostra o **overall** — o número que o
treino move —, depois que a pré-mortem provou que a nota quase não responde ao treino.
`packages/world-engine` e os 5 goldens ficam intocados. O card desenhado é a fatia 2.*
