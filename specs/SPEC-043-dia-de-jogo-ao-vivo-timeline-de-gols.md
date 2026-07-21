# SPEC-043 — Dia de jogo ao vivo · fatia 1 (timeline de gols determinístico)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-043 |
| **Feature** | Dia de jogo ao vivo — a timeline de gols determinística (fatia 1 de N; roadmap 3.1) |
| **Slug** | dia-de-jogo-ao-vivo-timeline-de-gols |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | **3.1** — Dia de jogo ao vivo (a dopamina das 15h; o north star: ≥3 humanos presentes) |
| **Appetite** | 2 a 3 dias (o produtor puro + a fusão no enrich + o campo aditivo no `/v1` + os testes de golden-safety) |
| **Prioridade** | HIGH — a matéria-prima do "assistir" (o cliente reproduz a timeline na fatia 2) |
| **Criada em** | 2026-07-21 |
| **Aprovada em** | {a preencher após aprovação no card} |
| **Aprovada por** | {a preencher — founder/architect} |
| **Status** | Rascunho — aguardando aprovação no card |

---

## Decisões travadas com o founder (2026-07-21)

> **Régua do card (do founder):** toda decisão é voltada para o jogador **curtir, ficar preso assistindo e interagir**. A fatia 1 é a fundação invisível (a timeline), mas é **moldada para o replay** e deixa os **seams** do artilheiro/nota/interação prontos para crescer aditivamente — o payoff que se SENTE (o cliente reproduzindo a partida ~15min ao vivo) é a **fatia 2 imediata**.

1. **Fatia 1 = só-servidor** (engine + jsonb + `/v1` aditivo), sem tocar o cliente — **server-first** (SPECs 037/038/041/042 provaram: os dados precedem a UI). A política aditiva-only mantém o cliente WPF atual (SPEC-042) intocado.
2. **A NOTA do jogador (rating ao vivo) fica DEFERIDA** para fatia própria — a fórmula é decisão de design não especificada, puxa forma/moral (cross-schema, fora do engine puro) e vai absorver os desfechos dos eventos de escolha (3.2). Não congelar um número contestado no `/v1` agora.
3. **Granularidade: minuto + LADO** (qual clube marcou), **não o artilheiro** (qual atleta) — dá o placar-que-sobe renderável, é roster-light e 100% score-neutral; o artilheiro entra **aditivo depois** (`GoalEvent.athleteId?`, exige roster, pareia com a nota e o card compartilhável 4.3).
4. **A timeline SOMA o placar exato por CONSTRUÇÃO:** o placar (`homeGoals`/`awayGoals`) já é computado pelo stream de 6 partes do `simulateSeason` e é **autoritativo/congelado**; o produtor amostra QUAL minuto para a contagem já fixada, **nunca QUANTOS** → `count === placar` por construção.
5. **Colisão de minuto PERMITIDA** (dois gols no mesmo minuto, possível com até 11+11 em [1,90]) — mais simples, determinística, plausível no futebol; a ordem é estável por um **desempate determinístico explícito** (minuto, lado, seq de geração), não pela estabilidade do `Array.sort`.
6. **Discriminador do novo stream = `'goals'`** (≠ `'events'` das lesões) — **invariante de golden-safety** (a injetividade do `deriveSeed` por prefixo de comprimento torna `'goals'` disjunto tanto das chaves de placar [6 partes] quanto das de lesão [`'events'`, 7 partes]). TRAVADO.
7. **Lista `events` unificada e CRONOLÓGICA** (gols + lesões ordenados por minuto) — é a intenção de produto (UMA timeline); golden-neutro (nenhum golden carrega `events`).
8. **Campo do contrato:** `BandMatch.goals?: {minute, isMine}[]`, presente (possivelmente `[]`) quando `played` (rodada liquidada) e **omitido pré-jogo** — `[]` num 0-0 jogado é um fato real; ausente = "não se aplica".

---

## Objetivo

Dar ao "Dia de jogo ao vivo" a sua matéria-prima: o **minuto de cada gol** da partida do dia — uma timeline que **soma o placar já final** e que o cliente vai **reproduzir ao vivo** (a fatia 2) para o jogador assistir a tensão dos ~15min subir (0–0 → 1–0 aos 23' → empate aos 71'). Hoje a partida só tem um placar final estático; esta fatia entrega a **sequência**, determinística e persistida, sem tocar o placar nem os goldens.

---

## Contexto e motivação

