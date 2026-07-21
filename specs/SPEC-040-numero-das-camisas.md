# SPEC-040 — Número da camisa (derivado da posição)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada **no card**.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-040 |
| **Feature** | Número das Camisas — o atleta recebe o número da camisa **derivado da sua posição** |
| **Slug** | numero-das-camisas |
| **Owner** | gustavo-hartz (dev) |
| **Prioridade** | ALTA — dependência DURA antes do card 4 (a faixa visual desenha o número no avatar). |
| **Appetite** | **~0,5–1 dia** (fn pura + wiring aditivo no contrato + testes + notas de doc). |
| **Criada em** | 2026-07-21 |
| **Status** | **PROPOSTA — aguardando aprovação do founder no card.** |

## Decisões travadas com o founder (2026-07-21)

1. **O número é DERIVADO da posição — SEM escolha do jogador.** ⚠️ Isto **reverte** duas âncoras anteriores, registrado aqui como o "atualizar a âncora" do ritual de drift: **(a)** o design handoff v3 (`_ds/readme.md`: *"a shirt number you choose (1–99)"* + o seletor `yourNumber` no mockup) — o seletor **sai** (feedback ao designer, não é mudança de repo); **(b)** a decisão da SPEC-038 (*"o jogador escolhe na criação"*) — **superada**. O número passa a ser função da posição, não vaidade.
2. **Esquema: pool clássico por posição + variedade determinística.** Cada posição tem um conjunto de números clássicos; o número sai do pool por hash do id do atleta → é **sempre** um número da posição, mas nem todo atacante é #9 (combina com o "VOCÊ 9" do design, sem forçá-lo). **Função pura** (posição, id).
3. **Sem unicidade no elenco** (a 3ª opção não foi escolhida). A faixa só mostra o **SEU** número; os colegas são renderizados **sem número legível** (`Band.dc.html`). Colisão de número entre dois jogadores do mesmo elenco é aceita e invisível na faixa. Unicidade estrita = card futuro, se um *roster view* precisar.

---

## Objetivo

Dar ao atleta um **número de camisa** que a faixa desenha nas costas do sprite, **derivado da posição** (GK/DEF/MID/FWD) por uma **função pura** — sem coluna, sem migration, sem seletor, sem tocar o engine. O número entra **aditivamente** no contrato `/v1/band` (o campo `athlete.number`, que a SPEC-038 deixou explicitamente para um card próprio) e desbloqueia o card 4 (a faixa visual), que precisa do número para o avatar.

---

## Contexto e motivação (fatos verificados no repo)

- **`athlete.position`** (`schema/athlete.ts:28`) é `text` (GK/DEF/MID/FWD, sem CHECK de enum, guardado por `isPosition` na borda). **Não existe coluna de número** (grep `shirtNumber|shirt_number|jerseyNumber` → **zero**, confirmado na SPEC-038).
- **A faixa só mostra o SEU número.** `Band.dc.html`: a tag "VOCÊ {number}" só aparece sobre o herói (h≥88); os colegas (`isCt`) são importados *"secondary, no legible number"*. ⇒ **squad-uniqueness é irrelevante para a faixa**, e squad numbers não precisam existir nesta fatia.
- **O contrato `/v1/band` já reservou o campo.** A SPEC-038 registrou: *"`athlete.shirtNumber` fica fora do v1 e entra aditivamente"*. Esta fatia é esse aditivo — a política **aditiva-only** do `/v1` permite (campo novo pode aparecer; nada muda de tipo nem some).
- **O molde existe: `kitFromClubId`** (`packages/player/src/kit.ts`) — uma fn pura FNV-1a × bounds, guardrail-safe, sem migration. O número da camisa é o mesmo padrão aplicado a `(position, athleteId)`.
- **FNV-1a já vive em `packages/player`** (`decisions.ts` — *"hash FNV-1a de 32 bits via shifts"*, guardrail-safe). Reusar/extrair, não reimplementar com `Math`/entropia.
- **Guardrail em `packages/*/src`** (`eslint.config.mjs`): sem relógio/`random`/transcendental. A fn recebe a `position` e o `seed` (o id) já resolvidos — determinística por construção.

---

## Escopo — o que está DENTRO

### A) `packages/player` — a regra pura (aditiva, sob o guardrail)
- [ ] `shirt-number.ts` — `SHIRT` (tunável: os pools por posição) + **`shirtNumber(position: string, seed: string): number`**. Pura: `isPosition(position)` guarda (fallback seguro se desconhecido); `pool[fnv1a(seed) % pool.length]`. Reusa o FNV-1a via shifts (extrai um helper de `decisions.ts` se preciso — DRY).
- [ ] Linha de barrel (`index.ts`).

