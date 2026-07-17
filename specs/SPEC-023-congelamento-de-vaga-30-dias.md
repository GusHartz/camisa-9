# SPEC-023 — Congelamento de vaga (30 dias)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-023 |
| **Feature** | Congelamento de vaga 30 dias — card do board (`88e19c18`) |
| **Slug** | congelamento-de-vaga-30-dias |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Retenção + escassez (o pilar "escassez via waiting list"). Assenta sobre a ocupação da SPEC-020 e o `vacateSlot` da SPEC-022. |
| **Appetite** | **2 a 3 dias** (fatia só-mundo: 1 migration aditiva + 1 máquina de estados + o pass; sem cross-schema, sem workspace novo). |
| **Prioridade** | MÉDIA — a mecânica de retenção que segura o jogador ausente e libera a vaga para a fila. |
| **Criada em** | 2026-07-17 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-17)

1. **Janela única de 30 dias.** Ao ficar inativo, a vaga **já congela** (dispara o e-mail "estamos segurando sua camisa") e fica segurada; se o humano voltar dentro da janela, **descongela**; se completar **30 dias** de inatividade, **reverte a NPC** (a vaga volta à fila). **1 tunável: `revertAfterDays = 30`** (sem carência separada — o congelamento é a definição de "inativo hoje").
2. **O congelado ainda joga a partida das 15h, com a ability congelada.** O mundo joga com ou sem você: a vaga é segurada **como está**, a ability congelada segue contando no clube. O **snapshot é imutável durante a temporada** (determinismo intacto) e o **engine fica INTOCADO** (zero golden). Reverter só acontece no fim da janela.
3. **Reverter = "benched" (carreira preservada).** A vaga vira NPC (`is_human=false`, a ocupação some — reusa o `vacateSlot` da SPEC-022), mas o **atleta no player-store continua intacto** (atributos/progresso/`active`), apenas fora do mundo. Ele **pode re-ocupar uma vaga depois** (fluxo de entrada). **NÃO** encerra a carreira nem vira lenda (desacoplado do Regen).

**Defaults do projeto (não-perguntados, molde estabelecido):** o **e-mail** "segurando sua camisa" e o **sinal de "última atividade"** ficam como **seams** (deferidos — não há infra de e-mail/HTTP ainda; molde do `canRegen` da SPEC-022 e do scheduler). O pass é **callable + testado direto**; o wiring ao scheduler é fatia de deploy. As colunas novas de `world_occupation` **sobrevivem à viragem** (re-aplicadas no `reapplyOccupations` — o gotcha da SPEC-021).

---

## Objetivo

Dar ao mundo uma **política de retenção/escassez**: quando um humano fica inativo, a vaga dele é **congelada** por 30 dias (com um nudge de volta), e só então **revertida a NPC** — liberando a camisa para a fila sem punir quem volta a tempo. É o que faz a promessa "cada humano substitui um NPC; escassez via waiting list" ter dentes: vagas ociosas não ficam presas para sempre.

---

## Contexto e motivação (fatos verificados no repo)

- **A ocupação existe e é a autoridade (SPEC-020):** `world_occupation` (PK `(world_seed, athlete_id)`) guarda `human_athlete_id`/`ability`/`human_name`/`season_id` + `regen_requested` (SPEC-022). A linha do `athlete` (`is_human`) é cache. Não há **nenhum** conceito de atividade/presença/inatividade no código (grep amplo: só a tese nos docs) — é construído do zero aqui.
- **O revert já existe (SPEC-022):** `vacateSlot(db, seed, athleteId)` (`occupation-repo.ts`) já faz exatamente "reverte a vaga a NPC" numa transação idempotente (delete `world_occupation` + `is_human=false`). Reusado como o passo de revert.
- **O relógio já existe (SPEC-015):** o tick diário resolve um `dayIndex` monotônico (`resolveSlot(epochMs).dayIndex`). A janela de 30 dias conta em **day-index** (o mesmo relógio; atravessa temporadas naturalmente, pois o day-index é monotônico).
- **A viragem re-aplica ocupações (SPEC-021):** `reapplyOccupations` (`turnover-repo.ts`) DELETA e re-INSERE `world_occupation` no rollover, com lista **manual** de colunas → **toda coluna nova tem de ser adicionada lá** senão volta ao default a cada virada (gotcha documentado na SPEC-022).
- **Sem cross-schema:** congelar/reverter tocam **só** `world_occupation` + `athlete` (world-store). O "benched" significa **não tocar** o player-store no revert → a fatia é **single-schema** (não precisa de `services/*` novo; mora no world-store, molde do `daily-round`/`turnover-repo`).