Roadmap **3.1** (Fase 3 — o dia de jogo, a dopamina ao vivo; o north star do produto: ≥3 humanos presentes às 15h). O motor está completo e publica um **placar final** por partida (`resolveMatch` = chances × conversão), mas **não há sequência minuto-a-minuto** — não dá para "assistir os gols surgirem" sem a timeline existir. A **SPEC-031** já provou o padrão para enriquecer a partida **sem tocar os 5 goldens**: um campo `events?` opcional, preenchido **só no `world-season.ts`** (que tem os elencos), **depois** do placar fixado, com um **RNG de stream disjunto** (`deriveSeed(…, 'events')`) — e deixou o **timeline de gols explicitamente DEFERIDO** ("Falta: o timeline de gols"). Esta fatia paga exatamente esse débito, reusando o seam.

**Fatos verificados no repo:**
- `resolveMatch` (`engine/match.ts`) produz o placar como uma **contagem de Bernoullis** (home tudo, depois away), no stream de sub-seed de **6 partes** (`season.ts`: `deriveSeed(seed, leagueId, seasonId, round, homeId, awayId)`). Não carimba minuto → os minutos têm de vir de um stream **separado**.
- `MatchResult.events?` (`types.ts:41`) é opcional (jsonb); `MatchEvent` (`types.ts:24`) hoje é `{kind:'injury', clubId, athleteId, severity, minute}`, com `kind` **aberto** para `goal`.
- O enriquecimento vive em `world-season.ts:enrichMatch` (~l.66-80), **depois** do `simulateSeason` fixar o placar; já usa `deriveSeed(…, 'events')` (l.74) para as lesões. `MATCH_EVENTS.matchMinutes = 90` (minuto ∈ [1,90]).
- Os 5 goldens estão em `packages/world-engine/src/__fixtures__/` (season/prng/anchor/world/world-expansion). `advanceWorld`/`worldHash` leem **tabela/standings**, nunca `.events` → imunes ao enriquecimento (é como a SPEC-031 ficou byte-idêntica).
- O read-model expõe o placar em `BandMatch` (`band/types.ts:87`) via `buildTodayMatch` (`band/from-world.ts:59`), que já tem o `match` em mãos (com `events`) — zero leitura nova de banco.

---

## Escopo — o que está DENTRO

### A) Engine — o tipo e o produtor puro
- [ ] Alargar `MatchEvent` (`types.ts`) de interface fechada para **união discriminada** `InjuryEvent | GoalEvent`, onde `GoalEvent = {kind:'goal', clubId, minute}` (sem `severity`/`athleteId` nesta fatia). `MatchResult.events?` segue `readonly MatchEvent[]` opcional — **nenhum campo existente muda de tipo**.
- [ ] Novo produtor **PURO** `matchGoals(homeClubId, homeGoals, awayClubId, awayGoals, rng)` em `match-events.ts`: sorteia EXATAMENTE `homeGoals` minutos do lado casa e `awayGoals` do lado fora em `[1, MATCH_EVENTS.matchMinutes]` via `nextInt`, rotula cada um por `clubId`, retorna a lista. Amostra QUAL minuto, **nunca QUANTOS** (a contagem é o placar autoritativo).

### B) Engine — a fusão no enrich (score-neutral)
- [ ] Em `enrichMatch` (`world-season.ts`), adicionar um 2º RNG `createRng(deriveSeed(seed, leagueId, seasonId, m.round, m.homeId, m.awayId, 'goals'))` (discriminador NOVO, ≠ `'events'`) e **fundir** os gols com as lesões numa ÚNICA lista `events` **ordenada cronologicamente** (minuto asc + desempate determinístico: minuto, lado casa<fora, seq de geração). **Ausência limpa mantida:** retorna `m` (sem chave `events`) quando não há gol NEM lesão.
- [ ] `match.ts`/`season.ts`/`resolveMatch`/`simulateSeason` **INTOCADOS** — o stream de placar de 6 partes fica byte-idêntico.

### C) Contrato `/v1` (aditivo)
- [ ] Campo OPCIONAL novo `BandMatch.goals?: readonly BandGoal[]` (`BandGoal = {minute: number, isMine: boolean}`) em `band/types.ts`, mapeado em `buildTodayMatch` (`band/from-world.ts`) a partir do `match.events` **já em mãos** (filtra `kind==='goal'`), orientado `isMine` comparando `event.clubId` ao clube do humano (**espelha a lógica de `goalsFor`**). Presente (possivelmente `[]`) quando `played`; **omitido pré-jogo**.
- [ ] **Gate de relógio:** a timeline herda o mesmo gate `settled` que já protege o placar do `todayMatch` (o MAJOR da SPEC-038: `cursor >= tickDay`) — aparece só quando a rodada MOSTRADA liquidou.

