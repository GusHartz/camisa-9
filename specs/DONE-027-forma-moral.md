# DONE-027 — Forma & Moral (as duas barras vivas · fatia A)

> Registro de conclusão (par do `SPEC-027`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-027 (par da SPEC-027) |
| **Feature** | 2.3 (Forma/Moral) — card do board |
| **Roadmap item** | 2.3 (Simulação do atleta — MVP: duas barras persistentes) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/2-3-forma-moral` |
| **Concluída em** | 2026-07-17 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## O que foi entregue

As **duas barras persistentes do R4 — Forma e Moral** ganharam vida no player-store, **consumindo os seams que as SPECs 024/025/026 plantaram**. As barras **movem de verdade** (a moral sobe ao comprar/decidir/voltar de lesão; a forma cai na contusão) e o **payoff concreto**: o `moral` real entra no `DecisionContext` → o `crise-moral` (e as decisões gatilhadas por moral) **deixaram de ser inertes**. **Só-player-store**; a aplicação na performance da partida é a **fatia B (SPEC-028)**.

### A) Lib pura `packages/player/mood.ts` (sob o guardrail)
- `MOOD` tunável (`baseline 50`, `decayStep 5`, `lifestyleClamp ±30`, `injuryFormaDrag 20`, `trainFormaBump 6`).
- `clampBar` (prende `[0,100]`) · `stepToward` (passo inteiro rumo ao alvo, **monotônico, sem overshoot** nas duas direções) · `bumpBar` (evento na fonte, clampeado) · `lifestyleMoralOffset` (o componente `moral` das compras, **limitado ±clamp**) · `nextMoral` (decai rumo a `baseline + offset`) · `nextForma` (decai rumo a `baseline`, rebaixado `injuryFormaDrag` enquanto recuperando). Standalone, inteiro, guardrail-safe.

### B) `services/player-store` — as barras + a dinâmica + os wires
- **Migration aditiva `0007`** (OP-01): `athlete.forma`/`athlete.moral` — `integer NOT NULL DEFAULT 50` + CHECK `between 0 and 100`.
- `mood-repo.ts`: `applyDailyMood` (o **passe diário** `FOR UPDATE` — decai moral rumo ao alvo do estilo de vida [lê as compras] e forma rumo ao baseline [rebaixado se recuperando, lê a lesão]) · `readMood` · `bumpMoral`/`bumpForma` (as primitivas de **evento-na-fonte**, chamadas DENTRO da tx do repo-fonte).
- **A 2.3 APLICA os seams (evento-na-fonte, na tx do próprio repo):**
  - `answerDecision`/`resolveDeadline` → aplicam `outcome.moral` (o do jogador **e** o da conservadora do agente). *Cumpre "a 2.3 aplica moral" (SPEC-025).*
  - `advanceRecovery` **e** o fecha-lazily do `injureFromMatch` → aplicam o `comebackOutcome().moral` na transição `active→recovered` (a "volta por cima"), em **ambos** os produtores, exatamente 1×. *Cumpre "a 2.3 aplica o comeback" (SPEC-026).*
  - `applyTraining` → bump de forma (`trainFormaBump`).
- **Consumidor concreto:** `buildContext` lê `moral` da linha do atleta → `DecisionContext.moral` → `crise-moral` deixa de ser inerte (o payoff).

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | As barras (puro) | `mood.test.ts`: clamp, `stepToward` anti-overshoot (↑ e ↓), `bumpBar`, offset limitado (bordas ±clamp), `nextMoral`/`nextForma`, convergência. |
| 2 | Persistência | `athlete.forma`/`moral` default 50; `readMood`; CHECK `[0,100]`. Ao vivo. |
| 3 | A 2.3 aplica os seams | decisão respondida move a moral; `resolveDeadline` (fallback) move a moral da conservadora; `advanceRecovery` **e** o lazy-close aplicam o comeback; `applyTraining` sobe a forma. Ao vivo. |
| 4 | O passe diário | decai moral rumo ao alvo do estilo de vida (com/sem compras; satura em ±clamp) e forma rumo ao baseline (rebaixado recuperando; boundary do drag). Ao vivo. |
| 5 | O consumidor | moral baixa → `crise-moral` aparece na geração; moral neutra → não. Ao vivo. |
| 6 | Determinismo & clamps | barras nunca saem de `[0,100]` (teto **e** piso); passe converge (monotônico, sem oscilar). Ao vivo + puro. |
| 7 | Isolamento | os wires não tocam focos/saldo; decisão sem `moral` → moral inalterada. Ao vivo. |
| 8 | OPs & gates | sem `any` (14); ≤50/função (15); ≤300/arquivo (16); genéricos (11); migration aditiva (01); regra na lib / IO no store (17); `typecheck`/`eslint`/`build`/`test`/prettier verdes; **engine + 4 goldens intocados** (`git diff` = 0); world-store intocado; ao vivo serial. |

**363/363 testes** (338 preservados + 7 puros de `mood` + 18 ao vivo de `mood-repo`, incl. os 7 da revisão). Sem `DATABASE_URL`: puros sempre, ao vivo skip.

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

- **1 minor real, CONFIRMED e CORRIGIDO — o comeback engolido no lazy-close.** A transição `active→recovered` tem **dois produtores** (`advanceRecovery` **e** o fecha-lazily de `injureFromMatch`); só o primeiro aplicava o `+comeback` moral → uma re-lesão que chega antes do passe fechava a vencida em silêncio, **perdendo o bônus** no exato seam que a SPEC-027 liga. **Fix:** o lazy-close também aplica o comeback (na mesma tx), exatamente 1× (o outro produtor casa 0 linhas depois).
- **Calibração endurecida (achado refutado como bug, mas real como UX):** `trainFormaBump` **4→6** (> `decayStep`) — senão o passe do mesmo dia anulava o bump de treino (net-zero). Agora o treino rende **net-positivo** ("treino sobe forma", R4).
- **Lacunas de cobertura MAJOR/minor/nit CONFIRMED → +7 testes:** o moral da conservadora no `resolveDeadline`; **concorrência** de dois `answerDecision` (nenhum bump perdido — `FOR UPDATE`); convergência **com offset** (satura em ±clamp, não no baseline); boundary do drag da lesão; decisão sem-moral (inalterada); piso do clamp; o comeback no lazy-close (o fix). Puros: anti-overshoot ascendente + bordas do offset.
- **3 achados REFUTED** (não reproduziram).

---

## Escopo deferido (fatia B / futuro)

- **A aplicação na partida** — `effectiveAbility(base, forma, moral)` + a modulação in-memory da ability humana no `runDailyRound` + recompute de `clubStrength`: **fatia B (SPEC-028)**, logo em seguida (**card a criar**). A base congelada da SPEC-020 fica intacta; goldens byte-idênticos.
- **O passe no clock real** — o **scheduler** chama `applyDailyMood` 1×/dia (fatia de deploy). *Nota: como o `accrueRound` (SPEC-024), a **idempotência estrita por dia** do passe é concern do scheduler; o passe é monotônico/convergente (rodar 2× não oscila, mas decai 2 passos) — o ledger por dia entra no card do scheduler.*
- **Stamina** (partida rica) · os **12 atributos** (expansão) · **`fama`/`risco`** do agregado (outros seams) · a performance de partida como driver de forma (card 1.1/3.2).

---

## Arquivos

**Criados:** `packages/player/src/mood.ts` · `mood.test.ts` · `services/player-store/src/store/mood-repo.ts` · `services/player-store/src/migrations/0007_forma_moral.sql` (+ meta) · `services/player-store/test/mood-repo.test.ts` · `specs/SPEC-027-*.md` · `specs/DONE-027-*.md`.

**Editados:** `packages/player/src/index.ts` · `services/player-store/src/schema/athlete.ts` (+ barrel, drizzle.config) · `services/player-store/src/index.ts` · `decision-repo.ts` (aplica `outcome.moral` + lê `moral` no contexto) · `injury-repo.ts` (comeback no `advanceRecovery` **e** no lazy-close) · `training-repo.ts` (bump de forma) · `docs/projeto/roadmap.md` · `CLAUDE.md` (Estado atual + flip SPEC-026 → PR #29).

**Intocado:** `packages/world-engine` (engine puro) e **os 4 goldens** (`git diff` = 0); o `world-store` (a costura da rodada é a fatia B).

---

*DONE-027 — método H1VE. A fatia A ligou os seams das últimas 3 SPECs às duas barras vivas; o payoff (crise-moral deixa de ser inerte) está em código. A revisão pegou 1 gap real (o comeback engolido no lazy-close) + endureceu a calibração do treino; engine e goldens intocados. A aplicação na partida é a fatia B (SPEC-028), logo em seguida.*
