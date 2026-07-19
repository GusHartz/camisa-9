# DONE-033 — Transferências (Fatia 1 — o humano como ALVO do mercado)

> Registro de conclusão (par do `SPEC-033`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-033 (par da SPEC-033) |
| **Feature** | Transferências (roadmap 1.4) — card do board |
| **Roadmap item** | 1.4 (transferências) — 1ª fatia (só-humano) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/transferencias-roadmap-1-4` |
| **Concluída em** | 2026-07-19 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## O que foi entregue

Deu vida ao `outcome.transfer`. **O humano é o ALVO do mercado, nunca o operador** (o pilar "cooperação, não gestão"): o mundo (NPC) assedia por heurística, a proposta chega como decisão das 18h, e aceitar **MOVE o humano de clube na viragem** — cross-divisão, rachando o quinteto. O engine `runTransfers` e os 4 goldens ficam INTOCADOS.

### A) `packages/player` — a heurística pura
- `transfer.ts`: `isTransferTarget(overall, tier, explore)` (forte-para-o-tier; `bandMaxByTier` redeclara `WORLD.abilityByTier[*].max`, cruzado no teste) + `transferValue(overall, age)` + `TRANSFER` tunável.
- `decisions.ts`: `tier?`/`marketOpen?` no `DecisionContext` + o template `proposta-clube-maior` (trigger forte-para-o-tier). Os templates `proposta-salario`/`renovar-contrato` já davam `transfer:'rival'`/`'explore'`.

### B) `services/player-store` — o seam de tier + a pendência
- Migration **`0009`**: `athlete.transfer_requested` + `market_open`. `answerDecision` → `applyTransferSeam` (aceitar → pendência; explore → mercado aberto). `readTransferRequested`/`clearTransferRequested`. O `tier` entra como seam no `generateForDay`/`buildContext`. `leaveTeam` (o racha).

### C) `services/world-store` — o MOVE atômico + o destino
- `transfer-repo.ts`: `transferOccupation` — o **MOVE ATÔMICO** (numa tx: `lockOrigin` FOR UPDATE → `weakestNpcSlotAt` no destino → ocupa carregando a idade de carreira + a força VIVA + reverte a origem a NPC + move a linha de ocupação; guarda de gênese; **sem janela órfã**). `pickTransferDestination` (puro, determinístico, **NPC-only**).

### D) `services/transfer` (workspace novo) — a costura
- `runTransferPass`: na gênese, p/ cada humano com a proposta aceita → destino (força viva) → `transferOccupation` → **limpa a flag ANTES do move** (at-most-once) → racha o quinteto. Isolamento por-candidato.

### E) `services/scheduler` — o wiring
- `processDay` chama `runTransferPass` na gênese (após o regen) + passa o `tier` do clube ao `generateForDay`. Report ganhou `transferred`.

---

## Revisão adversarial (workflow · 3 dimensões · verificação — 8 achados CONFIRMED)

O núcleo (atomicidade da tx, guarda de gênese, o move sem órfão) voltou **sólido**. A revisão pegou **5 MAJOR reais (3 raízes)** + 2 MINOR + 1 NIT — todos os MAJOR corrigidos:

- **MAJOR (divergência heurística↔move — #1/#4):** o `pickTransferDestination` contava HUMANOS ao achar "a vaga mais fraca" (o `WorldState.Athlete` não tem `isHuman`), mas o move só troca NPC → enfraquecia o destino (trocava um NPC forte) ou LANÇAVA (destino sem vaga NPC) deixando a proposta PRESA. **Fix:** o pick recebe o conjunto de slots HUMANOS e o exclui (`weakestNpcAbilityAt`) → casa com o `weakestNpcSlotAt` do move.
- **MAJOR (move em dobro — #2/#5):** a flag era limpa DEPOIS do move, que NÃO é idempotente (re-escolhe destino, excluindo o clube atual) → um crash/erro entre o move e a limpeza movia o humano UMA SEGUNDA vez (corrompendo o snapshot do money path). **Fix:** **clear-first** (AT-MOST-ONCE) — a intenção é limpa ANTES do move; um crash raro PERDE a transferência (re-ofertada), nunca move em dobro.
- **MAJOR (vivo vs. congelado — #3):** a proposta gatilhava no overall VIVO (focos), mas o destino usava a ability CONGELADA (entrada) → a transferência aceita EVAPORAVA justo para quem CRESCEU no treino. **Fix:** a costura lê a força VIVA (`abilityFromFocos` dos focos atuais) e a usa no destino E a grava na nova vaga (a transferência reconhece o crescimento).
- **MINOR (#7 — mundo estale no loop):** o mundo/ocupações são lidos FRESCOS por-candidato (transferências anteriores no mesmo passe já contam).
- **MINOR (#6) + NIT (#8) — aceitos/deferidos:** o `leaveTeam` roda após o move (o racha só num move bem-sucedido; uma falha rara nele perde só o racha cosmético, sem corromper); `market_open` de quem só testou o mercado sem aceitar persiste entre viragens (assediável de leve) → reset por-temporada = refinamento futuro.

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | A heurística (pura) | `transfer.test.ts`: forte-para-o-tier, explore, tier fora de faixa, `transferValue`, cross-check `bandMaxByTier` vs. engine. |
| 2 | A proposta | `decisions.test.ts`: `proposta-clube-maior` gatilha via o seam `tier` (inerte sem ele). |
| 3 | Aceitar → pendente | `decision-repo.test.ts`: aceitar seta `transfer_requested` (ao vivo). |
| 4 | A viragem MOVE | `transfer.test.ts` + `daily-tick.test.ts`: move de clube, vaga antiga → NPC, flag limpa, melhor-ou-igual tier, o tick executa na gênese. Ao vivo. |
| 5 | Quinteto racha | `transfer.test.ts`: `team_id` limpo. Ao vivo. |
| 6 | Sem candidato / idempotência | fraco → não move + flag limpa; 2× move UMA vez. Ao vivo. |
| 7 | Força viva (fix #3) | humano que cresceu (frozen 34 / vivo 70) É transferido e leva o overall vivo. Ao vivo. |
| 8 | OPs & goldens | sem `any`; ≤50/função (decomposto); ≤300/arquivo; migration `0009`; **engine + 4 goldens intocados** (`git diff` = 0); lint/typecheck/build/test/prettier verdes. |

**429 testes** (415 preservados + 14 novos: puros de `transfer`/template, `answerDecision`→flag, os 6 ao vivo do passe [move/racha/idempotência/sem-candidato/sem-pendência/força-viva], o wiring no tick).

---

## Escopo deferido (Fatia 2 / futuro)

- O **mercado NPC rico** (valuation + cross-divisão + clube supre fraqueza no `runTransfers` do engine → regenera o `world.golden`). Termos ricos (salário/luvas/contrato). Janela do meio da temporada. A química do quinteto. Recusar com consequência rica. **Reset de `market_open` por-temporada** (NIT). Reconciliação transacional distribuída cross-schema (o clear-first é at-most-once por design).

---

## Arquivos

**Criados:** `packages/player/src/transfer.ts` (+ `.test.ts`) · `services/player-store/src/migrations/0009_transfer_flags.sql` · `services/world-store/src/store/transfer-repo.ts` · `services/transfer/*` (workspace) + `test/transfer.test.ts` · `specs/SPEC-033-*.md`, `specs/DONE-033-*.md`.

**Editados:** `packages/player` (decisions.ts + `.test.ts` + barrel) · `services/player-store` (athlete schema, decision-repo, team-repo `leaveTeam`, barrel, decision-repo.test) · `services/world-store` (occupation-repo — helpers exportados + `weakestNpcSlotAt`; barrel) · `services/scheduler` (daily-tick, main, daily-tick.test) · `tsconfig.base.json`, `vitest.config.ts` (workspace `transfer`) · `docs/projeto/roadmap.md`, `CLAUDE.md`.

**Intocado (o critério DURO):** `packages/world-engine` (`runTransfers`/`resolveMatch`/`simulateSeason`/`advanceWorld`) e os **4 goldens** (`git diff` = 0). A transferência é 100% borda + lib pura de player.

---

*DONE-033 — método H1VE. Transferência sem gestão: o mundo assedia por heurística, a proposta é uma decisão das 18h, aceitar te MOVE de clube na viragem — o "regen que muda de clube". A revisão adversarial pegou 5 MAJOR (3 raízes: a divergência heurística↔move, o move em dobro, o vivo vs. congelado) — todos corrigidos (NPC-only no pick, clear-first at-most-once, força viva no destino/move). Engine e os 4 goldens intocados.*
