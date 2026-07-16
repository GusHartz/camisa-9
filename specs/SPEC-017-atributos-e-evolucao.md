# SPEC-017 — Atributos e evolução (treino): a barra de XP → +1 ponto livre

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-017 |
| **Feature** | Atributos e evolução (card 13 — a segunda feature da Fase 1) |
| **Slug** | atributos-e-evolucao |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Fase 1 (o atleta) — a progressão do humano; consome a fundação da SPEC-016 (card 22). |
| **Appetite** | **1 a 2 dias**. |
| **Prioridade** | ALTA — sem evolução, o atleta criado na SPEC-016 é estático; o loop de carreira (o "subir da várzea") não existe. |
| **Criada em** | 2026-07-16 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-16) — leia antes de aprovar

Esta fatia parte do design record `docs/projeto/design-atributos-e-evolucao.md` (co-desenhado durante a SPEC-016) + duas decisões tomadas agora:

1. **Motor da progressão = Model A: BARRA ÚNICA + PONTO LIVRE** (fiel ao design record). Um único acumulador de XP por atleta; cada treino deposita XP (o **FOCO do dia multiplica a taxa** — seam neutro em v1); quando a barra enche → **+1 ponto FLUTUANTE** que o jogador gasta **em qualquer foco** (até 99). O limiar da próxima barra **cresce com o overall** (curva de 3 zonas). *Efeito colateral aceito pelo founder:* um 99 num foco isolado sai mais barato (o overall ainda está baixo).
2. **DLC + idade = plantar o seam e adiar.** A matemática de treino recebe os parâmetros `speedMultiplier` (o gancho do DLC "tempo não poder") e `ageFactor`, **ambos default neutro (1.0)**. O DLC real (precisa de infra de compra/entitlement, inexistente) e a curva de idade (o humano nem entra no mundo — card 21) ficam para fatias dedicadas.
3. **Refinamentos de mecanismo** (não de escopo — decorrem de fatos do repo, ver §Notas):
   - A curva é **inteira/piecewise por zona** (não exponencial) — o guardrail de determinismo proíbe `exp`/`pow`/transcendentais em `packages/*/src`.
   - Gastar o +1 usa uma primitiva **nova** `applyPoint` (+1, teto 99) — a `allocateAttributes` da SPEC-016 é **trava de criação** (exige soma === 136) e não serve para o treino, que cresce a soma além de 136.

---

## Objetivo

Entregar o **loop de progressão do atleta humano**: o treino diário enche uma **barra de XP** que, cheia, concede **+1 ponto** para o jogador distribuir livremente num dos 4 focos (Físico/Técnico/Tático/Mental), até 99. O limiar da barra **cresce em 3 zonas** (várzea rápida → meio compromisso → cauda elite brutal), materializando o "subir da várzea" sem tornar o 99 nem trivial nem impossível. A **matemática é lib pura** (`packages/player`, determinística, sob o guardrail); a **persistência do progresso** (barra, pontos livres, atributos) vive no **serviço isolado** (`services/player-store`). Sem rota HTTP, sem tocar o mundo (engine/world-store), sem DLC real, sem curva de idade — só os seams neutros.

---

## Contexto e motivação

A SPEC-016 entregou a **criação** do atleta (conta + 4 focos calibrados para a várzea, overall 34) e **plantou o seam** `athlete.training_xp` — mas o atleta nasce e **não cresce**. Toda a tese de carreira ("da várzea às lendas") depende deste loop.

