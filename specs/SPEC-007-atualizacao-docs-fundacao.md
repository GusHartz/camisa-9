# SPEC-007 — Atualização dos docs de fundação (v1.4 + Steam-only + SPEC-006)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-007 |
| **Feature** | Atualização dos docs de fundação (v1.4 + Steam-only + SPEC-006) |
| **Slug** | atualizacao-docs-fundacao |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Manutenção de docs de fundação (fora da sequência numerada) — sincroniza os 4 docs com o design v1.4, a decisão Steam-only (15/07) e o veredito da SPEC-006. |
| **Appetite** | **1 dia** (docs-only, cirúrgico). |
| **Prioridade** | MEDIUM |
| **Criada em** | 2026-07-15 |
| **Aprovada em** | 2026-07-15 |
| **Aprovada por** | Gustavo Hartz (founder/architect) — comissionada diretamente com os 16 patches especificados |
| **Status** | Aprovada |

---

## Objetivo

Aplicar os **16 patches** do relatório de auditoria (`auditoria-docs-camisa9.md`, 15/07/2026) aos quatro documentos de fundação, sincronizando-os com: (1) o **design doc v1.4** (treino com banking, batida semanal, salário & estilo de vida); (2) a decisão **Steam-only** de 15/07 (canal único, F2P + compra "Carreira", instalador próprio deferido); (3) o veredito da **SPEC-006** (modo mini = faixa compacta ancorada, postura A). É uma edição **cirúrgica** — o relatório é a fonte de verdade; nada é reescrito além do que os patches pedem.

---

## Contexto e motivação

Os docs de fundação estão fiéis até ~v1.3, mas divergiram do estado real do projeto em três eixos (naming ambíguo "Nexus Flow"; ausência de v1.4/Steam-only/monetização; linguagem de produto atrasada em relação à SPEC-006). A auditoria de 15/07 destilou a divergência em achados numerados com **patches prontos** (G1; V1-V5; F1-F2; S1-S5; R1-R4). Esta SPEC os aplica em bloco, com review do founder direto no diff. Não desbloqueia código — é higiene documental para que as próximas SPECs (dados 0.2, monetização, arte/GTM) partam de uma fundação correta.

---

## Escopo — o que está DENTRO

**Os 16 patches numerados do relatório + o naming G1 nos 4 títulos.**

**Gerais / naming (G1):**
- [ ] **G1** — renomear o título dos 4 docs para `— Camisa 9 (codinome · método H1VE)`. Realizado por **V1** (vision-scope), **S1** (sdd), **R1** (roadmap) e o título da **functional-spec** (sem número próprio no relatório, aplicado sob G1). NÃO renomeia repo, packages, nem "Nexus Flow / H1VE" no README/CLAUDE.md.

**vision-scope.md:**
- [ ] **V1 (G1)** — título → `# Visão & Escopo — Camisa 9 (codinome · método H1VE)`.
- [ ] **V2 (G4)** — no pilar "Presença ambiente", trocar "modo mini na taskbar (…~130px)" pela forma ratificada na SPEC-006 (faixa compacta ancorada, postura A/topmost).
- [ ] **V3 (G2)** — em "No escopo", adicionar 3 bullets v1.4 (treino & progressão diária; batida semanal; salário & estilo de vida) após "Decisões de carreira".
- [ ] **V4 (G3/G6)** — adicionar seção "## Modelo de negócio" antes de "## Fora do escopo".
- [ ] **V5** — rebaixar o `[SUPOSIÇÃO — revisar]` do baseline técnico apenas nos itens já provados (arquitetura/qualidade — SPECs 001-006/ADR-001); manter a tag na segurança (0.4 ainda não exercida).

**functional-spec.md:**
- [ ] **G1 (título)** — `# Especificação Funcional — Camisa 9 (codinome · método H1VE)`.
- [ ] **F1 (G4)** — capacidade 3, mesma troca de linguagem do V2.
- [ ] **F2 (G2/G6/G7/G8)** — adicionar capacidades 14-18 (treino; batida semanal; salário & estilo de vida; monetização Steam; convite para vaga do clube).

