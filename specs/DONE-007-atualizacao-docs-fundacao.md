# DONE-007 — Atualização dos docs de fundação (v1.4 + Steam-only + SPEC-006)

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-007 |
| **SPEC correspondente** | SPEC-007-atualizacao-docs-fundacao.md |
| **Feature** | Atualização dos docs de fundação (v1.4 + Steam-only + SPEC-006) |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/atualizacao-docs-fundacao` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado** | 2026-07-15 |
| **Desenvolvimento concluído** | 2026-07-15 |
| **Dias utilizados vs appetite** | <1 dia vs 1 dia |

---

## Resumo do que foi feito

Aplicados os **16 patches** do relatório de auditoria (`auditoria-docs-camisa9.md`, 15/07) aos quatro docs de fundação, de forma **cirúrgica** (o relatório como fonte de verdade; nenhuma reescrita além do pedido): naming G1 nos 4 títulos → `— Camisa 9 (codinome · método H1VE)`; linguagem de produto atualizada para a **SPEC-006** (modo mini = faixa compacta ancorada, postura A); v1.4 adicionada (treino com banking, batida semanal, salário & estilo de vida); **Steam-only** (canal único, F2P + compra "Carreira", instalador próprio deferido); trilha GTM/arte e as fases de monetização/social/moderação/telemetria no roadmap; corte do beta ratificado (P6). Estilo/formatação preservados (tabelas, ✅/⚠️/❌, `[SUPOSIÇÃO — revisar]`), conteúdo não-mencionado intacto, notas de SPEC-003/005/006 não duplicadas. Passada de consistência final feita — dois resíduos de linguagem que o relatório não enumerou foram alinhados com o vocabulário ratificado do próprio relatório (ver Desvios). **Nenhum conflito acionou o protocolo de parada.** Docs-only; ADR-001, código, CI e specs antigas inalterados.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `specs/SPEC-007-atualizacao-docs-fundacao.md` | A SPEC desta feature (16 patches enumerados). |
| `specs/DONE-007-atualizacao-docs-fundacao.md` | Este documento. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `docs/projeto/vision-scope.md` | V1 (título), V2 (pilar presença→SPEC-006), V3 (3 bullets v1.4), V4 (seção "Modelo de negócio"), V5 (rebaixa `[SUPOSIÇÃO]`) + fix de consistência (3 níveis "No escopo"). |
| `docs/projeto/functional-spec.md` | G1 (título), F1 (capacidade 3→SPEC-006), F2 (capacidades 14-18). |
| `docs/projeto/sdd.md` | S1 (título), S2 (Distribuição→Steam-only), S3 (widget→"Modo mini RESOLVIDO"), S4 (D6 + D9/D10), S5 (R4 resolvido + nota R3). |
| `docs/projeto/roadmap.md` | R1 (título), R2 (Trilha GTM), R3 (Fases 2/3/4: 2.6-2.8, 3.7, 4.5-4.7), R4 (corte do beta ratificado) + fix de consistência (3.4). |

> **`CLAUDE.md` "Estado atual" — NÃO atualizado (desvio consciente):** o template/ritual pede essa atualização, mas o `CLAUDE.md` fica no **raiz do repo**, fora do escopo de diretório desta tarefa (`docs/projeto/` + `specs/`). Deixado intencionalmente para o founder ou uma tarefa fora-de-escopo. Ver Desvios.

---

## Mudanças de schema aplicadas

Nenhuma migration neste DONE. Docs-only.

---

## Mudanças de API entregues

Nenhuma mudança de API neste DONE. Docs-only.

---

## Critérios de aceitação — verificação

| Cenário (SPEC-007) | Status | Evidência |
|---|---|---|
| 1 — Patches aplicados fielmente | ✅ | Os 16 patches (+ G1) aplicados por `Edit` cirúrgico; diff `+72/-18` nas 4 áreas patchadas; texto conforme o relatório. |
| 2 — Naming (G1) nos 4 títulos | ✅ | Os 4 títulos = `— Camisa 9 (codinome · método H1VE)`; **zero** "Nexus Flow" restante nos 4 docs (grep); repo/packages/README/CLAUDE.md intactos. |
| 3 — Cirúrgico, não reescrita | ✅ | Diff toca só as regiões dos patches; nenhum parágrafo não-mencionado reformatado; blockquotes SPEC-003/005/006 do roadmap não duplicadas. |
| 4 — Consistência semântica | ✅ (com 2 alinhamentos) | "instalador próprio" só em contexto DEFERIDO; "waiting list" = mecânica de jogo (retida); nenhum "modo mini DENTRO da taskbar"/~130px sobrou. Dois resíduos terços alinhados (ver Desvios). |
| 5 — Conflito não previsto | ✅ (não acionado) | Todos os 16 patches casaram com o texto esperado; o protocolo de parada **não** foi necessário. |
| 6 — Gates | ✅ | Só `.md` mudou; `.prettierignore` cobre `spikes/` **e** `**/*.md`; nenhum arquivo não-`.md` alterado; typecheck/test/build (sobre `packages/*`) inalterados. `prettier --check` nos meus arquivos: limpo. |

---

## Como testar manualmente

```
1. git diff origin/main -- docs/projeto/   # revisar o diff cirúrgico dos 4 docs
2. Conferir cada patch contra auditoria-docs-camisa9.md (G1; V1-V5; F1-F2; S1-S5; R1-R4).
3. grep -niE "nexus flow|na taskbar|instalador próprio" docs/projeto/
   → "Nexus Flow": 0; "na taskbar": só contexto histórico (blockquote SPEC-006, risco R4
     resolvido, fato do TBH); "instalador próprio": só DEFERIDO.
4. Ler os 4 títulos: todos "— Camisa 9 (codinome · método H1VE)".
```

**Dados de teste necessários:** nenhum — revisão de diff.

---

## Testes automatizados

Nenhum teste automatizado (docs-only). Os gates TS existentes seguem cobrindo `packages/*`, inalterados por esta feature.

**Comando para rodar (inalterados):**
```bash
npm run lint && npm run typecheck && npm test && npm run build
```

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `docs/projeto/{vision-scope,functional-spec,sdd,roadmap}.md` (diffs) + `SPEC-007`/`DONE-007` | ~100% | Sim — cada patch aplicado do relatório verbatim; diff revisado linha a linha; passada de consistência por grep; founder revisa no diff do PR. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → **duas** correções de consistência (Cenário 4 / step 5), documentadas abaixo. Nenhuma inventa conteúdo — ambas usam o vocabulário já ratificado pelo relatório.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **Título da functional-spec (G1)** | Renomeado como os outros 3, embora o relatório não lhe dê um número próprio (só V1/S1/R1). | A instrução G1 diz "nos **4** docs"; a functional-spec é o 4º. |
| **Fix de consistência #1 (step 5)** | vision-scope "No escopo", cadeia "3 níveis": `modo mini NA taskbar` → `modo mini ancorado à taskbar`. | O relatório patchou o **pilar** (V2) e a capacidade da functional-spec (F1), mas deixou a cadeia gêmea da vision-scope com a linguagem stale. Alinhado com o keyword ratificado ("ancorada à taskbar") — **não** é prosa inventada; é o step-5 de consistência. |
| **Fix de consistência #2 (step 5)** | roadmap 3.4, cadeia "3 níveis": `mini na taskbar` → `mini ancorada à taskbar`. | Mesmo motivo; resíduo terço não enumerado, alinhado ao vocabulário ratificado. |
| **R4 (roadmap) — "Trilha G" → "Trilha GTM"** | O texto do relatório dizia "Trilha G completas"; escrevi "Trilha GTM completas". | A seção criada por R2 chama-se "**Trilha GTM**"; a referência foi alinhada ao nome real da seção. |
| **S5 — R4 sem strikethrough** | R4 adaptado para "**RESOLVIDO (SPEC-006)**" **sem** `~~...~~`. | Regra explícita da tarefa: o SDD não usa strikethrough; manter a linha legível preservando o sentido. |
| **`CLAUDE.md` "Estado atual" não atualizado** | Pulado de propósito. | Fora do escopo de diretório desta tarefa (`docs/projeto/` + `specs/`). O founder decide se atualiza à parte. |

**Protocolo de conflito (parar+registrar):** **não acionado** — nenhum patch encontrou texto atual que o relatório não previsse. Os únicos resíduos foram os dois acima, encontrados na passada de consistência (step 5), não em conflito de patch.

---

## Limitações conhecidas

- **Docs de referência apenas** — os novos itens de roadmap (Trilha GTM G.1-G.5; 2.6-2.8; 3.7; 4.5-4.7) e as capacidades 14-18 são **direção**, não SPECs executáveis; cada um vira a sua própria SPEC quando priorizado no board.
- **`CLAUDE.md` "Estado atual"** fica fora de sincronia até o founder atualizá-lo (desvio consciente acima).
- **v1.4 aplicada conforme o relatório** — se o design doc v1.4 tiver nuances além do que o relatório destilou, ficam para uma auditoria posterior.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Atualizar o "Estado atual" do `CLAUDE.md` para citar a SPEC-007 | Baixo | Próxima tarefa que possa tocar o raiz do repo (fora deste escopo docs-only). |
| Criar as SPECs referenciadas (GTM, monetização, social, moderação, telemetria) | Médio | Quando cada item for priorizado no board. |
| Revisão v1.4 completa (design doc vs. docs) além do relatório | Baixo | Oportunístico. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (6/6; Cenário 4 com 2 alinhamentos documentados)
- [x] Testes criados e passando (N/A — docs-only; gates TS inalterados)
- [x] Typecheck limpo (inalterado — nada em `packages/*` mudou)
- [x] Lint limpo (`.md` ignorado pelo Prettier; sem TS novo p/ ESLint)
- [x] Nenhum log de debug em código de produção (N/A — docs-only)
- [x] Nenhum tipo `any` introduzido (N/A — docs-only)
- [x] Nenhum segredo hardcoded (N/A)
- [x] AI Declaration preenchida acima
- [ ] `CLAUDE.md` "Estado atual" atualizado — **intencionalmente pulado** (fora do escopo de diretório; ver Desvios)
- [x] `docs/projeto/roadmap.md` atualizado (R1-R4)
- [x] Este DONE está completo e commitado na branch

---

*DONE-007 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Docs-only; ADR-001 inalterado.*
