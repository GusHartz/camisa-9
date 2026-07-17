# DONE-029 — Forma & Moral: aplicar na partida (fatia B)

> Registro de conclusão (par do `SPEC-029`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-029 (par da SPEC-029) |
| **Feature** | Forma/Moral — fatia B: aplicar na partida — card do board |
| **Roadmap item** | 2.3 (Simulação do atleta — fatia B) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/forma-moral-fatia-b-aplicar-na-partida-spec-028` |
| **Concluída em** | 2026-07-17 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## O que foi entregue

Fecha o "aplicar já": **Forma e Moral passam a modular a ability efetiva do humano na PARTIDA**. Um jogador em fase/moral altas puxa o `clubStrength` para cima; em má fase, para baixo. A modulação é **in-memory** no `runDailyRound` (via um **seam injetado**), então a **base congelada de `world_occupation.ability` (SPEC-020) fica intacta** e os **4 goldens byte-idênticos** (a lógica do engine não é tocada — `clubStrength` é reusado).

### A) Lib pura `packages/player/mood.ts` (extensão)
- `MOOD` ganhou `formaWeight: 6`, `moralWeight: 4`, `matchSwingPct: 12` (tunáveis).
- `moodAbilityPct(forma, moral)` — o multiplicador (%) centrado em 100, peso 60/40, **simétrico** (trunca a magnitude rumo a zero — sem o viés pessimista do `floor` do sinal). 50/50 → 100; 100/100 → 112; 0/0 → 88.
- `effectiveAbility(base, forma, moral)` = `floor(base × pct / 100)`, clampeado a [0,100]. Inteiro, guardrail-safe.

### B) `services/world-store` — a modulação in-memory + o seam no tick
- `applyMoodToWorld(world, abilityByAthleteId)` (**puro**, novo módulo): reconstrói o `WorldState` sobrescrevendo a ability dos atletas mapeados + **recomputando `clubStrength`** dos clubes afetados (skip no-op se a ability não muda; clube sem atleta mapeado mantém a referência). No-op no mapa vazio. Reusa `clubStrength` (já exportado — **engine intocado**).
- `runDailyRound(db, seed, epochMs, modulate?)` — 4º param **opcional** `modulate?: WorldModulator` (default identidade), aplicado entre `readWorld` e `simulateWorldSeason`. Sem ele → comportamento idêntico (os testes NPC não mudaram).

### C) `services/player-store` — o batch de leitura
- `readMoodByIds(db, athleteIds): Map<id, Mood>` (`inArray`) — forma/moral de vários atletas de uma vez.

### D) `services/world-entry` (a costura cross-schema — o modulador injetável)
- `moodModulator(worldDb, playerDb, seed)` → o `WorldModulator` que o **scheduler** injeta no `runDailyRound`: lê `readWorldOccupations` (world) + `readMoodByIds` (player), projeta `effectiveAbility(base congelada, forma, moral)` → aplica `applyMoodToWorld`. Só leituras; nada é persistido.

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | O modificador (puro) | `mood.test.ts`: neutro=base, alto>base, baixo<base, monotônico, clamp [0,100], simetria, peso 60/40. |
| 2 | A modulação (pura) | `mood-modulation.test.ts`: sobrescreve+recomputa força, clube irmão intocado, no-op vazio, skip no-op (override=ability), muda a simulação. |
| 3 | O tick com o seam | `daily-round.test.ts`: `runDailyRound(..., modulate)` → a rodada **PUBLICADA** bate com a sim MODULADA e difere da pura; **sem** modulate → idêntico (12 testes NPC intactos). Ao vivo. |
| 4 | A costura ponta-a-ponta | `mood-modulator.test.ts`: humano com forma/moral altas → `clubStrength` ≥; baixas → ≤; a efetiva = `effectiveAbility(base, forma, moral)`. Ao vivo. |
| 5 | Base congelada intacta | `world_occupation.ability` inalterada após o tick modulado (modulação in-memory). Ao vivo. |
| 6 | Determinismo | `applyMoodToWorld`/`effectiveAbility` puros; a rodada modulada é reproduzível. Testado. |
| 7 | OPs & gates | sem `any` (14); ≤50/função (15); ≤300/arquivo (16); genéricos (11); regra na lib / IO no store (17); `typecheck`/`eslint`/`build`/`test`/prettier verdes; **lógica do engine + 4 goldens intocados** (`git diff` = 0); ao vivo serial. |

**377/377 testes** (363 preservados + 14 novos: 5+2 puros de `mood`, 3+1 puros de `applyMoodToWorld`, 2 ao vivo da costura, 1 batch `readMoodByIds`, 1 ao vivo do seam no tick — os 5 da revisão).

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

- **1 MAJOR real, CONFIRMED e CORRIGIDO — o seam do tick não era testado.** O `modulate` do `runDailyRound` (o ponto de integração com o **money path**) nunca era exercitado — todos os testes chamavam com 3 args. Uma regressão que passasse o mundo NÃO-modulado (ou esquecesse o `await`) deixaria Forma/Moral fora da rodada publicada sem quebrar nenhum teste. **Fix:** teste ao vivo que roda `runDailyRound(..., modulate)` e prova que a rodada **PUBLICADA** = a sim modulada (o seam threadou o mundo modulado) **e** ≠ a pura (a modulação mexeu).
- **1 nit, CONFIRMED e CORRIGIDO — assimetria do `floor`.** `moodAbilityPct` aplicava `floor` a um quociente com sinal → viés pessimista perto do neutro (55/55 → +1 mas 45/45 → −2). **Fix:** trunca a magnitude rumo a zero (via `Math.abs`) → simétrico; anchors preservados.
- **1 minor, CONFIRMED e DOCUMENTADO (trade-off aceito, débito sinalizado) — replay/auditoria.** Forma/moral são os **inputs** da modulação, mas são **mutados in-place** todo dia (decay + bumps) **sem histórico por rodada**. Logo uma rodada humana publicada **não é mais recomputável a partir de (seed + estado)** — só do `published_round.result` (que é durável/atômico). Antes da SPEC-029 a linha do tempo humana era recomputável da base congelada (imutável) + seed; agora depende de forma/moral do dia, que o passe seguinte sobrescreve. **A linha do tempo NÃO se perde** (o `published_round` é a fonte durável), mas a garantia do charter muda de "recomputar dos inputs" para "confiar no resultado gravado". **Débito registrado** (como a idempotência do `accrueRound`, SPEC-024): se o replay-dos-inputs for exigido, um **snapshot de forma/moral por rodada** é um card de auditoria futuro. **Não corrigido nesta fatia** (fora do escopo in-memory; decisão explícita).
- **Achados minor/nit de cobertura → +testes** (batch `readMoodByIds` com ausentes, skip no-op, simetria).
- **3 achados REFUTED** (não reproduziram).

---

## Escopo deferido (futuro)

- **A química** (o humano influenciando a ability dos COLEGAS) — seam futuro.
- **O snapshot de forma/moral por rodada** (para o replay-dos-inputs) — card de auditoria (débito acima).
- **O wiring no clock real** — o **scheduler** chama `runDailyRound(..., moodModulator(...))` 1×/dia.
- **Stamina** · os **12 atributos** · a performance de partida como driver de forma (card 1.1/3.2).

---

## Arquivos

**Criados:** `services/world-store/src/store/mood-modulation.ts` · `services/world-store/test/mood-modulation.test.ts` · `services/world-entry/src/mood-modulator.ts` · `services/world-entry/test/mood-modulator.test.ts` · `specs/SPEC-029-*.md` · `specs/DONE-029-*.md`.

**Editados:** `packages/player/src/mood.ts` (+ barrel) · `mood.test.ts` · `services/world-store/src/store/daily-round.ts` (+ barrel) · `daily-round.test.ts` · `services/player-store/src/store/mood-repo.ts` (+ barrel) · `mood-repo.test.ts` · `services/world-entry/src/index.ts` · `docs/projeto/roadmap.md` · `CLAUDE.md` (Estado atual + flip SPEC-027 → PR #31 + correção "fatia B (SPEC-028)" → 029).

**Intocado:** a **lógica** do `packages/world-engine` (só reusa `clubStrength`) e **os 4 goldens** (`git diff` = 0); a base congelada de `world_occupation.ability`; sem migration.

---

*DONE-029 — método H1VE. A fatia B fechou o "aplicar já": Forma/Moral modulam a ability efetiva do humano na partida, in-memory, via um seam injetado que mantém o world-store desacoplado do player-store. A revisão pegou o gap real (o seam do tick sem teste), corrigiu a simetria, e sinalizou o débito de replay-dos-inputs (snapshot por rodada = card futuro). Engine e goldens intocados. Renumerado de 028 (GTM) para 029.*
