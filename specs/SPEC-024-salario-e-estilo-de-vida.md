# SPEC-024 — Salário e estilo de vida (básico)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-024 |
| **Feature** | Salário e estilo de vida — card do board (`8c43a8fb`) |
| **Slug** | salario-e-estilo-de-vida |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 2.8 (Salário & estilo de vida — básico) |
| **Appetite** | **2 a 3 dias** (lib pura de economia + player-store; sem cross-schema, sem workspace novo). |
| **Prioridade** | ALTA — dá **stakes** ao loop; casa com a retenção (SPEC-023). |
| **Criada em** | 2026-07-17 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-17)

1. **Ganho por RODADA (pingo diário).** O salário é creditado a cada rodada (pequeno, `f(overall)`), + **prêmios por partida** (vitória > empate > derrota). Casa com o `runDailyRound`. O **gatilho real** (quem chama a cada tick) e a **origem do resultado da partida** (mundo → prêmio) ficam como **seam** (params/wiring deferido) — a fatia não cruza schema.
2. **Efeitos das compras = SEAM declarado.** Cada compra **declara** seu trade-off narrativo (ex.: carro = +moral/+fama/+risco; academia = +físico/−vestiário) como **dado**, mas a **aplicação real** espera a **2.3 (Forma/Moral)** e a **F2 (fama/química)**. Esta fatia **NÃO** constrói Forma/Moral (fronteira limpa) e **NÃO** aplica nada a atributo — respeita **"nunca loja de stats"**.
3. **Moradia = compras EXPLÍCITAS.** O jogador compra a próxima moradia (**pensão → quitinete → casa → cobertura**); o **tier de patrimônio = a maior moradia comprada** (a faixa mostra a atual). A **casa da mãe** é um **marco especial à parte** (dispara um card compartilhável — seam), fora da escada.

**Invariantes inegociáveis (regras NUNCA — não são perguntas):**
- **Trava anti-dinheiro-real:** o dinheiro do jogo é 100% ganho no jogo (salário/prêmios). **Nenhum** caminho adiciona saldo com dinheiro real (zero IAP/seam de compra de moeda). Campo 05 do charter.
- **Nunca loja de stats:** nenhuma compra escreve em atributo (focos). Os trade-offs são dado narrativo aplicado por outro sistema (2.3/F2), nunca um "+5 físico" comprável.

---

## Objetivo

Transformar o desempenho em **poder de compra pessoal**: o atleta ganha salário/prêmios, gasta em um **catálogo de compras com trade-off narrativo**, sobe a **escada de moradia** (o patrimônio que aparece na faixa) e alcança o marco da **casa da mãe**. É o que dá **stakes materiais** à carreira — sem nunca virar loja de stats nem ponte com dinheiro real.

---

## Contexto e motivação (fatos verificados no repo)

- **O atleta existe e tem overall (SPEC-016/017):** `packages/player` deriva `overall` dos 4 focos (`overall`/`pointsEarnedTotal`); o `player-store.athlete` persiste focos + `free_points` + `active`. O salário = `f(overall)` é **puro** e mora aqui.
- **O relógio diário existe (SPEC-015):** `runDailyRound` roda 1×/dia; o crédito por rodada engancha aí (wiring futuro).
- **Forma/Moral (2.3) e fama/química (F2) NÃO existem:** grep — zero `moral`/`forma`/`fama`/`quimica` como estado no código (só a tese nos docs). Por isso os efeitos das compras são **seam declarado** (decisão 2).
- **Sem economia hoje:** grep — zero `saldo`/`balance`/`salario`/`compra`/`purchase` no código. Construído do zero, molde das SPEC-016/017/019 (lib pura + player-store, migration aditiva).
- **Sem cross-schema:** o salário lê o `overall` do próprio player-store; o **prêmio recebe o resultado da partida como PARÂMETRO** (a busca no mundo é do caller futuro) → a fatia é **single-schema** (não toca o world-store).

---

## Escopo — o que está DENTRO

**A) Lib pura `packages/player/economy.ts` (determinística, sob o guardrail):**
- [ ] `ECONOMY` tunável: `salaryBase`/`salaryPerOverall` (salário/rodada = `salaryBase + overall × salaryPerOverall`, inteiro), `prize` (`{ win, draw, loss }`), e o **catálogo** `PURCHASES` (itens com `id`/`name`/`cost`/`kind`/`tradeoff`) + a **escada de moradia** `HOUSING` (`pensao`→`quitinete`→`casa`→`cobertura`, com custo por degrau).
- [ ] `salaryPerRound(overall): number` (inteiro, guardrail-safe). `matchPrize(result: 'win'|'draw'|'loss'): number`. `roundEarnings(overall, result?)` = salário + prêmio (result opcional).
- [ ] `purchaseById(id)`, `canAfford(balance, id)`, `isHousing(id)`, `housingTierOf(id)`, `lifestyleTier(ownedHousingIds): number` (o maior degrau possuído; pensão = 0 default). Validações puras da compra (existe / já possui [itens 1×] / degrau de moradia válido / tem saldo).
- [ ] `MOTHERS_HOUSE_ID` — o marco especial (fora da escada; sinaliza o card).

