# SPEC-012 — Ajuste de tunáveis: elenco de 16 + cascata (rosterSize 20→16, transfersPerLeague 12→10)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-012 |
| **Feature** | Ajuste de tunáveis: elenco 16 |
| **Slug** | ajuste-de-tunaveis-elenco-16 |
| **Card (board)** | `c454a49f-de3a-4034-848a-9d6d727ca513` |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Ajuste de tunáveis decorrente do **R4 FINAL** (SPEC-011); precede 0.2 (camada de dados) e 1.2 (rodada diária). |
| **Appetite** | **meio dia** (spec de código curta) |
| **Prioridade** | ALTA — re-ancora o motor ao número final antes de qualquer persistência. |
| **Criada em** | 2026-07-16 |
| **Status** | **Proposta — aguardando aprovação do founder no card** |

---

## Objetivo

Alinhar o `packages/world-engine` ao **R4 FINAL** ratificado pela SPEC-011: o elenco de cada clube passa de **20 → 16 atletas** (11 titulares + 5 reservas), com a **cascata de tunáveis vizinhos** que o card pede — as **transferências por liga na viragem** caem de **12 → 10** (proporcional ao elenco menor: 12/20 ≈ 10/16). É um **ajuste puro de tunáveis** em `constants.ts`, que regenera o **único golden dependente do elenco/viragem** (`world.golden.json`) e reafirma as invariantes de determinismo e de viragem. **Nenhuma mudança de lógica.**

---

## Contexto e motivação