**Pools propostos (clássicos, position-recognizable, todos em [1,99]) — a ratificar:**
```ts
export const SHIRT = {
  pools: {
    GK:  [1, 12],
    DEF: [2, 3, 4, 5, 6],
    MID: [8, 10, 14, 16, 18, 20],
    FWD: [7, 9, 11, 19, 21],
  },
  fallback: 9, // posição desconhecida — não deve ocorrer (a criação valida)
} as const;
```

### B) `services/api` — fiar no contrato `/v1/band` (aditivo)
- [ ] `src/band/types.ts` — `BandAthlete` ganha **`readonly number: number`** (aditivo-only).
- [ ] `src/band/from-player.ts` — `buildAthlete` calcula `shirtNumber(identity.position, athleteId)` (já recebe ambos).
- [ ] `src/band/band-state.ts` — nenhuma leitura nova (o `athleteId` e o `identity.position` já estão na onda 1). **Zero round-trip adicional.**

### C) Testes (puros sempre; ao vivo gated por `DATABASE_URL`)
- [ ] `packages/player/src/shirt-number.test.ts` — determinismo, position-tied (todo retorno ∈ pool da posição), variedade (ids diferentes distribuem no pool), range [1,99], fallback, guardrail (sem `Math.random`/`Date`).
- [ ] `services/api/test/band-state.test.ts` — `athlete.number === shirtNumber(position, athleteId)`; o V1_SHAPE ganha o campo `number: 'number'`.

### D) Docs de fundação
- [ ] `functional-spec.md` / `sdd.md` — nota: **o número da camisa é DERIVADO da posição (fn pura), não escolhido** — corrige a suposição do design (o seletor 1–99 sai) e registra que a decisão da SPEC-038 ("o jogador escolhe") foi superada.

## Escopo — o que está FORA

- **Escolha livre / seletor de número na criação** — revertido (Decisão 1). Nenhuma rota/fluxo aceita um número do cliente.
- **Coluna / migration** — o número é fn pura; **SEM MIGRATION** (OP-01 não acionada). Reversível (a fn é aditiva e desligável).
- **Unicidade no elenco** (Decisão 3) — deferida; card futuro se um *roster view* precisar.
- **`squad[].number` dos colegas** — a faixa não mostra número de colega; entra **aditivamente** se o card 4 precisar de um squad view.
- **NPCs / qualquer mudança no `world-engine`, no snapshot ou nos goldens** — o número deriva da posição do **humano** (player-store); **engine e os 4 goldens INTOCADOS** (`git diff` = 0).
- **A renderização** (o número nas costas do sprite) — é do **card 4** (a faixa visual); esta fatia só **provê** `athlete.number`.

---

## Contrato — `athlete.number`

```ts
// packages/player — a regra pura
export function shirtNumber(position: string, seed: string): number;
// = SHIRT.pools[position][ fnv1a(seed) % pool.length ]  (fallback se position ∉ pools)

// services/api — o contrato /v1/band (ADITIVO)
export interface BandAthlete {
  // ...campos existentes intocados...
  readonly number: number; // NOVO — derivado de (position, athleteId), 1..99, no pool da posição
}
```

