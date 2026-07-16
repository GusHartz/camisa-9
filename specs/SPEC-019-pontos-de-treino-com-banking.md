# SPEC-019 — Pontos de treino com banking: FOCO do dia + rendimento decrescente

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-019 |
| **Feature** | Pontos de treino com banking — card do board |
| **Slug** | pontos-de-treino-com-banking |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 2.7 — completa o loop de treino (o card 9 do board); estende a SPEC-017. |
| **Appetite** | **1 a 2 dias**. |
| **Prioridade** | ALTA — dá profundidade ao ritual diário de treino (o "Dia do Jogador"), sem depender do mundo. |
| **Criada em** | 2026-07-16 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-16) — leia antes de aprovar

1. **Efeito do FOCO = viés de TAXA (mantém o Model A).** O FOCO do dia mexe no **ritmo** (quanto XP a barra recebe), **não** em qual atributo cresce. O ponto ganho continua **FLUTUANTE** (gasto em qualquer foco via `applyPoint`). **Nenhuma revisão do Model A** (barra única + ponto flutuante — SPEC-017).
2. **Rendimento decrescente = streak por DEGRAUS.** Treinar o **mesmo** foco em dias consecutivos corta o depósito por degraus (`100 − repeats×step`, com piso), **resetando ao trocar** de foco. Persiste `last_focus` + `focus_streak` no atleta.
3. **Sem escolha → o técnico treina o FOCO MAIS BAIXO** (arredonda a fraqueza). Determinístico, temático.
4. **Calibração: MANTER a curva de lenda.** As fronteiras/limiares das 3 zonas (SPEC-017) ficam **intactos** (zero rebalanceamento). Só se corrige a frase do design record ("carreira → ~85" era incompatível; a curva leva uma carreira a ~overall 72, e 85+ é grind multi-carreira — coerente com "da várzea às lendas"). **Consequência aceita:** a penalidade de repetição só pode **desacelerar** relativo ao baseline plano da SPEC-017 — rotação perfeita = pace idêntico; nunca acelera acima dele.

---

## Objetivo

Fechar o loop de treino da SPEC-017 dando **efeito real ao FOCO do dia** — que hoje é um **seam neutro** (`focusMultPct` todos 100). Cada sessão treina um foco (**escolhido** pelo jogador ou, sem escolha, o **mais baixo** pelo técnico); **repetir** o mesmo foco em dias consecutivos aplica um **rendimento decrescente** (degraus com piso), e um foco **fresco/rotacionado** rende **100%** (o baseline da SPEC-017). O ponto segue **flutuante** (Model A intacto). O **banking já existe** (SPEC-017: `free_points` e `training_xp` não expiram) — esta fatia adiciona a camada de FOCO + rotação. A matemática é **lib pura** (`packages/player`, sob o guardrail); o **streak** persiste no `services/player-store` (transação atômica, `FOR UPDATE`).

---

## Contexto e motivação

O roadmap 2.7 ("Pontos de treino com banking") pede: *"Pontos acumulam sem expirar; FOCO do dia (Físico/Técnico/Tático/Mental; sem escolha = técnico decide); bônus de treino focado no dia, com rendimento decrescente ao repetir o mesmo foco."* A SPEC-017 (card 13) já entregou a barra de XP → +1 ponto flutuante, o **banking** (nada expira) e plantou o **FOCO como seam neutro** (`focusMultPct: {…100}`) — declaradamente "diferenciar o efeito do foco é fatia futura". Esta é a fatia.

O **mecanismo** que honra as 4 decisões de uma vez: a escolha do FOCO importa pelo **ritmo** — rotacionar mantém 100%, martelar um foco decai (piso). Como o ponto é flutuante, **qual** atributo cresce continua sendo decidido pelo **gasto** (`spendFreePoint`), não pelo treino. O treino vira um mini-ritmo diário (rotacione para render); o build fica no gasto. Zero conflito com o Model A.

