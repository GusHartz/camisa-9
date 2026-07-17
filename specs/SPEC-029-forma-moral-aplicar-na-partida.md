# SPEC-029 — Forma & Moral: aplicar na partida (fatia B)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | **SPEC-029** (o 028 foi tomado pela *página Coming Soon na Steam* — PR #30 do 24bit; renumerado para evitar colisão) |
| **Feature** | Forma/Moral — fatia B: aplicar na partida — card do board (*título diz "SPEC-028"; renumere p/ 029 se quiser*) |
| **Slug** | forma-moral-aplicar-na-partida |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 2.3 (Simulação do atleta — fatia B) |
| **Appetite** | **2 a 3 dias** (fatia B: a fórmula pura + a modulação in-memory + a costura; sem tocar a lógica do engine). |
| **Prioridade** | ALTA — completa o "aplicar já" (a fatia A / SPEC-027 só ativou as barras no player-store). |
| **Criada em** | 2026-07-17 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-17)

1. **Peso Forma/Moral no modificador = 60/40** (default recomendado, **tunável**). A Forma (afiação de jogo) é o driver mais DIRETO de desempenho; a Moral entra como coadjuvante. `pesoForma=6`, `pesoMoral=4`.
2. **Força do efeito = ±12%** (moderado, **tunável**). Um humano em ótima fase (80/80) joga ~+7% de ability; maxado (100/100) +12%; arrasado (20/20) −7%. Os focos/treino seguem o **principal** determinante — forma/moral são um diferencial sensível, não o protagonista.
3. **Escopo = só a ability DO PRÓPRIO humano.** A química (o humano influenciando os colegas) fica **fora** (seam futuro). Os NPCs não têm forma/moral → intocados.
4. **In-memory, base congelada intacta, goldens byte-idênticos.** A modulação acontece **só em memória** no caminho da rodada (zero escrita no snapshot); a base congelada de `world_occupation.ability` (SPEC-020) NÃO muda. Os 4 goldens são 100%-NPC → um modificador só-humano **não os regenera**.
5. **Modulação = seam INJETADO** (desacopla). O `runDailyRound` ganha um param **opcional** `modulate?` (default identidade) → o `world-store` **não** importa o `player-store`; a costura cross-schema (que lê forma/moral) é injetada. Os testes existentes do `runDailyRound` (NPC) **não mudam** (o param é opcional).

---

## Objetivo

Fechar o "aplicar já" que o founder escolheu: **Forma e Moral passam a afetar a PERFORMANCE da partida**. Na fatia A (SPEC-027) as barras ganharam vida e já entram nas decisões; agora elas **modulam a ability efetiva do humano** no cálculo da força do clube — um jogador em fase/moral altas **puxa o clube para cima**, em má fase **para baixo**. A modulação é **in-memory** no `runDailyRound` (a base congelada da SPEC-020 fica intacta; os goldens byte-idênticos).

---

## Contexto e motivação (fatos verificados no repo)

- **`runDailyRound(db, seed, epochMs)`** (`services/world-store/src/store/daily-round.ts:36`): lê o mundo em `:43` (`readWorld`) e simula em `:48` (`simulateWorldSeason(world, seed)`). **O ponto de modulação é entre `:43` e `:48`** — modular o `WorldState` em memória antes de simular.
- **A ability humana entra no `WorldState` via a coluna-cache `athlete.ability`** (congelada na ocupação, SPEC-020); o engine puro lê `Athlete.ability` (`world-engine/types.ts:77`, "0..100") só via **`clubStrength`** (`world-engine/engine/roster.ts:8` — média inteira das `strengthTopN` melhores). **`clubStrength` JÁ é exportado** do barrel do engine (`world-engine/index.ts:22`) → reusável na costura **sem tocar o engine**.
- **`readWorldOccupations(worldDb, seed): Promise<OccupationView[]>`** (`world-store/occupation-repo.ts:121`, já exportado) dá TODAS as ocupações humanas: `athleteId` (id no mundo), `humanAthleteId` (id no player-store) e `ability` (a base **congelada**). É o join world↔player.
- **`readMood`** (`player-store/mood-repo.ts`, SPEC-027) dá `{forma, moral}` por atleta. Falta um **batch** (`readMoodByIds`).
- **A costura de dois handles existe** (`services/world-entry`, SPEC-020): o molde para ler o player + escrever/computar no mundo.

---

## Escopo — o que está DENTRO (fatia B)

**A) Lib pura `packages/player/mood.ts` (extensão — a matemática do modificador):**
- [ ] `MOOD` ganha `formaWeight: 6`, `moralWeight: 4`, `matchSwingPct: 12` (tunáveis).
- [ ] `moodAbilityPct(forma, moral)` → o multiplicador em % centrado em 100: `100 + floor(matchSwingPct × (formaWeight×(forma−baseline) + moralWeight×(moral−baseline)) / span)`, `span = (formaWeight+moralWeight)×(max−baseline)`. Inteiro; em 50/50 → 100; em 100/100 → 112; em 0/0 → 88.
- [ ] `effectiveAbility(base, forma, moral)` → `floor(base × moodAbilityPct(...) / 100)`, **clampeado ao domínio da ability [0,100]**. Standalone, inteiro, guardrail-safe (só `Math.floor`/`max`/`min`).

