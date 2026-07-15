# DONE-004 — Ratificação de stack do cliente

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-004 |
| **SPEC correspondente** | SPEC-004-ratificacao-de-stack-do-cliente.md |
| **Feature** | Ratificação de stack do cliente (a "#1") |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/ratificacao-de-stack-do-cliente` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado** | 2026-07-15 |
| **Desenvolvimento concluído** | 2026-07-15 |
| **Dias utilizados vs appetite** | <1 dia vs 1–2 dias (decisão/ADR) |

---

## Resumo do que foi feito

Ratificada a **stack do cliente Windows — `C#/WPF` (.NET LTS)** — como baseline de F0, encerrando a decisão "#1"
que a SPEC-003 deixou em aberto. A decisão vive num **ADR** (`docs/adr/ADR-001`): critérios ponderados, landscape
dos 4 candidatos (WPF · Rust/Win32 · Tauri/WebView2 · WinUI3), evidência **medida** da SPEC-003, o tradeoff
`footprint × velocidade` nomeado, consequências, reversibilidade e gatilhos de revisão. O **doc de fundação técnica**
(`docs/projeto/sdd.md`) teve os itens de stack marcados `⚠️` (seção §1 "Cliente Windows" + decisão **D5**) **flipados
de pendente para ratificado**, apontando ao ADR — honrando a intenção literal do card.

A ratificação foi **na evidência medida + literatura** (escolha de escopo do founder): WPF é o único candidato
construído/medido e passou os dois orçamentos duros com folga (**CPU 0,249%** / ~4× · **RAM ~87 MB** / ~1,7×);
seu único con é o footprint (**161 MB** self-contained). O ADR também **adota formalmente** os orçamentos `<1% CPU`
e `<150 MB RAM` (process tree inteiro) e **registra dois requisitos antes silentes**: code-signing (com o gap do
founder BR) e o modelo de payload de autoupdate.