---

## Escopo — o que está DENTRO

**A) Schema + migration aditiva `0006` (OP-01):**
- [ ] `world_occupation.last_active_day integer` (**nullable**) — o day-index da última atividade do humano. `null` = ainda não rastreado (entrante fresco antes do wiring de atividade → nunca congela).
- [ ] `world_occupation.frozen_since_day integer` (**nullable**) — o day-index em que o congelamento começou. `null` = ativa/não-congelada. Marca a transição (dispara o e-mail **uma vez**) e alimenta o "faltam X dias" do e-mail/UI.

**B) Política tunável (`vacancy-policy.ts`, world-store — molde do `regen-age.ts`):**
- [ ] `VACANCY = { revertAfterDays: 30 }` — o único tunável. Congelar é imediato (o 1º dia inativo); reverter aos 30 dias de inatividade.

**C) `vacancy-repo.ts` (world-store, novo) — a máquina de estados:**
- [ ] `markActive(db, seed, humanAthleteId, day)` — **o seam**: grava `last_active_day = day` e **descongela** (`frozen_since_day = null`). É o que uma ação futura (login/escalação/treino/decisão) chama. Autoridade server-side.
- [ ] `runVacancyPass(db, seed, currentDay, hooks?)` — o pass diário (molde do `runRegenPass`). Para cada ocupação com `last_active_day` não-nulo, computa `inativo = currentDay − last_active_day`:
  - `inativo <= 0` (ativo hoje) → se congelada, **descongela** (limpa `frozen_since_day`, `hooks.onThaw?`).
  - `inativo >= revertAfterDays` (30) → **reverte a NPC** (`vacateSlot`).
  - `0 < inativo < 30` e ainda não congelada → **congela** (`frozen_since_day = currentDay`, `hooks.onFreeze?` = o e-mail "segurando sua camisa"). Já congelada → no-op (e-mail **não** re-dispara).
  - `last_active_day` nulo → **pulado** (não rastreado). Devolve um `VacancyReport` (quantos congelados/descongelados/revertidos).
- [ ] `hooks = { onFreeze?, onThaw? }` — **seam de notificação** (default no-op); o e-mail real é fatia futura.
- [ ] `readVacancyState(db, seed, humanAthleteId)` — `{ lastActiveDay, frozenSinceDay }` (p/ teste/UI futura).

**D) Sobreviver à viragem (SPEC-021):**
- [ ] `OccupationView` + `toView` + `reapplyOccupations` carregam `last_active_day` + `frozen_since_day` (o gotcha). O congelamento não é perdido no rollover (o day-index é monotônico entre temporadas).

**E) Wiring (fora do tick puro):** o scheduler chama `runVacancyPass(db, seed, currentDay)` **1×/dia** (junto do `runDailyRound`). Na fatia, é **testado direto**; o ponto de wiring é documentado. `markActive` idem (chamado pela futura ação de atividade).

**F) Testes** (ao vivo gated por `DATABASE_URL`; serial): ver Critérios.

## Escopo — o que está FORA

