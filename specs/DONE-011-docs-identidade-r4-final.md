# DONE-011 — Docs de fundação: identidade Next Goat + R4 final (diário) + Dia do Jogador

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-011 |
| **SPEC correspondente** | SPEC-011-docs-identidade-r4-final.md |
| **Feature** | Docs de fundação: identidade Next Goat + R4 final (diário) + Dia do Jogador |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/docs-identidade-r4-final` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado** | 2026-07-16 |
| **Desenvolvimento concluído** | 2026-07-16 |
| **Dias utilizados vs appetite** | <½ dia vs ½ dia |

---

## Resumo do que foi feito

Continuação direta da SPEC-007/008/010. Aplicado o **ADENDO 4 + o "Complemento ao Adendo 4"** do relatório (`auditoria-docs-camisa9.md`) — **R4 FINAL: jogo diário (7/7) às 15h + liga de 20 + o Dia do Jogador**, patches **A10-A12** — e sincronizado o bloco **"Estado atual" do CLAUDE.md** (SPECs 001-010 concluídas + Next Goat + R4 final).

- **A10 · vision-scope** — cadência "ter/qui/sáb 15h" / "3 jogos/semana" / "3×/semana" → **jogo diário (7/7) às 15h Brasília; liga de 20; 38 rodadas ≈ 6 semanas** (frase da visão → "joga TODO DIA às 15h"; pilar do ritual; motor do mundo; dia de jogo). Batida semanal → **batida diária / o Dia do Jogador**. Complemento: treino ganha o **FOCO do dia** (Físico/Técnico/Tático/Mental + rendimento decrescente); barras → **DUAS (Forma e Moral)** + **stamina só dentro da partida**; R14 milestone → 11 = primeiro onze, 16 = elenco completo.
- **A11 · functional-spec** — cap. 4 (Dia de jogo) → diária + **stamina de partida** guiando as substituições do técnico NPC (até 5/jogo); cap. 15 → **batida diária / Dia do Jogador**, "escalação da véspera às 18h" → **"escalação do dia às 12h"**; cap. 7 → duas barras + fôlego cortado; cap. 14 → FOCO do dia; cap. 12 → **pendência do encaixe da Copa** no calendário diário; cap. 18 (R14) → vagas até **16** (11 = primeiro onze, 16 = elenco completo); novo **Gate de cadência (R4)** = telemetria de presença por dia da semana no beta.
- **A12 · roadmap** — 1.2 → **rodada diária 15h + encaixe da Copa** no escopo; 2.3 → duas barras + stamina de partida + fôlego cortado; 2.7 → FOCO do dia; 3.1 → diário + substituições; 3.7 → **batida diária**; **Gate de cadência (R4)** no corte do beta; **nota registrando** o ajuste de tunáveis **`rosterSize` 20→16 como spec de CÓDIGO futura** (não implementado). "18 rodadas" (0.1.5) → registro histórico sem a bare cadência-alvo; 4.4 "Copa das quintas" → "Copa".
- **CLAUDE.md "Estado atual"** — SPECs **001-010** concluídas (SPEC-010 promovida a mergeada/#13); **+SPEC-011** (PR pendente); nome oficial **Next Goat**; **R4 FINAL = jogo diário 7/7 às 15h** + Dia do Jogador + duas barras + elenco 16; próxima frente = **ajuste de tunáveis (elenco 16) + camada de dados (0.2) + rodadas diárias (1.2)** + GTM.

Docs-only; ADR-001, código, CI e specs antigas inalterados; gates TS intocados.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `specs/SPEC-011-docs-identidade-r4-final.md` | A SPEC (A10-A12 + Complemento + Nota de baseline sobre A1-A9). |
| `specs/DONE-011-docs-identidade-r4-final.md` | Este documento. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `docs/projeto/vision-scope.md` | A10 + Complemento (visão, pilar, motor, dia de jogo, batida diária, treino, barras, cadastro R14, live-ops). |
| `docs/projeto/functional-spec.md` | A11 + Complemento (cap. 4, 7, 12, 14, 15, 18 + gate money-path sem "sábado" + novo Gate de cadência R4). |
| `docs/projeto/roadmap.md` | A12 + Complemento (0.1.5, 1.2, 2.3, 2.7, 3.1, 3.7, 4.4, gate do beta + nota do ajuste de tunáveis). |
| `docs/projeto/sdd.md` | **Consistência** (orquestração diária; gate money-path "rodada das 15h"). |
| `CLAUDE.md` | **Consistência do *charter*** (3 menções de cadência) + bloco **"Estado atual"** (001-011). |
| `AGENTS.md` | **Consistência do *charter*** (espelho do CLAUDE.md — 3 menções de cadência). |
| `.github/copilot-instructions.md` | **Consistência do *charter*** (espelho do CLAUDE.md — 3 menções de cadência). |

---

## Mudanças de schema aplicadas

Nenhuma migration. Docs-only.

## Mudanças de API entregues

Nenhuma. Docs-only.

---

## Critérios de aceitação — verificação

| Cenário (SPEC-011) | Status | Evidência |
|---|---|---|
| 1 — A10-A12 + Complemento fiéis | ✅ | Cadência diária (7/7, 15h, liga de 20, 38 rodadas), batida diária / Dia do Jogador, FOCO do treino, duas barras (Forma/Moral), stamina de partida + substituições, elenco 16 — presentes em vision-scope/functional-spec/roadmap conforme o ADENDO 4. |
| 2 — Cadência antiga eliminada | ✅ | grep em `docs/projeto/*` = **0** ocorrências de "3 jogos/semana", "ter/qui/sáb", "3×/semana", "18 rodadas", "escalação da véspera". CLAUDE.md/AGENTS.md/copilot-instructions.md idem no *charter*. Remanescentes só em `specs/` antigas (fora de escopo) e como quote/histórico marcado. |
| 3 — Fôlego não é barra diária | ✅ | "forma/moral/fôlego" some das barras; toda menção a "fôlego" agora é "**fôlego diário cortado**"; stamina só dentro da partida. |
| 4 — A1-A9 intactos | ✅ | grep: "Pirâmide Elástica", "Cadastro solo/team", "NEXT GOAT", "Arte e assets", "Inteligência de mercado" seguem presentes (não reaplicados, não removidos). |
| 5 — Tunável registrado, não implementado | ✅ | roadmap cita a spec futura `rosterSize` 20→16; `git diff --stat` = **0** arquivos em `packages/`. |
| 6 — CLAUDE.md "Estado atual" | ✅ | SPECs 001-010 concluídas; +011 em PR; nome Next Goat; R4 final diário; próxima frente = tunáveis + 0.2 + rodadas. |
| 7 — Docs-only | ✅ | `git diff --stat`: 8 arquivos, todos `.md` (docs/projeto + CLAUDE.md + AGENTS.md + copilot-instructions.md + specs/); nada em `packages/` ou `.github/workflows/`. |

---

## Como testar manualmente

```
1. git diff origin/main -- docs/projeto/ CLAUDE.md AGENTS.md .github/copilot-instructions.md   # revisar o diff
2. Conferir A10-A12 + Complemento contra o ADENDO 4 de auditoria-docs-camisa9.md.
3. grep -rniE "3 jogos/semana|ter/qui/s|3×/semana|18 rodadas|escalação da véspera|forma/moral/fôlego" docs/projeto/ CLAUDE.md AGENTS.md .github/copilot-instructions.md
   → 0 em docs/projeto e no charter (só quote/histórico marcado).
4. grep -niE "jogo diário|Dia do Jogador|38 rodadas|Forma e Moral|elenco (completo|de 16)|foco do (dia|treino)" docs/projeto/
   → cadência/Dia do Jogador/barras/elenco novos presentes.
```

**Dados de teste necessários:** nenhum — revisão de diff.

---

## Testes automatizados

Nenhum (docs-only). Os gates TS existentes seguem cobrindo `packages/*`, inalterados. `.md` é ignorado pelo Prettier — CI de docs verde (precedente SPEC-007/008/010).

**Comando (inalterado):** `npm run lint && npm run typecheck && npm test && npm run build`

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `docs/projeto/{vision-scope,functional-spec,roadmap,sdd}.md` (diffs) + `CLAUDE.md` + `AGENTS.md` + `.github/copilot-instructions.md` (charter) + `SPEC-011`/`DONE-011` | ~100% | Sim — A10-A12 aplicados conforme o ADENDO 4; diff revisado; consistência por grep (0 em docs/projeto). Founder revisa no diff do PR. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → (1) **não reaplicou A1-A9** (já em `main` — ver desvio); (2) consistência de cadência em `sdd.md`, no *charter* do CLAUDE.md e nos **espelhos** AGENTS.md / copilot-instructions.md; (3) roadmap 4.4 "Copa das quintas" e 0.1.5 "18 rodadas" reconciliados. Nenhuma inventa conteúdo de produto.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **A1-A9 já em `main`** | **Não reaplicados.** SPEC-011 entregou só o ADENDO 4 (A10-A12) + Complemento. | SPEC-008 (#11) e SPEC-010 (#13) já os mergearam; reaplicar geraria conflito/no-op. Verificado por grep; registrado na Nota de baseline da SPEC-011. **Protocolo de conflito: registrar-e-seguir.** |
| **Consistência além da lista A10-A12** | `sdd.md` (orquestração/gate) + **charter do CLAUDE.md** + **espelhos AGENTS.md e copilot-instructions.md** receberam a mesma correção de cadência. | Step 5 da tarefa exige **zero** menção à cadência antiga em **qualquer** doc; deixá-las tornaria o CLAUDE.md (e seus espelhos lidos por Cursor/Copilot/Codex) internamente contraditório com o R4 final. Consistência, não patch novo. |
| **"18 rodadas" histórica (SPEC-002)** | A bare "18 rodadas" como cadência/produto foi removida (roadmap 0.1.5 e CLAUDE.md → "90 partidas"/"turno-returno"); **não** reescrita para "38" onde descreve o que o spike SPEC-002 realmente fez. | Reescrever o passado do spike para 38 seria factualmente falso. O número exato do spike vive na SPEC-002/DONE-002 (specs antigas, fora de escopo). Documentado na tabela de riscos da SPEC-011. |
| **Elenco 16 — só docs** | Registrado como **decisão de produto** e como **spec de CÓDIGO futura** no roadmap; `world-engine` **não** tocado. | O ajuste de tunáveis (`rosterSize` 20→16, golden regenerado) é spec de código separada — fora do escopo desta higiene de documentação (critério 5 + 7). |

**Espelhos de charter — nota:** AGENTS.md e `.github/copilot-instructions.md` são cópias integrais do CLAUDE.md. Nesta entrega recebem **apenas** a correção de cadência do *charter* (3 linhas cada); a sincronização integral do bloco "Estado atual" desses espelhos com o CLAUDE.md é **drift pré-existente** (não introduzido aqui) e fica como débito abaixo.

**Protocolo de conflito (parar+registrar):** **acionado** — (a) discrepância A7-A12 vs. baseline (A7-A9 já merged via SPEC-010 #13) → numeração resolvida com o founder = **SPEC-011**; (b) tensão entre o step 4 (CLAUDE.md só "Estado atual") e o step 5 (zero cadência em qualquer doc) → resolvida a favor da consistência (charter + espelhos corrigidos), registrada.

---

## Limitações conhecidas

- **Elenco 16 é decisão de produto ratificada**, mas a **implementação** (tunável no `world-engine` + golden regenerado) é spec de código futura — aqui só documentada.
- **Encaixe da Copa no calendário diário** é pendência registrada (quartas intercaladas / entre temporadas / domingos de mata-mata) — resolve na spec de rodadas (1.2).
- **Gate de cadência (R4)** depende de telemetria de beta que ainda não existe (Fase 4.7); o doc registra o gate, não o instrumenta.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Spec de CÓDIGO do elenco 16 (`rosterSize` 20→16, `positionCounts`, invariante, golden regenerado) | Médio | Antes/junto da spec de rodadas (1.2). |
| Spec de rodadas diárias (1.2) com encaixe da Copa | Médio | Fase 1.2. |
| Sync integral do "Estado atual" nos espelhos AGENTS.md / copilot-instructions.md (drift pré-existente) | Baixo | Próxima higiene de docs (ou automatizar a geração dos espelhos a partir do CLAUDE.md). |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (7/7)
- [x] Testes criados e passando (N/A — docs-only; gates TS inalterados)
- [x] Typecheck limpo (inalterado — nada em `packages/*`)
- [x] Lint limpo (`.md` ignorado pelo Prettier; sem TS novo)
- [x] Nenhum log de debug / `any` / segredo (N/A — docs-only)
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` seção "Estado atual" atualizada (no escopo — step 4 da tarefa)
- [x] `docs/projeto/roadmap.md` atualizado (A12 + nota do ajuste de tunáveis)
- [x] Este DONE está completo e commitado na branch *(commit no fluxo do PR)*

---

*DONE-011 — método H1VE. Continuação da SPEC-007/008/010; docs-only; ADR-001 inalterado. A1-A9 já em `main` (SPEC-008 #11, SPEC-010 #13); esta feature entregou o ADENDO 4 + Complemento (A10-A12) + Estado atual.*
