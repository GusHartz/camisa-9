# SPEC-009 — Pirâmide completa do mundo

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-009 |
| **Feature** | Pirâmide completa do mundo |
| **Slug** | piramide-completa-do-mundo |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Fase 1 — Motor do mundo (cobre 1.2 multi-divisão + 1.3 ciclo de vida NPC + 1.4 transferências NPC). Card do board (HIGH). |
| **Appetite** | **14 dias** (teto do card). |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-15 |
| **Aprovada em** | 2026-07-15 |
| **Aprovada por** | Gustavo Hartz (founder/architect) |
| **Status** | **Aprovada com ajustes** (ver "Ajustes aprovados" abaixo) |

---

## Objetivo

Expandir a lib pura `packages/world-engine` (hoje: 1 liga, 10 clubes, entidade única `Club{strength}` — SPEC-002) para uma **pirâmide de 4 divisões que roda 1 temporada inteira sozinha**, com **elenco NPC que envelhece**, **promoção/rebaixamento**, **transferências NPC** e **aposentadorias + reposição de base** na virada de temporada. Tudo **determinístico por seed** (sem `Math.random`/`Date`/transcendentais; golden vector cross-ambiente). Prova a tese central — *o mundo vive sem nenhum humano* — no formato do mundo real de produção, e cria os NPCs que a Fase 2 (humano assume vaga de NPC) precisará substituir.

---

## Contexto e motivação

O SPEC-002 provou o **coração determinístico** (partida, temporada de 1 liga, publicação atômica, âncora de fuso), mas num modelo mínimo: só clubes com um escalar `strength`, uma liga, uma temporada, sem ninguém envelhecendo nem trocando de time. Este card é a Fase 1 do roadmap — o motor do mundo completo. Decisões de escopo já ratificadas pelo founder (h1ve start, 15/07):

1. **Elenco NPC mínimo** — cada clube ganha um elenco de atletas NPC com **idade + habilidade**; a força do clube é **derivada** do elenco. Habilita aposentadoria, base e transferência. O modelo rico de **12 atributos + evolução fica no card separado** "Atributos e evolução".
2. **20 clubes/divisão, 3 sobem/descem** — pirâmide **linear** de 4 divisões (1 grupo cada). A ramificação 2× do R13 (grupos paralelos, disparada por ocupação humana) é **futura** e fica fora.
3. **1 ciclo completo** — seed → simula 1 temporada (4 divisões) → **viragem** (promoção/rebaixamento + envelhecimento + aposentadorias + transferências + reposição de base) → estado do mundo da próxima temporada.

**Reaproveitamento (o mapa confirmou que já generalizam):** `generateFixtures` (qualquer nº par de clubes), `resolveMatch`/PRNG/`deriveSeed` (o `leagueId` já entra no sub-seed → N divisões = N streams independentes), `computeStandings`, `RoundStore`/`RoundPublisher` (chaveados por `leagueId`). **Não tocamos** `resolveMatch` nem `simulateSeason` nem seus golden — a força de clube continua um escalar, agora **derivado** do elenco.

---

## Ajustes aprovados (revisão do founder, 15/07)

A SPEC foi **aprovada com 5 exigências de arquitetura** — fundações baratas de specs futuras que a v1 deve deixar prontas. Elas **prevalecem** sobre o texto original abaixo onde houver conflito:

1. **`WorldState` modela `tier → [leagues]` desde já** (fundação R13). O container passa a ser `Tier { tier, leagues: League[] }` + `League { leagueId, clubs }` — **substitui** o `Division { tier, leagueId, clubs }` do texto original. Em v1, `leaguesPerTier = 1`; grupos paralelos entram sem refatorar o tipo.
2. **`WorldClub` nasce com `archetype` + `weights` sorteados por seed na criação** — mesmo sem uso na v1. Sortear archetype/weights **antes** do elenco fixa a ordem do stream; atribuí-los depois deslocaria o PRNG e quebraria golden/replay. Fundação da 1.4 (mercado com necessidade + personalidade).
3. **Reposição de base respeita carência POSICIONAL** (`Athlete.position`): repõe a posição que saiu até restaurar a formação `squadShape`, não sorteio puro.
4. **Invariante testado:** `roster.length === rosterSize (20)` após **qualquer** viragem (mais: a formação por posição volta a `squadShape`).
5. **10 viragens encadeadas = critério de aceite:** invariantes preservados a cada viragem **e** sequência de hash golden estável.

