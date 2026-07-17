# DONE-024 — Salário e estilo de vida (básico)

> Registro de conclusão (par obrigatório da SPEC-024). O que foi construído, como foi verificado,
> o que a revisão adversarial confirmou (e corrigiu), e o débito honesto sinalizado ao founder.

---

## Metadados

| Campo | Valor |
|---|---|
| **SPEC** | SPEC-024 — Salário e estilo de vida (básico) |
| **Roadmap item** | 2.8 (Salário & estilo de vida — básico) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/salario-e-estilo-de-vida` |
| **Concluída em** | 2026-07-17 |
| **Status** | **CONCLUÍDA** — gates verdes; aguardando duplo sign-off QA+Data e merge do arquiteto |

---

## O que foi entregue

O desempenho vira **poder de compra**: o atleta ganha salário (por rodada, `f(overall)`) + prêmios, gasta num **catálogo ABERTO** de compras com **trade-off narrativo DECLARADO** (aplicado pela 2.3/F2 — aqui só dado), sobe a **escada de moradia** (o patrimônio da faixa) e alcança o marco da **casa da mãe**. **Fatia só-player-store** (zero cross-schema), engine/goldens intocados.

**A) Lib pura `packages/player/economy.ts`:** `ECONOMY` tunável (salário/prêmio inteiros) + `HOUSING_LADDER` (pensão→quitinete→casa→cobertura) + `PURCHASES` (catálogo aberto, cada item com custo + trade-off declarado) + `MOTHERS_HOUSE_ID`. Funções: `salaryPerRound`/`matchPrize`/`roundEarnings`, `lifestyleTier` (maior degrau), `hasMothersHouse`, `aggregateTradeoffs` (o único ponto de plugue p/ a 2.3/F2), `validatePurchase` (existe/1×/moradia-em-ordem/tem-saldo).

**B) `services/player-store`:** migration aditiva **`0004`** (`athlete.balance int CHECK ≥0` + tabela `purchase` PK `(athlete_id, item_id)`), `economy-repo` (`accrueRound` credita salário+prêmio; `purchaseItem` = compra ATÔMICA com `FOR UPDATE`; `readWallet` = saldo/posse/moradia/marco/agregado).

**Invariantes NUNCA respeitadas:** **anti-dinheiro-real** (o saldo só cresce por `accrueRound` — zero seam de moeda real, confirmado pela revisão) + **nunca loja de stats** (nenhuma compra escreve nos focos — provado por teste no caminho da compra E do crédito).

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

A revisão **confirmou a correção do núcleo** (as verificações-de-segurança voltaram positivas): a **compra atômica** (`FOR UPDATE` + READ COMMITTED) **não deixa saldo negativo** num double-spend concorrente; o **double-buy** do mesmo item é barrado (re-read de `owned` na tx + PK backstop); a **escada de moradia** não permite pular degraus; o overflow de `int4` é desprezível numa carreira. Os achados acionáveis:

- **minor (OP-11) — CORRIGIDO:** `economy-repo` não traduzia erros de constraint do pg (CHECK `23514` / PK `23505`) → vazariam crus. **Fix:** `accrueRound`/`purchaseItem` envelopam a tx (`isConstraintViolation` → mensagem genérica; a causa fica só p/ log server-side; o erro de domínio já era genérico).
- **major (cobertura) — CORRIGIDO:** faltava teste de concorrência do `purchaseItem`. **Fix:** teste double-spend (2 compras simultâneas juntas > saldo → exatamente 1 passa, saldo nunca negativo, 1 posse).
- **minor/nit (cobertura) — CORRIGIDOS:** +teste puro da **soma-de-chave-repetida** do `aggregateTradeoffs` (moral de 2 itens); +teste de que **`accrueRound` NÃO toca os focos** (anti-loja-de-stats no caminho do crédito); +**boundary de saldo exato** (custo == saldo → compra passa, zera); `reason` do "já adquirido" agora assertado.

### ⚠️ Débito honesto sinalizado ao founder (idempotência do crédito)

A revisão pegou uma **tensão com o charter** (não é bug hoje — `accrueRound` não tem caller): a SPEC-024 §104 dizia *"idempotência não exigida (o gatilho diário garante 1×/dia)"*, mas o **charter exige** que o job da rodada seja *"idempotente, protegido por lock e chave de idempotência (retry seguro)"* — e o próprio `publishWorldRound` é idempotente por PK `(season_id, round)` justamente porque a entrega é **at-least-once**. Sob um scheduler real, um retry re-creditaria salário+prêmio → **pagamento em dobro no money path**. A assinatura atual (`accrueRound(athleteId, result?)`) nem carrega identificador de rodada para deduplicar.

**Enquadramento correto (corrige o §104):** a idempotência do crédito **não** é dispensável — ela é **parte obrigatória do wiring do scheduler** (um ledger por rodada, chave `(athlete_id, season_id, round)`, no molde do `publishWorldRound`). Esta fatia entrega o primitivo de crédito; **o card do scheduler DEVE** adicionar a chave de idempotência **antes** de costurar `accrueRound` ao tick. Sinalizado ao founder para entrar no escopo daquele card.

---

## Desvio de MECANISMO / gotcha (não bug de produto)

- **Limpeza serial cross-arquivo (gotcha da SPEC-015, recorrência):** a nova tabela-filha `purchase` (FK→`athlete`) fez os `wipeAll` dos OUTROS testes do player-store (+ regen + world-entry) que apagam `player.athlete` violarem a FK (com as compras que o teste de economia deixa). **Fix:** `delete(purchase)` antes de `delete(athlete)` em `player-repo`/`training-repo`/`team-repo`/`regen`/`world-entry`. **Regra:** ao adicionar uma tabela-filha, atualizar o `wipeAll` de TODA suíte que apaga o pai — não só a nova.

---

## Verificação (gates)

- **299/299 testes** (276 preservados da SPEC-023 + 23 novos: ~14 puros de economia + ~9 ao vivo, incl. concorrência, anti-loja-de-stats no crédito, boundary de saldo), estável em 2 execuções. Sem `DATABASE_URL`: os puros sempre rodam; os ao vivo dão skip.
- `npm run typecheck` · `npx eslint .` · `npm run build` · prettier — verdes (OP-11/14/15/16/17 + guardrail de determinismo; fórmulas inteiras).
- **`world-engine` e os 4 goldens INTOCADOS** — `git status --short packages/world-engine/src/__fixtures__/` = vazio (byte-idêntico). **Zero toque no world-store** (o prêmio é param — sem cross-schema).
- **Migration aditiva `0004`** (CREATE TABLE `purchase` + ADD COLUMN `balance` + CHECK — OP-01). CI: o `postgres:16` + migrate do player-store já aplica `0000..0004`.

---

## Critérios de aceitação — status

1. **Salário (puro)** — ✅ (`salaryBase + overall×perOverall`, inteiro; `win>draw>loss≥0`).
2. **Crédito** — ✅ (`accrueRound` soma salário [+ prêmio]; idempotência de rodada = débito do scheduler, ver acima).
3. **Compra atômica** — ✅ (`FOR UPDATE`; saldo insuficiente → genérico, nada muda; +teste de concorrência).
4. **Regras da compra** — ✅ (inexistente/1×/moradia-fora-de-ordem).
5. **Moradia / lifestyle tier** — ✅ (a escada sobe o tier; `readWallet` reflete).
6. **Casa da mãe** — ✅ (`hasMothersHouse` liga; card = seam).
7. **Efeitos = seam** — ✅ (`aggregateTradeoffs` devolve o dado; **nenhum focos escrito** — provado na compra E no crédito).
8. **Trava anti-dinheiro-real** — ✅ (o saldo só cresce por `accrueRound`; auditado na revisão — zero seam de moeda real).
9. **OPs & gates** — ✅ (todos verdes; engine/goldens intocados).

---

## Escopo deferido (honesto)

- **Aplicar os efeitos** dos trade-offs (moral/física/fama/química) — depende da **2.3/F2**; `aggregateTradeoffs` é o plugue pronto.
- **A idempotência do crédito por rodada** (ledger `(athlete_id, season_id, round)`) — **obrigatória no card do scheduler**, antes de costurar `accrueRound` (corrige o §104).
- **O gatilho real do crédito** (scheduler) + **a costura resultado-da-partida → prêmio** (world-store → player) — o `result` é param.
- **A UI da faixa** (cena de casa) + **o card** da casa da mãe — sem cliente.
- **Contratos / luvas / renovação** — o ganho aqui é salário/rodada + prêmio.
- **Dinheiro real / IAP** — **NUNCA** (invariante).

---

## Fecho

- **Estado atual** (CLAUDE.md): SPEC-024 adicionada; SPEC-023 flipada → **PR #26**.
- **`docs/projeto/roadmap.md`**: 2.8 (Salário & estilo de vida — básico) ✅.
- **Memória do projeto**: a economia (catálogo aberto + trade-off seam + moradia) + o reforço do gotcha "nova tabela-filha → atualizar TODO wipeAll" capturados.

*DONE-024 — método H1VE. O desempenho vira estilo de vida: salário pinga a cada rodada, o dinheiro compra o catálogo com trade-off, sobe a escada de moradia da faixa, chega na casa da mãe. Nunca loja de stats; nunca comprável com dinheiro real. A revisão confirmou a compra atômica e pegou o débito de idempotência do crédito — sinalizado como obrigatório para o card do scheduler. Engine, goldens e world-store intocados.*
