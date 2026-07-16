# SPEC-011 — Docs de fundação: identidade Next Goat + R4 final (diário) + Dia do Jogador

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-011 |
| **Feature** | Docs de fundação: identidade Next Goat + R4 final (diário) + Dia do Jogador |
| **Slug** | docs-identidade-r4-final |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Higiene de documentação (continuação direta da SPEC-007/008/010). Não é item de produto. |
| **Appetite** | **meio dia** |
| **Prioridade** | MÉDIA |
| **Criada em** | 2026-07-16 |
| **Aprovada em** | 2026-07-16 |
| **Aprovada por** | Gustavo Hartz (founder/architect) |
| **Status** | Aprovada |

---

## Objetivo

Aplicar o **ADENDO 4 + o "Complemento ao Adendo 4"** do relatório de auditoria (`auditoria-docs-camisa9.md`) — **R4 FINAL: jogo diário (7/7) às 15h + liga de 20 + o Dia do Jogador**, patches **A10-A12** — aos docs de fundação, e **sincronizar o bloco "Estado atual" do CLAUDE.md** com a realidade pós-merge (SPECs 001-010 concluídas + o nome oficial NEXT GOAT). Docs-only.

---

## Contexto e motivação

Continuação direta da SPEC-007 (v1.4/Steam-only), da SPEC-008 (A1-A6: R13 + R14) e da SPEC-010 (A7-A9: identidade Next Goat + leis de arte + inteligência do mundo) — **todas já mergeadas** (ver Nota de baseline). O founder bateu o **martelo final do R4** (design doc v2.0, 3ª e definitiva revisão): a cadência deixa de ser **3 jogos/semana (ter/qui/sáb)** e passa a **jogo DIÁRIO, 7 dias por semana, às 15h Brasília**, sobre **liga de 20 clubes** (**38 rodadas ≈ 6 semanas**, ratificando o `clubsPerLeague: 20` já entregue na SPEC-009). O "Complemento" ratifica o **Dia do Jogador** (batida diária comprimida com FOCO de treino), reduz as barras persistentes do atleta a **DUAS (Forma e Moral)** — **fôlego diário cortado** —, move a stamina para **dentro da partida** (guia as substituições do técnico NPC) e fixa o **elenco em 16** (11 titulares + 5 reservas).

O pivô **inverte um pilar de longa data** ("ritual coletivo sincronizado = 3 jogos/semana"), então a cadência antiga não pode sobrar em nenhum doc de fundação — nem como visão, nem como capacidade, nem como spec de roadmap. Sem esta sincronização, os docs (e o próprio CLAUDE.md que orienta os agentes) seguem descrevendo um produto que o founder já revogou.

---

## Nota de baseline — DISCREPÂNCIA REGISTRADA (protocolo de conflito)

A tarefa pediu "aplicar os ADENDOS 3 e 4 — **patches A7-A12**". **Verificação no repositório (2026-07-16, `origin/main`):**

