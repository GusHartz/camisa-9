# SPEC-027 — Forma & Moral (as duas barras vivas · fatia A)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-027 |
| **Feature** | 2.3 (Forma/Moral) — card do board |
| **Slug** | forma-moral |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 2.3 (Simulação do atleta — MVP: duas barras persistentes) |
| **Appetite** | **2 a 3 dias** (fatia A: só-player-store — barras + dinâmica + wire; sem cross-schema, sem tocar o engine). |
| **Prioridade** | ALTA — o card de payoff: liga os seams plantados (SPEC-024/025/026). |
| **Criada em** | 2026-07-17 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-17)

1. **Aplicar ao overall — SIM, mas em duas fatias.** O founder quer Forma/Moral **afetando a partida** (não mais um seam inerte). O "aplicar já" bem-feito é um vertical grande (subsistema novo + costura cross-schema na rodada), então **fatiamos**: **esta fatia A** entrega as **barras VIVAS e já CONSUMIDAS** (dinâmica + drivers + moral entra nas decisões); **a fatia B (SPEC-028, logo em seguida)** entrega a **aplicação na partida** (`effectiveAbility` + modulação in-memory no `runDailyRound`). O founder recebe o "aplicar já" **completo**, em dois PRs revisáveis.
2. **Dinâmica = baseline + offset + evento que decai.** Cada barra é persistente, clamp `[0,100]`, baseline **50**. Um **offset permanente** vem do estilo de vida (a Moral usa o componente `moral` do `aggregateTradeoffs` das compras possuídas — vive enquanto possuído); **eventos** (outcomes de decisão + comeback da lesão + treino) entram como bumps aplicados **na fonte** e a barra **decai** rumo ao alvo (baseline + offset) a cada dia. Modela "posse contínua vs. evento pontual" e evita a barra grudar em 100/0.
3. **Drivers da Forma (nesta fatia) = treino + lesão.** Como a Forma será aplicada ao overall (fatia B), ela **precisa se mexer** com drivers que já existem: **treino** dá um bump de forma; **lesão recuperando** puxa a forma para baixo (alvo rebaixado); o **comeback** (recovered) restaura. A performance de partida vira driver quando a partida rica existir (card 1.1/3.2).
4. **Engine e goldens INTOCADOS nesta fatia.** Fatia A é **só-player-store**; a modulação da ability (que tocaria o caminho da rodada) é a fatia B. Os 4 goldens seguem byte-idênticos.

---

## Objetivo

Dar vida às **duas barras persistentes do R4 FINAL — Forma e Moral** — no player-store, **consumindo os seams que as últimas SPECs plantaram**: o `aggregateTradeoffs` das compras (SPEC-024), o `outcome.moral` das decisões (SPEC-025) e o `comebackOutcome` da lesão (SPEC-026). O payoff concreto **agora**: o `moral` real entra no `DecisionContext` → o template `crise-moral` (e as decisões gatilhadas por moral) **deixam de ser inertes**. As barras passam a **mexer de verdade** (você vê a moral subir ao comprar/decidir/voltar de lesão; a forma cair na contusão). A aplicação na performance da partida é a **fatia B**.

---

## Contexto e motivação (fatos verificados no repo)

- **Os seams existem e estão inertes:**
  - `aggregateTradeoffs(ownedIds): Record<string, number>` (`packages/player/economy.ts:144`) — soma os trade-offs DECLARADOS das compras possuídas (chaves `moral`/`fama`/`risco`/`fisico`). Ninguém aplica.
  - `DecisionOutcome = Record<string, number|string>` (`packages/player/decisions.ts:11`) — o `outcome.moral` das opções; `DecisionContext.moral?` (`:28`) já existe; `crise-moral` usa `(c.moral ?? 100) < 30` (`:162`) — **inerte hoje**.
  - `comebackOutcome(): DecisionOutcome` = `{ moral: 12 }` (`packages/player/injury.ts:50`, `INJURY.comeback`) — a volta por cima; `advanceRecovery` (`injury-repo.ts:69`) devolve `{recovered}` (o gatilho); `readInjuryState`/`injuryPhase`/`isAvailable` dão a fase (recuperando = driver de forma).