**B) `services/player-store` — o dinheiro persistido:**
- [ ] **Migration aditiva `0004`** (schema `player`, OP-01): `athlete.balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0)` + tabela **`purchase`** (`athlete_id` FK, `item_id`, `purchased_at`; PK `(athlete_id, item_id)` — possuir é um conjunto, 1× por item).
- [ ] `economy-repo.ts` (novo): `accrueRound(db, athleteId, result?)` — lê o `overall` do atleta, credita `roundEarnings` (transação; `result` opcional = seam do resultado da partida). `purchaseItem(db, athleteId, itemId)` — transação com **`SELECT … FOR UPDATE`** no atleta: valida (via lib) + deduz `cost` + grava a posse; **atômico** (saldo e posse juntos). `readWallet(db, athleteId)` — `{ balance, ownedItemIds, lifestyleTier }`. Erros **genéricos** (OP-11: saldo insuficiente / item inválido / já possui / degrau inválido → mensagem segura).

**C) Efeitos como seam:** `readOwnedTradeoffs(db, athleteId)` (ou a lib `aggregateTradeoffs(ownedIds)`) devolve o **agregado dos trade-offs declarados** — o ponto único que a 2.3/F2 vai consumir para aplicar moral/física/fama/química. Aqui só **expõe o dado**, não aplica.

**D) Casa da mãe (marco):** comprar `MOTHERS_HOUSE_ID` grava a posse + expõe um **flag de marco** (`hasMothersHouse`) — o **card compartilhável** é seam (render futuro, sem cliente).

**E) Wiring (fora do tick puro):** o scheduler chama `accrueRound(db, athleteId, result)` a cada rodada (o `result` vindo da leitura do mundo — costura futura). Na fatia, `accrueRound`/`purchaseItem` são **testados direto**.

**F) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA

