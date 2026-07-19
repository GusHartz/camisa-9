# SPEC-033 — Transferências (Fatia 1 — o humano como ALVO do mercado)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-033 |
| **Feature** | Transferências (roadmap 1.4) — card do board |
| **Slug** | transferencias-humano |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 1.4 (transferências) — 1ª fatia (só-humano) |
| **Appetite** | **4 a 5 dias** (a heurística pura + o seam de tier + a flag/execução + o primitivo de MOVE atômico + a costura + o racha do quinteto). |
| **Prioridade** | ALTA — dá vida ao maior seam inerte hoje (o `outcome.transfer` da SPEC-025) e fecha o loop de mobilidade da carreira. |
| **Criada em** | 2026-07-19 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-19)

1. **O humano é o ALVO do mercado, nunca o operador.** Charter: "você **é** o atleta; o clube é palco (NPC)"; anti-usuário = o min-maxer de gestão. Os clubes NPC operam o mercado por heurística; o humano só **decide sobre si** (aceitar/recusar uma proposta; "testar o mercado" pra aumentar a visibilidade). Nunca compra/vende/escala/negocia elenco.
2. **Quinteto racha (escolha dramática).** Humanos em time (SPEC-018) TAMBÉM recebem propostas; **aceitar sair racha o quinteto** (o `team_id` é limpo, você vira solo no novo clube). É uma decisão pesada e narrativa ("trocar os amigos pela glória?"), não um bloqueio.
3. **Fatia 1 = só-humano; o engine `runTransfers` e os 4 goldens INTOCADOS.** Só o lado humano (proposta → decisão → aceita → move na viragem). O mercado **NPC rico** (valuation, cross-divisão, clube supre fraqueza no `runTransfers` do engine) = **Fatia 2** (toca o engine, regenera o `world.golden` intencionalmente).
4. **A transferência aceita aplica na VIRAGEM** (janela de gênese). A proposta chega na temporada, você aceita, e a mudança de clube efetiva acontece na viragem — respeita a **imutabilidade do snapshot** (a guarda de gênese da SPEC-020/032; foi por isso que o regen só roda na gênese) e reusa a máquina de viragem. "Assina agora, muda na próxima janela", igual futebol.

---

## Objetivo

Dar vida ao `outcome.transfer`. Hoje as decisões `renovar-contrato` (→ `transfer: 'explore'`) e `proposta-salario` (→ `transfer: 'rival'`) da SPEC-025 **existem mas ninguém as executa**. Esta fatia faz **(a)** o mundo gerar interesse por um humano (heurística `overall` vs. `tier`), **(b)** a proposta surgir como decisão das 18h (aceitar/recusar), e **(c)** a aceita **mover o humano de clube na viragem** — cross-divisão, com o racha do quinteto quando aplicável. O mercado NPC segue o placeholder da SPEC-009 (engine/goldens intocados).

---

## Contexto e motivação (fatos verificados no repo)

- **`packages/player/decisions.ts`:** os templates `renovar-contrato` (trigger `overall>=45`, opção "Testar o mercado" → `outcome.transfer:'explore'`) e `proposta-salario` (trigger `overall>=55`, opção "Aceitar (2× salário)" → `outcome.transfer:'rival'`) já existem. `DecisionContext` tem `overall/balance/lifestyleTier/age?/moral?/injured?` — **não tem `tier`** (o "overall vs. tier" precisa desse seam). `outcome` é DADO declarado (a aplicação é de outro sistema — aqui, o card 1.4).
- **`decision-repo.ts`:** `generateForDay(db, athleteId, day, seed, extra: {age?, injured?})` monta o contexto e injeta os seams `age`/`injured` (só se definidos — `exactOptionalPropertyTypes`). `answerDecision` grava a resposta; a conservadora fecha as PENDING às 18h. **`tier` entra como 3º seam**, molde exato do `age`/`injured`.
- **`occupation-repo.ts` (SPEC-020):** `occupyNpcSlot(db, {worldSeed, clubId, position, humanAthleteId, humanName, ability, allowAnyTier?})` — ocupa a vaga do NPC MAIS FRACO da posição (FOR UPDATE), com guarda de GÊNESE (rejeita se a temporada já publicou rodada) e guarda de tier-4 (pulável por `allowAnyTier`, usado pelo regen). `vacateSlot` reverte uma vaga a NPC.
- **`reassign-repo.ts` (SPEC-022):** `reassignSlot` reaponta a MESMA vaga a um novo humano (regen) — **não serve** p/ transferência (que MOVE entre clubes); mas prova o padrão atômico "sem janela órfã" (a ocupação nunca fica solta).
- **`services/regen` (SPEC-022) + o wiring no scheduler (SPEC-032):** `runRegenPass(worldDb, playerDb, seed)` roda na **janela de gênese** (`season_rolled || before_season`) — o molde EXATO da execução da transferência (também pós-viragem, também muta o snapshot na gênese).
- **`world_occupation`:** overlay autoritativo (SPEC-020) com `human_name`/`ability` congelados + `regen_requested` (SPEC-022) + `last_active_day`/`frozen_since_day` (SPEC-023). Sobrevive à viragem via `reapplyOccupations`.
- **`athlete.team_id` (SPEC-018):** a filiação ao quinteto (NULL = solo). Limpar = sair do time.
- **Engine `transfers.ts`/`world-turnover.ts` (SPEC-009):** `runTransfers(survivors, transferRng, immuneIds)` — placeholder NPC na viragem, **já pula os humanos** (`immuneIds`). É a fatia 2; aqui fica INTOCADO.
- **Guardrail:** a heurística de interesse/valuation vai numa **lib pura** (`packages/player`), inteira (hash/aritmética, sem `Date`/`random`/transcendentais). `services/*` é a borda.