- **O atleta não tem Forma/Moral:** `athlete` tem `fisico/tecnico/tatico/mental` + `training_xp`/`free_points`/`balance` (`schema/athlete.ts:30-46`) + CHECKs (`:57-63`). Colunas novas seguem o molde aditivo.
- **A geração de decisões lê o atleta:** `buildContext` (`decision-repo.ts:76-109`) monta o `DecisionContext` — o ponto onde o `moral` real entra (lido da mesma linha do atleta).
- **Os drivers de forma existem:** `applyTraining` (`training-repo.ts:47`, `FOR UPDATE`) e `advanceRecovery` (`injury-repo.ts:69`) — os pontos de bump.
- **`runDailyRound` (`world-store/.../daily-round.ts:36`) só recebe `worldDb`** — a costura cross-schema (ler forma/moral e modular a ability) é a **fatia B**; aqui não tocamos.

---

## Escopo — o que está DENTRO (fatia A)

**A) Lib pura `packages/player/mood.ts` (determinística, sob o guardrail):**
- [ ] `MOOD` tunável: `{ baseline: 50, min: 0, max: 100, decayStep, lifestyleClamp, injuryFormaDrag, trainFormaBump }`.
- [ ] `clampBar(v)` → `[min,max]`; `stepToward(current, target, step)` (passo inteiro rumo ao alvo); `bumpBar(current, delta)` (evento na fonte, clampeado).
- [ ] `lifestyleMoralOffset(tradeoffAgg)` — extrai + **limita** (`±lifestyleClamp`) o componente `moral` do `aggregateTradeoffs` (o offset permanente do estilo de vida).
- [ ] `nextMoral(current, lifestyleOffset)` — o passo diário: `stepToward(current, baseline + lifestyleOffset, decayStep)` (decai rumo ao alvo do estilo de vida; os eventos já entraram como bumps na fonte).
- [ ] `nextForma(current, injuredRecovering)` — o passo diário: alvo = `baseline − (injuredRecovering ? injuryFormaDrag : 0)`; `stepToward(...)`.
- **Standalone** (não importa o engine; inteiro em tudo — guardrail-safe).

**B) `services/player-store` — as barras persistidas + a dinâmica + os wires:**
- [ ] **Migration aditiva `0007`** (schema `player`, OP-01): `athlete.forma` e `athlete.moral` — `integer NOT NULL DEFAULT 50` + CHECK `between 0 and 100` (molde de `athlete.ts:57-63`).
- [ ] `mood-repo.ts` (novo): `applyDailyMood(db, athleteId, day)` — **o passe diário** (`FOR UPDATE`): lê as compras possuídas (→ `lifestyleMoralOffset`) + o `readInjuryState(day)` (→ `injuredRecovering`), aplica `nextMoral`/`nextForma`, escreve ambas. `readMood(db, athleteId)` → `{ forma, moral }`. `bumpMoral`/`bumpForma(tx, athleteId, delta)` — as primitivas de evento-na-fonte (usadas pelos repos irmãos, dentro da transação deles).
- [ ] **Wire evento-na-fonte (a 2.3 APLICA os seams declarados):**
  - `answerDecision`/`resolveDeadline` (`decision-repo.ts`): ao gravar o outcome, **aplica `outcome.moral`** à moral (via `bumpMoral`, na mesma transação `FOR UPDATE`). — *cumpre "a 2.3 aplica moral" (SPEC-025).*
  - `advanceRecovery` (`injury-repo.ts`): ao devolver `recovered:true`, **aplica o `comebackOutcome().moral`** (a volta por cima) via `bumpMoral`, na mesma transação. — *cumpre "a 2.3 aplica o comeback" (SPEC-026).*
  - `applyTraining` (`training-repo.ts`): aplica um **bump de forma** (`trainFormaBump`) via `bumpForma`, na mesma transação `FOR UPDATE`.
- [ ] **Wire do consumidor concreto:** `buildContext` (`decision-repo.ts`) lê `moral` da linha do atleta → preenche `DecisionContext.moral` → `crise-moral` e as decisões gatilhadas por moral **deixam de ser inertes** (o payoff desta fatia).

**C) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA (fatia B / futuro)