- **Aplicar os efeitos** dos trade-offs (moral/física/fama/química) — depende da **2.3/F2**; aqui é seam declarado.
- **O gatilho real do crédito** (o scheduler que chama `accrueRound` por rodada) — fatia de deploy.
- **A costura resultado-da-partida → prêmio** (world-store → player) — o `result` é param; o wiring é futuro.
- **A UI da faixa** (a cena de casa que evolui) + **o render do card** da casa da mãe — sem cliente.
- **Luvas de contrato / renovação / bônus de assinatura** (contratos são 2.x/decisões de carreira) — o ganho aqui é salário/rodada + prêmio.
- **Dinheiro real / IAP** — **NUNCA** (invariante).

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/economy.ts` (+ `index.ts`, `types.ts` se preciso) | criar/editar — fórmulas + catálogo + validações puras. |
| `packages/player/src/economy.test.ts` | criar — testes puros. |
| `packages/player/src/constants.ts` | editar — bloco `ECONOMY`/`HOUSING`/`PURCHASES` (ou em `economy.ts`). |
| `services/player-store/src/schema/athlete.ts` (+ `purchase.ts`, barrel) | editar/criar — `balance` + tabela `purchase`. |
| `services/player-store/src/migrations/0004_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/player-store/src/store/economy-repo.ts` (+ `index.ts`) | criar — `accrueRound`/`purchaseItem`/`readWallet`. |
| `services/player-store/test/economy-repo.test.ts` | criar — testes ao vivo. |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 2.8 + flip SPEC-023 → PR #26. |
| `specs/SPEC-024-*.md`, `specs/DONE-024-*.md` | criar. |

**Intocado:** `packages/world-engine` (engine puro) e todos os goldens; o `world-store` (zero cross-schema — o prêmio é param).

---

## Critérios de aceitação

1. **Salário (puro):** `salaryPerRound(overall)` = `salaryBase + overall × salaryPerOverall` (inteiro; cresce com o overall). `matchPrize('win') > matchPrize('draw') > matchPrize('loss') ≥ 0`. Testado puro.
2. **Crédito:** `accrueRound(athleteId)` soma o salário ao `balance`; com `result` soma também o prêmio. Idempotência **não** exigida (cada rodada é um crédito novo — o gatilho diário garante 1×/dia). Testado ao vivo.
3. **Compra atômica:** `purchaseItem(athleteId, id)` deduz o `cost` e grava a posse **numa transação** (`FOR UPDATE`); saldo insuficiente → erro genérico, **nada muda**. Testado ao vivo.
4. **Regras da compra:** item inexistente → erro; item 1× já possuído → erro; moradia fora de ordem (comprar `casa` sem `quitinete`) → erro. Testado (puro + ao vivo).
5. **Moradia / lifestyle tier:** comprar a escada sobe o `lifestyleTier` (pensão 0 → cobertura 3 = a maior possuída); `readWallet` reflete. Testado.
6. **Casa da mãe:** comprar `MOTHERS_HOUSE_ID` liga `hasMothersHouse` (o card é seam). Testado.
7. **Efeitos = seam:** `aggregateTradeoffs(ownedIds)` devolve o agregado declarado; **nenhum** atributo (focos) é escrito por compra alguma (prova de "nunca loja de stats"). Testado.
8. **Trava anti-dinheiro-real:** não existe função/rota que adicione saldo fora de `accrueRound` (salário/prêmio). Verificado por revisão (sem seam de moeda real).
9. **OPs & gates:** sem `any` (OP-14); ≤50 linhas/função (OP-15); ≤300/arquivo (OP-16); erros genéricos (OP-11); migration aditiva (OP-01); regra pura na lib / IO no store (OP-17); guardrail verde (fórmulas inteiras); `lint`/`typecheck`/`build`/`test`/prettier verdes; **engine e os 4 goldens intocados** (`git diff` = 0); ao vivo serial + limpeza em ordem de FK.

---

## Segurança

- **Trava anti-dinheiro-real (charter 05):** nenhum caminho credita saldo com dinheiro real; o saldo só cresce por `accrueRound` (salário/prêmio do jogo). Auditado na revisão.
- **Nunca loja de stats:** nenhuma compra toca focos; o trade-off é dado, aplicado por outro sistema. Teste prova que os focos ficam inalterados.
- **Autoridade server-side:** o saldo, o custo e a validação da compra são decididos no servidor (`FOR UPDATE`); o cliente nunca força um saldo nem uma compra sem fundos.
- **OP-11:** saldo insuficiente / item inválido / já possui → erro genérico, sem SQL/stack.
- **Atomicidade:** `purchaseItem` deduz o saldo e grava a posse na mesma transação (all-or-nothing).

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Efeitos hollow** (compra não faz nada visível ainda) | Decisão do founder (seam): a fatia entrega a economia + catálogo + moradia + marco; os efeitos wired quando 2.3/F2 existirem. `aggregateTradeoffs` é o ponto de plugue pronto. |
| **Prêmio precisa do resultado do mundo** (cross-schema) | O `result` é **param** de `accrueRound`; a costura mundo→prêmio é futura. A fatia não toca o world-store. |
| **Loja de stats acidental** | Nenhuma compra escreve em focos; teste dedicado prova os focos inalterados. Trade-off é dado. |
| **Dinheiro real** | Invariante: zero seam de moeda real; auditado. |
| **Calibração dos números** (salário vs. custos) | Tunável em `ECONOMY`/`HOUSING`/`PURCHASES`; os valores iniciais são um ponto de partida ajustável sem churn de lógica. |

**Dependências:** SPEC-016/017 (`athlete`/`overall`/`pointsEarnedTotal`). **Precede:** a aplicação dos efeitos (2.3 Forma/Moral, F2 fama/química), o wiring do scheduler, a costura resultado→prêmio, a UI da faixa + o card da casa da mãe.

---

## Notas de implementação

- **A economia mora no player-store** (single-schema): salário lê o `overall` local; o prêmio é param. Zero world-store. Molde SPEC-016/017/019.
- **Inteiro em tudo** (guardrail): salário/prêmio/custos são inteiros; sem transcendentais.
- **`aggregateTradeoffs`** é o **único ponto de plugue** para a 2.3/F2 — a fatia deixa o dado pronto, não aplica.
- **Casa da mãe** é um item de catálogo especial (fora da escada de moradia); comprar liga o marco (o card é seam).
- **Fecho do DONE:** "Estado atual" (SPEC-024, flipar SPEC-023 → PR #26) + `roadmap.md` (2.8).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (economia + catálogo + moradia + marco; efeitos/scheduler/UI/contratos fora)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva `0004` — OP-01)
- [x] Critérios testáveis (salário, crédito, compra atômica, regras, moradia, casa da mãe, efeitos=seam, anti-dinheiro-real)
- [x] Riscos avaliados (hollow, cross-schema, loja de stats, dinheiro real, calibração)
- [x] Decisões co-desenhadas registradas (por-rodada, efeitos=seam, moradia=compras) + invariantes NUNCA
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-024 — método H1VE. O desempenho vira poder de compra: salário pinga a cada rodada, prêmios premiam a campanha, e o dinheiro vira estilo de vida — a escada de moradia que a faixa exibe, as compras com trade-off narrativo, o marco da casa da mãe. Nunca uma loja de stats; nunca comprável com dinheiro real. Lib pura + player-store, engine e goldens intocados.*