**Fatos verificados (repo, branch atual sobre `main`):**
- **`packages/player/src/training.ts`** (SPEC-017): `trainSession(state, focus, opts)` deposita `sessionDeposit` na barra e estoura pontos em cascata (limiar recomputado); `applyPoint` (+1, teto 99); `nextThreshold` (3 zonas inteiras); `pointsEarnedTotal` (anti-hoarding). `sessionDeposit` já compõe `focusMultPct[focus]` × `speed` × `age` por **% inteira** (guardrail-safe).
- **`constants.ts` → `TRAINING`**: `sessionXp:100`, `focusMultPct:{…100}` (neutro), fronteiras `midStartPoints:104`/`eliteStartPoints:204`, limiares `zone1Xp:300`/`zone2Xp:800`/`zone3BaseXp:1500`/`zone3RampXp:25`. **Toda a calibração vive aqui.**
- **`types.ts`**: `TrainState {attributes, trainingXp, freePoints}`, `TrainOpts {speedMultiplierPct?, ageFactorPct?}`, `TrainResult {trainingXp, freePoints, freePointsGained}`. **Os testes da SPEC-017 checam `TrainResult` com `toEqual` EXATO** — não posso adicionar campos a `TrainResult` sem quebrá-los.
- **`services/player-store/src/store/training-repo.ts`**: `applyTraining(db, athleteId, focus, opts)` numa transação com `loadActive` (**`SELECT … FOR UPDATE`**); persiste `trainingXp` + `freePoints`; `toProgress` deriva `overall`/`nextThreshold`. Migrations `0000`/`0001`/`0002`.
- **Guardrail** (`packages/*/src`): sem `Date`/`Intl`/`Math.random`/transcendentais. A curva de degraus é **inteira/piecewise** (mesma disciplina da curva de 3 zonas).

---

## Escopo — o que está DENTRO

**A) Lib pura `packages/player`:**
- [ ] `constants.ts` → `TRAINING`: **+`focusRepeatStepPct`** (queda em p.p. por repetição consecutiva; ex. 20) e **+`focusRepeatFloorPct`** (piso; ex. 40). `focusMultPct` **permanece** (seam por-foco, default 100 — inalterado).
- [ ] `training.ts`:
  - `repeatPenaltyPct(repeats: number): number` — os degraus: `max(floor, 100 − repeats×step)`. Inteira, sem transcendental.
  - `coachFocus(attributes: Attributes): Focus` — o **foco mais baixo** (empate → ordem canônica `FOCI`). O default do técnico.
  - `resolveFocusStreak(lastFocus, focusStreak, focus)` → `{ repeats, lastFocus, focusStreak }` — `repeats` = sessões consecutivas JÁ feitas neste foco (0 se fresco/trocou); e o **próximo** estado do streak (`focus===lastFocus ? +1 : 1`). Pura, testável.
  - `sessionDeposit` ganha o fator de repetição: aplica `focusRepeatPct` (via `TrainOpts`) como mais um **% inteiro** na cadeia (default **100 = neutro** → SPEC-017 intacta).
- [ ] `types.ts` → `TrainOpts` **+`focusRepeatPct?`** (default 100). `TrainState`/`TrainResult` **inalterados** (preserva o `toEqual` dos 168).
- [ ] `index.ts` → exporta `repeatPenaltyPct`, `coachFocus`, `resolveFocusStreak`.

**B) Serviço `services/player-store`:**
- [ ] Schema + **migration aditiva `0003`** (OP-01): `athlete` ganha **`last_focus` text NULL** (o último foco treinado; NULL = nunca treinou) + **`focus_streak` int NOT NULL DEFAULT 0** (+CHECK ≥ 0). Aditivas, zero downtime.
- [ ] `training-repo.ts` → `applyTraining(db, athleteId, focus: Focus | null, opts?)`:
  - `focus === null` → **`coachFocus(row.attributes)`** (o técnico decide).
  - lê `last_focus`/`focus_streak` no `loadActive`; `resolveFocusStreak(...)` → `repeats` + próximo streak; passa `repeatPenaltyPct(repeats)` como `opts.focusRepeatPct` a `trainSession`.
  - persiste `trainingXp`, `free_points`, **`last_focus`**, **`focus_streak`** na mesma transação (`FOR UPDATE` mantido).
  - `Progress` (leitura) ganha `lastFocus`/`focusStreak`/`nextFocusPenaltyPct` (p/ UI/testes mostrarem o estado do streak). `spendFreePoint`/`readAthleteProgress` seguem.

