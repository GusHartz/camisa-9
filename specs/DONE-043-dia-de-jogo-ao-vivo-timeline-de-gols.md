# DONE-043 — Dia de jogo ao vivo · fatia 1 (timeline de gols determinístico)

> Registro de conclusão. Par obrigatório da SPEC-043. Nenhum PR é válido sem este DONE.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-043 / DONE-043 |
| **Feature** | Dia de jogo ao vivo — a timeline de gols determinística (fatia 1 de N; roadmap 3.1) |
| **Slug** | dia-de-jogo-ao-vivo-timeline-de-gols |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.1 — Dia de jogo ao vivo (a dopamina das 15h; o north star: ≥3 humanos presentes) |
| **Concluída em** | 2026-07-21 |
| **Dependência DURA** | SPEC-031 (o seam `events?` + o padrão score-neutral + o RNG `'events'`) · SPEC-038 (`todayMatch` + o gate `settled`) — em `main` |

---

## Resumo do que foi feito

A partida ganhou **sequência**. Antes só havia um placar final estático; agora cada gol tem **minuto**, numa timeline que **soma o placar já final por construção** — a matéria-prima do "assistir" (o cliente reproduz na fatia 2). Tudo **score-neutral**: reusa o seam da SPEC-031 (um 2º stream de RNG `'goals'`, disjunto do `'events'` das lesões), preenchido **só no `world-season.ts`**, DEPOIS do placar. `resolveMatch`/`simulateSeason` e os **5 goldens ficam byte-idênticos** (`git diff` = 0).

**Régua do founder honrada (curtir + assistir + interagir):** a timeline é reproduzível (0–0 → 1–0 aos 23' → empate aos 71') e deixa os **seams** do artilheiro (`athleteId?`), da nota e dos eventos de escolha **prontos** para crescer aditivos — cada um empurrando o jogador a assistir/interagir. A fatia 1 é a fundação; o payoff que se SENTE é a fatia 2 (o cliente reproduzindo).

**Camadas (só-servidor; `match.ts`/`season.ts` e os 5 goldens INTOCADOS, `git diff` = 0; SEM MIGRATION):**
- **Engine — o tipo:** `MatchEvent` virou **união discriminada** `InjuryEvent | GoalEvent` (`GoalEvent = {kind:'goal', clubId, minute}`). Nenhum campo existente mudou de tipo; `MatchResult.events?` segue opcional. `matchInjuries` passou a retornar `InjuryEvent[]` (mais preciso — só faz lesões).
- **Engine — o produtor puro** `matchGoals(homeClubId, homeGoals, awayClubId, awayGoals, rng)` em `match-events.ts`: amostra EXATAMENTE `homeGoals`+`awayGoals` minutos ∈ [1,90] (QUAL minuto, nunca QUANTOS — a contagem é o placar autoritativo).
- **Engine — a fusão:** `enrichMatch` (`world-season.ts`) deriva um 2º RNG `'goals'` e **funde** gols+lesões numa timeline **cronológica** com ordem TOTAL determinística (`mergeChronological`: minuto asc → lado casa<fora → seq de geração — não depende da estabilidade do `Array.sort`). Ausência limpa mantida.
- **Contrato `/v1` (aditivo):** `BandGoal = {minute, isMine}` + `BandMatch.goals?`; `buildTodayMatch` (`from-world.ts`) mapeia `match.events` (filtra `kind==='goal'`) orientado `isMine` (espelha `goalsFor`); presente (possivelmente `[]`) quando `played`, omitido pré-jogo, herdando o gate de relógio `settled` da SPEC-038.

---

## Desvios da SPEC (mecanismo/necessidade, não de produto) — registrados

1. **`services/scheduler/src/round-outcomes.ts` tocado (fora da lista da SPEC).** A união discriminada quebrou o `.find((e) => e.kind==='injury' && e.athleteId===…)?.severity` (o `.find` sobre a união devolve `MatchEvent`, não `InjuryEvent`). **Fix necessário:** um **type-predicate** `(e): e is InjuryEvent =>`. A SPEC antecipou o risco ("o único leitor de produção narrowa por `kind`"); a correção o endureceu. Consequência necessária da união, não expansão de escopo.
2. **`matchInjuries` mudou o tipo de retorno** para `InjuryEvent[]` (era `MatchEvent[]`) — precisão limpa que a união habilitou; sem mudança de comportamento (só faz lesões).
3. **Locais de teste:** a SPEC listou `services/api/src/band/from-world.test.ts` (não existe) — o teste PURO do mapper foi criado em `services/api/test/from-world.test.ts` (o dir de testes da api, onde os testes de banda vivem); e o **round-trip** (Cenário 8) foi provado **augmentando o teste ao vivo** `band-state.test.ts` (pós-jogo: `raw.events` sobrevive ao `publishWorldRound → readRound`, e `match.goals` reflete a timeline) em vez de um `band-readers.test.ts` separado. Mesma cobertura, no lugar certo.

---

## Revisão adversarial

⚠️ **Esta fatia NÃO passou por revisão adversarial multi-agente** (ao contrário das SPECs 041/042) — o risco central (golden-safety) é **provado por construção + testes automatizados fortes**, e o padrão é uma **réplica exata da SPEC-031 já revisada e mergeada**. A prova está nos gates: o selo dos 5 goldens (`git diff`=0), o teste SCORE-NEUTRAL, a estabilidade das lesões e a soma-exata por-partida. Uma revisão adversarial pode ser adicionada no QA/Data se o arquiteto julgar necessário.