**Tunáveis confirmados:** elenco **20**, aposentadoria **35** (melhoria futura registrada: janela seed-derivada 33–38), base **17**, **faixas de força SOBREPOSTAS** entre tiers adjacentes, **3↑3↓ como parâmetro POR FRONTEIRA** (`promoteRelegate[]`), **12 transferências placeholder**. Escopo "fora" confirmado.

### Desvios de forma (mesmo escopo, implementação fiel)
- **`advanceWorld` retorna `WorldState`** (não `{next, report}`); o `TurnoverReport` vira uma **função pura separada** `turnoverReport(before, after)` derivada por DIFF do estado — melhor SRP (a viragem é a transição; o relatório é uma observação) e não infla o stream. Continua **DENTRO** do escopo.
- **Módulos** fatiados um pouco além da lista original: `data/names.ts`, `engine/draw.ts`, `engine/world-turnover.ts`, `engine/world-hash.ts`, `engine/turnover-report.ts` (todos ≤300 linhas, funções ≤50) — mesma responsabilidade, granularidade menor.
- **Transferências v1 são intra-liga** (trocas de mesma posição dentro da divisão, preservam tamanho/formação). Movimento cross-divisão fica para o mercado real (1.4).
- **Habilidade do jovem** vem da faixa do **tier atual** do clube (pós-promoção). Simplificação de v1; o modelo de academia/progressão é card separado.

---

## Escopo — o que está DENTRO

- [ ] **Entidade `Athlete` (NPC mínimo):** `{ id, name, age, ability }` (`ability` 0..100 = contribuição de força; sem os 12 atributos). Imutável (readonly).
- [ ] **`Club` ganha `roster: readonly Athlete[]`** e mantém `strength` como campo **derivado** do elenco (recomputado quando o elenco muda) — preserva o caminho golden do `simulateSeason`/`resolveMatch` intacto.
- [ ] **Container de mundo:** `Division { tier, leagueId, clubs }` e `WorldState { seasonId, divisions }` (4 divisões, tier 1 = topo).
- [ ] **Seeder determinístico** `seedWorld(seed): WorldState` — gera 4×20 = **80 clubes**, cada um com elenco de tamanho fixo, a partir de pools de nomes fictícios + PRNG (idades/habilidades enviesadas por tier: divisões de cima começam mais fortes). **Não hardcoda** 80 clubes/~1600 atletas (estouraria o limite de 300 linhas) — gera por `deriveSeed`.
- [ ] **`clubStrength(roster): number`** — força do clube = média (inteira) das 11 melhores habilidades do elenco.
- [ ] **Runner de mundo** `simulateWorldSeason(world, seed): WorldSeasonResult` — roda o `simulateSeason` existente para **cada divisão** (sub-seed já isola por `leagueId`), retornando as 4 tabelas + rodadas.
- [ ] **Viragem de temporada** `advanceWorld(world, results, seed): { next: WorldState, report: TurnoverReport }`, na ordem canônica determinística:
  1. **Promoção/rebaixamento:** por fronteira, os **3 últimos** da divisão de cima trocam com os **3 primeiros** da de baixo (ordem final da tabela). Topo da Div 1 e fundo da Div 4 não se movem.
  2. **Envelhecimento:** `age += 1` para todos.
  3. **Aposentadoria:** atletas com `age ≥ retirementAge` saem do elenco.
  4. **Transferências NPC:** conjunto **limitado e seed-dirigido** de trocas entre clubes (mover atleta de A→B).
  5. **Reposição de base:** cada clube recompleta o elenco ao tamanho-alvo com atletas jovens (`age = youthAge`, habilidade seed-derivada).
  6. **Recomputar `strength`** de cada clube; `seasonId += 1`.