### D) Testes de golden-safety (a prova)
- [ ] Teste **SOMA EXATA** por-partida (a contagem de `kind:'goal'` por lado == `homeGoals`/`awayGoals`); minutos ∈ [1,90]; 0-0 → zero gols + ausência limpa.
- [ ] Teste **SCORE-NEUTRAL** (strip de TODOS os `events` → deep-equal ao `simulateSeason` puro, placar+tabela) + **selo de goldens** (`git diff` == 0 dos 5 fixtures) + **estabilidade das lesões** (o subconjunto `kind:'injury'` é idêntico com/sem os gols → streams disjuntos) + **determinismo/ordem**.
- [ ] Atualizar os asserts de lesão pré-existentes em `world-season.test.ts` (filtrar `kind==='injury'` antes de ler `.athleteId`/afirmar `every(injury)` — senão a união quebra o typecheck).
- [ ] Round-trip `publishWorldRound → readRound` recupera um `GoalEvent` byte-exato do `published_round.result` jsonb (sem migration).

---

## Escopo — o que está FORA

- **A NOTA do jogador (rating 0-10 ao vivo).** Motivo: fórmula não especificada + cross-schema (forma/moral) + absorve a 3.2 → fatia própria.
- **O render ~15min na faixa / a câmera-no-seu-jogador / o replay local.** Motivo: é o cliente WPF (card 4/3.4), server-first — **é a fatia 2 imediata**, mas fora daqui.
- **Eventos de ESCOLHA + intervenção na partida (3.2).** Motivo: SPEC própria; a fatia 1 é 100% passiva.
- **Resumo de 20s (perdeu ao vivo, 3.3).** Motivo: SPEC própria.
- **Stamina → substituições do técnico NPC.** Motivo: território da 2.3; stamina não existe no código; é cor, não muda resultado.
- **"Amigos assistem o mesmo jogo" como sincronização (websocket/SSE/servidor de partida).** Motivo: **sai de graça do determinismo** — todos leem o mesmo `published_round`. Zero infra de tempo-real nesta fatia.
- **Artilheiro (qual atleta marcou).** Motivo: aditivo depois (`GoalEvent.athleteId?`); exige roster, pareia com a nota/4.3.
- **A lesão AFETAR o placar.** Motivo: reescreveria `resolveMatch` e regeneraria os goldens.
- **Backfill de rodadas já publicadas.** Motivo: forward-only (jsonb = o que foi escrito); rodadas antigas renderizam sem timeline. Não é migration.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `packages/world-engine/src/types.ts` | modificar | `MatchEvent` → união `InjuryEvent \| GoalEvent`; `GoalEvent = {kind:'goal', clubId, minute}` |
| `packages/world-engine/src/engine/match-events.ts` | modificar | novo produtor puro `matchGoals(...)` (amostra os minutos; contagem = placar) |
| `packages/world-engine/src/engine/world-season.ts` | modificar | `enrichMatch`: 2º RNG `'goals'` + fusão cronológica gols+lesões numa lista `events` |
| `packages/world-engine/src/index.ts` | modificar | exportar `matchGoals`/`GoalEvent` se público |
| `packages/world-engine/src/engine/match-events.test.ts` | modificar | testes de `matchGoals` (soma exata, minutos, colisão, determinismo) |
| `packages/world-engine/src/engine/world-season.test.ts` | modificar | SCORE-NEUTRAL estendido + estabilidade das lesões + ordem; atualizar asserts de lesão (filtrar `kind`) |
| `services/api/src/band/types.ts` | modificar | `BandGoal` + `BandMatch.goals?` (aditivo) |
| `services/api/src/band/from-world.ts` | modificar | `buildTodayMatch` mapeia `match.events` (kind=goal) → `goals?` orientado `isMine` |
| `services/api/src/band/from-world.test.ts` | modificar | teste do mapper (isMine, `[]` quando played, omitido pré-jogo) |
| `services/world-store/test/band-readers.test.ts` (ou a suíte de round-trip) | modificar | round-trip publish→readRound de um `GoalEvent` |
| `specs/SPEC-043-…`, `specs/DONE-043-…` | criar | esta SPEC + o DONE |
| `CLAUDE.md` | modificar | Estado atual (ao final) |

**Intocado (o critério DURO):** `resolveMatch`/`simulateSeason` (`match.ts`/`season.ts`) e **os 5 goldens** (`__fixtures__/*.golden.json`), byte-idênticos (`git diff` = 0).

---

## Mudanças de schema (se aplicável)