A SPEC-011 (PR #14, **mergeada** em `main`) cravou o **elenco de 16** como invariante do mundo (R4 final: jogo diário, duas barras, stamina só na partida, **11 titulares + 5 reservas**) e **registrou explicitamente** que o `rosterSize` 20 da SPEC-009 seria ajustado para 16 numa **spec de código futura** — esta.

Fazer o ajuste **agora**, barato, tem três razões:
1. **Estabiliza a FORMA do dado antes da 0.2** — se a camada de dados (0.2) persistir/semear com roster-20, sofreria re-migração imediata ao virar 16.
2. **Destrava a rodada diária (1.2)**, que pressupõe elenco 16 + stamina/substituições (até 5/jogo).
3. **Determinismo é money-path.** Reduzir o elenco muda o número de saques do PRNG **dentro de cada clube** → o `worldHash` muda → o golden do mundo precisa ser **regenerado por decisão INTENCIONAL**. O próprio `note` de `world.golden.json` manda regenerar **só** assim ("rompe replay"). Esta SPEC é essa decisão intencional, isolada e auditável.

**Fatos de código verificados (2026-07-16, `origin/main`):**
- `constants.ts`: `WORLD.rosterSize: 20` (l.48); `WORLD.strengthTopN: 11` (l.50); `WORLD.transfersPerLeague: 12` (l.64); `WORLD.squadShape { GK:3, DEF:6, MID:7, FWD:4 }` (l.80); comentário `(3+6+7+4 = 20)` (l.79).
- `runTransfers` (`engine/transfers.ts`) usa `WORLD.transfersPerLeague` como **contagem de loop** (l.15): cada iteração troca dois atletas da **mesma posição** entre clubes. Mudar o número (12→10) só muda **quantas** trocas ocorrem — a lógica e a ordem do stream não mudam, e a troca mesma-posição **preserva `rosterSize`/`squadShape`**.
- `createClub` (`data/world-seed.ts`) sorteia na ordem fixa **archetype → weights → roster**, com **um RNG por-clube** (`createRng(deriveSeed(seed, 'club', id))`). Logo, encolher o roster muda **só os saques de elenco daquele clube** — `archetype`/`weights` e o stream dos **outros** clubes ficam intactos.
- `buildRoster` itera `POSITIONS` e faz `squadShape[position]` saques (idade, habilidade) — **dinâmico**: reduzir `squadShape` reduz os saques, sem tocar a lógica.
- `clubStrength` = média inteira das `strengthTopN` (11) melhores. Com roster 16, **16 ≥ 11** → fórmula intacta.
- Golden roster-dependente = **apenas** `world.golden.json` (lido só por `world-turnover.test.ts`). `season`/`prng`/`anchor` `.golden.json` são lidos só pelos seus próprios testes e **não** dependem de roster.
- Testes (`world-seed.test.ts`, `world-turnover.test.ts`, `roster.test.ts`) **derivam de `WORLD.rosterSize`/`squadShape`** — não há literal `20` hardcodado a editar.

---

## Escopo — o que está DENTRO

- [ ] `constants.ts` — `WORLD.rosterSize`: **20 → 16** (l.48).
- [ ] `constants.ts` — `WORLD.squadShape`: `{ GK:3, DEF:6, MID:7, FWD:4 }` → **`{ GK:2, DEF:5, MID:5, FWD:4 }`** (soma = 16; respeita 11 titulares + 5 reservas) (l.80).
- [ ] `constants.ts` — `WORLD.transfersPerLeague`: **12 → 10** (l.64) — a cascata de tunáveis vizinhos (churn proporcional ao elenco 16).
- [ ] `constants.ts` — atualizar o comentário l.79 `(3+6+7+4 = 20)` → `(2+5+5+4 = 16)` (e a referência a "20" na l.47, se houver).
- [ ] **Regenerar `world.golden.json`** — os 11 hashes (seed `"decada"` + 10 viragens) via **script throwaway FORA de `packages/*/src`** (em `harness/` ou no scratchpad); atualizar o campo `note` para citar a **SPEC-012** como a mudança intencional do stream (elenco 16 **+ transfers 10**). `seed` e `seasons` preservados.

## Escopo — o que está FORA

- **Nenhuma mudança de LÓGICA** — `roster.ts`, `lifecycle.ts`, `world-turnover.ts`, `world-season.ts`, `transfers.ts`, `world-seed.ts` ficam **intocados no código** (só mudam **constantes** em `constants.ts`; `buildRoster`, a reposição e `runTransfers` já leem `squadShape`/`transfersPerLeague` dinamicamente; a ordem de sorteio archetype→weights→roster e a ordem canônica da viragem **não** mudam).
- `strengthTopN` permanece **11**; `clubStrength` intocado.
- `season.golden.json`, `prng.golden.json`, `anchor.golden.json` — **bit-idênticos** (independentes de roster).
- **Nenhuma edição de teste** — todos derivam de `WORLD.*`.
- **Persistência / DB / atomicidade** (Fase 0.2); **rodada diária, stamina, substituições, encaixe da Copa** (1.2+); distinção titulares-na-partida vs reservas (spec de dia de jogo) — tudo fora.
- Renomear o repositório / tocar docs de produto — fora (a decisão já está nos docs via SPEC-011).

---

## Arquivos que serão tocados

| Arquivo | Ação | O quê |
|---|---|---|
| `packages/world-engine/src/constants.ts` | modificar | `rosterSize` 20→16 + `squadShape` {2,5,5,4} + `transfersPerLeague` 12→10 + comentário. |
| `packages/world-engine/src/__fixtures__/world.golden.json` | regenerar | 11 hashes + `note` (mudança intencional SPEC-012). |
| `harness/` (script throwaway) | criar (temporário) | regen do golden **fora** de `packages/*/src`; removido ou documentado antes do PR. |
| `specs/SPEC-012-ajuste-elenco-16.md`, `specs/DONE-012-ajuste-elenco-16.md` | criar | Esta SPEC + o DONE. |

**Só leitura / confirmação (não editados):** `engine/roster.ts`, `data/world-seed.ts`, `engine/lifecycle.ts`, `engine/world-turnover.test.ts`, `data/world-seed.test.ts`, `engine/roster.test.ts`.

---

## Critérios de aceitação

1. `WORLD.rosterSize === 16`, a soma de `WORLD.squadShape === 16` (`GK2+DEF5+MID5+FWD4`; nenhuma posição em 0) e `WORLD.transfersPerLeague === 10`.
2. Após `seedWorld` **e** após **cada** viragem: `roster.length === 16` e `positionCounts(roster) === WORLD.squadShape` para todo clube — as asserções já existentes em `world-seed.test.ts`, `world-turnover.test.ts` e `roster.test.ts` passam **sem editar os testes**. (As 10 trocas/liga de `runTransfers` seguem mesma-posição → não alteram tamanho nem formação do elenco.)
3. `world.golden.json` regenerado e o teste "bate byte-a-byte com o golden commitado" (`world-turnover.test.ts`) **verde**. A falha **antes** da regen é **sinal esperado**, não regressão.
4. `season.golden.json`, `prng.golden.json` e `anchor.golden.json` **bit-idênticos** (`git diff` = 0 nesses três) — prova de que o ajuste **não vazou** para o money path escalar (SPEC-002).
5. `clubStrength` segue = média inteira das **top 11** habilidades; `16 ≥ strengthTopN(11)` mantém a fórmula válida (a força numérica muda porque o pool muda — a **semântica** não).
6. `archetype` e `weights` de cada clube **inalterados** pela mudança (sorteados antes do roster, RNG por-clube) — invariante de determinismo preservada.
7. **4 gates de CI verdes**: `lint` (OP-14 sem `any`, OP-15 função < 50 linhas, OP-16 arquivo < 300 linhas — `constants.ts` ~82), `typecheck`, `test`, `build`; guardrail de determinismo intacto (sem `Date`/`Intl`/`Math.random`/transcendentais em `packages/*/src`).

---

## Segurança (se aplicável)

N/A — lib pura, sem I/O, sem superfície de rede, sem segredos. O único ponto de impureza (script de regen) fica **fora** de `packages/*/src`.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| Esquecer de regenerar `world.golden.json` → `world-turnover.test` falha | A regen é **passo explícito do escopo**; a falha pré-regen é sinal esperado (critério 3). |
| Regenerar o golden errado (tocar `season`/`prng`/`anchor`) → falso verde mascarando drift | Critério 4 exige os três **bit-idênticos** (`git diff` = 0). |
| Reordenar acidentalmente o stream (`pick` archetype → `nextInt` weights → `buildRoster`) → quebra replay | Só trocar **NÚMEROS** em `constants.ts`; **nunca** a sequência em `createClub`. Critério 6. |
| Script de regen dentro de `packages/*/src` violaria o lint de determinismo | Mantê-lo em `harness/` (ou scratchpad); removido/documentado antes do PR. |
| Lint local falha por **CRLF** no Windows (gotcha de projeto) | Não é regressão; o CI (LF) é a fonte da verdade. Rodar `prettier --write` nos arquivos novos antes do push. |

**Dependências:** SPEC-011 (R4 final — número 16 — **mergeada** #14) é o fundamento normativo; SPEC-009 (mundo com roster) é a base técnica. **Precede** a Fase 0.2 (camada de dados) e a 1.2 (rodada diária), que pressupõem o elenco no formato final.

---

## Notas de implementação

- **`squadShape` alvo `{ GK:2, DEF:5, MID:5, FWD:4 }` = 16** — 2 goleiros, 5 na defesa, 5 no meio, 4 no ataque; **bate com o "2GK/5DEF/5MEI/4ATA" do card** e com "11 titulares + 5 reservas" do R14/R4 final.
- **`transfersPerLeague` 12 → 10** — cascata de tunáveis vizinhos (decisão do founder, faixa ~8-10 → **10**, proporcional: 12/20 ≈ 10/16). Só o **número** muda; `runTransfers` é intocado. Afeta o `world.golden.json` (as trocas acontecem no passo de transferência da viragem) — capturado pela **mesma** regen do elenco 16, num só golden intencional. Não reordena a viragem (muda a contagem dentro do passo de transferência, não a sequência).
- **Regen do golden:** script throwaway (ex.: `harness/regen-world-golden.ts`) que reproduz o `runChain()` de `world-turnover.test.ts` — `seedWorld('decada')` + 10× (`simulateWorldSeason` → `advanceWorld`), coletando `worldHash` (11 valores) — imprime os hashes e reescreve `world.golden.json` mantendo `seed`/`seasons` e atualizando `note` para a SPEC-012. Rodar via `tsx`/`vitest`; **não** deixar o script em `packages/*/src`.
- **Não editar testes:** todos derivam de `WORLD.*`. Se algum falhar por literal hardcodado, é bug do teste (reportar) — mas o grep confirmou que derivam.
- **`clubStrength`:** com 16 ≥ 11 o guard `top.length === 0` nunca dispara; a fórmula fica intacta.
- **Fecho do DONE:** regenerado o golden e verdes os 4 gates, atualizar o bloco "Estado atual" do CLAUDE.md (SPEC-012) e o `note` de `rosterSize` na entrada da SPEC-009 (de "a ser ajustado" para "ajustado na SPEC-012"). O DONE **justifica a regen do golden** como **mudança de regra do founder** (R4 final: elenco 16 + transfers 10), explicitamente **não** drift — como o card exige.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (só tunável + regen do golden; lógica/persistência/rodadas fora)
- [x] Arquivos listados corretos (verificados no código)
- [x] Mudanças de schema documentadas (N/A — sem migration; é constante da lib)
- [x] Critérios de aceitação testáveis (asserções já existentes + `git diff` dos goldens)
- [x] Riscos avaliados (regen do golden e ordem do stream são os centrais — mitigados)
- [x] Appetite razoável (meio dia)
- [ ] **Aprovada** — *aguardando o founder/architect no card `c454a49f`*

---

*SPEC-012 — método H1VE. Primeira spec de **código** desde a SPEC-009; decorre do R4 FINAL (SPEC-011). Ajuste de tunável puro + regen do único golden roster-dependente; determinismo cross-ambiente preservado por construção.*
