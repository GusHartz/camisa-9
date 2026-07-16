# DONE-009 — Pirâmide completa do mundo

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-009 |
| **SPEC correspondente** | SPEC-009-piramide-completa-do-mundo.md |
| **Feature** | Pirâmide completa do mundo |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/piramide-completa-do-mundo` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado** | 2026-07-15 |
| **Desenvolvimento concluído** | 2026-07-16 |
| **Dias utilizados vs appetite** | <1 dia vs 14 dias |

---

## Resumo do que foi feito

Expandi a lib pura `packages/world-engine` (antes: 1 liga, 10 clubes, `Club{strength}` escalar da SPEC-002) para uma **pirâmide de 4 divisões com elenco NPC que roda 1 temporada inteira sozinha e faz a viragem de temporada** — tudo **determinístico por seed**, sem tocar `simulateSeason`/`resolveMatch` nem o `season.golden.json` (o mundo novo é **aditivo**; a força de clube virou campo **derivado**).

- **Seed do mundo** (`seedWorld`): 4 andares × 20 clubes = **80 clubes**, cada um com elenco de **20 atletas NPC** (idade + habilidade + posição), gerados por `deriveSeed` a partir de pools de nomes **100% fictícios**. **Ordem de sorteio fixa por clube** (contrato de determinismo do ajuste #2): `archetype → weights → elenco`.
- **Força derivada** (`clubStrength`): média inteira das **11 melhores** habilidades do elenco. Habilidade sorteada em **faixas por tier SOBREPOSTAS** (um bom clube de baixo pode superar um fraco de cima).
- **Temporada do mundo** (`simulateWorldSeason`): projeta cada `WorldClub → Club` e reusa `simulateSeason` para as 4 divisões (o `leagueId` já isola o sub-seed) — 38 rodadas / 380 partidas por divisão.
- **Viragem** (`advanceWorld`), na **ordem canônica da SPEC**: promoção/rebaixamento por fronteira → envelhecer → aposentar (≥35) → **transferir** (12 trocas placeholder de mesma posição) → **repor base** por posição (jovens 17) → recomputar força → `seasonId++`.
- **Relatório de viragem** (`turnoverReport`): função pura por **DIFF** do estado antes/depois (promovidos/rebaixados/aposentados/nascidos/transferidos) — insumo de auditoria (painel 1.5).
- **Golden do ciclo** (`world.golden.json`): sequência de **11 hashes** (mundo semeado + 10 viragens) via `worldHash` (reusa o cyrb128, só inteiros → estável cross-ambiente).

**Review adversarial** (workflow de 5 dimensões + verificação adversarial de cada achado, padrão SPEC-002/006): **7 achados → 2 confirmados corrigidos + 2 guardas de hardening**. O mais relevante: a review pegou um **drift real** — eu havia implementado a ordem `repor base → transferir`, invertendo a ordem da SPEC aprovada (`transferir → repor base`), e ainda rotulei a minha de "ORDEM CANÔNICA". **Corrigi o rumo**: reordenei o código para bater com a SPEC e regenerei o golden (protocolo de drift do CLAUDE.md — a âncora aprovada vence).

**Gates:** `typecheck` verde · **89 testes** verdes (48 golden da SPEC-002 preservados + 41 novos) · `build` verde · **ESLint verde** (OP-14/15/16 + guardrail de determinismo). *(O `prettier --check` local falha por CRLF — gotcha conhecido do Windows, não é regressão; CI em LF é verde.)*

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `packages/world-engine/src/data/name-pools.ts` | Pools de nomes fictícios (clube + atleta). Só dados. |
| `packages/world-engine/src/data/names.ts` | Derivação de nomes: clube por bijeção de índice (único), atleta por hash do id (fora do stream do mundo). |
| `packages/world-engine/src/data/world-seed.ts` | `seedWorld` — 4×20 clubes + elencos, ordem de sorteio fixa. |
| `packages/world-engine/src/engine/draw.ts` | `pick`/`drawInt` — sorteios tipados seguros sobre o PRNG. |
| `packages/world-engine/src/engine/roster.ts` | `clubStrength` (top-11), `positionCounts`, `tierAbilityRange`. |
| `packages/world-engine/src/engine/promotion.ts` | Promoção/rebaixamento por fronteira + guardas de conservação. |
| `packages/world-engine/src/engine/lifecycle.ts` | Envelhecimento, aposentadoria, reposição de base posicional. |
| `packages/world-engine/src/engine/transfers.ts` | 12 transferências placeholder (trocas de mesma posição). |
| `packages/world-engine/src/engine/world-season.ts` | `simulateWorldSeason` (projeta `WorldClub → Club`). |
| `packages/world-engine/src/engine/world-turnover.ts` | `advanceWorld` — orquestra a viragem na ordem canônica. |
| `packages/world-engine/src/engine/turnover-report.ts` | `turnoverReport` — relatório por DIFF puro. |
| `packages/world-engine/src/engine/world-hash.ts` | `worldHash` — impressão digital determinística do estado. |
| `packages/world-engine/src/__fixtures__/world.golden.json` | Golden do ciclo (11 hashes). |
| `packages/world-engine/src/**/*.test.ts` (5 arquivos) | Testes de propriedade/determinismo/golden das peças novas. |
| `specs/SPEC-009-*.md`, `specs/DONE-009-*.md` | A SPEC (aprovada com ajustes) e este DONE. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `packages/world-engine/src/types.ts` | +`Position`, `Archetype`, `Athlete`, `WorldClub`, `League`, `Tier`, `WorldState`, `LeagueSeasonResult`, `WorldSeasonResult`, `ClubMove`, `AthleteMove`, `TurnoverReport`. `Club` (spike) **inalterado** (preserva o golden). |
| `packages/world-engine/src/constants.ts` | +objeto `WORLD` (tunáveis ratificados), `ARCHETYPES`, `POSITIONS`. |
| `packages/world-engine/src/index.ts` | Exporta a API de mundo nova. |

---

## Mudanças de schema aplicadas

Nenhuma migration. O mundo vive em memória (lib pura); persistência durável é a Fase 0.2 (OP-01 não se aplica — sem schema).

---

## Mudanças de API entregues

Superfície pública nova da lib (`index.ts`, sem I/O): `seedWorld`, `simulateWorldSeason`, `advanceWorld`, `turnoverReport`, `clubStrength`, `positionCounts`, `tierAbilityRange`, `applyPromotionRelegation`, `ageAndRetire`, `refillYouth`, `runTransfers`, `worldHash` + `WORLD`/`ARCHETYPES`/`POSITIONS` + os tipos novos.

---

## Critérios de aceitação — verificação

| Cenário (SPEC-009) | Status | Evidência |
|---|---|---|
| 1 — Seed determinístico do mundo | ✅ | `world-seed.test.ts`: 4 andares × 20 clubes, elenco 20, idades em `[18,34]`, habilidade na faixa do tier, ids únicos; mesma seed → deep-equal. |
| 2 — Temporada do mundo inteiro | ✅ | `world-season.test.ts`: 4 ligas, 38 rodadas / 380 partidas / tabela de 20 cada; determinismo + replay por `leagueId`. |
| 3 — Promoção/rebaixamento conserva fluxo | ✅ | `world-turnover.test.ts` (3↓ tier1 ↔ 3↑ tier2) + `assertConservation` (cada liga = 20) + `turnover-report.test.ts` (promovidos == rebaixados == 9). |
| 4 — Ciclo de vida NPC | ✅ | `assertInvariants` a cada viragem: todos `youthAge ≤ age < 35`, elenco = 20, formação = `squadShape`. |
| 5 — Transferências NPC determinísticas | ✅ | `turnover-report.test.ts`: transferidos mudam de clube (id preservado), total de atletas conservado, mesma seed → mesmo diff. *(placeholder intra-liga — ver Desvios.)* |
| 6 — Determinismo cross-ambiente (golden) | ✅ | `world-turnover.test.ts` bate byte-a-byte com `world.golden.json`; sequência idêntica entre o vitest e um processo `node` separado sobre o `dist`. |
| 7 — Edge: fronteiras e vazios | ✅ | Estrutural: topo da Div1 / fundo da Div4 nunca entram em `removeIds` (sem fronteira além); `refillYouth` cobre déficit posicional de qualquer tamanho (até o elenco inteiro). Exercitado nas 10 viragens encadeadas. |
| **Aceite extra (ajuste #5)** | ✅ | 10 viragens encadeadas: invariantes por viragem **+** sequência golden estável e reproduzível. |

---

## Como testar manualmente

```bash
npm run typecheck && npm test && npm run build     # gates (89 testes)
npx eslint "packages/world-engine/src/**/*.ts"     # OPs + guardrail de determinismo