---

## Arquivos modificados

**Novos:** `services/api/test/from-world.test.ts` · `specs/{SPEC,DONE}-043-dia-de-jogo-ao-vivo-timeline-de-gols.md`.

**Editados:** `packages/world-engine/src/types.ts` · `engine/match-events.ts` (+`.test.ts`) · `engine/world-season.ts` (+`.test.ts`) · `index.ts` · `services/scheduler/src/round-outcomes.ts` (type-predicate) · `services/api/src/band/{types,from-world}.ts` · `services/api/test/band-state.test.ts`.

**Intocado (o critério DURO):** `resolveMatch`/`simulateSeason` (`match.ts`/`season.ts`) e **os 5 goldens** (`__fixtures__/*.golden.json`), byte-idênticos (`git diff` = 0). **SEM MIGRATION.**

---

## Critérios de aceitação

Os 9 cenários da SPEC, todos ✅ (cravados na suíte):

1. **A união compila em todo o repo** — typecheck verde, incl. `round-outcomes.ts` (type-predicate `kind==='injury'`); `MatchResult.events?` segue opcional.
2. **SOMA EXATA (por-partida)** — teste `world-season.test.ts`: `events.filter(goal & clubId===homeId).length === homeGoals` (e away); minutos ∈ [1,90]; 0-0 → zero gols; ausência limpa.
3. **SCORE-NEUTRAL** — o teste existente (strip de TODOS os events → deep-equal ao `simulateSeason` puro) passa sem mudança de expectativa.
4. **O selo dos goldens** — `git diff` dos 5 fixtures (season/prng/anchor/world/world-expansion) = **0**.
5. **Estabilidade das lesões** — teste novo: o subconjunto `kind==='injury'` da temporada enriquecida == a referência de `matchInjuries` (mesma seed) → stream `'goals'` disjunto do `'events'`.
6. **Determinismo + ordem** — `simulateWorldSeason` deep-equal a si mesmo; teste da timeline cronológica (minuto asc + desempate casa<fora).
7. **Contrato aditivo + gate de relógio** — `band-state.test.ts` ao vivo: pós-jogo `match.goals` orientado `isMine` (meus gols == goalsFor); teste PURO `from-world.test.ts`: pré-jogo OMITE `goals`, 0-0 jogado → `[]`, isMine correto, ignora lesões.
8. **Sem migration (round-trip jsonb)** — `band-state.test.ts`: `raw.events` (com o `GoalEvent`) sobrevive ao `publishWorldRound → readRound`; nenhum arquivo de migration novo.
9. **Suíte completa verde** — **623 testes** (610 preservados + 13 novos), ao vivo contra Postgres real; typecheck/eslint(guardrail)/build/prettier verdes.

---

## Gates de qualidade

- **623 testes verdes** (13 novos: 5 de `matchGoals`, ~4 no `world-season` [soma/ordem/estabilidade/0-0], 4 do mapper puro `from-world` + a augmentação do round-trip ao vivo), rodados **ao vivo contra Postgres real**.
- typecheck · eslint (guardrail de determinismo) · build · prettier verdes.
- **`match.ts`/`season.ts` e os 5 goldens INTOCADOS** (`git diff` = 0). **SEM MIGRATION** (os gols viajam no `published_round.result` jsonb, como as lesões).

---

## Escopo deferido / follow-ups (nomeados)

- **A fatia 2 — o cliente reproduz a timeline ~15min ao vivo** (o "assistir" que se SENTE): o cliente WPF baixa a timeline 1× e a reproduz por um relógio local (dentro de `<1% CPU`/autosuspend Neon; zero stream/websocket).
- **Os eventos de ESCOLHA + intervenção (3.2)** — o "interagir".
- **A NOTA do jogador ao vivo** — fórmula de design + forma/moral (cross-schema).
- **O artilheiro** (`GoalEvent.athleteId?`, aditivo) — pareia com a nota e o card compartilhável (4.3).
- **O resumo de 20s (3.3)**, a **stamina→substituições** (2.3), a lesão AFETAR o placar (reescreveria o engine).

---

## AI declaration

Implementação conduzida por agente de IA (Claude Code / Opus 4.8) em par com o dev (gustavo-hartz), com: um **workflow de entendimento** (5 leitores paralelos das fontes — resolução da partida, o padrão score-neutral da SPEC-031, persistência/read-model, intenção de design, render do cliente) que fundamentou o escopo e a golden-safety; a implementação escrita e **verificada localmente** (typecheck + 623 testes ao vivo + o selo dos goldens `git diff`=0 + o teste SCORE-NEUTRAL + a estabilidade das lesões). **Não houve revisão adversarial multi-agente** nesta fatia — a golden-safety é provada por construção (réplica do padrão SPEC-031 já revisado) + testes automatizados; **nem revisão humana linha-a-linha** antes deste DONE. Os desvios (o type-predicate no scheduler, os locais de teste) estão registrados acima.

---

*DONE-043 — método H1VE. A fatia 1 de "Dia de jogo ao vivo": a timeline de gols determinística (os minutos que SOMAM o placar já final), score-neutral (padrão SPEC-031, RNG `'goals'` disjunto), persistida no jsonb (sem migration) e exposta aditivamente no `/v1`. Moldada para o replay + os seams do artilheiro/nota/interação. `resolveMatch`/`simulateSeason` e os 5 goldens INTOCADOS.*