**sdd.md:**
- [ ] **S1 (G1)** — título → `# Especificação Técnica (SDD) — Camisa 9 (codinome · método H1VE)`.
- [ ] **S2 (G3)** — substituir a seção "Distribuição" pela versão "rev. 15/07 — Steam-only".
- [ ] **S3 (G4)** — substituir o bullet "Widget na taskbar" por "Modo mini — RESOLVIDO (SPEC-006)".
- [ ] **S4** — atualizar D6 na tabela de decisões + adicionar D9 (Steam) e D10 (validação de demanda).
- [ ] **S5** — R4 dos riscos rebaixado para "RESOLVIDO (SPEC-006)" (mantendo a linha legível, **sem strikethrough** — o doc não usa) + nota no R3 (paywall).

**roadmap.md:**
- [ ] **R1 (G1)** — título → `# Roadmap — Camisa 9 (codinome · método H1VE)`.
- [ ] **R2 (G5/G3)** — nova "Trilha GTM (paralela)" após a Fase 0 (G.1 briefing de arte … G.5 Playtest).
- [ ] **R3 (G2/G7)** — adicionar linhas nas Fases 2 (2.6/2.7/2.8), 3 (3.7) e 4 (4.5/4.6/4.7).
- [ ] **R4** — substituir o `[SUPOSIÇÃO — revisar]` do corte do beta pela decisão ratificada (citando P6).

**Consistência final:**
- [ ] Passada de leitura confirmando que nenhuma referência a "instalador próprio como canal ativo", "landing/waiting list própria" ou "modo mini DENTRO da taskbar" sobrou fora de contexto histórico/deferido.

---

## Escopo — o que está FORA

- **Qualquer mudança de código** (`packages/*`, `spikes/*`, `harness/*`) — docs-only.
- **CI / gates / configs** (`.github/`, `eslint`, `prettier`, `package.json`).
- **ADR-001** — a stack do cliente **NÃO muda**; os docs continuam apontando para ele.
- **README.md e CLAUDE.md** — fora do diretório de escopo (`docs/projeto/` + `specs/`); o naming "Nexus Flow / H1VE" e o nome do repo/packages permanecem. *(Consequência: a atualização do "Estado atual" do CLAUDE.md — normalmente parte do ritual — é intencionalmente pulada aqui; ver DONE.)*
- **SPECs/DONEs antigos** (001-006) — não reescritos.
- **Criar as SPECs que os novos itens de roadmap referenciam** (G.1-G.5, 2.6-2.8, 3.7, 4.5-4.7, monetização) — este PR só as **lista** no roadmap; cada uma vira a sua própria SPEC quando priorizada.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `docs/projeto/vision-scope.md` | modificar | V1-V5 |
| `docs/projeto/functional-spec.md` | modificar | G1 (título) + F1-F2 |
| `docs/projeto/sdd.md` | modificar | S1-S5 |
| `docs/projeto/roadmap.md` | modificar | R1-R4 |
| `specs/SPEC-007-atualizacao-docs-fundacao.md` | criar | esta SPEC |
| `specs/DONE-007-atualizacao-docs-fundacao.md` | criar | o DONE (ao final) |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema nesta feature. Docs-only.

---

## Mudanças de API (se aplicável)

Nenhuma mudança de API nesta feature. Docs-only.

---

## Critérios de aceitação

**Cenário 1 — Patches aplicados fielmente**
- Dado o relatório de auditoria como fonte de verdade; quando os 16 patches (+ G1) são aplicados; então cada doc contém exatamente o texto especificado, preservando estilo/formatação existentes (tabelas, ✅/⚠️/❌, `[SUPOSIÇÃO — revisar]`) e todo conteúdo não mencionado.