**Nenhuma mudança de schema nesta feature.** Os gols viajam no mesmo `published_round.result` jsonb (`$type<RoundResult>()`) que já round-trippa as lesões (SPEC-031). Sem migration.

---

## Mudanças de API (se aplicável)

**Uma mudança ADITIVA no contrato `/v1` (política aditiva-only, SPEC-038):** um campo opcional novo em `GET /v1/band` → `BandState.club.todayMatch`:

```
BandMatch.goals?: readonly { minute: number; isMine: boolean }[]
  - presente (possivelmente []) quando a partida do dia MOSTRADA já liquidou (played + settled);
  - OMITIDO pré-jogo (ausente = "não se aplica");
  - `isMine` = o gol foi do clube do humano (espelha `goalsFor`).
Nenhum campo existente de BandMatch/BandState muda de tipo ou some.
```

Nenhum endpoint novo, nenhum método novo. O cliente atual (SPEC-042) ignora o campo desconhecido (tolerante) e segue funcionando.

---

## Critérios de aceitação

**Cenário 1 — A união discriminada compila em todo o repo**
- Dado `MatchEvent = InjuryEvent | GoalEvent`
- Quando rodar o typecheck de todo o repo (incl. `scheduler/round-outcomes.ts`, que faz narrowing `kind==='injury'`)
- Então verde; `MatchResult.events?` segue opcional; nenhum campo existente mudou de tipo.

**Cenário 2 — A timeline SOMA o placar exato (por-partida)**
- Dado `simulateWorldSeason(seededWorld, seed)`
- Quando contar os `GoalEvent` de cada partida por lado
- Então `events.filter(e=>e.kind==='goal' && e.clubId===homeId).length === homeGoals` E `...===awayId).length === awayGoals`, para TODA partida; todo minuto ∈ [1,90]; um 0-0 produz zero gols (e `enrichMatch` retorna `m` sem `events` se também não houver lesão).

**Cenário 3 — SCORE-NEUTRAL (o money path intocado)**
- Dado a temporada enriquecida (`simulateWorldSeason`)
- Quando remover TODOS os `events` de todas as partidas
- Então o resultado é deep-equal ao `simulateSeason` puro (placar E tabela byte-idênticos).

**Cenário 4 — O selo dos goldens (o critério DURO)**
- Dado a fatia aplicada
- Quando rodar `git diff --exit-code packages/world-engine/src/__fixtures__/*.golden.json`
- Então retorna 0 (season/prng/anchor/world/world-expansion byte-idênticos).

**Cenário 5 — Estabilidade das lesões (streams disjuntos)**
- Dado a temporada enriquecida COM gols
- Quando comparar o subconjunto `kind==='injury'` com uma referência computada só por `matchInjuries` (mesma seed)
- Então idênticos → o stream `'goals'` é disjunto do `'events'` (o placar/as lesões não deslocam).

**Cenário 6 — Determinismo + ordem cronológica**
- Dado a mesma `(world, seed)`
- Quando rodar `simulateWorldSeason` duas vezes
- Então deep-equal; e o array `events` de cada partida está ordenado por minuto ascendente com desempate determinístico (minuto, lado casa<fora, seq).

**Cenário 7 — O contrato aditivo + o gate de relógio (regressão da SPEC-038)**
- Dado um `GET /v1/band` de manhã de D+1, com a rodada de ONTEM já liquidada
- Quando montar o `todayMatch`
- Então `goals` reflete a rodada liquidada (`cursor>=tickDay`), orientado `isMine`; antes da liquidação `goals` é ausente; num 0-0 jogado `goals` é `[]`; token de A + `?athleteId=B` → sempre a timeline de A (autorização por construção).

**Cenário 8 — Sem migration (round-trip jsonb)**
- Dado uma rodada com um `GoalEvent`
- Quando `publishWorldRound` → `readRound`
- Então o `GoalEvent` volta byte-exato do `published_round.result`; nenhum arquivo de migration novo.

**Cenário 9 — Suíte completa verde**
- Dado a fatia
- Quando rodar `npm test` (ao vivo contra Postgres real p/ banda/round-trip) + typecheck/eslint(guardrail)/build/prettier
- Então todos verdes; ≥581 testes preservados + os novos.

---

## Segurança (se aplicável)

