# DONE-036 — Camada de dados 0.2 · Fatia 5: Pirâmide Elástica (R13)

> Registro de conclusão (par da `SPEC-036`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-036 (par da SPEC-036) |
| **Feature** | Camada de dados 0.2 · Fatia 5 — Pirâmide Elástica — card do board |
| **Roadmap item** | Camada de dados 0.2 (Fatia 5 de 5) + R13 |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/camada-de-dados-0-2-fatia-5-piramide-elastica` |
| **Concluída em** | 2026-07-19 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## Resumo do que foi feito

**Fecha a camada de dados 0.2:** o mundo passa a **CRESCER** (R13). Quando o andar de entrada enche de humanos (~70%), a virada de temporada **expande** — alarga a base até o teto 2×, depois cria um andar novo embaixo — determinística por seed, na tx de rollover. E a **promoção passa a cruzar grupos paralelos** (o mínimo correto; o playoff de acesso rico ficou pro card 2.2).

**A jogada de golden-safety (o critério DURO honrado por construção):**
- **A promoção de 1-grupo fica INTOCADA** — o `advanceWorld` faz um **dispatch**: todos os andares com 1 grupo → `applyPromotionRelegation` (o `promotion.ts` v1, byte-idêntico); qualquer andar com grupos paralelos → `promoteRelegateMulti` (novo, exercitado só pós-expansão).
- **A expansão é gated** num 5º param `expand?` (default `false`, **zero PRNG consumido** — retorna a mesma referência) — mesmo padrão do `immuneIds` da SPEC-021. O golden roda 100% NPC → 0% ocupação → nunca expande → **byte-idêntico**.
- **Sem migration** — o schema já grava topologia variável (`league.ord` + `overwriteSnapshot` das SPEC-013/021).

### Engine (`packages/world-engine`)
- `constants.ts`: `expansionThreshold: 0.70` + `branchingFactor: 2`.
- `expansion.ts` (novo, puro): a regra de crescimento (alarga/novo-andar) + seeding dos clubes NPC frescos via `createClub` (índices globais CONTINUADOS da contagem → únicos, sub-seed disjunta).
- `promotion-multi.ts` (novo): promoção entre grupos — rank ACHATADO (interleave dos grupos) reusando `newMembers`/`assertConservation`, re-empacota em grupos de 20.
- `promotion.ts`: `boundaryK` com clamp (fronteiras novas herdam o último valor); exporta `newMembers`/`assertConservation` (reuso). **O corpo v1 intocado.**
- `roster.ts`: `tierAbilityRange` com clamp (andar novo = banda de várzea).
- `world-turnover.ts`: 5º param `expand?` + dispatch de promoção + o passo de expansão.

### Borda (`services/world-store`)
- `entryOccupancyRate(world, occupations)` (puro): % de humanos em clubes da entrada / nº de clubes da entrada.
- `persistWorldTurnover`: mede a taxa, computa `expand = taxa ≥ WORLD.expansionThreshold`, injeta no `advanceWorld`. O `overwriteSnapshot` grava a topologia crescida; `reapplyOccupations` re-aplica os humanos.

### Novo golden
- `world-expansion.golden.json` (+ harness `regen-world-expansion-golden.ts`): a cadeia de 6 viragens COM `expand:true` forçado — prova a topologia + a promoção multi-grupo determinísticas, cross-ambiente. É o par do `world.golden.json` (all-NPC).

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

As dimensões **golden-safety/determinismo** E **expansão/seam/OPs** voltaram **LIMPAS** (zero achados — o coração da viragem/money path e o seam confirmados sólidos). **3 achados** na promoção multi-grupo, **2 confirmados** (1 refutado), ambos em `repackTier`, ambos corrigidos:
- **MINOR (overflow silencioso):** se `promoteRelegate` for reconfigurado a ponto de top-k e bottom-k se sobreporem, o `slice` do re-pack truncaria em silêncio (dropando/duplicando clubes) e o `assertConservation` (só checa ==20) não pegaria — enquanto o caminho v1 falha ALTO no mesmo input. **Fix:** guard `clubs.length === grupos × 20` no `repackTier` → falha alto (paridade com o v1). *(Config-gated: o default `[3,3,3]` nunca sobrepõe num rank de 20 → não alcançável hoje.)*
- **NIT (sort lexicográfico além de 999 clubes):** `clube-1000 < clube-999` lexicograficamente. **Fix:** ordena por (comprimento do id, depois lex) = ordem NUMÉRICA — no-op abaixo de 1000 clubes (mesmo comprimento) → **golden intocado**.
- **REFUTADO:** a alegação de "quebra de conservação num andar do meio com 3+ grupos" — a cobertura existe e a conservação vale.

---

## Arquivos modificados

**Engine:** `constants.ts` · `engine/roster.ts` · `engine/promotion.ts` · `engine/world-turnover.ts` · `data/world-seed.ts` (export `createClub`) · `index.ts`. **Novos:** `engine/expansion.ts` · `engine/promotion-multi.ts` · `engine/expansion.test.ts` · `engine/expansion.golden.test.ts` · `__fixtures__/world-expansion.golden.json` · `harness/regen-world-expansion-golden.ts`.

**Borda:** `services/world-store/src/store/turnover-repo.ts` (`entryOccupancyRate` + `expand`) · `services/world-store/src/index.ts` · `services/world-store/test/turnover-repo.test.ts` (+2 seam) · `services/world-store/test/entry-occupancy.test.ts` (novo). **Robustez de teste (flaky pré-existente do main, idêntico ao PR #38):** `services/player-store/test/injury-repo.test.ts` (wipeAll limpa `purchase` antes de `athlete`).

**Intocado (o critério DURO):** `world.golden.json`, `season.golden.json`, `prng.golden.json`, `anchor.golden.json` — **byte-idênticos** (`git diff` = 0). **Nenhuma migration.**

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | Os 4 goldens originais **byte-idênticos** | `git diff __fixtures__/` = 0 |
| 2 | `advanceWorld(…, expand=false)` ≡ `advanceWorld(…)` (no-op, stream intocado) | `expansion.test` (equivalência + mesma referência) |
| 3 | Expansão determinística: alarga a base até o teto 2×, depois novo andar | `expansion.test` + `world-expansion.golden.json` (cross-ambiente) |
| 4 | Promoção multi-grupo conserva o fluxo: cada grupo com 20; campeão sobe | `expansion.test` (conservação + campeão promovido) |
| 5 | Seam borda→engine: ocupação ≥70% → EXPANDE persistido; <70% → não | `turnover-repo.test` ao vivo (14/20 → cresce; 5/20 → intacto) |
| 6 | OPs & goldens | sem `any`; ≤50/função; ≤300/arquivo; erros genéricos; **4 goldens intocados**; **sem migration**; lint/typecheck/build/test/prettier verdes |

**453 testes** (437 preservados + 16 novos: 8 de expansão + 2 do golden + 4 de `entryOccupancyRate` + 2 do seam), typecheck/eslint (com o guardrail de determinismo)/build/prettier verdes; **engine v1 + os 4 goldens byte-idênticos**; **sem migration**.

---

## Escopo deferido (cards futuros)

- **O playoff de acesso RICO** (chaveamento entre campeões de grupo) → **card de produto 2.2**.
- **Re-ancoragem percentual perfeita do gradiente** (os novos andares usam a banda de várzea; os existentes não mudam) — follow-up se a calibração pedir.
- **Cap de andares/`maxTiers`**, multi-seed, a UI da pirâmide, o calendário ciente de grupos (1.2).
- **Calibração do 70%** — o limiar é tunável (`WORLD.expansionThreshold`); ajustar com telemetria real de ocupação.

---

## AI Declaration

Preenchida no card via a tool `submit_ai_declaration`. Autoria: código gerado pela IA (Claude) sob direção do founder; as 3 decisões de design (slice, topologia, gatilho) co-desenhadas com o founder; toda a lógica + a revisão adversarial (workflow 3 dimensões) + os 2 fixes revisados por humano.

---

*DONE-036 — método H1VE. Fecha a camada de dados 0.2: o mundo CRESCE (R13) — alarga a base a ~70% de ocupação humana, depois cria andar novo, determinístico por seed, na tx de rollover. A promoção cruza grupos (o mínimo correto; o playoff rico = card 2.2). Golden-safe por construção: o caminho de 1-grupo é o v1 INTOCADO (dispatch), a expansão é gated (all-NPC = 0% → nunca dispara) → os 4 goldens byte-idênticos; sem migration.*
