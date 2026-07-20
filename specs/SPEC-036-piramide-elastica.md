# SPEC-036 — Camada de dados 0.2 · Fatia 5: Pirâmide Elástica (R13)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-036 |
| **Feature** | Camada de dados 0.2 · Fatia 5 — Pirâmide Elástica — card do board |
| **Slug** | piramide-elastica |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Camada de dados 0.2 (Fatia 5 de 5) + R13 |
| **Appetite** | **3 a 4 dias** (a topologia + a expansão na virada + a promoção multi-grupo + os goldens). |
| **Prioridade** | MÉDIA — **fecha a camada de dados 0.2**; o mundo passa a CRESCER (R13). |
| **Criada em** | 2026-07-19 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-19)

1. **Slice (escopo):** entrega a **expansão end-to-end** (topologia + gatilho + criação dos grupos na virada) + uma **promoção multi-grupo DETERMINÍSTICA SIMPLES** que conserva o fluxo. **DEFERE o playoff de acesso rico** (chaveamento entre campeões de grupo) pro card de produto 2.2.
2. **Topologia:** **alarga a base, depois novo andar.** O andar de ENTRADA (mais baixo) ganha um grupo por vez até o teto = **2× a largura do andar acima**; quando satura, nasce um **ANDAR NOVO** embaixo (largura 1), que vira a nova entrada. (Os dois movimentos do doc; ramificação 2× como teto.)
3. **Gatilho:** **calculado na virada, stateless.** A borda (world-store) mede a **% de vagas humanas do andar de entrada** de `world_occupation` na hora da virada e **injeta** a decisão de expandir no `advanceWorld` (mesmo padrão do `immuneIds` da SPEC-021). Limiar tunável em `WORLD.*`. **SEM migration.** Golden all-NPC = 0% → nunca expande → **byte-idêntico**.

---

## Objetivo

Fechar a camada de dados 0.2: o mundo deixa de ter topologia fixa (4 andares × 1 liga) e passa a **CRESCER por ramificação** (R13) — quando o andar de entrada enche de humanos (~70%), a virada de temporada **expande** (alarga a base ou adiciona um andar novo embaixo), determinística por seed, persistida na tx de rollover. E a **promoção/rebaixamento passa a cruzar grupos paralelos** (hoje `promotion.ts` FALHA ALTO em >1 liga/tier) — o mínimo correto pra a virada seguinte não quebrar.

---

## Contexto e motivação (fatos verificados no repo)

- **Fundações plantadas (SPEC-009):** `WorldState = tier → League[]` (`types.ts:108-139`) já modela N grupos/tier; o schema `league` tem `ord` dentro do tier (`schema/world.ts:38-53`); o `worldStateToRows`/`rowsToWorldState` é **orientado a lista** (grava/lê qualquer nº de ligas); o `overwriteSnapshot` (DELETE-total + reinsert, `turnover-repo.ts:106-118`) **persiste qualquer topologia** → **sem migration**.
- **O seam engine-safe existe (SPEC-021):** `advanceWorld(before, results, seed, immuneIds?)` — um input injetado default-vazio que mantém o `world.golden.json` byte-idêntico. A expansão segue o MESMO padrão (5º param `expand?`).
- **A promoção HOJE falha alto em multi-grupo:** `promotion.ts:28-36` (`assertSingleLeaguePerTier`) lança em >1 liga/tier (guard deliberado da SPEC-009). Todo o `promotion.ts` assume 1 liga/tier (`firstLeague`, `leagues[0]`).
- **A ocupação humana vive na borda** (`world_occupation`, SPEC-020); o engine é puro e só fala de ids. O `entryTier = max(tier)` já é derivado (`occupation-repo.ts:231`). **Não há** cálculo de taxa de ocupação hoje.
- **O golden de viragem roda 100% NPC** (`world-turnover.test.ts:117-127`: `advanceWorld(world, results, SEED)`, sem 4º arg → 0% ocupação). Logo, expansão gated em ≥70% humano → **nunca dispara no golden**.
- **Config:** `WORLD.leaguesPerTier: 1` (`constants.ts:44`, escalar) — o seed nasce linear (4×1); a topologia dinâmica passa a viver no `WorldState` (não na config).

---

## Design (o que a Fatia 5 constrói)

### A) Topologia elástica (a regra de crescimento)
- Cada andar tem **largura-teto = `branchingFactor` (2) × largura(andar acima)**. O topo (tier 1) é sempre 1 (eterno).
- **Expansão (quando o gatilho dispara, na virada):**
  - Se `largura(entrada) < 2 × largura(andar-acima-da-entrada)` → **alarga**: +1 grupo no andar de entrada.
  - Senão (entrada saturada) → **novo andar**: +1 andar embaixo com largura 1, que vira a nova entrada.