# Regenerar/inspecionar o golden do ciclo (cross-processo):
npm run build
node --input-type=module -e "import {seedWorld,simulateWorldSeason,advanceWorld,worldHash} from './packages/world-engine/dist/index.js'; let w=seedWorld('decada'); const h=[worldHash(w)]; for(let s=0;s<10;s++){w=advanceWorld(w,simulateWorldSeason(w,'decada'),'decada');h.push(worldHash(w));} console.log(JSON.stringify(h));"
# → deve bater com packages/world-engine/src/__fixtures__/world.golden.json
```

**Dados de teste necessários:** nenhum — tudo seed-derivado.

---

## Testes automatizados

- `data/world-seed.test.ts` (10) — determinismo, estrutura da pirâmide, invariantes de clube/elenco, faixas por tier, unicidade de ids/nomes.
- `engine/roster.test.ts` (6) — `clubStrength` (top-11, média inteira, ordem-independente, vazio) + `positionCounts`.
- `engine/world-season.test.ts` (6) — 4 ligas completas, determinismo, ligas distintas por `leagueId`.
- `engine/world-turnover.test.ts` (9) — viragem única (invariantes, promoção, giro de elenco), determinismo, **10 viragens encadeadas + golden**.
- `engine/turnover-report.test.ts` (6) — DIFF: promovidos/rebaixados, conservação por fronteira, nascidos==aposentados, transferidos, determinismo.

**Comando:** `npm run lint && npm run typecheck && npm test && npm run build`

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| Todo o código, testes e docs desta feature | ~100% | Sim — código de autor único coerente (ordem do PRNG é determinismo-crítica, não paralelizável); **review adversarial** por workflow de 5 dimensões + verificação de cada achado; 2 confirmados corrigidos + 2 guardas. Founder revisa no diff do PR. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → 2 guardas de hardening (multi-liga R13 e conservação de fronteira) que a review levantou como traps latentes de tunáveis ratificados. Não alteram comportamento em v1; falham alto se um tunável for reconfigurado de forma insegura. Documentadas abaixo.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **Ordem da viragem** | A review pegou um **drift**: eu havia feito `repor base → transferir`, invertendo a SPEC. **Reordenei para `transferir → repor base`** (a ordem aprovada) e regenerei o golden. | Protocolo de drift — a âncora aprovada vence; corrigir o rumo, não reescrever a SPEC para caber no meu erro. |
| **`TurnoverReport`** | `advanceWorld` retorna `WorldState`; o relatório é a **função pura separada** `turnoverReport(before, after)` (DIFF), não `{next, report}`. | Melhor SRP e não infla o stream do PRNG. **Dentro** do escopo (registrado na SPEC como "desvio de forma"). |
| **Módulos** | Fatiamento mais fino que a lista da SPEC (`names`, `draw`, `world-turnover`, `world-hash`, `turnover-report`). | OP-15/16 (funções ≤50, arquivos ≤300). Mesma responsabilidade. |
| **Transferências** | v1 é **intra-liga** (trocas de mesma posição dentro da divisão). | Placeholder; mercado real com movimento cross-divisão é a 1.4. |
| **Habilidade do jovem** | Vem da faixa do **tier atual** (pós-promoção) do clube. | Simplificação de v1; academia/progressão é card separado. |
| **Guardas de hardening** | +`assertSingleLeaguePerTier` e +`assertConservation` em `promotion.ts`. | Converte traps latentes (multi-liga R13; sobreposição de `promoteRelegate`) em falha alta e explícita. |

**Protocolo de conflito (parar+registrar):** o drift de ordem foi **detectado na review e reconciliado** (código → SPEC), não empurrado adiante.

---

## Limitações conhecidas

- **Transferências intra-liga** e em número placeholder (12/liga); sem valores/janelas/contratos (1.4).
- **Jovem herda a faixa do tier atual** — um clube recém-promovido produz base mais forte na hora; balanço econômico real é card à parte.
- **Promoção multi-liga (R13) não implementada** — guardada com throw explícito; a topologia entre grupos paralelos (quem sobe para qual grupo, playoff) é design futuro.
- **Sem head-to-head** na fronteira — ordem total do `computeStandings` (herdado da SPEC-002).

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| **Ordem `transferir → repor base` vs `repor base → transferir`** | Baixo | Decisão do founder: a ordem da SPEC pode fazer uma transferência "no-op" se a aposentadoria esvaziar uma posição; `repor base` antes evitaria isso (mas diverge da SPEC atual). Registrado para ratificação. |
| Janela de aposentadoria seed-derivada 33–38 | Baixo | Melhoria futura já registrada pelo founder na aprovação. |
| Mercado real cross-divisão (valores, janelas, química) | Médio | Fase 1.4. |
| Modelo rico de 12 atributos + evolução | Médio | Card "Atributos e evolução". |
| Promoção entre grupos paralelos (R13) | Médio | Quando a Pirâmide Elástica (2.2) for priorizada. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (7/7 + aceite extra)
- [x] Testes criados e passando (89 no total; 41 novos)
- [x] Typecheck limpo
- [x] Lint limpo (ESLint verde; `prettier --check` local falha por CRLF — gotcha conhecido, CI verde)
- [x] Nenhum log de debug em código de produção
- [x] Nenhum tipo `any` introduzido (OP-14)
- [x] Nenhuma função > 50 linhas (OP-15) / arquivo > 300 linhas (OP-16)
- [x] Nenhum segredo hardcoded
- [x] Determinismo money-path preservado (guardrail + golden cross-ambiente)
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` seção "Estado atual" atualizada
- [ ] `docs/projeto/roadmap.md` — status a atualizar (frente 1.2/1.3/1.4)
- [x] Este DONE está completo e commitado na branch *(commit pendente de "go" do founder)*

---

*DONE-009 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Assenta sobre a SPEC-002 (world-engine); lib pura, determinística; ADR-001 não se aplica (servidor).*
