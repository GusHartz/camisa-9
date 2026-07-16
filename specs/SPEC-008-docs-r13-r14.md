# SPEC-008 — Docs de fundação: R13 (Pirâmide Elástica) + R14 (código de time)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-008 |
| **Feature** | Docs de fundação: R13 (Pirâmide Elástica) + R14 (código de time) |
| **Slug** | docs-r13-r14 |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Manutenção de docs de fundação (continuação direta da SPEC-007) — aplica os adendos R13/R14 da auditoria. |
| **Appetite** | **meio dia** (docs-only, cirúrgico). |
| **Prioridade** | MEDIUM |
| **Criada em** | 2026-07-15 |
| **Aprovada em** | 2026-07-15 |
| **Aprovada por** | Gustavo Hartz (founder/architect) — comissionada diretamente com os patches A1-A6 |
| **Status** | Aprovada |

---

## Objetivo

Aplicar os **6 patches (A1-A6)** dos ADENDOS 1 e 2 do relatório de auditoria (`auditoria-docs-camisa9.md`) aos quatro docs de fundação e **sincronizar o bloco "Estado atual" do CLAUDE.md**. Os adendos ratificam duas decisões novas do founder (15/07): **R13 — Pirâmide Elástica** (o mundo cresce por ramificação 2× por nível, expansão a ~70% de ocupação humana da base, revogando o gatilho "pool 100% humano") e **R14 — Cadastro solo/team com código de time** (bifurcação solo/team; código coloca amigos direto no elenco; absorve o takeover de quinteto). Edição **cirúrgica** — o relatório é a fonte de verdade.

---

## Contexto e motivação