**C) Docs:** corrige a frase de calibração no `docs/projeto/design-atributos-e-evolucao.md` (decisão 4).

**D) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA

- **Build dirigido pelo treino** (o ponto ir p/ o foco treinado) — o founder escolheu o **viés de taxa** (Model A intacto). Fora.
- **Efeito por-foco diferenciado** (físico ≠ mental na taxa) — `focusMultPct` fica neutro; é seam para futuro.
- **Rebalancear a curva** — as zonas/limiares ficam intactos (decisão 4). Fora.
- **Forma & Moral / stamina / fôlego diário** (2.3) — este card é só o treino. Fora.
- **Gatilho diário / scheduler / UI / rota HTTP** — quem/quando dispara o treino é orquestração futura.
- **DLC (`speed`) e idade (`age`) reais** — seguem seams neutros (SPEC-017).
- **`world-engine`/`world-store`** — intocados; nenhum golden regenerado. Colocar o atleta no mundo = card 21.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/constants.ts` | editar — +`focusRepeatStepPct`/`focusRepeatFloorPct` em `TRAINING`. |
| `packages/player/src/training.ts` | editar — +`repeatPenaltyPct`/`coachFocus`/`resolveFocusStreak`; `sessionDeposit` aplica `focusRepeatPct`. |
| `packages/player/src/types.ts` | editar — `TrainOpts` +`focusRepeatPct?`. |
| `packages/player/src/index.ts` | editar — exportar as 3 novas funções puras. |
| `packages/player/src/training.test.ts` | editar — +testes (degraus, piso, reset, coachFocus, neutro=SPEC-017). |
| `services/player-store/src/schema/athlete.ts` | editar — +`last_focus`/`focus_streak` (+CHECK). |
| `services/player-store/src/migrations/0003_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/player-store/src/store/training-repo.ts` | editar — `focus \| null` (coach); lê/grava streak; `Progress` +estado. |
| `services/player-store/src/index.ts` | editar — reexports se necessário. |
| `services/player-store/test/training-repo.test.ts` | editar — +testes ao vivo (penalidade persistida, reset, coach). |
| `docs/projeto/design-atributos-e-evolucao.md` | editar — corrige a frase de calibração. |
| `specs/SPEC-019-*.md`, `specs/DONE-019-*.md` | criar. |

**Intocado:** `packages/world-engine`, `services/world-store`, todos os goldens, migrations `0000`/`0001`/`0002`. **CI sem mudança** (o migrate do `player-store` já aplica o `0003`).

---

## Critérios de aceitação

1. **FOCO fresco = 100% (curva intacta):** uma sessão num foco diferente do último deposita exatamente o `sessionXp` da SPEC-017 (nenhuma regressão de pace; os 168 testes seguem verdes — `trainSession` sem `focusRepeatPct` = neutro). Testado.
2. **Rendimento decrescente por degraus:** repetir o mesmo foco N vezes consecutivas deposita `sessionXp × max(floor, 100 − N×step)/100` (inteiro); reseta a 100% ao trocar de foco. Testado puro + persistido.
3. **`coachFocus` = mais baixo:** sem escolha, `applyTraining(…, null)` treina o foco de menor valor (empate → ordem `FOCI`). Testado.
4. **Streak persistido:** `last_focus`/`focus_streak` gravados na transação; duas sessões no mesmo foco através de duas chamadas separadas mostram a penalidade crescer; trocar reseta. Testado contra Postgres real.
5. **Banking preservado:** `free_points`/`training_xp` continuam sem expirar (SPEC-017 intacta); o ponto segue **flutuante** (`spendFreePoint` inalterado). Testado.
6. **Atomicidade + concorrência:** `applyTraining` numa transação; `FOR UPDATE` serializa; falha → rollback (streak não avança sozinho). Testado.
7. **Calibração intacta:** `nextThreshold` e as fronteiras `104/204` **inalteradas** (`git diff` da curva = 0 nos tunáveis de zona); só a frase do design record muda. Verificado.
8. **OPs & gates:** sem `any` (OP-14); funções ≤50 (OP-15); arquivos ≤300 (OP-16); erros genéricos (OP-11); migration OP-01; guardrail verde (degraus inteiros); `lint`/`typecheck`/`build`/`test` verdes; `world-engine`/`world-store` intactos; ao vivo serial + limpeza FK.

---

## Segurança

- **Autoridade server-side:** o streak, a penalidade e o default do técnico são decididos no servidor (lib+store) — o cliente nunca burla o ritmo. `FOR UPDATE` serializa o read-modify-write do streak.
- **OP-11:** atleta inexistente/inativo, sem ponto, foco no máximo → **classe genérica**, sem SQL/stack. `last_focus` é validado como `Focus` (via `resolveFocusStreak`/`coachFocus`) — a coluna é `text` sem CHECK de enum (como `position`), a lib é a autoridade.
- **OP-02/OP-12:** nada de segredo novo.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Quebrar os 168 testes da SPEC-017** (`toEqual` exato em `TrainResult`) | Penalidade entra por `TrainOpts.focusRepeatPct` (default 100 = neutro); `TrainState`/`TrainResult` **inalterados**; o streak vive no store. Fresco = idêntico à SPEC-017. |
| **Coach-mais-baixo pode repetir** (o pior foco continua o pior por dias) → penalidade | É **desejado** e gentil: piso (ex. 40%) garante progresso; full-auto = mais lento/equilibrado, rotação ativa = mais rápido. Tunável; o founder calibra `step`/`floor`. |
| **Interação com a curva** ("manter") | A penalidade só **desacelera** vs. o baseline plano; rotação perfeita = pace da SPEC-017 (curva intacta). Fronteiras de zona não tocadas. Documentado. |
| **Schema change (`last_focus`/`focus_streak`)** | Colunas **aditivas** (`0003`), NULL/DEFAULT 0, zero downtime, OP-01; atletas existentes começam frescos. |
| **Lint local por CRLF (Windows)** | Não é regressão; validar LF antes do push (memória). |

**Dependências:** SPEC-016 (`athlete`) + SPEC-017 (`trainSession`/`training-repo`/`free_points`). **Precede:** acoplar Forma/Moral/stamina (2.3), gatilho diário/scheduler.

---

## Notas de implementação

- **Preservar a SPEC-017 é invariante:** a penalidade é um **3º seam** na cadeia de `sessionDeposit` (junto de speed/age), default 100. Nenhum teste da SPEC-017 passa `focusRepeatPct` → todos rendem 100% → intactos.
- **`repeats` vs `streak`:** `repeats` = sessões consecutivas **já feitas** neste foco (a penalidade desta sessão); o `focus_streak` **persistido** é o próximo (`+1` se repetiu, `1` se fresco/trocou). `resolveFocusStreak` devolve os dois numa função pura só.
- **Degraus inteiros** (guardrail): `repeatPenaltyPct(r) = max(floor, 100 − r×step)`. Ex. step 20 / floor 40: `100, 80, 60, 40, 40…`. Sem `pow`/decay fracionário.
- **`coachFocus` determinístico:** `argmin` sobre `FOCI` na ordem canônica (empate → primeiro). Nada de aleatório (guardrail).
- **`Progress` expõe o estado do streak** (`lastFocus`, `focusStreak`, `nextFocusPenaltyPct`) só para leitura (UI/testes) — não é regra de negócio na borda (OP-17: a regra fica na lib).
- **Fecho do DONE:** atualizar "Estado atual" do CLAUDE.md (SPEC-019) + `roadmap.md` (2.7) + a frase de calibração no design record.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (FOCO/streak/coach/calibração; build-dirigido/Forma-Moral/scheduler/HTTP fora)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva `0003` — OP-01)
- [x] Critérios de aceitação testáveis (fresco=100, degraus, coach, persistência, banking, atomicidade, curva intacta)
- [x] Riscos avaliados (168 testes, coach-repete, interação com a curva)
- [x] Decisões co-desenhadas registradas (as 4 do founder)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-019 — método H1VE. Completa o loop de treino (2.7): o FOCO do dia vira ritmo (rotacione para render; repetir decai por degraus, piso), o técnico cobre a fraqueza sem escolha, o ponto segue flutuante (Model A intacto) e a curva de lenda fica intacta. Lib pura + streak persistido com FOR UPDATE. Preserva os 168 testes por construção (seam neutro).*