- **O e-mail real** "segurando sua camisa" (infra de notificação/SMTP) — `onFreeze` fica seam no-op.
- **O sinal de "atividade" real** (o que marca `last_active_day`: login/escalação/treino) — `markActive` é callable; quem o chama é fatia futura (precisa da superfície HTTP/sessão).
- **Wiring ao scheduler de produção** — `runVacancyPass` é callable; o gatilho diário é fatia de deploy.
- **A waiting-list / a fila que ocupa a vaga liberada** — o revert devolve a vaga a NPC; quem puxa a fila é fatia futura (a vaga volta a ser ocupável pelo fluxo de entrada normal).
- **Re-entrada automática do benched** — o atleta preservado pode re-ocupar pelo fluxo de entrada existente; automatizar isso é futuro.
- **Interação fina Regen×Vacância** — os dois passes são independentes (regen = idade, fronteira de temporada; vacância = inatividade, diário). Um benched (revertido) simplesmente deixa de ser candidato a regen (sem ocupação). Documentado; sem orquestração conjunta nesta fatia.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `services/world-store/src/schema/world.ts` | editar — `last_active_day` + `frozen_since_day` em `world_occupation`. |
| `services/world-store/src/migrations/0006_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/world-store/src/store/vacancy-policy.ts` | criar — `VACANCY = { revertAfterDays: 30 }`. |
| `services/world-store/src/store/vacancy-repo.ts` | criar — `markActive`/`runVacancyPass`/`readVacancyState` + `VacancyReport`/`VacancyHooks`. |
| `services/world-store/src/store/occupation-repo.ts` | editar — `OccupationView`/`toView` carregam os 2 campos novos. |
| `services/world-store/src/store/turnover-repo.ts` | editar — `reapplyOccupations` re-aplica os 2 campos (sobrevivem à viragem). |
| `services/world-store/src/index.ts` | editar — exporta `markActive`/`runVacancyPass`/`readVacancyState`/`VACANCY` + tipos. |
| `services/world-store/test/vacancy-repo.test.ts` | criar — testes ao vivo (a máquina de estados). |
| `services/world-store/test/turnover-repo.test.ts` | editar — teste "campos de vacância sobrevivem à viragem". |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — flip SPEC-022 → PR #25 + estado. |
| `specs/SPEC-023-*.md`, `specs/DONE-023-*.md` | criar. |

**Intocado:** `packages/world-engine` (engine puro) e todos os goldens; o `player-store` (o benched preserva a carreira — zero toque cross-schema); a viragem/`daily-round` a não ser pelos 2 campos re-aplicados.

---

## Critérios de aceitação

1. **Marcar ativo:** `markActive(seed, humanId, day)` grava `last_active_day=day` e limpa `frozen_since_day`. Testado ao vivo.
2. **Congelar (dia 1):** um humano inativo (`currentDay > last_active_day`) e não-congelado → `runVacancyPass` seta `frozen_since_day` e chama `onFreeze` **uma vez** (rodar de novo no dia seguinte **não** re-dispara). Testado ao vivo.
3. **Descongelar:** um congelado que fica ativo de novo (`markActive` com o dia corrente) → `frozen_since_day` volta a `null` e `onThaw` dispara. Testado ao vivo.
4. **Reverter aos 30:** `inativo >= 30` → `runVacancyPass` reverte a vaga a NPC (a ocupação some, `is_human=false` — via `vacateSlot`). O atleta do **player-store fica intocado** (benched: a fatia não cruza schema). Testado ao vivo (lado mundo) + assertado por construção (nenhuma escrita no player-store).
5. **Não rastreado é pulado:** `last_active_day` nulo → nunca congela/reverte. Testado ao vivo.
6. **Idempotência do pass:** rodar `runVacancyPass` 2× no mesmo dia → mesmo estado, sem e-mail duplicado, sem revert duplicado. Testado ao vivo.
7. **Sobrevive à viragem:** `last_active_day` + `frozen_since_day` são re-aplicados no rollover (`reapplyOccupations`) — um congelado atravessa a virada sem perder o relógio. Testado ao vivo.
8. **OPs & gates:** sem `any` (OP-14); ≤50 linhas/função (OP-15); ≤300/arquivo (OP-16); erros genéricos (OP-11); migration aditiva (OP-01); regra na borda do store / engine puro intocado (OP-17); `lint`/`typecheck`/`build`/`test`/prettier verdes; **engine e os 4 goldens intocados** (`git diff` = 0); ao vivo serial + limpeza em ordem de FK.

---

## Segurança