**B) `services/world-store` — a modulação in-memory + o seam no tick:**
- [ ] `applyMoodToWorld(world, abilityByAthleteId: ReadonlyMap<string, number>): WorldState` (**puro**, novo módulo): reconstrói `tiers → leagues → clubs → roster` sobrescrevendo a `ability` dos atletas presentes no mapa e **recomputando `clubStrength`** dos clubes afetados. **No-op** se o mapa é vazio (mundo NPC → `WorldState` inalterado). Reusa `clubStrength` do engine; **engine intocado**.
- [ ] `runDailyRound(db, seed, epochMs, modulate?)` — 4º param **opcional** `modulate?: (world: WorldState) => WorldState | Promise<WorldState>` (default **identidade**). Aplicado entre `readWorld` (:43) e `simulateWorldSeason` (:48): `const w = modulate ? await modulate(world) : world`. Sem `modulate` (ou mundo sem humanos) → **comportamento idêntico** (os testes NPC existentes não mudam).

**C) `services/player-store` — o batch de leitura:**
- [ ] `readMoodByIds(db, athleteIds): Promise<Map<string, Mood>>` (`inArray`) — o `mood-repo` lê forma/moral de vários atletas de uma vez.

**D) `services/world-entry` (a costura cross-schema — o modulador injetável):**
- [ ] `moodModulator(worldDb, playerDb, seed): (world) => Promise<WorldState>` — lê `readWorldOccupations` (world) + `readMoodByIds` (player) → para cada ocupação, `effectiveAbility(o.ability [base congelada], forma, moral)` → `Map<o.athleteId, ability>` → `applyMoodToWorld(world, map)`. É o que o **scheduler** injeta no `runDailyRound`.

**E) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA (futuro)