- [ ] **`TurnoverReport`** (auditabilidade): quem subiu/desceu, aposentou, foi transferido, nasceu — insumo do painel de auditoria (1.5) e do rigor money-path.
- [ ] **Constantes `WORLD`** em `constants.ts`: `divisions=4`, `clubsPerDivision=20`, `promoteRelegate=3`, `rosterSize`, `retirementAge`, `youthAge`, faixas de idade/habilidade, `transfersPerDivision`.
- [ ] **Determinismo:** toda etapa estocástica (geração, transferências, base) por `deriveSeed(seed, seasonId, etapa, ...)`; aposentadoria/envelhecimento são puros (limiar de idade). Sem transcendentais.
- [ ] **Golden vector novo** `__fixtures__/world.golden.json`: hash do `WorldSeasonResult` + do `WorldState` pós-viragem de um mundo canônico (prova determinismo cross-ambiente do ciclo inteiro).
- [ ] **Testes de propriedade:** determinismo (mesma seed → mesmo ciclo), conservação de fluxo (nº de clubes por divisão constante após prom/rebaix), tamanho de elenco constante pós-viragem, nº de clubes do mundo constante, sem atleta com `age ≥ retirementAge` no início da nova temporada, IDs únicos.
- [ ] **Exports** no `index.ts` + atualização do `README.md` do pacote se necessário (convenções).

---

## Escopo — o que está FORA

- **Persistência real (Postgres/migrations)** — o mundo vive em memória (como o `RoundStore`); a camada de dados durável é a Fase 0.2. (OP-01 não se aplica — sem schema.)
- **Os 12 atributos + evolução do atleta** — card separado "Atributos e evolução". Aqui o atleta tem só `age` + `ability`.
- **Ramificação 2× / grupos paralelos (R13 elástico)** — futura, disparada por ocupação humana; a pirâmide aqui é **linear** (1 grupo/divisão).
- **Qualquer humano** — o mundo roda 100% NPC. Substituição de NPC por humano é a Fase 2.
- **Playoff de acesso** (R13) — nesta versão o acesso é direto (3 sobem/3 descem por posição). Playoff entre campeões de grupo só existe quando houver grupos paralelos.
- **Transferências ricas** (janelas, valores, contratos, salários) — aqui é só o movimento determinístico de elenco. Economia/salário = Fase 2.8.
- **Multi-temporada em loop** — o ciclo é rodável repetidamente (é uma função pura `advanceWorld`), mas **provar** N temporadas seguidas fica como teste/uso, não como feature; o entregável é **1 ciclo completo** + o golden.
- **UI/cliente** — nada. Lib pura.
- **Tie-break por confronto direto** — o `computeStandings` usa a ordem total atual (pontos → saldo → gols pró → id). Head-to-head na fronteira de acesso fica como possível refino (registrado em Débito).

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição |
|---|---|---|
| `packages/world-engine/src/types.ts` | modificar | +`Athlete`, `Division`, `WorldState`, `WorldSeasonResult`, `TurnoverReport`; `Club` ganha `roster`. |
| `packages/world-engine/src/constants.ts` | modificar | +objeto `WORLD` (nºs ratificados + tuning). |
| `packages/world-engine/src/data/name-pools.ts` | criar | Pools de nomes fictícios (partes de clube + atleta). Dados puros. |
| `packages/world-engine/src/data/world-seed.ts` | criar | `seedWorld(seed): WorldState` — gera 4×20 clubes + elencos determinísticos. |
| `packages/world-engine/src/engine/roster.ts` | criar | `clubStrength(roster)`; helpers de elenco. |
| `packages/world-engine/src/engine/promotion.ts` | criar | Promoção/rebaixamento (3 sobem/descem por fronteira). |
| `packages/world-engine/src/engine/lifecycle.ts` | criar | Envelhecimento + aposentadoria + reposição de base. |
| `packages/world-engine/src/engine/transfers.ts` | criar | Transferências NPC seed-dirigidas. |
| `packages/world-engine/src/engine/world-season.ts` | criar | `simulateWorldSeason` + `advanceWorld` (orquestra a viragem). |
| `packages/world-engine/src/index.ts` | modificar | Exportar a API nova. |
| `packages/world-engine/src/**/*.test.ts` | criar | Testes unitários + de propriedade das peças novas. |
| `packages/world-engine/src/__fixtures__/world.golden.json` | criar | Golden do ciclo completo (cross-ambiente). |
| `packages/world-engine/README.md` | modificar (se necessário) | Documentar a API de mundo. |