**Cenário 2 — Naming (G1) nos 4 títulos**
- Dado os 4 títulos; então todos passam a `— Camisa 9 (codinome · método H1VE)`; e nenhuma referência a "Nexus Flow" fora dos títulos é tocada (nem repo/packages/README/CLAUDE.md).

**Cenário 3 — Cirúrgico, não reescrita**
- Dado que os patches são pontuais; então o diff toca apenas as regiões dos patches; nenhum parágrafo não-mencionado é reformatado; as notas de SPEC-003/005/006 já no roadmap não são duplicadas.

**Cenário 4 — Consistência semântica**
- Dado a passada final; então não sobra "instalador próprio como canal ativo", "landing/waiting list própria" nem "modo mini DENTRO da taskbar" fora de contexto histórico/deferido.

**Cenário 5 — Conflito não previsto (edge)**
- Dado um patch que conflite com texto atual que o relatório não previu; então o desenvolvimento **PARA nesse patch**, registra o conflito no DONE e segue para o próximo — sem inventar resolução.

**Cenário 6 — Gates**
- Dado que os 4 gates TS rodam sobre `packages/*` e o Prettier ignora `**/*.md`; então docs-only não altera nenhum gate (verde como antes).

---

## Segurança (se aplicável)

Sem superfície de segurança relevante. Docs-only; nenhum código, segredo ou input.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Reescrita acidental (perder conteúdo não-patchado) | Média | Edições cirúrgicas por `Edit` com âncoras exatas; diff revisado; nada de reescrever seções inteiras. |
| Patch conflita com texto atual imprevisto pelo relatório | Baixa | Protocolo do Cenário 5: parar, registrar no DONE, seguir — não inventar. |
| Duplicar notas de SPEC-003/005/006 no roadmap | Baixa | R2 insere a Trilha GTM **após** as blockquotes existentes, sem tocá-las. |
| V5/S5 exigem julgamento (rebaixar tag / adaptar sem strikethrough) | Média | Seguir as regras explícitas da tarefa (manter tag no não-exercido; linha legível sem `~~`). |

**Dependências:**
- Relatório `auditoria-docs-camisa9.md` (fonte de verdade). SPEC-006 já mergeada (PR #9) — a nota já está no roadmap.

---

## Notas de implementação

- **Fonte de verdade = o relatório.** Aplicar os patches **exatamente** como escritos; não melhorar prosa nem "consertar" o que o relatório não pediu.
- **G1** só toca os **títulos** dos 4 docs. Não mexer em "Nexus Flow / H1VE" no corpo, README, CLAUDE.md, repo ou packages.
- **V5:** remover a tag do cabeçalho do baseline; manter `[SUPOSIÇÃO — revisar]` referida à **segurança** (roadmap 0.4, não exercida). Arquitetura e qualidade = ratificadas (SPECs 001-006, ADR-001).
- **S5:** o SDD **não** usa strikethrough — adaptar o R4 mantendo o sentido "resolvido pela SPEC-006" **sem** `~~...~~`.
- **R4 (roadmap):** substituir a `[SUPOSIÇÃO — revisar]` do corte do beta pela decisão ratificada citando **P6**.
- **CLAUDE.md** fica **fora** (escopo de diretório) — a atualização do "Estado atual" é pulada de propósito e anotada no DONE como desvio conhecido.

---

## Checklist de aprovação

- [x] Objetivo está claro e verificável
- [x] Escopo está bem delimitado (dentro e fora) — os 16 patches enumerados
- [x] Arquivos listados estão corretos e completos
- [x] Mudanças de schema estão documentadas (N/A — docs-only)
- [x] Critérios de aceitação são testáveis
- [x] Riscos e superfície de segurança foram avaliados (sem superfície)
- [x] Appetite é razoável para o escopo definido (1 dia, cirúrgico)
- [x] Não há conflito com SPECs abertas em paralelo
- [x] **Aprovada** — comissionada diretamente pelo founder com os 16 patches

---

*SPEC-007 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Docs-only; ADR-001 inalterado.*