- **A1-A6 (ADENDOS 1+2 — R13 + R14) já estão em `main`** via **SPEC-008 (PR #11)**. Confirmado por grep ("Pirâmide Elástica", "Cadastro solo/team").
- **A7-A9 (ADENDO 3 — identidade Next Goat) já estão em `main`** via **SPEC-010 (PR #13)**. Confirmado por grep ("NEXT GOAT" em vision-scope, "Arte e assets" em sdd, "Inteligência de mercado" em functional-spec).
- **A10-A12 (ADENDO 4 + Complemento) NÃO estão em `main`** (grep: cadência ainda "ter/qui/sáb" / "3×/semana"; barras ainda "forma/moral/fôlego").

**Decisão (registrar-e-seguir, conforme o protocolo de conflito da própria tarefa):** SPEC-011 **não reaplica A1-A9** (impossível — o texto-alvo já foi substituído). Entrega o que falta: **A10-A12 + o Complemento + Estado atual + passada de consistência** (que verifica A1-A9 presentes). O **diff real desta SPEC é A10-A12 + Complemento**.

---

## Escopo — o que está DENTRO

- [ ] **A10 · `vision-scope.md`** — substituir a cadência "ter/qui/sáb 15h" / "3 jogos/semana" / "3×/semana" por **jogo diário (7/7) às 15h Brasília; liga de 20; temporada de 38 rodadas ≈ 6 semanas** (frase da visão → "um mundo que joga TODO DIA às 15h com ou sem você"; pilar do ritual; motor do mundo; dia de jogo). Bullet da batida vira **batida diária / o Dia do Jogador**. Complemento: bullet de treino ganha o **FOCO do dia** (Físico/Técnico/Tático/Mental; rendimento decrescente); bullet de barras vira **DUAS (Forma e Moral) + stamina só dentro da partida**; R14 milestone 11 = primeiro onze / 16 = elenco completo.
- [ ] **A11 · `functional-spec.md`** — mesma substituição na **capacidade 4 (Dia de jogo)** e na **capacidade 15 (batida → diária / Dia do Jogador)**; "escalação da véspera às 18h" → **"escalação do dia às 12h"**; registrar a **pendência do encaixe da Copa** na capacidade do calendário (cap. 12); adicionar **gate/telemetria de presença POR DIA DA SEMANA** (gate do R4). Complemento: capacidade 7 (barras) → duas + fôlego cortado; capacidade 14 (treino) → FOCO do dia; capacidade 4 → stamina de partida + substituições do técnico NPC (até 5/jogo); capacidade 18 (R14) → vagas humanas até 16 (11 = primeiro onze, 16 = elenco completo).
- [ ] **A12 · `roadmap.md`** — spec de rodadas (1.2) → **rodada diária 15h + encaixe da Copa no escopo**; "18 rodadas" → **38 rodadas (liga de 20)**; spec 2.3 (barras) → duas + stamina de partida + fôlego cortado; spec 2.7 (treino) → FOCO do dia; spec 3.1 (dia de jogo) → diário + substituições; spec 3.7 (batida) → **batida diária**; gate do beta → **presença por dia da semana decide a cadência antes do público**. **Registrar (sem implementar)** o ajuste de tunáveis **`rosterSize` 20→16** como **spec de CÓDIGO futura**.
- [ ] **Consistência (passada final, além da lista literal):** `sdd.md` (cadência "3×/semana" da orquestração → diária; "Rodada de sábado" do gate money-path → "rodada das 15h") e **CLAUDE.md** *charter* ("A visão em uma frase" + pilar "3 jogos/semana" + Stack "job agendado 3×/semana") — porque o step de consistência exige **zero** menção à cadência antiga em **qualquer** doc, e deixá-las tornaria o próprio CLAUDE.md internamente contraditório.
- [ ] **CLAUDE.md — bloco "Estado atual"** — SPECs **001-010 concluídas** (+011 em PR), nome oficial **NEXT GOAT**, **R4 final = jogo diário 7/7 às 15h**, próxima frente = **ajuste de tunáveis (elenco 16) + camada de dados (0.2) + rodadas diárias**.

## Escopo — o que está FORA

- **Código, CI, ADRs, specs antigas** — nada tocado. Os gates TS seguem cobrindo `packages/*`, inalterados.
- **O ajuste de tunáveis `rosterSize` 20→16** — é **spec de CÓDIGO separada** (`world-engine`: `rosterSize`, `positionCounts`, invariante, golden regenerado). Aqui **apenas se registra** no roadmap como spec futura; **não se implementa**.
- **Renomear o repositório** — o codinome interno `camisa-9` fica (regra da própria decisão de identidade).
- **Reaplicar A1-A9** — já em `main` via SPEC-008/010 (ver Nota de baseline).

---

## Arquivos que serão tocados

| Arquivo | Ação | Patch |
|---|---|---|
| `docs/projeto/vision-scope.md` | modificar | A10 + Complemento (cadência, batida diária, treino, barras, R14). |
| `docs/projeto/functional-spec.md` | modificar | A11 + Complemento (cap. 4, 7, 12, 14, 15, 18 + gate de cadência). |
| `docs/projeto/roadmap.md` | modificar | A12 + Complemento (1.2, 2.3, 2.7, 3.1, 3.7, gate do beta + nota do ajuste de tunáveis). |
| `docs/projeto/sdd.md` | modificar | Consistência (orquestração diária; gate money-path sem "sábado"). |
| `CLAUDE.md` | modificar | Consistência do *charter* (cadência) + bloco "Estado atual" (001-011). |
| `specs/SPEC-011-*.md`, `specs/DONE-011-*.md` | criar | Esta SPEC + o DONE. |

---

## Critérios de aceitação

1. **A10-A12 + Complemento aplicados fielmente** — cadência diária (7/7, 15h, liga de 20, 38 rodadas), batida diária / Dia do Jogador, FOCO do treino, duas barras (Forma/Moral), stamina de partida + substituições, elenco 16 — todos presentes conforme o ADENDO 4.
2. **Cadência antiga eliminada** — grep NÃO encontra "3 jogos/semana", "ter/qui/sáb", "3×/semana", "18 rodadas" nem "escalação da véspera às 18h" em nenhum doc de fundação nem no CLAUDE.md (as menções remanescentes de "18 rodadas/90 partidas" só como registro **histórico** de SPEC-002, se houver, ficam claramente marcadas como histórico).
3. **Fôlego não é mais barra diária** — "forma/moral/fôlego" some das barras persistentes; a stamina aparece só **dentro da partida**.
4. **A1-A9 intactos** — R13/R14/identidade/arte/inteligência verificados presentes (não reaplicados, não removidos).
5. **Ajuste de tunáveis registrado, não implementado** — o roadmap cita a spec futura `rosterSize` 20→16; `packages/*` intocado.
6. **CLAUDE.md "Estado atual"** — SPECs 001-010 concluídas; +011 em PR; nome Next Goat; R4 final diário; próxima frente = tunáveis + 0.2 + rodadas.
7. **Docs-only** — `git diff` toca apenas `docs/projeto/*`, `CLAUDE.md`, `specs/*`; ADR-001, código e CI inalterados; gates TS inalterados.

---

## Segurança (se aplicável)

N/A — docs-only. Sem código, sem superfície de rede, sem segredos.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| Reaplicar A1-A9 por engano (conflito/duplicação) | Nota de baseline: A1-A9 verificados em `main`; SPEC-011 só aplica A10-A12 + Complemento. |
| Reescrever a **história** de SPEC-002 ("18 rodadas") como se fosse produto atual | O registro histórico do spike não é falsificado para "38"; a bare "18 rodadas" como cadência-alvo é removida, o que era histórico fica marcado como histórico. Documentado no DONE. |
| Cadência antiga sobrar em doc fora da lista A10-A12 (sdd, charter do CLAUDE.md) | Passada de consistência explícita cobre sdd.md e o charter — senão o CLAUDE.md ficaria contraditório consigo mesmo. Registrado como desvio-por-consistência. |
| Implementar o elenco 16 por engano (mudar `world-engine`) | Fora do escopo: só se **registra** a spec de código futura; `packages/*` não é tocado (critério 5 + 7). |

**Dependências:** SPEC-008 (A1-A6) e SPEC-010 (A7-A9) em `main` são pré-requisito lógico. Ratifica o `clubsPerLeague: 20` da **SPEC-009**. Desbloqueia a futura **spec de código do ajuste de tunáveis** (elenco 16) e a **spec de rodadas diárias** (1.2).

---

## Notas de implementação

- **Patches como substituição, não append:** A10-A12 **substituem** o texto que a SPEC-008 escreveu (cadência ter/qui/sáb, batida semanal, escalação da véspera). É substituição **prevista** pela própria tarefa — não conflito.
- **"18 rodadas" vira 38 (liga de 20)** onde for cadência/produto; onde for registro histórico de SPEC-002 (o spike 1 liga/10 clubes), preserva-se a honestidade do registro (não se reescreve o passado para 38).
- **Não reaplicar A1-A9** (já em `main`): verificar por grep antes de qualquer edição.
- **Elenco 16 = decisão de produto ratificada**; a **implementação** (tunável no `world-engine`) é spec de código futura — aqui só documentada.
- **CLAUDE.md:** além do bloco "Estado atual" (step 4 da tarefa), o *charter* recebe a correção de cadência por consistência (step 5 exige zero "ter/qui/sáb"); o resto do arquivo fica intocado.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (A10-A12 + Complemento + Estado atual; A1-A9 fora — já em `main`; código do elenco 16 fora — spec futura)
- [x] Arquivos listados corretos
- [x] Mudanças de schema documentadas (N/A — docs-only)
- [x] Critérios de aceitação testáveis (grep + diff)
- [x] Riscos avaliados (reaplicação de A1-A9 e "18 rodadas histórica" são os riscos centrais — mitigados)
- [x] Appetite razoável (meio dia)
- [x] **Aprovada** — founder (docs-only, continuação SPEC-007/008/010)

---

*SPEC-011 — método H1VE. Continuação direta da SPEC-007/008/010; docs-only; ADR-001 não se aplica. A1-A9 já em `main` (SPEC-008 #11, SPEC-010 #13); esta SPEC entrega o ADENDO 4 + Complemento (A10-A12) + Estado atual.*