---

## Escopo — o que está DENTRO (Fatia 1)

### A) `packages/player` — a heurística pura + o seam de tier + a proposta
- [ ] `transfer.ts` (novo, PURO): `TRANSFER` (tunável) + `isTransferTarget(overall, tier)` — o humano é alvo quando está **forte para o seu tier** (ex.: `overall − tierFloor(tier) >= threshold`); `transferValue(overall, age)` (inteiro — insumo dos termos/narrativa). Determinístico, guardrail-safe.
- [ ] `decisions.ts`: `tier` entra no `DecisionContext` (seam opcional, molde do `age`). Um template novo `proposta-clube-maior` (type `proposta`, trigger `isTransferTarget(overall, tier)`) — opções `aceitar` (`outcome.transfer:'accept'`) / `ficar` (conservadora, `moral:+`). Os templates `proposta-salario`/`renovar-contrato` existentes seguem (o `'rival'`/`'explore'`).
- [ ] `explore` (o "testar o mercado") = **seam de visibilidade**: aumenta a chance/antecipa a proposta (ex.: baixa o threshold do `isTransferTarget` por N dias). Aplicação mínima nesta fatia (a flag é lida pelo contexto).

### B) `services/player-store` — o seam de tier + a flag de pendência
- [ ] `generateForDay(…, extra: {age?, injured?, tier?})` + `buildContext` passam `tier` (só se definido). O scheduler injeta o `tier` do clube do humano.
- [ ] Migration aditiva: `athlete.transfer_requested` (bool, default false) — a **pendência** (a proposta aceita, ainda não executada). `answerDecision` seta `transfer_requested=true` quando a opção respondida tem `outcome.transfer ∈ {accept, rival}` (aceitou sair). `readTransferRequested`.
- [ ] `explore` seta um flag/janela de visibilidade (campo aditivo `market_open_until` ou simples bool) que o `buildContext` lê p/ o `tier`-threshold. (Mínimo; pode ser um bool `market_open`.)

### C) `services/world-store` — o MOVE atômico + a heurística de destino
- [ ] `transferOccupation(db, {worldSeed, humanAthleteId, toClubId, position, humanName, ability})` (novo, transacional): numa ÚNICA transação — ocupa a vaga do NPC mais fraco da `position` no `toClubId` (reusa a seleção do `occupyNpcSlot`, `allowAnyTier`) E reverte a vaga ANTIGA do humano a NPC — **sem janela órfã** (a lição da SPEC-022) — com guarda de gênese. O humano mantém o `humanAthleteId`; a `ability`/`name` congelados migram.
- [ ] `pickTransferDestination(world, occ, seed)` (puro-ish, na borda): escolhe o clube-alvo determinístico por seed — um clube de tier **melhor-ou-igual** (≠ o atual) que **precisa da posição** (a vaga mais fraca da posição é mais fraca que o humano → ele melhora o destino). Sem candidato → sem move (a proposta "não vinga" — raro).

