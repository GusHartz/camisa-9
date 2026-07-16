# DONE-008 — Docs de fundação: R13 (Pirâmide Elástica) + R14 (código de time)

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-008 |
| **SPEC correspondente** | SPEC-008-docs-r13-r14.md |
| **Feature** | Docs de fundação: R13 (Pirâmide Elástica) + R14 (código de time) |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/docs-r13-r14` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado** | 2026-07-15 |
| **Desenvolvimento concluído** | 2026-07-15 |
| **Dias utilizados vs appetite** | <½ dia vs ½ dia |

---

## Resumo do que foi feito

Continuação direta da SPEC-007. Aplicados os **6 patches A1-A6** dos ADENDOS 1 e 2 do relatório (`auditoria-docs-camisa9.md`) aos quatro docs de fundação, de forma **cirúrgica**: **R13 — Pirâmide Elástica** (o mundo cresce por ramificação 2× por nível; expansão disparada a ~70% de ocupação humana da base, só na virada de temporada — **revogando o gatilho "pool 100% humano"**; motor de temporada ciente de grupos paralelos) e **R14 — Cadastro solo/team com código de time** (bifurcação solo/team; código coloca amigos direto no elenco; jogável desde o humano nº 1; **absorve o takeover de quinteto**, puxado da F2 para a F1/beta). As substituições A5 (capacidade 18) e A6 (spec 2.6) trocaram o conteúdo que a SPEC-007 acabara de criar ("Convite para vaga do clube") — **substituição prevista, não conflito**. Também sincronizado o bloco **"Estado atual" do CLAUDE.md** (fechando o desvio consciente do DONE-007): SPECs 001-008, F0 técnico completo, Steam-only, R13/R14, próxima frente = Trilha GTM (G.1) + Fase 0.2. Passada de consistência (step 5) feita; **nenhum conflito acionou o protocolo de parada**. Docs-only; ADR-001, código, CI e specs antigas inalterados.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `specs/SPEC-008-docs-r13-r14.md` | A SPEC desta feature (patches A1-A6 enumerados). |
| `specs/DONE-008-docs-r13-r14.md` | Este documento. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `docs/projeto/vision-scope.md` | A1 (Pirâmide Elástica inline no bullet de entrada), A4 (novo bullet "Cadastro solo/team") + consistência (remove takeover da linha F2). |
| `docs/projeto/functional-spec.md` | A2 (capacidade 2 → Pirâmide Elástica), A5 (capacidade 18 → Cadastro solo/team R14) + consistência (remove takeover da linha "Fora do beta F2"). |
| `docs/projeto/roadmap.md` | A3 (spec 1.2 +grupos paralelos; spec 2.2 → Pirâmide Elástica), A6 (spec 2.6 → Cadastro solo/team R14; spec 5.4 remove takeover). |
| `CLAUDE.md` | **Apenas** o bloco "Estado atual": data→SPEC-008; Fase F0 completa; SPEC-006 promovida a Concluído (PR #9); +SPEC-007 (PR #10); +SPEC-008 (PR pendente); Próximo = Trilha GTM G.1 + Fase 0.2. |

---

## Mudanças de schema aplicadas

Nenhuma migration neste DONE. Docs-only.

---

## Mudanças de API entregues

Nenhuma mudança de API neste DONE. Docs-only.

---

## Critérios de aceitação — verificação

| Cenário (SPEC-008) | Status | Evidência |
|---|---|---|
| 1 — A1-A6 aplicados fielmente | ✅ | 6 patches por `Edit` cirúrgico; diff `+22/-15`; texto conforme os ADENDOS. |
| 2 — Substituições previstas (A5/A6) | ✅ | Capacidade 18 e spec 2.6 (criadas na SPEC-007) trocadas pelo conteúdo R14 — sem duplicar, sem acionar parada. |
| 3 — A3 completo (2 partes) | ✅ | Nova spec 2.2 (Pirâmide) **e** acréscimo à entrega da spec 1.2 ("grupos paralelos — fundação do R13") — ambos no diff. |
| 4 — CLAUDE.md "Estado atual" | ✅ | Só o bloco mudou; reflete SPECs 001-008, F0 completo, Steam-only, R13/R14, próxima frente (G.1 + 0.2). |
| 5 — Consistência | ✅ | grep: nenhum "pool 100% humano" como gatilho (só o registro "revoga o gatilho" no CLAUDE.md); "takeover" só em "absorve o takeover" (A4/A5 + registro). Standalone F2 removidos (roadmap 5.4 + 2 gêmeas). |
| 6 — Conflito imprevisto | ✅ (não acionado) | Todos os patches casaram com o texto esperado; protocolo de parada não necessário. |

---

## Como testar manualmente

```
1. git diff origin/main -- docs/projeto/ CLAUDE.md   # revisar o diff cirúrgico
2. Conferir A1-A6 contra os ADENDOS 1/2 de auditoria-docs-camisa9.md.
3. grep -niE "pool 100% humano|takeover" docs/projeto/ CLAUDE.md
   → "pool 100% humano": só o registro "revoga o gatilho" (CLAUDE.md);
     "takeover": só "absorve o takeover" (contexto histórico/absorvido).
