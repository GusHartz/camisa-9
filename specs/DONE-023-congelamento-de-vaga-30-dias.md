# DONE-023 — Congelamento de vaga (30 dias)

> Registro de conclusão (par obrigatório da SPEC-023). O que foi construído, como foi verificado,
> onde a revisão adversarial mordeu (e como foi corrigido), e o que fica documentado/deferido.

---

## Metadados

| Campo | Valor |
|---|---|
| **SPEC** | SPEC-023 — Congelamento de vaga (30 dias) |
| **Roadmap item** | Retenção + escassez (o pilar "escassez via waiting list") |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/congelamento-de-vaga-30-dias` |
| **Concluída em** | 2026-07-17 |
| **Status** | **CONCLUÍDA** — gates verdes; aguardando duplo sign-off QA+Data e merge do arquiteto |

---

## O que foi entregue (a máquina de estados de retenção)

Quando um humano fica inativo, a vaga dele **congela** (dispara o e-mail "estamos segurando sua camisa" — seam); se ele voltar dentro de **30 dias**, **descongela**; se completar 30 dias, a vaga **reverte a NPC** (volta à fila), com a carreira **preservada** (benched — o atleta segue no player-store, re-ocupável). Tudo **só-mundo** (zero cross-schema), com o **engine e os goldens intocados**.

**A) Schema + migration aditiva `0006` (OP-01):** `world_occupation.last_active_day` (o relógio, nullable — null = não-rastreado → nunca congela) + `frozen_since_day` (a transição, nullable — marca o congelamento p/ o e-mail disparar 1×). Ambos em day-index (o relógio monotônico do tick, atravessa temporadas).

**B) Política tunável** `vacancy-policy.ts`: `VACANCY = { revertAfterDays: 30 }` (o único tunável — janela única, congela imediato, sem carência).

**C) `vacancy-repo.ts` (novo) — a máquina de estados:**
- `markActive(db, seed, humanId, day, onThaw?)` — o seam de atividade: grava `last_active_day = day` e descongela (atômico via `SELECT … FOR UPDATE`; `onThaw` dentro da tx). No-op silencioso se o humano não ocupa vaga.
- `runVacancyPass(db, seed, currentDay, hooks?)` — o passe diário (molde do `runRegenPass`): congela o inativo (e-mail 1×), reverte a NPC aos 30 dias, pula o não-rastreado, com **isolamento por candidato**. Devolve `{ frozen, reverted }`.
- `readVacancyState` — o relógio de um humano (teste/UI "faltam X dias").
- `hooks = { onFreeze?, onThaw? }` — seam de notificação (default no-op).

**D) Sobrevive à viragem (SPEC-021):** `OccupationView`/`toView`/`reapplyOccupations` carregam os 2 campos novos → o relógio de congelamento não é zerado no rollover (o gotcha da SPEC-021, aplicado — este é o 2º caso, o 1º foi `regen_requested`).

**E) Wiring:** documentado — o scheduler chama `runVacancyPass(db, seed, currentDay)` 1×/dia (junto do `runDailyRound`); `markActive` é chamado por uma ação futura (login/escalação/treino). Na fatia, ambos são testados direto.

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

A dimensão **viragem/OP/escopo voltou LIMPA** (a re-aplicação dos campos no rollover, a migration aditiva, o benched sem cross-schema, o engine/golden intocados — todos confirmados corretos). Os defeitos reais estavam **todos na concorrência da máquina de estados** — a mesma classe money-path das SPECs anteriores:

**CRITICAL (corrigido) — TOCTOU no revert expulsava um humano ativo.** O passe lia um snapshot sem lock (`readWorldOccupations`), decidia "reverter" pela inatividade obsoleta, e o `vacateSlot` deletava **sem re-checar** `last_active_day`. Um `markActive` concorrente (o humano logando no dia 30) commitava no meio da janela → o humano ativo/pagante era **irrecuperavelmente expulso do mundo** (viola "o humano sobrevive"). **Fix:** `revertIfStale` — a reversão virou um **DELETE condicional atômico** (`WHERE last_active_day <= currentDay − revertAfterDays`); um `markActive` concorrente invalida o WHERE → **no-op** (o humano NÃO é expulso).

**MAJOR (corrigido) — TOCTOU no freeze congelava um humano ativo.** `freezeOne` re-checava só `frozen IS NULL`, não a inatividade ao vivo → um `markActive` entre o snapshot e o freeze congelava quem acabou de voltar (+ e-mail espúrio, estado final `frozen != null` para uma vaga ativa). **Fix:** o UPDATE de freeze ganhou `AND last_active_day < currentDay` no WHERE (fire-once **e** anti-TOCTOU).

**MAJOR (corrigido) — `onFreeze` que lança perdia o e-mail para sempre.** O `freezeOne` commitava `frozen_since_day` ANTES do hook; uma exceção era engolida pelo `try/catch` e o guard fire-once bloqueava todo retry → o e-mail de retenção (o produto da SPEC) era perdido em silêncio. **Fix:** `freezeOne` virou uma **transação** e o `onFreeze` dispara **dentro dela** → lança faz **ROLLBACK** (o `frozen` não persiste) e o próximo passe **retenta** (at-least-once). O mesmo padrão foi aplicado ao `markActive`/`onThaw`.

**Minor (corrigido) — `markActive` read+update não-atômico.** O read de `frozen` + o UPDATE eram 2 statements → um `freezeOne` concorrente entre eles perdia o `onThaw`. **Fix:** `markActive` virou uma tx com `SELECT … FOR UPDATE` (serializa contra o `freezeOne`).

**Cobertura (MAJOR corrigido):** +6 testes — `onFreeze` lançando (rollback → retenta), o limite da janela em par (inativo **29 congela** / **30 reverte**), multi-ocupante (congela só o inativo, o report conta certo), isolamento por candidato (um `onFreeze` que lança não impede o outro), anti-TOCTOU (humano que voltou não é expulso), `markActive` num não-ocupante (no-op).

---

## Desvios de MECANISMO / limitações (documentados, não bugs)

- **Ramo de thaw removido do passe (nit da revisão):** a SPEC (escopo C) listava um `inativo <= 0 → descongela` DENTRO do passe, mas como o `markActive` é o único escritor de `last_active_day` e limpa o `frozen` junto, esse ramo é **inalcançável** (código morto). Removido — o thaw é 100% do `markActive`. Mesmo comportamento observável (o congelado que volta descongela).
- **A vaga revertida mantém nome/ability do ex-humano** (nit): o `revert` (como o `vacateSlot`) só faz `is_human=false`; a identidade original do NPC não foi guardada na ocupação (foi sobrescrita na entrada, SPEC-020), então não há o que restaurar. O NPC revertido joga com o nome/ability congelados **até a próxima viragem** regenerar o mundo (self-heal). Cosmético; não afeta o money path.
- **Salto de relógio pula o aviso** (minor): se o passe NÃO rodar por ≥30 dias (outage de scheduler catastrófico), o humano é revertido sem nunca ter recebido o "segurando sua camisa". A cadência diária é premissa; endurecer é fatia de scheduler.
- **Benched provado por construção:** o revert é só-mundo (não toca o player-store), então a carreira é preservada por construção; não há teste cross-schema numa suíte de world-store.
- **E-mail real = outbox:** o `onFreeze`/`onThaw` são seams no-op; um sender real deve usar um **outbox** (grava na tx, envia async), não bloquear a transação com um SMTP síncrono. Documentado no código.

---

## Verificação (gates)

- **276/276 testes** (263 preservados da SPEC-022 + 13 novos: 12 ao vivo em `vacancy-repo` + 1 de sobrevivência à viragem em `turnover-repo`), estável em 2 execuções. Sem `DATABASE_URL`: os ao vivo dão skip.
- `npm run typecheck` · `npx eslint .` · `npm run build` · prettier — verdes (OP-11/14/15/16/17 + guardrail).
- **`world-engine` e os 4 goldens INTOCADOS** — `git status --short packages/world-engine/src/__fixtures__/` = vazio (byte-idêntico). Zero toque no engine ou no player-store.
- **Migration aditiva `0006`** (2 `ADD COLUMN` nullable — OP-01). CI: o `postgres:16` + migrate já aplica `0000..0006`; sem mudança de pipeline.

---

## Critérios de aceitação — status

1. **Marcar ativo** — ✅ (`markActive` grava + descongela, atômico).
2. **Congelar (dia 1) 1×** — ✅ (fire-once via `frozen IS NULL`; rodar de novo não re-dispara).
3. **Descongelar** — ✅ (`markActive` limpa `frozen` + `onThaw`).
4. **Reverter aos 30** — ✅ (`revertIfStale` → ocupação some + `is_human=false`; player-store intocado).
5. **Não rastreado pulado** — ✅.
6. **Idempotência do pass** — ✅ (2× mesmo dia → mesmo estado, sem e-mail/revert duplicado).
7. **Sobrevive à viragem** — ✅ (`reapplyOccupations` re-aplica os 2 campos).
8. **OPs & gates** — ✅ (todos verdes; engine/goldens intocados).

**Reforço além da SPEC** (da revisão): anti-TOCTOU no freeze E no revert (writes condicionais atômicos) + at-least-once nos hooks (rollback no throw) + isolamento por candidato testado.

---

## Escopo deferido (honesto)

- O **e-mail real** "segurando sua camisa" (infra de notificação/outbox) — `onFreeze` fica seam no-op.
- O **sinal de atividade real** (o que chama `markActive`: login/escalação/treino) — precisa da superfície HTTP/sessão.
- O **wiring ao scheduler de produção** — `runVacancyPass` é callable; o gatilho diário é fatia de deploy.
- A **waiting-list** que puxa a vaga liberada — o revert devolve a vaga a NPC; a fila é futura.
- A **re-entrada automática do benched** — o atleta preservado re-ocupa pelo fluxo de entrada existente.
- **Restaurar a identidade de NPC na vaga revertida** — regenera na viragem por ora.

---

## Fecho

- **Estado atual** (CLAUDE.md): SPEC-023 adicionada; SPEC-022 flipada → **PR #25**.
- **`docs/projeto/roadmap.md`**: a mecânica de retenção/escassez (congelamento de vaga) registrada.
- **Memória do projeto**: o padrão anti-TOCTOU do passe (decidir no snapshot, mutar com re-check condicional) capturado.

*DONE-023 — método H1VE. A camisa some por inatividade, esperamos 30 dias segurando a vaga, e só então ela volta à fila — quem volta a tempo descongela, quem não volta é aposentado do banco (a carreira fica guardada). A revisão adversarial pegou um TOCTOU que expulsava um humano ativo no dia exato do revert (money path) e o fechou com writes condicionais atômicos. Engine e goldens intocados.*