⚠️ **`seed` = o `athleteId` do player-store** (uuid estável). Como a posição do humano é fixa na criação (SPEC-016) e o id nunca muda, o número é **estável** por construção — sem persistir. A borda não passa entropia; o número é recomputável a qualquer momento.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/shirt-number.ts` (+`.test.ts`) | criar — `SHIRT` + `shirtNumber`. |
| `packages/player/src/index.ts` | editar — barrel (`shirtNumber`, `SHIRT`). |
| `packages/player/src/decisions.ts` (ou um `hash.ts` novo) | possível refactor — extrair o `fnv1a` para reuso (DRY). |
| `services/api/src/band/types.ts` | editar — `BandAthlete.number` (aditivo). |
| `services/api/src/band/from-player.ts` | editar — `buildAthlete` calcula o número. |
| `services/api/test/band-state.test.ts` | editar — asserção do `number` + o V1_SHAPE. |
| `docs/projeto/functional-spec.md`, `sdd.md` | editar — a nota "número derivado, não escolhido". |
| `specs/SPEC-040-numero-das-camisas.md`, `specs/DONE-040-numero-das-camisas.md` | criar. |

**Intocado (o critério DURO):** `packages/world-engine` inteiro e os 4 goldens (`git diff` = 0); o schema do player-store e do world-store (**SEM MIGRATION**).

---

## Mudanças de schema

**Nenhuma. SEM MIGRATION** (OP-01 não acionada): o número é uma **função pura** de `(position, athleteId)` — dados que já existem. Nenhuma coluna, tabela ou índice novo.

---

## Critérios de aceitação

1. **`shirtNumber` é pura, determinística e position-tied** *(puro)*: mesmo `(position, id)` → mesmo número (idempotente); **todo** retorno ∈ `SHIRT.pools[position]`; todo número ∈ [1,99]; posição desconhecida → `SHIRT.fallback`. Guardrail: o arquivo passa o lint de `packages/*/src` (sem `Math.random`/`Date`/transcendental).
2. **Variedade** *(puro)*: sobre uma amostra de ids distintos numa mesma posição, o número **não é constante** (distribui pelo pool) — prova que não é "número canônico único".
3. **Fiado no `/v1/band`, aditivo** *(ao vivo)*: `athlete.number === shirtNumber(identity.position, athleteId)`; o teste de forma `V1_SHAPE` ganha `number: 'number'` (presença + tipo, sem quebrar a política aditiva). **Zero round-trip novo** (o contador ≤28 da SPEC-038 não sobe).
4. **Sem escolha** *(grep)*: nenhuma rota/fluxo aceita um número do cliente (a fn deriva de dados server-side).
5. **OPs & gates** *(o critério DURO)*: sem `any` (14) / ≤50 linhas por função (15) / ≤300 por arquivo (16) / **sem migration** (01); lint/typecheck/build/test/prettier verdes; testes preservados (rodar `npm test` em `main` no início da fatia e usar esse número como baseline); **engine e os 4 goldens INTOCADOS (`git diff` = 0)**.

---

## Segurança

- **Server-side por construção.** O número deriva de `(position, athleteId)` — ambos server-side (a posição vem do player-store; o id da sessão). Nenhum input do cliente entra na derivação, então não há o que validar como entrada do ator (mesmo espírito da autorização-por-construção da SPEC-038).
- **i18n:** o número é `number` (não prosa); nada localizável sai da API.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Colisão de número no elenco** (dois jogadores mesmo número) | Média | **Aceita** (Decisão 3): a faixa só mostra o SEU número; colegas sem número legível. Unicidade estrita = card futuro (*roster view*). |
| **O design tem seletor 1–99** | Alta | **Feedback ao designer** (não é mudança de repo): o seletor `yourNumber` sai; o número do avatar passa a ser derivado. Registrado no DONE. |
| **Pool "errado"** (números pouco clássicos) | Baixa | Os pools são **tunáveis** (`SHIRT.pools`) e ratificados na aprovação do card; trocar é um diff de dados, sem lógica. |
| **Alguém "persiste" o número** | Baixa | Nota no cabeçalho do `shirt-number.ts`: é derivação PURA e estável (id + posição fixos); persistir é débito desnecessário. |

**Dependências:** SPEC-016 (`athlete.position`, `isPosition`), SPEC-038 (o contrato `/v1/band` + `BandAthlete` + o campo reservado). **Precede:** o **card 4** (a faixa visual — dep DURA: desenha o número no avatar).

---

## Notas de implementação

- **Guardrail:** `shirtNumber` vive em `packages/*/src` → recebe `position` e `seed` já resolvidos; o FNV-1a é **via shifts** (guardrail proíbe `random`/relógio). Reusar o de `decisions.ts` (extrair um `hash.ts` se ficar mais limpo — DRY).
- **`isPosition` guarda o `position` cru** (a coluna é `text` sem CHECK); fallback seguro fecha o `any`/o caso impossível.
- **Aditivo puro no contrato:** o V1_SHAPE assere **presença + tipo** (não proíbe chaves novas), então o campo entra sem quebrar os testes da SPEC-038; nenhum campo existente muda.
- **Zero I/O novo:** `buildAthlete` já tem `identity.position` e o `athleteId` — o número é computado in-memory; o teto de ≤28 round-trips não se mexe.
- **⚠️ Ritual do board H1VE:** escrever o arquivo **não** publica. Rodar `h1ve spec --from specs/SPEC-040-numero-das-camisas.md` (ou a tool MCP `set_spec`), obter a **aprovação no próprio card**, e no fim `h1ve done --doc` antes do PR.
- **⚠️ CI (SPEC-166 + prettier):** o DONE precisa das seções `## Resumo do que foi feito` · `## Arquivos modificados` · `## Critérios de aceitação` · `## AI Declaration`; e rodar `prettier --write` em **todos** os arquivos tocados antes do push (os dois gates rápidos mordem antes da suíte).

---

## Checklist de aprovação

- [ ] Objetivo claro e verificável
- [ ] Escopo delimitado (fn pura + wiring aditivo; escolha livre/coluna/migration/unicidade FORA)
- [ ] Decisão do founder registrada (derivado da posição, pool+variedade, sem unicidade — reverte design/SPEC-038)
- [ ] **Sem mudança de schema** — nenhuma migration
- [ ] Critérios testáveis (5, incl. o selo de goldens)
- [ ] **Pools ratificados** — os números por posição (GK/DEF/MID/FWD)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-040 — método H1VE. O número da camisa **derivado da posição** por uma função pura (molde do `kitFromClubId`), fiado aditivamente no contrato `/v1/band`. Reverte a escolha livre do design/SPEC-038 (decisão do founder). SEM MIGRATION. Engine e os 4 goldens INTOCADOS.*