4. Conferir capacidade 18 (functional-spec) e spec 2.6 (roadmap) = Cadastro solo/team R14.
5. Conferir spec 1.2 (roadmap) tem "grupos paralelos" e spec 2.2 = Pirâmide Elástica.
```

**Dados de teste necessários:** nenhum — revisão de diff.

---

## Testes automatizados

Nenhum teste automatizado (docs-only). Os gates TS existentes seguem cobrindo `packages/*`, inalterados.

**Comando para rodar (inalterados):**
```bash
npm run lint && npm run typecheck && npm test && npm run build
```

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `docs/projeto/{vision-scope,functional-spec,roadmap}.md` (diffs) + `CLAUDE.md` (bloco "Estado atual") + `SPEC-008`/`DONE-008` | ~100% | Sim — cada patch aplicado do relatório verbatim; diff revisado linha a linha; consistência por grep. Founder revisa no diff do PR. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → duas remoções de consistência (step 5) e um ajuste mecânico, documentados abaixo. Nenhuma inventa conteúdo.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **Consistência: takeover nas listas F2 gêmeas** | Removido "takeover de clube por quinteto" de **vision-scope** ("F2 comprometida") e **functional-spec** ("Fora do beta F2"). | A6 remove o takeover da roadmap 5.4; step 5 manda não deixar takeover como feature própria fora de contexto histórico. As duas listas gêmeas não têm número de patch próprio — mesma remoção do A6, por paridade. O "absorve o takeover" (A4/A5) fica como contexto histórico. |
| **A1 — casamento com o ponto final** | O trecho substituído foi casado **com** o ponto final ("...divisão de entrada.") para o texto novo (que termina em ".") não gerar ponto duplo antes de "Vaga congelada...". | Fidelidade mecânica — evita `..` no meio da frase. Conteúdo idêntico ao patch. |
| **CLAUDE.md "Estado atual" atualizado** | Atualizado (desta vez DENTRO do escopo). | Fecha o desvio consciente registrado no DONE-007 — a tarefa o trouxe explicitamente para o escopo. |

**Protocolo de conflito (parar+registrar):** **não acionado** — nenhum patch encontrou texto que o relatório não previsse. As substituições A5/A6 (do conteúdo da SPEC-007) eram **previstas** pela tarefa, não conflitos.

---

## Limitações conhecidas

- **Docs de referência apenas** — a Pirâmide Elástica (2.2) e o cadastro solo/team (2.6) descrevem a direção; os **números exatos** (razão de ramificação, limiar exato de ocupação, formato do playoff, expiração do código) ficam para cada SPEC executável quando priorizada.
- **Motor de temporada ciente de grupos paralelos** (spec 1.2) é agora um requisito de fundação do R13 — a SPEC de 1.2 precisará desenhá-lo.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| SPEC executável da Pirâmide Elástica (números de ramificação/limiar/playoff) | Médio | Quando a Fase 2.2 for priorizada. |
| SPEC executável do Cadastro solo/team + código de time (expiração, tranca, NPC fixo) | Médio | Quando a Fase 2.6 for priorizada. |
| Motor de temporada (1.2) ciente de grupos paralelos | Médio | Na SPEC da 1.2. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (6/6)
- [x] Testes criados e passando (N/A — docs-only; gates TS inalterados)
- [x] Typecheck limpo (inalterado — nada em `packages/*` mudou)
- [x] Lint limpo (`.md` ignorado pelo Prettier; sem TS novo p/ ESLint)
- [x] Nenhum log de debug em código de produção (N/A — docs-only)
- [x] Nenhum tipo `any` introduzido (N/A — docs-only)
- [x] Nenhum segredo hardcoded (N/A)
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` seção "Estado atual" atualizada (**desta vez no escopo**)
- [x] `docs/projeto/roadmap.md` atualizado (A3, A6)
- [x] Este DONE está completo e commitado na branch

---

*DONE-008 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Continuação da SPEC-007; docs-only; ADR-001 inalterado.*