- A partir de 4×1, evolui p/ `…,1,2,4,8` descendo (2× por nível como teto). O topo permanece estreito (escassez = altitude).
- **Banda de habilidade dos novos clubes:** a **banda de várzea** (`WORLD.abilityByTier` do andar de entrada, `{34,66}`); um andar novo herda a banda de várzea. Os clubes existentes **não** são re-ancorados (o gradiente estende-se p/ baixo; a re-interpolação percentual perfeita fica deferida — simplificação do slice).

### B) A expansão no `advanceWorld` (engine puro, gated)
- Novo 5º param **opcional** `expand?: boolean` (default `false`). Um passo novo `applyExpansion(state, seed, expand)`:
  - `expand=false` → **no-op, consome ZERO do PRNG** → stream idêntico → **golden byte-idêntico**.
  - `expand=true` → cria o(s) grupo(s)/andar novo com clubes+elencos NPC frescos via **`deriveSeed` com chaves NOVAS** (`'expansion'` + tier + índice) → **stream disjunto** dos existentes (transfer/youth intocados).
- Ordem canônica: `promoção → envelhecer → aposentar → transferências → base nova → EXPANSÃO → recomputar força → seasonId++` (a expansão entra antes do recompute p/ os novos clubes ganharem força; não desloca os streams existentes).

### C) Promoção multi-grupo (o mínimo correto — golden-safe por dispatch)
- **Dispatch no passo de promoção:** se **TODOS** os tiers têm 1 grupo → o **caminho ATUAL, INTOCADO** (`promotion.ts` verbatim) → o golden all-1-grupo é **byte-idêntico por construção**. Se **algum** tier tem >1 grupo → o **caminho NOVO** (`promotion-multi.ts`), exercitado só no golden de expansão.
- **Regra multi-grupo (conserva o fluxo):** por fronteira, rank **achatado** do tier (concatena os grupos por `ord`, ordena por classificação), os **bottom-F** descem / os **top-F** sobem (`F` = `promoteRelegate` da fronteira). Depois, **re-empacota** cada tier no seu nº de grupos de `clubsPerLeague` (20) **determinístico por seed** (conservação garante que cada tier fica com `G_tier × 20` clubes → o particionamento é sempre possível). Grupos são redesenhados por temporada (como sorteio real de grupos).
- **Invariante (provado por teste):** todo grupo termina com exatamente 20 clubes; nº de rebaixados = nº de promovidos por fronteira.

### D) O gatilho na borda (world-store)
- Nova função `entryOccupancyRate(db, seed)` — % de **vagas humanas** do andar de entrada (`Σ world_occupation` no `entryTier` / `Σ vagas` do `entryTier` = grupos × 20). `WORLD.expansionThreshold` (0.70).
- `persistWorldTurnover`: computa `expand = rate ≥ threshold` e passa a `advanceWorld(before, results, seed, immuneIds, expand)`. O `overwriteSnapshot` grava o mundo crescido; `reapplyOccupations` re-aplica os humanos (os novos clubes são NPC-only).

---

## Escopo — o que está DENTRO

1. `WORLD`: `expansionThreshold: 0.70` + `branchingFactor: 2` (`constants.ts`).
2. **Engine:** `expansion.ts` (novo, puro — a regra de crescimento + seeding dos novos clubes via `deriveSeed`); `world-turnover.ts` (5º param `expand?` + o passo `applyExpansion` gated); `promotion.ts` (dispatch 1-grupo→atual / multi→novo) + `promotion-multi.ts` (novo).
3. **world-store:** `entryOccupancyRate` (novo; reusa `entryTier`) + `persistWorldTurnover` passa `expand`.
4. **Goldens:** `world.golden.json` **byte-idêntico** (all-NPC) + **novo** `world-expansion.golden.json` (cadeia com `expand:true` forçado no engine → prova a topologia + a promoção multi-grupo determinísticas).
5. **Testes:** puros (topologia, expansão determinística, invariante da promoção multi-grupo, no-op quando `expand=false`) + ao vivo (o seam borda→engine: ocupação ≥70% → expande na virada persistida; <70% → não).

## Escopo — o que está FORA

- **O playoff de acesso rico** (chaveamento entre campeões de grupo) → **card de produto 2.2**.
- **Re-ancoragem percentual perfeita do gradiente de altitude** (o slice usa banda de várzea p/ os novos; os existentes não mudam).
- **Migration** (o gatilho é stateless; o schema já grava topologia variável).
- **Cap de andares/`maxTiers`**, multi-seed, a UI da pirâmide, o calendário ciente de grupos (1.2).
- **Mid-season** (expansão só na virada, por definição).

---

## Arquivos que serão tocados

**Engine (`packages/world-engine/src`):** `constants.ts` (2 tunáveis) · `engine/world-turnover.ts` (param `expand?` + passo gated) · `engine/promotion.ts` (dispatch) · `engine/promotion-multi.ts` (novo) · `engine/expansion.ts` (novo) · `data/world-seed.ts` (reusa `buildRoster`/`buildClub` p/ os novos clubes, se preciso). Barrel `index.ts` se preciso.