### D) `services/transfer` (workspace novo) — a costura (molde do `services/regen`)
- [ ] `runTransferPass(worldDb, playerDb, seed)`: na **janela de gênese** (o scheduler chama junto do regen), para cada ocupação humana com `transfer_requested` (lê o player-store) → `pickTransferDestination` → `transferOccupation` → **limpa `transfer_requested`** (player) + **limpa o `team_id`** se o humano estava num quinteto (o racha) → registra no log. Isolamento por-candidato (um erro não aborta os demais). Idempotente (a flag limpa = idempotência natural, molde do regen).

### E) `services/scheduler` — o wiring
- [ ] No `processDay`, dentro da janela de gênese (`season_rolled || before_season`), chamar `runTransferPass` (junto do `runRegenPass`); e passar o `tier` do humano ao `generateForDay` (lê o clube da ocupação → tier). Report ganha `transferred`.

### F) Testes
Ver Critérios. Puros (heurística/template) + ao vivo (a proposta aparece, aceita→pendente, a viragem move de clube, o quinteto racha, cross-divisão, sem-candidato, idempotência, engine/goldens intocados).

## Escopo — o que está FORA (Fatia 2 / futuro)

- **O mercado NPC rico** (valuation + cross-divisão + clube supre fraqueza no `runTransfers` do engine) → toca o engine, **regenera o `world.golden`** — Fatia 2.
- **Negociação/termos** (salário, luvas, duração de contrato) — hoje o "2× salário" é rótulo; a economia real do contrato é futura.
- **Janela do meio da temporada** (mudança mid-season por overlay) — a decisão foi "na viragem".
- **A química do quinteto** / a waiting-list que preenche a vaga liberada / o técnico que "pede" reforço.
- **Recusar com consequência rica** (o clube se magoa, banco) — aqui recusar = fica (efeito de moral simples).

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/transfer.ts` (+ barrel) | criar — `isTransferTarget`/`transferValue`/`TRANSFER` (puro). |
| `packages/player/src/decisions.ts` (+ `.test.ts`) | editar — `tier` no `DecisionContext` + template `proposta-clube-maior`. |
| `services/player-store/src/migrations/000N_transfer.sql` (+ meta) | criar (OP-01) — `athlete.transfer_requested` (+ `market_open`). |
| `services/player-store/src/store/decision-repo.ts` | editar — `tier` seam + `answerDecision` seta a flag. |
| `services/player-store/src/store/*` | editar — `readTransferRequested` / `clearTransferRequested`. |
| `services/world-store/src/store/transfer-repo.ts` | criar — `transferOccupation` (MOVE atômico) + `pickTransferDestination`. |
| `services/world-store/src/index.ts` | editar — exportar as peças. |
| `services/transfer/*` (workspace novo) | criar — `runTransferPass` + `package.json` (`exports`) + tsconfig/vitest paths. |
| `services/scheduler/src/daily-tick.ts` | editar — wire `runTransferPass` na gênese + `tier` no `generateForDay` + report `transferred`. |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 1.4 (fatia 1) + flip SPEC-032 → PR #35. |
| `specs/SPEC-033-*.md`, `specs/DONE-033-*.md` | criar. |

**Intocado (o critério DURO):** `packages/world-engine` (`runTransfers`/`resolveMatch`/`simulateSeason`/`advanceWorld`) e os **4 goldens** (`git diff __fixtures__/` = 0). A transferência é 100% borda + lib pura de player.

---

## Critérios de aceitação

1. **A heurística (pura):** `isTransferTarget(overall, tier)` — um humano forte no tier baixo É alvo; fraco/tier alto NÃO; determinístico; inteiro/guardrail. `transferValue` monotônico em overall, decrescente na idade. Testado puro.
2. **A proposta:** um humano forte-para-o-tier RECEBE a decisão `proposta-clube-maior` (via o `tier` seam); um fraco não. Testado (puro + ao vivo).
3. **Aceitar → pendente:** responder "aceitar" seta `transfer_requested`; "ficar" não. `explore` abre a visibilidade. Ao vivo.
4. **A viragem MOVE:** um humano com `transfer_requested` → na viragem, o `runTransferPass` o move p/ o clube-alvo (a ocupação aponta o novo clube), a vaga antiga volta a NPC, a flag limpa. **Cross-divisão** (o alvo pode ser tier melhor). Ao vivo.
5. **O quinteto racha:** um humano de time que aceita e é movido → `team_id` limpo (vira solo no novo clube). Ao vivo.
6. **Atomicidade (sem janela órfã):** o `transferOccupation` é uma transação — se o occupy no destino falha, a vaga antiga NÃO é perdida (o humano segue no clube atual, re-tentável). Testado.
7. **Sem candidato / idempotência:** sem clube-alvo elegível → sem move (o humano fica, flag preservada ou limpa por design); rodar a viragem 2× não move em dobro (flag limpa = idempotência). Ao vivo.
8. **OPs & gates:** sem `any` (14); ≤50/função (15); ≤300/arquivo (16); heurística na lib pura / move na borda (17); guarda de gênese; erros genéricos (11); migration (01); `lint`/`typecheck`/`build`/`test`/prettier verdes; **`world-engine` e os 4 goldens intocados** (`git diff` = 0).

---

## Segurança

- **Determinismo (money path):** a heurística de interesse e a escolha de destino derivam de seed + estado → reproduzíveis/auditáveis. O move é atômico (all-or-nothing), na janela de gênese (snapshot íntegro).
- **Autoridade server-side:** o interesse/destino são decididos no servidor (heurística); o humano só aceita/recusa. O cliente nunca move ninguém.
- **Snapshot íntegro:** o move só na gênese (guarda de gênese) — nunca reescreve uma temporada com rodadas publicadas.
- **OP-11/OP-17:** erros genéricos; regra pura na lib, I/O na borda.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Janela órfã no MOVE** (a lição da SPEC-022) | `transferOccupation` é UMA transação (occupy destino + vacate origem juntos); falha → rollback → o humano fica. Testado. |
| **Mover num snapshot publicado** | O move só na gênese (`season_rolled||before_season`); a guarda de gênese do occupy blinda. |
| **Proposta que não vinga** (sem destino) | `pickTransferDestination` pode voltar vazio → sem move; documentado (raro; quase sempre há uma vaga mais fraca num tier melhor). |
| **Sobrevivência à viragem** | A flag é player-side (não é dropada pelo `reapplyOccupations`); o `team_id` é player-side. |
| **Regen vs. transferência no mesmo humano** | Um ≥42 REGENERA (não transfere); a ordem na gênese (regen antes) + a flag garantem exclusão. Testado. |
| **Colisão com o mercado NPC** | O engine `runTransfers` pula humanos (`immuneIds`); os dois mercados não se cruzam nesta fatia. |

**Dependências:** SPEC-025 (`outcome.transfer`/decisões), SPEC-020 (`occupyNpcSlot`/`world_occupation`), SPEC-022 (`vacateSlot`/o padrão atômico), SPEC-023 (`vacateSlot`), SPEC-032 (a janela de gênese no scheduler), SPEC-018 (`team_id`). **Precede:** o mercado NPC rico (Fatia 2); a economia do contrato; a química.

---

## Notas de implementação

- **O molde é o regen (SPEC-022/032):** um passe na janela de gênese, isolado por-candidato, idempotente pela flag, cross-schema sequencial na borda. A transferência é "o regen que move de clube em vez de renascer no mesmo".
- **O `tier` fecha a lacuna do contexto:** hoje a proposta só olha `overall`; "forte para o tier" é o gatilho fiel (um craque na várzea é assediado). O seam entra como o `age`/`injured`.
- **`transferOccupation` ≠ `reassignSlot`:** reassign é mesma-vaga/novo-dono (regen); transfer é mesmo-dono/nova-vaga-noutro-clube. Novo primitivo, mesmo rigor atômico.
- **Fecho do DONE:** "Estado atual" (SPEC-033, flip SPEC-032 → PR #35) + `roadmap.md` (1.4 fatia 1).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (só-humano; mercado NPC rico / termos / mid-season fora)
- [x] Arquivos listados corretos (verificados no repo, com seams)
- [x] Mudança de schema COM migration (`transfer_requested`, OP-01)
- [x] Critérios testáveis (heurística, proposta, aceita→pendente, viragem-move, quinteto-racha, atomicidade, idempotência, goldens intocados)
- [x] Riscos avaliados (janela órfã, snapshot, sem-destino, regen-vs-transfer, colisão NPC)
- [x] Decisões co-desenhadas registradas (alvo-não-operador, quinteto-racha, só-humano, na-viragem)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-033 — método H1VE. Transferência sem gestão: o mundo (NPC) assedia o humano por heurística (forte para o tier), a proposta chega como decisão das 18h, e aceitar te MOVE de clube na viragem — cross-divisão, rachando o quinteto se for o caso. É o regen que muda de clube em vez de renascer: um passe na janela de gênese, atômico e idempotente, reusando os primitivos de ocupação. O engine `runTransfers` e os 4 goldens ficam intocados — o mercado NPC rico é a Fatia 2.*