> **Módulos pequenos de propósito** (OP-15 função ≤50 linhas · OP-16 arquivo ≤300 linhas): a viragem é fatiada em `promotion`/`lifecycle`/`transfers`/`roster` em vez de um arquivo gigante.

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema. O mundo vive em memória (lib pura); persistência durável é a Fase 0.2 (OP-01 não se aplica).

---

## Mudanças de API (se aplicável)

Nenhuma API de rede. A "API" é a superfície pública da lib (`index.ts`): `seedWorld`, `simulateWorldSeason`, `advanceWorld`, `clubStrength` + os novos tipos. Sem I/O.

---

## Critérios de aceitação

**Cenário 1 — Seed determinístico do mundo**
- Dado um `seed`; quando chamo `seedWorld(seed)`; então obtenho **4 divisões × 20 clubes** (80 clubes), cada clube com elenco de tamanho `rosterSize`, idades em `[youthAge, retirementAge-1]`, IDs únicos; e **a mesma seed produz o mundo idêntico** (byte-a-byte no hash).

**Cenário 2 — Temporada do mundo inteiro**
- Dado um `WorldState`; quando chamo `simulateWorldSeason(world, seed)`; então cada uma das 4 divisões roda um turno-returno completo (**38 rodadas / 380 partidas** para 20 clubes) com tabela final ordenada; e o resultado é **replay-estável** (independe de ordem interna).

**Cenário 3 — Promoção/rebaixamento conserva fluxo**
- Dado as 4 tabelas finais; quando aplico a viragem; então os **3 últimos** de cada divisão superior e os **3 primeiros** da inferior **trocam de divisão**; cada divisão continua com **exatamente 20 clubes**; nenhum clube some ou duplica.

**Cenário 4 — Ciclo de vida NPC**
- Dado a viragem; então **todos os atletas envelhecem +1**; os com `age ≥ retirementAge` **se aposentam** (saem); cada elenco é **recompletado a `rosterSize`** com jovens (`age = youthAge`, habilidade seed-derivada); no início da nova temporada **nenhum atleta tem `age ≥ retirementAge`** e todo elenco tem `rosterSize`.

**Cenário 5 — Transferências NPC determinísticas**
- Dado a viragem; então um conjunto **limitado** (`transfersPerDivision`) de atletas muda de clube, **seed-dirigido**; o total de atletas do mundo é conservado pela transferência (só a reposição de base cria/aposentadoria remove); e a mesma seed → as mesmas transferências.

**Cenário 6 — Determinismo cross-ambiente (golden)**
- Dado o mundo canônico; quando rodo `simulateWorldSeason` + `advanceWorld`; então o hash do resultado + do estado pós-viragem **bate com `world.golden.json`** (mesma saída em qualquer plataforma; guardrail de lint garante ausência de `Date`/`Math.random`/transcendentais).

**Cenário 7 — Edge: fronteiras e vazios**
- Dado a Div 1 (topo, ninguém sobe) e a Div 4 (fundo, ninguém desce); então a viragem **não move** o topo da 1 nem o fundo da 4; e uma divisão onde todos aposentassem no mesmo ano é **recompletada** sem quebrar (base cobre o buraco).

---

## Segurança (se aplicável)

Sem superfície de segurança relevante. Lib pura, sem I/O, sem rede, sem segredos, sem input não-confiável. A regra que vale é **determinismo do money path** (guardrail de lint + golden) e **OP-17** (nenhuma regra vaza para cliente — aqui é 100% servidor/lib).

---

## Riscos e dependências