Base montada por um fan-out de pesquisa (2 leitores de evidência + 4 lentes de stack → síntese) e **verificada
adversarialmente** (2 agentes: completude vs. os 7 critérios + fidelidade factual vs. a evidência) — que pegou e
**corrigiu 1 erro factual** (o ADR dizia ".NET 10 / verificado" onde a fonte mede **.NET 8**) e 2 números de
estimativa que estavam sem rótulo.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `docs/adr/ADR-001-stack-do-cliente-windows.md` | O ADR da decisão: ratifica C#/WPF, com critérios, evidência, landscape, tradeoff, reversibilidade, gatilhos e requisito de code-signing. |
| `docs/adr/README.md` | Índice/uso de ADRs (primeiro ADR do projeto) — SDD = estado; ADR = por quê. |
| `specs/SPEC-004-ratificacao-de-stack-do-cliente.md` | A SPEC desta feature. |
| `specs/DONE-004-ratificacao-de-stack-do-cliente.md` | Este documento. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `docs/projeto/sdd.md` | **Flip de ⚠️ → ratificado:** §1 "Cliente Windows" reescrita para a stack ratificada (C#/WPF, orçamentos, alternativas, gate items) + decisão **D5** flipada, ambas apontando ao ADR-001. |
| `CLAUDE.md` | Seção "Estado atual" atualizada (a #1 ratificada). |
| `docs/projeto/roadmap.md` | Nota da ratificação da #1 no de-risk do cliente. |

---

## Mudanças de schema aplicadas

Nenhuma migration neste DONE. Feature de decisão/documentação, sem persistência (OP-01 não se aplica).

---

## Mudanças de API entregues

Nenhuma mudança de API neste DONE.

---

## Critérios de aceitação — verificação

> Verificado por review adversarial de completude (agente lendo SPEC-004 + ADR-001 + os flips do SDD).

| Critério (SPEC-004) | Status | Observação |
|---|---|---|
| 1 — Decisão registrada e justificada (ADR + doc de fundação técnica) | ✅ **PASS** | ADR nomeia a stack, avalia os 4 candidatos, expõe critérios ponderados e o tradeoff; SDD §1 + D5 flipados para ratificado com link ao ADR. |
| 2 — Orçamentos ratificados com números | ✅ **PASS** | `<1% CPU` e `<150 MB RAM` (process tree) adotados; cita 0,249% / ~87 MB / 161 MB + o hardware de teste. |
| 3 — Requisitos antes silentes registrados | ✅ **PASS** | Code-signing (EV/SmartScreen + gap BR) e modelo de payload de autoupdate registrados no ADR. |
| 4 — Gate items, gatilhos e reversibilidade | ✅ **PASS** | Soak 8 h · hardware fraco · WorkerW listados como gate items; gatilhos de revisão + reversibilidade declarados. |
| 5 — Web-wrapper condicional (não Electron por outro nome) | ✅ **PASS** | Definido: só conta com WebView2 do sistema **e** passando `<1% CPU` sob build real. |
| 6 — Higiene dos gates | ✅ **PASS** | Diff só em `docs/` + `specs/`; nada em `packages/*` → os 4 gates TS seguem verdes. |
| 7 — Kill honesto (edge) | ✅ **N/A (documentado)** | Antecedente não disparou (evidência suficiente, risco central retirado); mesmo assim toda comparação não medida está rotulada "estimativa/literatura" e o re-spike fica como gatilho. |

**Gates TS:** os 4 gates (`lint`/`typecheck`/`test`/`build`) seguem verdes — mudança só em docs/specs; markdown é ignorado pelo Prettier e o SPEC-lint do CI (seções obrigatórias) é satisfeito.

---

## Como testar manualmente

```
1. Abrir docs/adr/ADR-001-stack-do-cliente-windows.md → confere: stack ratificada (C#/WPF),
   tabela de critérios ponderados, landscape dos 4 candidatos, tradeoff footprint×velocidade,
   gate items, reversibilidade + gatilhos de revisão, requisito de code-signing.
2. Abrir docs/projeto/sdd.md → §1 "Cliente Windows" e a linha D5 devem estar RATIFICADAS
   (✅, sem ⚠️) e linkando o ADR-001.
3. Conferir que os números batem com specs/DONE-003 + spikes/faixa-always-on-bottom/RESULTS.md
   (CPU 0,249% / RAM ~87 MB / footprint 161 MB / .NET 8).
Resultado esperado: decisão rastreável até a evidência, sem número medido inventado.
```

**Dados de teste necessários:** nenhum — leitura de documentos.

---

## Testes automatizados

Nenhum teste automatizado neste DONE (entrega documental). Os gates TS existentes seguem cobrindo `packages/*`,
inalterados por esta feature.

| Arquivo de teste | O que testa |
|---|---|
| — | (sem código de produto nesta feature) |

**Comando para rodar (inalterados):**
```bash
npm run lint && npm run typecheck && npm test && npm run build
```

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `docs/adr/ADR-001-...md`, `docs/adr/README.md`, `specs/SPEC-004-...md`, `specs/DONE-004-...md`, flips no `sdd.md` | ~100% | Sim — fundamentado por fan-out de pesquisa (SPEC-003 + literatura por stack) e **verificado adversarialmente** (2 agentes: completude + fidelidade factual); 1 erro factual (.NET 8 vs 10) e 2 estimativas sem rótulo corrigidos antes de fechar. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → **dentro da intenção do card**, e aprovado pelo founder antes de aplicar:
  - O deliverable cresceu de "só ADR" para "**ADR + flip do SDD**" ao reconciliar com a frase do card *"registrar no doc de fundação técnica"* — o SDD é literalmente o doc de fundação técnica. Sinalizado ao founder e aprovado; a SPEC foi republicada com o SDD no escopo antes de codar.

---

## Desvios em relação à SPEC

| Item da SPEC | O que foi feito | Motivo do desvio |
|---|---|---|
| Deliverable | ADR **+ flip do SDD** (não só o ADR do rascunho inicial) | Honrar a intenção literal do card ("doc de fundação técnica" = SDD). Reconciliado e aprovado pelo founder **antes** de escrever — está na SPEC aprovada, logo não é desvio da SPEC final. |

Fora isso: implementação seguiu a SPEC aprovada sem desvios.

---

## Limitações conhecidas

- **Decisão na evidência + literatura, não em head-to-head medido** — Rust/Tauri/WinUI3 nunca foram construídos/medidos para este app; suas comparações são estimativas rotuladas. Aceito conscientemente (escopo do founder); a decisão é **reversível** (cliente = thin renderer, OP-17).
- **Gate items deferidos ao build do cliente** — soak de 8 h, check de hardware fraco e a solução WorkerW/Win+D não são executados aqui; ficam como tarefas do cliente real + gatilhos de revisão no ADR.
- **Mitigação de footprint não medida** — a projeção single-file (~90–120 MB) é estimativa; o número medido é 161 MB self-contained / 0,2 MB framework-dependent.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Soak de 8 h do WPF (endurance/leak de runtime GC) | Médio | Build do cliente — antes do GO definitivo. |
| Check de CPU em hardware fraco (headroom fora de um box de 12 núcleos) | Médio | Build do cliente. |
| WorkerW/Win+D (sobreviver a "mostrar desktop" no Win11) | Alto (forma padrão) | Build do cliente (stack-agnóstico). |
| Plano de code-signing p/ founder BR (org/PJ vs. cert OV) + modelo de payload de autoupdate | Médio | SPEC de distribuição (adjacente à 0.4). |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (7/7 PASS; review adversarial de completude)
- [x] Fidelidade factual verificada vs. a evidência (1 erro corrigido: .NET 8 vs 10)
- [x] Sem código de produto → sem testes novos; gates TS inalterados/verdes (docs-only)
- [x] Nenhum log de debug / nenhum `any` / nenhum segredo (N/A — documentação)
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` seção "Estado atual" atualizada
- [x] `docs/projeto/roadmap.md` atualizado
- [x] SDD (doc de fundação técnica) ratificado + ADR-001 criado
- [ ] Este DONE commitado na branch *(commit/PR pendente de confirmação do founder)*

---

*DONE-004 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE.*