Continuação direta da SPEC-007 (que sincronizou os docs com v1.4 + Steam-only + SPEC-006, mergeada no PR #10). Após o fechamento da auditoria, o founder bateu dois martelos novos (R13, R14) e o relatório ganhou os ADENDOS 1 e 2 com patches prontos (A1-A6). Esta SPEC os aplica e ainda fecha o desvio consciente que o DONE-007 registrou: **atualizar o "Estado atual" do CLAUDE.md** (desta vez DENTRO do escopo). Não desbloqueia código — é higiene documental para que a camada de dados (0.2) e as SPECs de entrada humana (Fase 2) partam da Pirâmide Elástica e do cadastro solo/team corretos.

---

## Escopo — o que está DENTRO

**Os 6 patches A1-A6 + a atualização do "Estado atual" do CLAUDE.md + a passada de consistência (step 5).**

**R13 — Pirâmide Elástica:**
- [ ] **A1 · vision-scope.md** — no bullet "Entrada por substituição + waiting list real", trocar "pool 100% humano dispara criação automática de times na divisão de entrada" pelo texto da Pirâmide Elástica.
- [ ] **A2 · functional-spec.md** — capacidade 2, trocar o bullet "Pool 100% humano … dispara criação automática de times na divisão de entrada" pelo bullet **Pirâmide Elástica**.
- [ ] **A3 · roadmap.md** — spec 2.2 → **Pirâmide Elástica (expansão do mundo)**; **e** acréscimo à entrega da spec 1.2 (motor de temporada) → "calendário e promoção/rebaixamento cientes de grupos paralelos (fundação do R13)".

**R14 — Cadastro solo/team com código de time:**
- [ ] **A4 · vision-scope.md** — após o bullet da Pirâmide Elástica (A1), adicionar o bullet **Cadastro solo/team com código de time**.
- [ ] **A5 · functional-spec.md** — **substituir** o conteúdo da capacidade 18 (que a SPEC-007 criou como "Convite para vaga do clube") pelo novo **18. Cadastro solo/team + código de time (R14)**. *(Substituição prevista, não conflito.)*
- [ ] **A6 · roadmap.md** — **substituir** a spec 2.6 (Convite para vaga do clube, criada pela SPEC-007) por **Cadastro solo/team + código de time (R14)**; **e** remover o *takeover de quinteto* da spec 5.4 (absorvido pela 2.6).

**Sincronização + consistência:**
- [ ] **CLAUDE.md "Estado atual"** — atualizar (cirúrgico só nesse bloco): SPECs 001-008, F0 técnico completo, Steam-only, R13/R14 ratificados, próxima frente = Trilha GTM (G.1) + Fase 0.2.
- [ ] **Consistência (step 5)** — garantir que nenhum "pool 100% humano" como gatilho de expansão e nenhum "takeover de quinteto" como **feature própria** sobrem fora de contexto histórico. Inclui remover o *takeover de quinteto* das listas F2 gêmeas que A6 não enumera (vision-scope "F2 comprometida"; functional-spec "Fora do beta F2") — mesma remoção do A6, para paridade.

---

## Escopo — o que está FORA

- **Qualquer mudança de código** (`packages/*`, `spikes/*`, `harness/*`), CI, configs.
- **ADR-001** — inalterado.
- **README.md** — fora do escopo; naming "Nexus Flow / H1VE" e nome do repo/packages permanecem. *(CLAUDE.md entra apenas no bloco "Estado atual".)*
- **SPECs/DONEs antigos** (001-007) — não reescritos.
- **Criar as SPECs que os itens de roadmap referenciam** (2.2 Pirâmide, 2.6 cadastro solo/team, etc.) — este PR só as descreve no roadmap; números exatos (ramificação, playoff) ficam para cada SPEC.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `docs/projeto/vision-scope.md` | modificar | A1, A4 + consistência (remove takeover da linha F2). |
| `docs/projeto/functional-spec.md` | modificar | A2, A5 + consistência (remove takeover da linha "Fora do beta F2"). |
| `docs/projeto/roadmap.md` | modificar | A3 (1.2 + 2.2), A6 (2.6 + 5.4). |
| `CLAUDE.md` | modificar | **apenas** o bloco "Estado atual" (SPECs 001-008; F0 completo; Steam-only; R13/R14; próxima frente). |
| `specs/SPEC-008-docs-r13-r14.md` | criar | esta SPEC. |
| `specs/DONE-008-docs-r13-r14.md` | criar | o DONE (ao final). |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema nesta feature. Docs-only.

---

## Mudanças de API (se aplicável)

Nenhuma mudança de API nesta feature. Docs-only.

---

## Critérios de aceitação

**Cenário 1 — A1-A6 aplicados fielmente**
- Dado o relatório como fonte de verdade; quando os 6 patches são aplicados; então cada doc contém o texto especificado, preservando estilo/formatação e todo conteúdo não mencionado.

**Cenário 2 — Substituições previstas (A5/A6)**
- Dado que a capacidade 18 e a spec 2.6 foram criadas pela SPEC-007; quando A5/A6 as substituem pelo conteúdo R14; então o conteúdo antigo ("Convite para vaga do clube") é trocado, não duplicado — e isso NÃO é tratado como conflito.

**Cenário 3 — A3 completo**
- Dado A3; então **ambas** as mudanças ocorrem: a nova spec 2.2 (Pirâmide) **e** o acréscimo à entrega da spec 1.2 (grupos paralelos).

**Cenário 4 — CLAUDE.md "Estado atual"**
- Dado o bloco "Estado atual"; então reflete SPECs 001-008, F0 técnico completo, Steam-only, R13/R14 ratificados e a próxima frente (Trilha GTM G.1 + Fase 0.2); e **só** esse bloco muda.

**Cenário 5 — Consistência**
- Dado a passada final; então nenhum "pool 100% humano" como gatilho de expansão e nenhum "takeover de quinteto" como feature própria sobrevivem fora de contexto histórico/absorvido.

**Cenário 6 — Conflito imprevisto (edge)**
- Dado um patch que conflite com texto que o relatório não previu; então **PARA nesse patch**, registra no DONE e segue — sem inventar.

---

## Segurança (se aplicável)

Sem superfície de segurança relevante. Docs-only.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Tratar a substituição A5/A6 como "conflito" e parar | Baixa | A tarefa marca explicitamente que é substituição prevista do conteúdo da SPEC-007. |
| Esquecer o acréscimo à spec 1.2 (A3 tem duas partes) | Média | Checklist do A3 com as duas partes; verificação no diff. |
| Takeover sobrar como feature própria nas listas F2 gêmeas | Média | Consistência (step 5) remove das duas listas, espelhando o A6. |
| Editar o CLAUDE.md além do bloco "Estado atual" | Baixa | Edições cirúrgicas ancoradas no bloco; diff revisado. |

**Dependências:**
- Relatório `auditoria-docs-camisa9.md` (ADENDOS 1 e 2). SPEC-007 mergeada (PR #10) — a base já tem a capacidade 18 e a spec 2.6 que A5/A6 substituem.

---

## Notas de implementação

- **Fonte de verdade = o relatório.** Aplicar A1-A6 **exatamente**; não melhorar prosa.
- **A5/A6 são substituições PREVISTAS** do conteúdo da SPEC-007 — não acionar o protocolo de parada por isso.
- **A3 tem duas partes** — a spec 2.2 (Pirâmide) **e** o acréscimo à entrega da spec 1.2.
- **A6 remove o takeover da 5.4**; por consistência (step 5), o *takeover de quinteto* também sai das listas "F2" gêmeas da vision-scope e da functional-spec (A6 não as enumera, mas é a mesma remoção). O "absorve o takeover" em R14 (A4/A5) é o contexto histórico aceitável.
- **CLAUDE.md** entra **só** no bloco "Estado atual" (fecha o desvio consciente do DONE-007). O rodapé "Nexus Flow (H1VE)" e o resto do arquivo não mudam.

---

## Checklist de aprovação

- [x] Objetivo está claro e verificável
- [x] Escopo está bem delimitado (dentro e fora) — A1-A6 + CLAUDE.md "Estado atual" + consistência
- [x] Arquivos listados estão corretos e completos
- [x] Mudanças de schema estão documentadas (N/A — docs-only)
- [x] Critérios de aceitação são testáveis
- [x] Riscos e superfície de segurança foram avaliados (sem superfície)
- [x] Appetite é razoável para o escopo definido (meio dia)
- [x] Não há conflito com SPECs abertas em paralelo
- [x] **Aprovada** — comissionada diretamente pelo founder com os patches A1-A6

---

*SPEC-008 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Continuação da SPEC-007; docs-only; ADR-001 inalterado.*
