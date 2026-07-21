# DONE-040 — Número da camisa (derivado da posição)

> Registro de conclusão. Par obrigatório da SPEC-040.

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-040 / DONE-040 |
| **Feature** | Número das Camisas — o número derivado da posição |
| **Owner** | gustavo-hartz (dev) |
| **Concluída em** | 2026-07-21 |
| **Dependências** | SPEC-016 (`athlete.position`, `isPosition`), SPEC-038 (o contrato `/v1/band`) |

## Resumo do que foi feito

O atleta ganhou um **número de camisa DERIVADO da posição** — a decisão do founder (sem escolha do jogador), que **reverteu** o seletor 1–99 do design handoff e a decisão da SPEC-038 ("o jogador escolhe"). O número saiu como o padrão mais barato do repo: uma **função pura** `shirtNumber(position, seed)` (molde do `kitFromClubId`), **sem coluna, sem migration, sem seletor**, fiada **aditivamente** no contrato `/v1/band` (o campo `athlete.number` que a SPEC-038 reservou).

- **`packages/player/src/shirt-number.ts` (puro, sob o guardrail):** `SHIRT.pools` (GK `{1,12}` · DEF `{2,3,4,5,6}` · MID `{8,10,14,16,18,20}` · FWD `{7,9,11,19,21}`) + `fallback` 9 + `shirtNumber(position, seed)`. `isPosition` guarda; `pool[mix(fnv1a(seed)) % pool.length]`. FNV-1a por shifts + avalanche replicados (o padrão deliberado da `kit.ts`; os hashes de `kit`/`decisions` são privados). **Pool clássico + variedade por hash do id** — é sempre um número da posição, mas nem todo atacante é #9.
- **`services/api` — `/v1/band` aditivo:** `BandAthlete` ganhou `readonly number`; `buildAthlete` calcula `shirtNumber(identity.position, athleteId)`. **Zero round-trip novo** (o `athleteId` e a `position` já estavam na onda 1 — o teto ≤28 da SPEC-038 não se mexeu).
- **Estável por construção:** a posição do humano é fixa na criação (SPEC-016) e o id é imutável → o número é recomputável, **não persistido**.

## Arquivos modificados

**Novos:** `packages/player/src/shirt-number.ts` (+`.test.ts`) · `specs/DONE-040-numero-das-camisas.md`.

**Editados:** `packages/player/src/index.ts` (barrel) · `services/api/src/band/types.ts` (`BandAthlete.number`) · `services/api/src/band/from-player.ts` (`buildAthlete`) · `services/api/test/band-state.test.ts` (asserção + V1_SHAPE) · `docs/projeto/sdd.md` · `docs/projeto/functional-spec.md` (a nota "número derivado, não escolhido").

**Intocado (o critério DURO):** `packages/world-engine` inteiro e os 4 goldens (`git diff` = 0); o schema do player-store e do world-store. **SEM MIGRATION.**

## Critérios de aceitação

Os 5 critérios da SPEC, todos ✅:
1. **`shirtNumber` pura, determinística, position-tied** — mesmo `(position,id)` → mesmo número; todo retorno ∈ `SHIRT.pools[position]` ∈ [1,99]; posição inválida (`'XX'`/`''`/`'gk'`) → `fallback`. Guardrail: passa o lint de `packages/*/src`.
2. **Variedade** — sobre 300 ids distintos numa posição, o número não é constante (distribui pelo pool; FWD alcança ≥3 dos 5).
3. **Fiado no `/v1/band`, aditivo** — `athlete.number === shirtNumber('FWD', athleteId)` (ao vivo); o `V1_SHAPE` ganhou `number: 'number'` (presença+tipo, sem quebrar a política aditiva); zero round-trip novo.
4. **Sem escolha** — nenhuma rota/fluxo aceita um número do cliente (deriva de dados server-side).
5. **OPs & gates** — sem `any`/≤50 linhas fn/≤300 arquivo/**sem migration**; lint/typecheck/build/prettier verdes; **586 testes** (581 preservados + 5 novos de `shirt-number`); **engine e os 4 goldens INTOCADOS (`git diff` = 0)**.

## Gates de qualidade

**586 testes** (581 preservados + 5 novos), rodados ao vivo contra Postgres real. typecheck/eslint/build/prettier verdes. `packages/world-engine` + 4 goldens INTOCADOS (`git diff` = 0). **SEM MIGRATION**.

## Escopo deferido / follow-ups

- **Escolha livre / seletor de número** — revertido (decisão do founder).
- **Unicidade no elenco** — deferida (a faixa só mostra o SEU número; colegas sem número legível); card futuro se um *roster view* precisar.
- **`squad[].number`** — aditivo, se o card 4 precisar de um squad view.
- ⚠️ **Feedback ao designer** — o seletor `yourNumber` (1–99) do handoff v3 **sai**; o número do avatar passa a ser derivado. Vai junto na devolutiva.
- **A renderização** (o número nas costas do sprite) — card 4.

## AI Declaration

Implementação por agente de IA (Claude Code / Opus 4.8) em par com o dev, após o drift ser resolvido pelo founder (o número é derivado da posição, pool+variedade, sem unicidade — revertendo o design/SPEC-038). Fatia pequena e cirúrgica: fn pura + wiring aditivo. **Sem revisão humana linha-a-linha** antes deste DONE — o rigor veio dos gates automatizados (typecheck/eslint/**586 testes ao vivo**/selo de goldens `git diff` = 0).