- **Autoridade server-side:** a inatividade, o congelamento e o revert são decididos no servidor (day-index + `last_active_day`); o cliente nunca força um descongelamento nem segura a vaga além da política. `markActive` é a única porta de "estou aqui".
- **OP-11:** ocupação inexistente / falha de pass → erro genérico, sem SQL/stack.
- **Atomicidade:** cada mutação (freeze/thaw/revert) é transacional (o `vacateSlot` já é tx; freeze/thaw são UPDATEs de coluna). O pass é best-effort idempotente por ocupação (isolamento por candidato, molde do `runRegenPass`).
- **Sem PII/segredo novo** (OP-02/OP-12): o e-mail é seam; nenhum endereço é armazenado aqui (o e-mail mora no player-store `account`, alcançado só quando o wiring real existir).

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Colunas novas somem na viragem** (o gotcha da SPEC-021) | `reapplyOccupations` re-aplica os 2 campos; teste dedicado prova. |
| **Congelar cedo demais** (1 dia de ausência → e-mail) | Decisão do founder (janela única, sem carência): é um nudge, não punição; 30 dias de folga p/ voltar. `revertAfterDays` tunável; adicionar carência é 1 tunável futuro sem churn. |
| **Pass rodando fora de ordem / dia repetido** | Idempotente por construção: `frozen_since_day` marca a transição (e-mail 1×); revert via `vacateSlot` (idempotente); `markActive` sempre limpa o congelamento. |
| **Benched perde a carreira** | NÃO — a fatia é só-mundo; o player-store não é tocado no revert (o atleta segue `active`, fora do mundo, re-ocupável). |
| **Regen × Vacância colidem** | Independentes (idade/fronteira vs. inatividade/diário); um benched deixa de ser candidato a regen (sem ocupação). Documentado; sem orquestração conjunta. |

**Dependências:** SPEC-020 (`world_occupation`/`occupyNpcSlot`), SPEC-022 (`vacateSlot`), SPEC-021 (`reapplyOccupations` — a re-aplicar os campos), SPEC-015 (o `dayIndex` do tick). **Precede:** a waiting-list (quem puxa a vaga liberada), o e-mail real, o wiring do scheduler, o sinal de atividade real.

---

## Notas de implementação

- **A vacância mora no world-store** (não em `services/*` novo): é single-schema (só `world_occupation`/`athlete`), molde do `daily-round`/`turnover-repo`. O "benched" (não tocar o player-store) é o que mantém a fatia sem cross-schema.
- **Dois campos, não um:** `last_active_day` é o relógio; `frozen_since_day` marca a transição (para o e-mail disparar **uma vez** e para o "faltam X dias"). Derivar o congelamento só de `last_active_day` re-dispararia o e-mail a cada pass.
- **Reusa o `vacateSlot`** da SPEC-022 para o revert — mesma semântica "a vaga volta a NPC", já idempotente e testada.
- **Gotcha da viragem:** ao adicionar coluna em `world_occupation`, SEMPRE atualizar `OccupationView`/`toView`/`reapplyOccupations` (senão a viragem zera). Este é o 2º caso (o 1º foi `regen_requested`).
- **Fecho do DONE:** "Estado atual" (SPEC-023, flipar SPEC-022 → PR #25) + `roadmap.md`.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (máquina de estados congela→descongela→reverte; e-mail/atividade/scheduler/waiting-list fora)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva `0006` — OP-01)
- [x] Critérios testáveis (marcar ativo, congelar 1×, descongelar, reverter aos 30, pular não-rastreado, idempotência, sobrevive à viragem)
- [x] Riscos avaliados (gotcha da viragem, congelar cedo, ordem/dia repetido, benched, Regen×Vacância)
- [x] Decisões co-desenhadas registradas (janela única 30d, joga congelado, benched)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-023 — método H1VE. A camisa não fica presa nem é arrancada cedo: some da tela por inatividade, esperamos 30 dias segurando a vaga (com um "estamos segurando sua camisa"), e só então ela volta à fila. Quem volta a tempo, descongela e segue; quem não volta, é aposentado do banco — mas a carreira fica guardada. Só-mundo, engine e goldens intocados.*