- **A aplicação na partida** (`effectiveAbility(base, forma, moral)` + a modulação in-memory da ability humana no `runDailyRound` + recompute de `clubStrength`) — **fatia B (SPEC-028)**, logo em seguida. **Card a criar.**
- **O passe diário no clock real** (o scheduler chama `applyDailyMood` 1×/dia) — fatia de deploy do scheduler.
- **Stamina** (só dentro da partida) — depende da partida rica.
- **Os 12 atributos evolutivos** (o R4 cita; hoje são 4 focos) — expansão futura, não é esta fatia.
- **`fama`/`risco`** do `aggregateTradeoffs` — outros seams (sistema de fama / risco de lesão), não as duas barras.
- **A performance de partida como driver de forma** — a partida rica injeta (card 1.1/3.2).

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/mood.ts` (+ `index.ts`) | criar — as barras puras (dinâmica + offset + evento). |
| `packages/player/src/mood.test.ts` | criar — testes puros. |
| `services/player-store/src/schema/athlete.ts` (+ migration `0007_*` + meta) | editar/criar — `forma`/`moral` (aditivo, OP-01). |
| `services/player-store/src/store/mood-repo.ts` (+ `index.ts`) | criar — `applyDailyMood`/`readMood`/`bumpMoral`/`bumpForma`. |
| `services/player-store/src/store/decision-repo.ts` | editar — aplica `outcome.moral` (answer/resolve) + lê `moral` no `buildContext`. |
| `services/player-store/src/store/injury-repo.ts` | editar — aplica o comeback (moral) no `advanceRecovery`. |
| `services/player-store/src/store/training-repo.ts` | editar — bump de forma no `applyTraining`. |
| `services/player-store/test/mood-repo.test.ts` | criar — testes ao vivo. |
| Suítes irmãs do player-store (`decision`/`injury`/`training`-repo test) | editar — cobrir os novos bumps; nenhuma tabela-filha nova (sem gotcha de `wipeAll`). |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 2.3 (fatia A) + flip SPEC-026 → PR #29. |
| `specs/SPEC-027-*.md`, `specs/DONE-027-*.md` | criar. |

**Intocado:** `packages/world-engine` (engine puro) e **os 4 goldens** (fatia A é só-player-store); o `world-store` (a costura da rodada é a fatia B).

---

## Critérios de aceitação

1. **As barras (puro):** `nextMoral` decai rumo a `baseline + lifestyleOffset` por `decayStep`; `nextForma` decai rumo a `baseline` (ou `baseline − injuryFormaDrag` recuperando); `clampBar`/`bumpBar` respeitam `[0,100]`; `lifestyleMoralOffset` limita a `±lifestyleClamp`. Testado puro.
2. **Persistência:** `athlete.forma`/`moral` nascem em 50 (default); `readMood` devolve o par; CHECK barra fora de `[0,100]`. Testado ao vivo.
3. **A 2.3 aplica os seams (evento-na-fonte):** responder uma decisão com `outcome.moral` move a moral; o `advanceRecovery` que recupera aplica o comeback (+moral); o `applyTraining` sobe a forma — todos na transação do próprio repo. Testado ao vivo.
4. **O passe diário:** `applyDailyMood` decai a moral rumo ao alvo do estilo de vida (compras possuídas) e a forma rumo ao baseline (rebaixado se recuperando). Testado ao vivo (com e sem compras; recuperando vs. são).
5. **O consumidor concreto:** com `moral` baixa persistida, `generateForDay`/`buildContext` preenche `DecisionContext.moral` → `crise-moral` **aparece**; com moral alta, não. O `crise-moral` deixa de ser inerte. Testado ao vivo.
6. **Determinismo & clamps:** as barras nunca saem de `[0,100]`; o passe é idempotente por dia (rodar 2× no mesmo dia converge, não oscila). Testado.
7. **Isolamento:** os bumps/o passe tocam só o atleta alvo; nenhum outro estado (focos/saldo) é alterado pelos wires de mood. Testado.
8. **OPs & gates:** sem `any` (14); ≤50 linhas/função (15); ≤300/arquivo (16); erros genéricos (11); migration aditiva (01); regra pura na lib / IO no store (17); guardrail verde; `lint`/`typecheck`/`build`/`test`/prettier verdes; **engine e os 4 goldens intocados** (`git diff` = 0); ao vivo serial.

---

## Segurança

- **Autoridade server-side:** as barras e a dinâmica são decididas no servidor; o cliente nunca escreve forma/moral. Os bumps só vêm de eventos validados (decisão respondida, recuperação, treino) — nunca de input livre.
- **OP-09/11:** os wires reusam a transação `FOR UPDATE` autenticada de cada repo; erros genéricos.
- **Anti-abuso:** o `lifestyleMoralOffset` é **limitado** (`±lifestyleClamp`) — comprar tudo não estoura a moral; os bumps são clampeados. Sem "loja de moral" (a moral não é comprável diretamente — só via os trade-offs declarados, com downside).
- **Determinismo:** as barras são função inteira do estado + eventos — sem `Math.random`/relógio na lib (guardrail).

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Fatia A "inerte para a partida"** (barras que não afetam o jogo ainda) | NÃO é inerte: as barras movem de verdade E o `moral` já é consumido pela geração de decisões (`crise-moral` ativa). A aplicação na partida é a fatia B, **committed** (SPEC-028 logo em seguida). |
| **Barra saturando/oscilando** | Baseline + offset + decayStep (o modelo escolhido) evita grudar em 100/0; passe idempotente por dia (converge). Testado. |
| **Broadness** (toca 4 repos) | É a identidade da 2.3 (ligar os seams). Cada toque é pequeno (um `bump` na transação existente) e coeso (tudo player-store). Sem tabela-filha nova → sem o gotcha de `wipeAll`. |
| **Tocar o engine/golden** | Zero: fatia A é só-player-store; a costura da rodada é a fatia B. |
| **Acoplar mood a economia/lesão** | `applyDailyMood` lê o que precisa no MESMO schema (compras, lesão); os bumps ficam na transação do repo-fonte (evento-na-fonte, o padrão de seam do projeto). |

**Dependências:** SPEC-016 (`athlete`), SPEC-024 (`aggregateTradeoffs`/compras), SPEC-025 (`DecisionOutcome`/`buildContext`), SPEC-026 (`comebackOutcome`/`advanceRecovery`). **Precede:** a **fatia B (SPEC-028)** — a aplicação na partida; o **scheduler** — que roda o `applyDailyMood` 1×/dia.

---

## Notas de implementação

- **A 2.3 é o card de payoff:** as SPECs 024/025/026 plantaram efeitos DECLARADOS; a fatia A os **aplica** às duas barras (evento-na-fonte) e fecha o loop mais visível (moral → decisões). O charter "a 2.3 aplica moral/o comeback" vira código.
- **Evento-na-fonte + decay:** os deltas entram onde o evento acontece (responder decisão, recuperar, treinar); o passe diário só faz o decay rumo ao alvo (baseline + offset do estilo de vida). Padrão coeso, sem um "event bus".
- **O `moral` no `buildContext`** vem da MESMA linha do atleta já lida (custo zero de leitura) — o wire mais limpo, sem novo param.
- **Fatia B (SPEC-028) espreitando:** `effectiveAbility(base, forma, moral)` + a modulação in-memory no `runDailyRound` (dois handles, molde do `enterWorld`) + recompute de `clubStrength` — a base congelada da SPEC-020 fica intacta, goldens byte-idênticos.
- **Fecho do DONE:** "Estado atual" (SPEC-027, flipar SPEC-026 → PR #29) + `roadmap.md` (2.3 — fatia A).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (barras + dinâmica + wire; aplicação-na-partida/stamina/12-atributos fora — fatiado)
- [x] Arquivos listados corretos (verificados no repo, com linhas)
- [x] Mudança de schema documentada (migration aditiva — OP-01)
- [x] Critérios testáveis (barras, persistência, aplica-seams, passe diário, consumidor, determinismo, isolamento)
- [x] Riscos avaliados (inércia, saturação, broadness, engine/golden, acoplamento)
- [x] Decisões co-desenhadas registradas (aplicar-já em 2 fatias, baseline+offset+decay, drivers treino+lesão)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-027 — método H1VE. A fatia A dá vida às duas barras (Forma e Moral), consumindo os seams que as SPECs 024/025/026 plantaram: as barras movem de verdade e o moral já entra nas decisões (crise-moral deixa de ser inerte). A aplicação na performance da partida é a fatia B (SPEC-028), logo em seguida — o "aplicar já" completo, em dois PRs revisáveis. Engine e goldens intocados.*