- **A química** (o humano influenciando a ability dos COLEGAS) — seam futuro.
- **O wiring no clock real** — o **scheduler** chama `runDailyRound(..., moodModulator(...))` 1×/dia (card do scheduler).
- **Persistir a ability modulada** no snapshot — NÃO; ela é in-memory (a base congelada da SPEC-020 fica intacta).
- **Stamina** (dentro da partida) · os **12 atributos** · a performance de partida como driver de forma (card 1.1/3.2).

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/mood.ts` (+ `index.ts`) | editar — `moodAbilityPct`/`effectiveAbility` + tunáveis. |
| `packages/player/src/mood.test.ts` | editar — testes puros do modificador. |
| `services/world-store/src/store/mood-modulation.ts` (+ `index.ts`) | criar — `applyMoodToWorld` (puro). |
| `services/world-store/src/store/daily-round.ts` | editar — o 4º param opcional `modulate?` + aplicá-lo antes de simular. |
| `services/world-store/test/daily-round.test.ts` (ou novo) | editar/criar — o modulador altera o resultado; sem ele, idêntico. |
| `services/player-store/src/store/mood-repo.ts` (+ `index.ts`) | editar — `readMoodByIds` (batch). |
| `services/world-entry/src/mood-modulator.ts` (+ `index.ts`) | criar — `moodModulator` (a costura injetável). |
| `services/world-entry/test/mood-modulator.test.ts` | criar — a costura ponta-a-ponta (humano em fase → clube mais forte). |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 2.3 (fatia B) + flip SPEC-027 → PR #31. |
| `specs/SPEC-029-*.md`, `specs/DONE-029-*.md` | criar. |

**Intocado:** a **lógica** do `packages/world-engine` (só reusa `clubStrength`, já exportado) e **os 4 goldens** (`git diff` = 0 — a modulação nunca entra nos testes golden; o param é opcional/identidade); a base congelada de `world_occupation.ability` (SPEC-020) — a modulação é in-memory.

---

## Critérios de aceitação

1. **O modificador (puro):** `effectiveAbility(base, 50, 50) === base` (neutro); forma/moral altas → `> base`; baixas → `< base`; **monotônico** (mais forma/moral ⇒ ≥ ability); peso 60/40 respeitado; clampeado a [0,100]; `moodAbilityPct` = 100 no neutro, 112 no 100/100, 88 no 0/0. Testado puro.
2. **A modulação (pura):** `applyMoodToWorld` sobrescreve só os atletas do mapa e **recomputa `clubStrength`** dos clubes afetados; mapa vazio → `WorldState` **deep-equal** ao original (no-op). Testado.
3. **O tick com o seam:** `runDailyRound(db, seed, epochMs, modulate)` publica a rodada com as abilities moduladas; **sem** `modulate` → resultado **idêntico** ao atual (os testes NPC existentes passam sem edição). Testado ao vivo.
4. **A costura ponta-a-ponta:** um humano ocupando uma vaga, com **forma/moral altas**, deixa o `clubStrength` do clube dele **maior** (e o resultado da rodada muda) vs. o mesmo mundo sem a modulação; forma/moral baixas → menor. Testado ao vivo.
5. **Base congelada intacta:** após o tick modulado, `world_occupation.ability` e a coluna-cache `athlete.ability` **não mudam** (a modulação é in-memory). Testado.
6. **Determinismo:** dado o mesmo (mundo, ocupações, forma/moral, seed), a rodada modulada é **reproduzível** (o `applyMoodToWorld` é puro; forma/moral são estado persistido). Testado.
7. **OPs & gates:** sem `any` (14); ≤50 linhas/função (15); ≤300/arquivo (16); erros genéricos (11); regra pura na lib / IO no store (17); guardrail verde; `lint`/`typecheck`/`build`/`test`/prettier verdes; **a lógica do engine e os 4 goldens intocados** (`git diff` = 0); ao vivo serial.

---

## Segurança

- **Autoridade server-side:** a modulação é decidida no servidor (o cliente nunca infla a própria ability). A base vem da ability congelada (autoridade); forma/moral vêm do player-store (server-side).
- **Determinismo / money path:** `applyMoodToWorld`/`effectiveAbility` são puros e inteiros (guardrail) → a rodada publicada é reproduzível e auditável. A base congelada intacta preserva o replay honesto (SPEC-020).
- **Sem inflar o domínio:** `effectiveAbility` é clampeado a [0,100] — um pico de forma não estoura a faixa de ability.
- **OP-11:** leituras cross-schema falhas → erro genérico.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Tocar o engine/golden** | Zero: reusa `clubStrength` (já exportado); a modulação é uma costura pura FORA do engine; o param `modulate?` é opcional/identidade → os testes golden e NPC não mudam (`git diff` = 0). |
| **Quebrar o replay honesto (SPEC-020)** | A base congelada NÃO muda (modulação in-memory); forma/moral são estado persistido → a rodada é reproduzível a partir de (base congelada + forma/moral). |
| **Acoplar world-store ↔ player-store** | Não: a modulação é um **seam injetado** (`modulate?`); a costura cross-schema vive no `world-entry` (que já importa os dois). O `world-store` fica desacoplado. |
| **Inflar `clubStrength` acima do domínio** | `effectiveAbility` clampeado a [0,100]; o `clubStrength` (média das top-N) segue no domínio. |
| **Overshoot da força do efeito** | ±12% (tunável) — os focos/treino seguem o principal; a revisão pode calibrar. |

**Dependências:** SPEC-027 (`mood.ts`/`readMood`/as colunas forma/moral), SPEC-020 (`readWorldOccupations`/`world_occupation.ability` congelada), SPEC-015 (`runDailyRound`), SPEC-009 (`clubStrength`/`WorldState`). **Precede:** o **scheduler** (que injeta o `moodModulator` no `runDailyRound`); a **química** (fatia futura).

---

## Notas de implementação

- **O seam injetado é a chave:** `runDailyRound` ganha `modulate?` (default identidade) → o `world-store` não conhece o `player-store`; a costura injeta. Testável isoladamente; os testes NPC existentes ficam intocados.
- **A base é a ability CONGELADA** (`o.ability` do `readWorldOccupations`), não a cacheada — a modulação parte da foto honesta da SPEC-020; nada é persistido de volta.
- **`applyMoodToWorld` reconstrói o `WorldState` readonly** (map sobre tiers→leagues→clubs→roster) e recomputa `clubStrength` só dos clubes afetados — puro, decomposto (OP-15/16).
- **Fecho do DONE:** "Estado atual" (SPEC-029, flipar SPEC-027 → PR #31) + `roadmap.md` (2.3 — fatia B). Corrigir as referências "fatia B (SPEC-028)" nos docs já mergeados → **SPEC-029**.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (modificador + modulação + costura; química/scheduler/persistência fora)
- [x] Arquivos listados corretos (verificados no repo, com linhas)
- [x] Sem mudança de schema (fatia in-memory; nenhuma migration)
- [x] Critérios testáveis (modificador, modulação no-op, tick com/sem seam, costura ponta-a-ponta, base intacta, determinismo)
- [x] Riscos avaliados (engine/golden, replay, acoplamento, domínio, calibração)
- [x] Decisões co-desenhadas registradas (peso 60/40, ±12%, só-humano, in-memory, seam injetado)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-029 — método H1VE. A fatia B fecha o "aplicar já": Forma e Moral passam a modular a ability efetiva do humano no cálculo da força do clube — in-memory no `runDailyRound`, via um seam injetado que mantém o world-store desacoplado do player-store. A base congelada da SPEC-020 fica intacta e os 4 goldens byte-idênticos (a lógica do engine não é tocada; `clubStrength` é reusado). Renumerado de 028 (tomado pelo GTM) para 029.*