**world-store (`services/world-store/src`):** `store/occupation-repo.ts` (ou novo helper) `entryOccupancyRate` · `store/turnover-repo.ts` (computa + passa `expand`).

**Testes/goldens:** `engine/expansion.test.ts` (novo) · `engine/promotion-multi.test.ts` (novo) · `engine/world-turnover.test.ts` (+casos expand) · `__fixtures__/world-expansion.golden.json` (novo) · `services/world-store/test/turnover-repo.test.ts` (+seam de expansão) · `harness/regen-*` se um novo regen determinístico for preciso.

**Intocado (o critério DURO):** `world.golden.json`, `season.golden.json`, `prng.golden.json`, `anchor.golden.json` — **byte-idênticos** (`git diff` = 0). O caminho de 1-grupo do engine é preservado por dispatch.

---

## Critérios de aceitação

| # | Critério | Evidência |
|---|---|---|
| 1 | `world.golden.json` + os 4 goldens **byte-idênticos** (all-NPC nunca expande; 1-grupo usa o caminho atual) | `git diff __fixtures__/` = 0 |
| 2 | `advanceWorld(…, expand=false)` ≡ `advanceWorld(…)` (5º param default no-op, stream intocado) | teste de equivalência (molde do `immuneIds`) |
| 3 | Expansão determinística: `expand=true` alarga a base até o teto 2×, depois cria andar novo; reproduzível por seed | `expansion.test` + `world-expansion.golden.json` |
| 4 | Promoção multi-grupo conserva o fluxo: cada grupo termina com 20 clubes; rebaixados = promovidos | `promotion-multi.test` (invariante) |
| 5 | Seam borda→engine: ocupação de entrada ≥70% → a virada persistida EXPANDE; <70% → não | `turnover-repo.test` ao vivo |
| 6 | OPs & goldens | sem `any`; ≤50/função; ≤300/arquivo; erros genéricos; **os 4 goldens intocados**; **sem migration**; lint/typecheck/build/test/prettier verdes |

---

## Riscos e dependências

- **Regressão de golden na reescrita da promoção** → mitigado por **dispatch**: 1-grupo usa o código ATUAL verbatim (não "equivalente-reescrito") → byte-idêntico por construção; o `world.golden.json` é o gate.
- **Deslocamento do stream PRNG pela expansão** → mitigado: `expand=false` consome ZERO; `expand=true` usa `deriveSeed` com chaves NOVAS (stream disjunto) → os clubes existentes viram idêntico com/sem expansão.
- **Conservação de fluxo na promoção multi-grupo** (grupos fora de 20) → o invariante é o critério #4, provado por teste; a abordagem re-empacota o tier inteiro (conservação garante `G×20`).
- **Re-ancoragem de altitude** (deferida) → os novos andares usam a banda de várzea; a re-interpolação percentual perfeita é um follow-up se a calibração pedir.
- **Dependência:** o gatilho real de ocupação depende de humanos no mundo (SPEC-020); sem humanos (beta cedo) o mundo fica linear — correto (escassez = altitude).

---

## Notas de implementação

- **`expand?` como 5º positional** (não options object) → não toca os callers de `immuneIds` (turnover-repo) nem o golden test (3 args). Default `false`.
- **`applyExpansion` puro:** lê a topologia atual do `WorldState`, aplica a regra (alarga/novo-andar), seeda os novos clubes via `deriveSeed(seed, 'expansion', seasonId, tier, leagueIdx)` reusando `buildRoster` (mesmas bandas/`squadShape`). Zero PRNG quando `expand=false`.
- **Dispatch da promoção:** `if (state.tiers.every(t => t.leagues.length === 1)) return <atual>; else return promoteRelegateMulti(state, seed)`. O `assertSingleLeaguePerTier` sai (o dispatch o substitui).
- **`entryOccupancyRate`:** `entryTier = max(tier)`; conta ocupações no entryTier / (nº grupos do entryTier × `clubsPerLeague`). Puro-ish (lê o DB, sem lógica de negócio no store — OP-17: o limiar/decisão é `rate ≥ WORLD.expansionThreshold`, uma comparação; a regra de crescimento é 100% engine).
- **Golden de expansão:** um harness determinístico (`regen-world-expansion-golden.ts`) que roda uma cadeia com `expand:true` forçado (bypassa a borda) → hashes reproduzíveis cross-ambiente. Oráculo independente que aborta em divergência.
- **Reversível:** `expand` default-false → o mundo linear atual é o comportamento sem o gatilho; o engine 1-grupo é o caminho atual.

---

*SPEC-036 — método H1VE. Fecha a camada de dados 0.2: o mundo CRESCE (R13) — alarga a base a ~70% de ocupação humana, depois cria andar novo, determinístico por seed, na tx de rollover. A promoção passa a cruzar grupos (o mínimo correto; o playoff rico = card 2.2). Golden-safe por construção: o caminho de 1-grupo é o atual INTOCADO (dispatch), a expansão é gated (all-NPC = 0% → nunca dispara) → os 4 goldens byte-idênticos; sem migration.*
