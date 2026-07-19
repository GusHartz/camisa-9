# DONE-031 — Partida rica: ocorrência de lesão (fatia 1)

> Registro de conclusão (par do `SPEC-031`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-031 (par da SPEC-031) |
| **Feature** | Partida rica / eventos de partida — card do board |
| **Roadmap item** | 1.1 (motor de partida enriquecido) — 1ª fatia |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/partida-rica-eventos-de-partida-1-1-enriquecido-3-2` |
| **Concluída em** | 2026-07-19 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## O que foi entregue

Fecha o ciclo que a SPEC-026 abriu: **a partida finalmente MACHUCA**. Um evento de lesão determinístico faz o `injureFromMatch` (o seam que ninguém chamava) **disparar** — o arco de lesão (contusão → recuperação → volta por cima) finalmente ACONTECE em produção. E o card "que tocaria o engine/golden" saiu **de graça**.

### A) `packages/world-engine` — o tipo + a lib pura de eventos
- `MatchEvent` (novo): fatia 1 = a lesão (`kind:'injury'`, `clubId`, `athleteId`, `severity`, `minute`). `MatchResult` ganhou `events?` opcional.
- `match-events.ts` (novo, PURO): `matchInjuries(homeClubId, homeRoster, awayClubId, awayRoster, rng)` — decide (raro, ~4%/lado), sorteia o atleta (do elenco), a gravidade (ponderada leve>media>grave), o minuto. `MATCH_EVENTS` tunável. Inteiro/guardrail-safe. NÃO altera o placar.
- `world-season.ts`: DEPOIS do placar, anexa os `events` com um **RNG SEPARADO** (`deriveSeed(..., 'events')`) — os elencos estão AQUI. `resolveMatch`/`simulateSeason` **intocados**.

### B) `services/scheduler` — o wiring (a borda injeta a lesão)
- `roundOutcomes` colhe prêmios E lesões da rodada publicada; `injuryFor` acha o evento cujo `athleteId === occ.athleteId`; `runHumanPasses` chama `injureFromMatch(playerDb, occ.humanAthleteId, day, severity)` — mapeando id-do-mundo → id-do-player. **ANTES** dos demais passes (o `injured` do dia reflete na geração). NPC lesionado → não persiste (só humanos). Report ganhou `injured`.

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | Os eventos (puro) | `match-events.test.ts`: determinismo, taxa rara, atleta do roster, gravidade ponderada, roster vazio. |
| 2 | O enriquecimento | `world-season.test.ts`: eventos emitidos, atleta do elenco certo, determinismo com eventos. |
| 3 | **GOLDENS INTOCADOS** (o critério DURO) | `season`/`world`/`prng`/`anchor` byte-idênticos (`git diff __fixtures__/` = 0); + teste **SCORE-NEUTRAL** que prova o placar/tabela enriquecido == `simulateSeason` puro. |
| 4 | O seam ATIVADO | `daily-tick.test.ts`: evento de lesão na rodada → o humano fica lesionado (`readInjuryState`); + o **PAYOFF** (humano lesionado → o tick gera `lesao-volta` no dia). Ao vivo. |
| 5 | NPC não persiste | evento de um `athleteId` sem ocupação → nenhuma lesão no player-store; não misroteia. Ao vivo. |
| 6 | Idempotência | o tick 2× não re-lesiona (1 ativa/atleta). Ao vivo. |
| 7 | OPs & gates | sem `any`; ≤50/função; ≤300/arquivo; guardrail verde; `lint`/`typecheck`/`build`/`test`/prettier verdes; **`resolveMatch`/`simulateSeason` e os 4 goldens intocados** (`git diff` = 0); sem migration (jsonb). |

**402/402 testes** (388 preservados + 14 novos: 5 puros de `match-events`, 4 de `world-season` [incl. score-neutral], 5 ao vivo do tick [seam, idempotência-lesão, NPC, robustez, payoff]).

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

- **O NÚCLEO voltou SÓLIDO:** determinismo (o RNG de eventos separado do placar), goldens byte-idênticos e guardrail — **confirmados corretos**. A tese central (enriquecer sem tocar o money path) resistiu.
- **1 robustez real, CONFIRMED e CORRIGIDA:** uma lesão que LANÇA (gravidade corrompida no jsonb, falha transitória) rodava dentro de `runHumanPasses` sem isolamento → starvaria os demais passes do humano no dia (mood/decisões/recuperação) e subcontaria o accrue. **Fix:** `tryInjure` isola a injeção (try/catch, log OP-11) → a lesão é best-effort, os demais passes seguem. +teste (gravidade inválida → isolada, decisões presentes).
- **MAJOR de cobertura → +testes:** o **PAYOFF** (injured → `lesao-volta` via o tick) não era testado + o seam test injetava na 2ª tick (dia já selado); o **SCORE-NEUTRAL** não era assertado (só a isolação do `simulateSeason`); o **NPC não-persiste**. Todos cobertos.
- **1 débito latente do teste do scheduler (SPEC-030) corrigido:** o `wipeAll` do `daily-tick.test.ts` não limpava `turnover_report` → a linha da viragem acumulava entre runs → o insert conflitava (o `season_rolled` virava `deferred`). Adicionado `delete(turnoverReport)`.
- **nit notado (não corrigido):** a idempotência da lesão é por 1-ativa/atleta (sem ledger durável como accrue/mood) → um REPLAY cross-day (re-rodar um dia já vencido após a recuperação fechar) re-inseriria a lesão. Não exercitado (o scheduler só avança para frente); é o mesmo território do snapshot-por-rodada de auditoria.

---

## Escopo deferido (fatia 2 / futuro)

- **O timeline de gols** (`kind:'goal'` com minuto/artilheiro).
- **Os eventos de ESCOLHA interativos (3.2)** — o jogador decide durante a partida.
- **A lesão AFETAR o placar** (enfraquecer o time na hora) — reescreveria o `resolveMatch`.
- **Ponderar o atleta lesionado** (por minutos/físico); card de partida / dia de jogo ao vivo / faixa.

---

## Arquivos

**Criados:** `packages/world-engine/src/engine/match-events.ts` (+ `match-events.test.ts`) · `specs/SPEC-031-*.md`, `specs/DONE-031-*.md`.

**Editados:** `packages/world-engine/src/types.ts` (`MatchEvent` + `events?`) · `engine/world-season.ts` (enriquecimento) · `world-season.test.ts` (+score-neutral) · `index.ts` (barrel) · `services/scheduler/src/daily-tick.ts` (roundOutcomes + tryInjure + injury wiring) · `main.ts` (log `lesões`) · `daily-tick.test.ts` (+seam/NPC/robustez/payoff + wipe de `turnover_report`) · `docs/projeto/roadmap.md` · `CLAUDE.md` (Estado atual + flip SPEC-030 → PR #33).

**Intocado (o critério DURO):** `resolveMatch`/`simulateSeason` (o motor de placar) e **os 4 goldens** (`git diff` = 0); o `world-store` (jsonb schemaless, sem migration); o `injury-repo` (só é chamado).

---

*DONE-031 — método H1VE. A partida finalmente machuca: o evento de lesão nasce no `world-season` (que tem os elencos), com RNG separado do placar → o motor de placar e os 4 goldens ficam byte-idênticos (o critério das últimas SPECs sobrevive mesmo no card "que tocaria o engine"). A borda (o tick) injeta a lesão via `injureFromMatch`, ativando o arco da SPEC-026. A revisão confirmou o núcleo sólido; corrigi 1 robustez real (isolar a lesão que lança) + cobri o payoff/score-neutral/NPC + limpei um débito de teste da SPEC-030.*