| Risco | Prob. | Mitigação |
|---|---|---|
| Introduzir não-determinismo (algum `Math.random`/transcendental numa curva de idade/habilidade) | Média | Guardrail de ESLint já barra; toda aleatoriedade via `deriveSeed`+PRNG; golden vector cross-ambiente pega divergência. |
| Estourar OP-15/16 (viragem vira função/arquivo gigante) | Média | Fatiar em `promotion`/`lifecycle`/`transfers`/`roster`/`world-season`; funções pequenas e puras. |
| Degeneração do mundo em multi-temporada (forças explodem, pirâmide esvazia) | Média | Habilidade em faixa limitada (clamp); reposição mantém tamanho; teste de propriedade opcional rodando N temporadas checa invariantes (sem NaN, tamanhos constantes, forças em faixa). |
| Golden gigante/frágil (380×4 partidas) | Baixa | Golden guarda **hashes** (do resultado + estado), não o dump inteiro — estável e pequeno. |
| Injustiça na fronteira de acesso sem head-to-head | Baixa | Ordem total determinística já resolve empates; head-to-head fica como refino registrado (Débito). |
| Tamanho do mundo (80 clubes × ~elenco) pesar no tempo de teste | Baixa | Bench simples; o SPEC-002 fez ~1 ms/temporada de 1 liga — 4 divisões ~ 4×; medir e registrar. |

**Dependências:**
- `packages/world-engine` (SPEC-002) — reusa `simulateSeason`, `generateFixtures`, `computeStandings`, PRNG/`deriveSeed`, `RoundStore`/`RoundPublisher`.
- **Desbloqueia:** Fase 2 (entrada por substituição precisa de NPCs para substituir), o painel de auditoria (1.5) e a camada de dados (0.2, que vai persistir este `WorldState`).

---

## Notas de implementação

- **Não tocar `simulateSeason`/`resolveMatch`/`fixtures`/`standings` nem seus golden** — a força de clube segue escalar, agora **derivada** por `clubStrength`. A `DEMO_LEAGUE` e o `season.golden.json` ficam intactos (o mundo novo é aditivo).
- **`clubStrength` = média inteira das 11 melhores `ability`** do elenco — liga força à qualidade do plantel, mantém a partida só-força (sem retrabalho do modelo golden).
- **Ordem canônica da viragem** (determinismo): prom/rebaix → envelhecer → aposentar → transferir → repor base → recomputar força → `seasonId++`. Documentar essa ordem no código; mudá-la muda o golden.
- **Sub-seeds:** geração `deriveSeed(seed,'world',tier,i,...)`; transferências `deriveSeed(seed, seasonId,'transfer',divisionId,k)`; base `deriveSeed(seed, seasonId,'youth',clubId,slot)`. Aposentadoria/envelhecimento são puros.
- **Enviesar por tier no seed:** divisões de cima começam com `ability` média maior (faixa deslocada por tier) — a pirâmide nasce coerente (elite forte, várzea fraca) e o gradiente várzea→elite (4.1) ganha lastro.
- **Números iniciais propostos (tunáveis, aprovar no review):** `rosterSize=20` (força = top 11), `retirementAge=35`, `youthAge=17`, idade no seed `17..34`, `ability` base por tier em faixas dentro de `40..90`, `transfersPerDivision=12`. Ajustar após medir "sanidade" (distribuição de forças, rotatividade).
- **Nomes fictícios** (regra NUNCA nº1): pools 100% inventados, combinados por PRNG — zero nome real de clube/jogador.
- **i18n:** nomes gerados não são strings de UI localizáveis (são dados do mundo); nenhuma string de UI hardcoded.

---

## Checklist de aprovação

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora) — elenco NPC mínimo, 4 div lineares, 1 ciclo
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema documentadas (N/A — em memória, 0.2 persiste)
- [ ] Critérios de aceitação são testáveis (7 cenários + propriedades + golden)
- [ ] Riscos e superfície de segurança avaliados (determinismo é o risco central)
- [ ] Appetite é razoável (14 dias)
- [ ] **Decisões de design ratificadas** (elenco NPC mínimo · 20/div, 3↑↓ · 1 ciclo) — confirmar os números tunáveis
- [ ] Não há conflito com SPECs abertas em paralelo (docs SPEC-007/008 são docs-only)
- [ ] **Aprovada** — aguardando o founder

---

*SPEC-009 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Assenta sobre o SPEC-002 (world-engine); lib pura, determinística; ADR-001 não se aplica (servidor).*