**Fatos verificados (investigação do `packages/world-engine`, `origin/main`):**
- **O mundo NPC é uma escada estática.** A `ability` de um NPC é um **escalar único** (0..100) sorteado da banda do tier no nascimento e **nunca muda** (não cresce, não declina) até a aposentadoria dura aos 35 (`engine/lifecycle.ts` só incrementa `age`; `ability` é imutável). Bandas: várzea (tier 4) = **34..66** (média ~50); tier 1 = **58..90** (média ~74) (`constants.ts WORLD.abilityByTier`). → **O humano é a única entidade que evolui**; a calibração persegue um alvo fixo, não móvel.
- **O engine não modela atributos por-foco** — só o escalar `ability` (`types.ts:60`: "os 12 atributos ficam em card separado"). Colapsar os 4 focos do humano num `ability` comparável às bandas é problema do **card 21** (entrada no mundo), **não** desta fatia.
- **A fundação da SPEC-016 já existe:** `packages/player` (`allocateAttributes`, `PLAYER`, tipos `Focus`/`Attributes`), `athlete.training_xp int default 0`, e o padrão lib-pura + serviço-isolado + transação atômica.
- **Guardrail de determinismo** (ESLint, glob `packages/*/src`): sem `Date`/`Intl`/`Math.random`/**transcendentais** → a curva é inteira/piecewise; toda a matemática de treino é pura e reproduzível.

---

## Escopo — o que está DENTRO

**A) Lib pura `packages/player` (estende o workspace da SPEC-016):**
- [ ] `constants.ts` — bloco **`TRAINING`** tunável: `sessionXp` (XP-base por treino), `focusMultPctByFocus` (multiplicador por foco em %, **default 100 = neutro** — o seam do "FOCO do dia = taxa"), as **fronteiras das 3 zonas** (em `pointsEarnedTotal`) e o **limiar por zona** (em treinos-equivalentes), e os defaults dos seams `speedMultiplierPct: 100` / `ageFactorPct: 100`.
- [ ] `training.ts` — a matemática pura:
  - `pointsEarnedTotal(attributes, freePoints)` = `(sum(4 focos) − CREATION_TOTAL) + freePoints` — quantos pontos já foram GANHOS (inclui os não gastos, p/ o limiar não baratear com hoarding).
  - `nextThreshold(pointsEarnedTotal)` → o XP necessário p/ o próximo ponto, pela curva de 3 zonas (inteira/piecewise).
  - `trainSession(state, focus, opts?) → TrainResult` — deposita `sessionXp × focusMult × speedMultiplier × ageFactor` (tudo inteiro, via % com divisão inteira) na barra; **estoura em cascata** quantos pontos o depósito permitir (carrega o resto); retorna `{ trainingXp, freePointsGained, freePoints }`. `opts = { speedMultiplierPct?, ageFactorPct? }` (seams).
  - `applyPoint(attributes, focus) → Result<Attributes>` — a primitiva de GASTO: valida `freePoint` disponível (no store) e foco `< 99`, retorna atributos com `focus += 1`. **Distinta** da `allocateAttributes` (que é trava de criação, soma===136).
- [ ] `types.ts` — `TrainInput`/`TrainState` (`{ attributes, trainingXp, freePoints }`), `TrainResult`, `TrainOpts`.
- [ ] Reusa `Focus`/`Attributes`/`Result`/`PLAYER.attrMax(99)` da SPEC-016. **Standalone** (não importa o engine em `src`).

**B) Serviço `services/player-store` (estende o workspace da SPEC-016):**
- [ ] Schema + **migration aditiva `0001`** (OP-01): `athlete` ganha `free_points int NOT NULL DEFAULT 0` (+ CHECK `>= 0`). `training_xp` já existe (SPEC-016).
- [ ] `player-repo.ts` (ou novo `training-repo.ts`):
  - `applyTraining(db, athleteId, focus, opts?)` — lê o atleta, chama `trainSession`, persiste `training_xp` + `free_points` numa **transação** (all-or-nothing). Atleta inexistente/inativo → erro genérico (OP-11).
  - `spendFreePoint(db, athleteId, focus)` — lê, chama `applyPoint`, persiste o foco `+1` + `free_points − 1` numa transação. Sem ponto disponível **ou** foco já em 99 → erro **genérico** (OP-11); a régua 0..99 continua garantida pelo CHECK do banco (SPEC-016).
  - `readAthleteProgress(db, athleteId)` → `{ attributes, trainingXp, freePoints, overall, nextThreshold }` (leitura p/ a futura UI/testes).
- [ ] Nada de novo em auth/conta; nada toca o `world-store`.

**C) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`, serial + limpeza FK — invariante SPEC-015): ver Critérios.

## Escopo — o que está FORA

- **DLC real** (compra/entitlement/aceleração paga da cauda) → fatia de monetização. Aqui só o seam `speedMultiplierPct` (neutro).
- **Curva de idade / declínio** → card 21 / lifecycle. Aqui só o seam `ageFactorPct` (neutro). *(O próprio engine ainda não declina — corte duro aos 35.)*
- **Colocar o atleta no mundo / mapa focos→`ability`** → card 21 (bloqueado pelo snapshot imutável, SPEC-015).
- **Gatilho diário do treino / scheduler / UI / rota HTTP** → fatias futuras. Aqui o treino é uma **função** (uma sessão = uma chamada); quem/quando dispara é orquestração futura.
- **Acoplamento com Forma/Moral/stamina** (R4 FINAL) → fatias próprias; o FOCO do dia aqui só multiplica a taxa de XP (seam neutro).
- **`world-engine`/`world-store`** — intocados; nenhum golden regenerado.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/constants.ts` | editar — +bloco `TRAINING` (tunáveis da curva + seams). |
| `packages/player/src/training.ts` | criar — `trainSession`, `applyPoint`, `nextThreshold`, `pointsEarnedTotal`. |
| `packages/player/src/types.ts` | editar — +`TrainState`/`TrainResult`/`TrainOpts`. |
| `packages/player/src/index.ts` | editar — exportar o novo módulo. |
| `packages/player/src/training.test.ts` | criar — curva (3 zonas), determinismo, cascata, seams, `applyPoint` teto 99. |
| `services/player-store/src/schema/athlete.ts` | editar — +coluna `free_points` (+CHECK ≥ 0). |
| `services/player-store/src/migrations/0001_training_points.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/player-store/src/store/training-repo.ts` | criar — `applyTraining`/`spendFreePoint`/`readAthleteProgress`. |
| `services/player-store/src/index.ts` | editar — exportar. |
| `services/player-store/test/training-repo.test.ts` | criar — persistência atômica, gasto, teto, reconciliação (gated). |
| `docs/projeto/design-atributos-e-evolucao.md` | editar — marcar as decisões travadas (Model A + seams). |
| `specs/SPEC-017-*.md`, `specs/DONE-017-*.md` | criar. |

**Intocado:** `packages/world-engine`, `services/world-store`, todos os goldens, `packages/player` da criação (`attributes.ts`/`name-filter.ts`/`create.ts` etc. — só `constants`/`types`/`index` ganham adições). **CI sem mudança**: o passo `db:migrate -w services/player-store` (SPEC-016) já aplica o `0001`.

---

## Critérios de aceitação

1. **Curva de 3 zonas (feeling do design record):** `nextThreshold` entrega ~1 ponto a cada ~2–4 treinos na várzea (overall < 60), ~1 a cada ~8 no meio (60–85), ~1 a cada ~15+ na cauda elite (85–99). Testado nos limiares das zonas com os tunáveis default.
2. **Loop de treino determinístico:** `trainSession` com o mesmo estado/foco/opts dá o mesmo resultado (sem relógio/entropia — passa o guardrail); um depósito grande **estoura em cascata** múltiplos pontos e carrega o resto corretamente.
3. **Ponto livre gasto em qualquer foco, teto 99:** `applyPoint` aplica `+1` ao foco escolhido; rejeita foco já em 99; a soma cresce além de 136 (não é trava de criação). Testado puro.
4. **Anti-hoarding:** o limiar usa `pointsEarnedTotal` (inclui pontos não gastos) — acumular pontos sem gastar **não** barateia o próximo. Testado.
5. **Seams neutros e funcionais:** com `speedMultiplierPct = ageFactorPct = 100` o resultado é o baseline; com `speedMultiplierPct = 200` a barra enche ~2× mais rápido (prova o gancho do DLC) e com `ageFactorPct < 100` mais devagar. Sem seam passado → default 100. Testado.
6. **Persistência atômica:** `applyTraining`/`spendFreePoint` persistem numa **única transação** (all-or-nothing); falha → rollback, sem estado parcial. Testado contra Postgres real.
7. **Gasto seguro:** `spendFreePoint` sem ponto disponível ou com foco em 99 → erro **genérico** (OP-11); o CHECK `0..99` do banco (SPEC-016) permanece uma segunda linha de defesa. Testado.
8. **Migration aditiva coexiste:** `0001` aplica sobre o `0000` num DB limpo, ao lado do world-store, sem colisão (mesmo `postgres:16` no CI). Testado no CI.
9. **OPs & gates:** sem `any` (OP-14); funções ≤50 (OP-15); arquivos ≤300 (OP-16); erros genéricos (OP-11); migration versionada (OP-01); a curva é **inteira** (nenhum transcendental — guardrail verde); `lint`/`typecheck`/`build`/`test` verdes; `world-engine`/`world-store` intactos (goldens diff 0).
10. **Higiene de teste:** os testes ao vivo do treino são **serial** e limpam em **ordem de FK** (athlete→account) — invariante SPEC-015.

---

## Segurança

- **Autoridade server-side (anti-fraude):** o depósito de XP, o limiar e o teto 99 são calculados no servidor (lib+store) — o cliente nunca decide quanto XP ganhou nem burla o teto. O CHECK `0..99` do banco é a rede final.
- **OP-11:** "sem ponto disponível", "foco no máximo", atleta inexistente → **classe genérica**, sem SQL/constraint/stack.
- **OP-02/OP-12:** nada de novo em segredos; `DATABASE_URL` server-only.
- **Sem PII novo:** a fatia só adiciona `free_points` (inteiro de jogo) ao atleta.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Calibração "sente" errada** (rápido/lento demais) | Toda a curva vive em `TRAINING` (tunáveis) — reequilibra sem tocar lógica. Os testes provam os limiares das zonas, não números mágicos espalhados. |
| **99 num foco isolado barato demais** (efeito Model A) | Aceito pelo founder na decisão de design; documentado. Se incomodar, vira ajuste de tunável (limiar por valor-do-foco) numa fatia futura — não reescrita. |
| **Curva inteira ≠ suavidade exponencial** | Piecewise-linear por zona entrega o mesmo feeling escalonado e é a única opção sob o guardrail; suavização futura é tunável. |
| **`free_points` = schema change** | Migration **aditiva** `0001` (coluna com default), zero downtime, OP-01. Não toca dados existentes. |
| **Lint local por CRLF (Windows)** | Não é regressão; CI (LF) é a verdade; validar formato LF antes do push (memória do projeto). |

**Dependências:** SPEC-016 (`packages/player` + `athlete.training_xp`). **Precede:** card 21 (entrada no mundo — o mapa focos→`ability` lê estes atributos evoluídos), a UI de treino, o scheduler diário.

---

## Notas de implementação

- **A barra em números (default tunável, a aprovar):** `sessionXp` em unidades inteiras; limiar por zona ≈ **3 / 8 / 15+ treinos-equivalentes**; fronteiras em `pointsEarnedTotal` derivadas do overall (overall 60 ⇒ `p=104`; overall 85 ⇒ `p=204`; `p` máx = 260 no overall 99). Multiplicadores (`focusMult`, `speed`, `age`) aplicados como **porcentagem inteira** (`× pct / 100`) para manter tudo inteiro e guardrail-safe. Sanidade: uma carreira dedicada (~440 treinos na janela de pico) chega **perto de elite**, não a 99-em-tudo — fiel ao design record.
- **`pointsEarnedTotal` deriva dos próprios atributos** (`sum − 136`) + `free_points` — nenhum contador redundante de "pontos totais"; uma fonte de verdade.
- **Fronteira pura/impura (OP-17):** `training.ts` decide *quanto* e *se* ganhou ponto; o `training-repo` só lê/grava e envolve na transação. O `store` nunca recalcula a curva.
- **FOCO do dia = seam de taxa:** `focusMultPctByFocus` default 100 (todos iguais) — o mecanismo existe; diferenciar o efeito do foco (e acoplar a Forma/Moral) é fatia futura, coerente com "plantar seam e adiar".
- **Fecho do DONE:** atualizar "Estado atual" do CLAUDE.md (SPEC-017) e o `roadmap.md`; marcar as decisões travadas no design record.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (loop de treino + gasto; DLC/idade/mundo/UI fora — em seams ou cards nomeados)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva `0001` — OP-01)
- [x] Critérios de aceitação testáveis (curva, determinismo, teto, atomicidade, seams)
- [x] Riscos e segurança avaliados (autoridade server-side, OP-11, calibração tunável)
- [x] Decisões co-desenhadas registradas (Model A + seam-and-defer + refinamentos de mecanismo)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-017 — método H1VE. A segunda feature da Fase 1: a evolução. A barra de treino enche → +1 ponto livre nos 4 focos (Model A), com curva de 3 zonas que faz a subida da várzea valer a pena e o 99 ser grind orgulhoso. Lib pura + serviço isolado; DLC e idade ficam como seams neutros. Não coloca no mundo (card 21).*