- **Autorização por construção (herdada da SPEC-038):** o `todayMatch.goals` deriva do clube do atleta da sessão; nenhuma rota lê identificador de ator. `isMine` é computado server-side.
- **OP-17 (thin renderer / motor puro):** a timeline é **narrativa read-only** — nada persiste nem aciona no scheduler a partir dos gols; zero interação com o money path.
- **Determinismo (guardrail):** o produtor é puro (só `nextInt`/`deriveSeed`), sob o guardrail de `packages/*` (sem `Math.random`/`Date`/`Intl`).
- **i18n:** zero prosa localizável (só `minute`/`isMine`/`clubId`).

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Colisão de discriminador (`'goals'` × `'events'`/placar) deslocaria um stream | Baixa | Injetividade do `deriveSeed` por prefixo + literal distinto; cravado pelo teste de estabilidade das lesões |
| A união quebra leitores que assumem `.severity`/`.athleteId` | Média | O único leitor de produção (`scheduler/round-outcomes.ts`) JÁ faz narrowing `kind==='injury'`; o `world-season.test.ts` precisa filtrar (previsto no in-scope) |
| A ordenação cronológica reordena `events` de partidas com 2 lesões | Baixa | Golden-neutro (nenhum golden carrega `events`); teste de ordem explícito p/ não regredir |
| Persistência forward-only (rodadas antigas sem timeline) | Baixa | Cosmético; documentar, não é migration |
| Interpretação errada de "ao vivo" (poll rápido/stream nas 15h) | Média | A fatia NÃO abre rota nem stream; a arquitetura correta é a timeline baixada 1× + replay local no cliente (fatia 2) — dentro de `<1% CPU`/autosuspend Neon |
| Escopo-creep p/ nota/artilheiro (puxam forma/moral e roster) | Média | Segurar a linha em minuto+lado; os seams (`athleteId?`, a nota) são aditivos |

**Dependências:**
- SPEC-031 (o seam `events?` + o padrão score-neutral + o RNG `'events'`) — em `main`.
- SPEC-038 (o `todayMatch` + o gate de relógio `settled`) — em `main`.
- **Precede:** a **fatia 2** (o cliente reproduz a timeline ~15min ao vivo — o "assistir"), depois a 3.2 (eventos de escolha), a nota, o artilheiro.

---

## Notas de implementação

- **Reusar EXATAMENTE o seam da SPEC-031:** os gols nascem só em `enrichMatch`, DEPOIS do placar; `match.ts`/`season.ts` intocados. O 2º RNG usa o discriminador **`'goals'`** (nunca `'events'`).
- **Contagem autoritativa:** `matchGoals` recebe `homeGoals`/`awayGoals` já fixados e amostra SÓ os minutos — nunca re-deriva a contagem.
- **Ordem determinística cross-engine:** não confiar na estabilidade do `Array.sort`; ordenar por chave total explícita `(minute, sideRank[home=0,away=1], seqDeGeração)`, unificando gols+lesões.
- **Colisão de minuto:** permitida (sorteio com reposição); o desempate acima garante ordem estável.
- **Mapper `isMine`:** espelhar `goalsFor` (`from-world.ts:67`) — `event.clubId === o clube do humano`.
- **Seams para o gancho (crescimento aditivo):** `GoalEvent.athleteId?` (o artilheiro), a nota do jogador e os eventos de escolha (3.2) entram **aditivos** sobre esta timeline — a fatia 1 já os deixa possíveis sem quebrar o `/v1`.
- **⚠️ Ritual do board:** aprovação da SPEC no card antes de codar; `set_done` antes do PR.
- **⚠️ CI (SPEC-166 + prettier):** o DONE precisa de `## Resumo do que foi feito` · `## Arquivos modificados` · `## Critérios de aceitação` · `## AI declaration`; `prettier --write` em TODOS os arquivos tocados antes do push.

---

## Checklist de aprovação

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora)
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas (Nenhuma — sem migration)
- [ ] Mudanças de API estão documentadas (aditiva: `BandMatch.goals?`)
- [ ] Critérios de aceitação são testáveis (9 cenários; incl. SCORE-NEUTRAL + selo de goldens)
- [ ] Riscos e superfície de segurança foram avaliados (golden-safety; união discriminada)
- [ ] Appetite é razoável para o escopo definido (2-3 dias)
- [ ] Não há conflito com SPECs abertas em paralelo

---

*SPEC-043 — método H1VE. A fatia 1 de "Dia de jogo ao vivo": a timeline de gols determinística (os minutos que SOMAM o placar já final), score-neutral (padrão SPEC-031, RNG `'goals'` disjunto), persistida no jsonb (sem migration) e exposta aditivamente no `/v1`. Moldada para o replay + os seams do artilheiro/nota/interação. `resolveMatch`/`simulateSeason` e os 5 goldens INTOCADOS.*
