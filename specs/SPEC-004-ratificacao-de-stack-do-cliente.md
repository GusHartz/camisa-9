# SPEC-004 — Ratificação de stack do cliente

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-004 |
| **Feature** | Ratificação de stack do cliente |
| **Slug** | ratificacao-de-stack-do-cliente |
| **Owner** | gustavo-hartz (dev / architect) |
| **Roadmap item** | **De-risk do cliente — a "#1" (Ratificação de stack)**, o ponto de decisão alimentado pela SPEC-003 e governado pela promessa pública **<1% CPU**. Fora da sequência numerada 0.2–0.4 (server-first), na trilha paralela de cliente. Desbloqueia as SPECs de cliente a jusante (toasts #3, widget na taskbar #4, distribuição). |
| **Appetite** | **1–2 dias — é uma DECISÃO (um ADR), não um spike.** Sem build de candidato, sem medição nova. Escopo ratificado pelo founder: *ratificar na evidência medida da SPEC-003 + comparação de literatura*; probes medidos de alternativas ficam como gatilho de revisão deferido, **não** F0. |
| **Prioridade** | HIGH (P0-adjacente — a stack do cliente é bloqueador das SPECs de cliente; a promessa <1% CPU é bloqueador de tese) |
| **Criada em** | 2026-07-15 |
| **Aprovada em** | {YYYY-MM-DD — preencher após aprovação} |
| **Aprovada por** | {Gustavo Hartz — founder/architect} |
| **Status** | Rascunho — aguardando aprovação |

---

## Objetivo

Ratificar a **stack de UI do cliente Windows** — a decisão que a SPEC-003 chamou de **"#1"** — e registrá-la num **ADR** (Architecture Decision Record) durável e referenciável, **ratificando os itens de stack pendentes (⚠️) no doc de fundação técnica (SDD)**. O ADR consome a **evidência medida** da SPEC-003 (WPF: CPU 0,249%, RAM ~87 MB, footprint 161 MB) e a compara com os demais candidatos (Rust/Win32, Tauri/WebView2, WinUI3) por **critérios ponderados**, produzindo uma decisão explícita, com o tradeoff nomeado e a reversibilidade declarada. **Não é um spike: é a decisão** que desbloqueia toda a trilha de cliente. O que o founder passa a conseguir: uma stack ratificada e uma âncora (o ADR) que toda SPEC de cliente futura cita, em vez de re-litigar a escolha a cada feature.

---

## Contexto e motivação

F0. A SPEC-003 provou a **forma padrão** (faixa animada always-on-bottom) em **C#/WPF** e mediu o orçamento — mas **deixou a decisão de stack explicitamente para a #1**: *"o spike não decide a stack; produz a evidência para a #1"* (CLAUDE.md / SPEC-003). **Esta SPEC é a #1.**

Três fatos moldam a decisão: (1) o **risco central** (uma animação ambiente contínua cabe em `<1% CPU` por um expediente?) foi **retirado** — WPF passou com ~4× de folga (0,249%) e RAM com ~1,7× (~87 MB); (2) o **único con** medido do WPF é o **footprint** (161 MB self-contained, sem trim até o .NET 10) — o eixo que separaria WPF de um nativo enxuto (Rust, poucos MB); (3) **nenhuma alternativa foi construída/medida** para este app — o candidato B (Rust) foi deliberadamente não implementado (A passou → sem kill), então qualquer comparação com Rust/Tauri/WinUI3 é **literatura/estimativa**, não medição.

**Escolha de escopo do founder (registrada):** ratificar **na evidência medida + literatura**, tratando a decisão como **reversível** (o cliente é *thin renderer*, zero regra de negócio — OP-17 — logo um re-port futuro é barato). Um head-to-head medido de alternativas seria ~1–2 semanas de trabalho de cliente que compete com o *money path* (servidor TS) — fora de escopo aqui, preservado como gatilho de revisão.

A pesquisa de fundamentação revelou **duas lacunas de doc** que esta SPEC corrige no ADR: o **orçamento de RAM (<150 MB)** existe só no CLAUDE.md como artefato de spike (não ratificado como a promessa de CPU), e **code-signing não está documentado em lugar nenhum**.

---

## Escopo — o que está DENTRO

- [ ] **ADR** (`docs/adr/ADR-001-stack-do-cliente-windows.md`): a decisão ratificada + **critérios ponderados** + **tabela de evidência** + **landscape dos 4 candidatos** (WPF, Rust/Win32, Tauri/WebView2, WinUI3) + o **tradeoff `footprint × velocidade`** nomeado explicitamente + **consequências** + **reversibilidade** + os **gatilhos de revisão** ("o que reverteria a decisão").
- [ ] **Ratificar a decisão no "doc de fundação técnica" (`docs/projeto/sdd.md`)** — a intenção literal do card: flip dos itens marcados ⚠️ (a seção §1 **"Cliente Windows"** e a decisão **D5** "Cliente nativo (não Electron)") de *pendente de ratificação* para **ratificada**, com ponteiro ao ADR-001. O ADR guarda o raciocínio completo; o SDD passa a **refletir** a stack ratificada.
- [ ] **Adotar formalmente os orçamentos do cliente** como constraints ratificadas no ADR: **`<1% CPU`** (já governante) e **`<150 MB RAM`** — este último medido contra o **process tree inteiro** (decisivo para qualquer candidato WebView2).
- [ ] **Citar a evidência medida** da SPEC-003 (CPU avg/p95/pico, RAM avg/pico/drift, footprint self-contained vs framework-dependent, comportamentos de janela) + a **pesquisa de literatura por stack**, com as estimativas **rotuladas como estimativas**.
- [ ] **Requisito explícito de code-signing** no ADR (tipo de cert; a ressalva de que **EV não limpa mais o SmartScreen instantaneamente**; o **gap do founder BR** — Azure Trusted Signing individual é US/Canadá apenas; assinar o instalador **e cada payload de autoupdate**) + o **modelo de payload de autoupdate** (full vs delta). Aqui só o **requisito** é registrado; o pipeline é da SPEC de distribuição.
- [ ] **Definir o que "web-wrapper ultraleve" precisa significar** para contar como candidato: **WebView2 do sistema** (não Chromium empacotado — senão é Electron por outro nome) **E** passar o **gate `<1% CPU` sob um build real** antes de ser mais que um nome.
- [ ] **Registrar os GATE ITEMS pós-ratificação** da stack vencedora como tarefas do **cliente real** (não bloqueadores desta ratificação): **soak de 8 h**, **check de hardware fraco / baixo nº de cores**, e a **solução WorkerW/Win+D**.
- [ ] **Declarar a reversibilidade** explicitamente (F0; *thin renderer*; OP-17; re-port barato) + registrar o **WinUI3 como dominado** (não selecionado; re-check em native-AOT no .NET 11).
- [ ] **Higiene dos gates**: a mudança é só em `docs/` + `specs/` — os 4 gates TS (`lint`, `typecheck`, `test`, `build`) seguem verdes.

---

## Escopo — o que está FORA

- **Construir/medir qualquer candidato** (Rust/WinUI3/Tauri) ou rodar qualquer probe medido — escolha de escopo: ratificar na evidência. Probes ficam como **gatilho de revisão deferido**.
- **Re-implementar/re-medir** always-on-bottom / toasts / WorkerW em qualquer stack — comportamentos já provados **portáveis e stack-agnósticos** na SPEC-003.
- **Resolver o Win+D / WorkerW** (DWM cloaking) — deferido ao cliente real, stack-agnóstico, não é discriminador.
- **Executar o soak de 8 h ou a validação de hardware fraco** como pré-requisito da ratificação — são **gate items do vencedor**, feitos no build do cliente.
- **Detalhar o pipeline de distribuição / instalador / assinatura / autoupdate** — SPEC própria (adjacente à 0.4). Aqui só o **requisito** entra no ADR.
- **Decisões de produto não afetadas pela stack**: preço / calibração Steam BR; modo compacto como *feature* (o orçamento já é batido pela forma cheia).
- **Qualquer regra de negócio / conexão com o `world-engine`** — a stack do cliente não toca o motor.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `docs/adr/ADR-001-stack-do-cliente-windows.md` | criar | O ADR: decisão ratificada, critérios ponderados, evidência, landscape, tradeoff, consequências, reversibilidade, gatilhos de revisão, requisito de code-signing. |
| `docs/adr/README.md` | criar | Índice/uso de ADRs (primeiro ADR do projeto) — o que é, como numerar, quando escrever. |
| `specs/SPEC-004-ratificacao-de-stack-do-cliente.md` | criar | Esta SPEC. |
| `specs/DONE-004-ratificacao-de-stack-do-cliente.md` | criar | O DONE (ao final da sessão). |
| `docs/projeto/sdd.md` | modificar | **Ratificar a stack no doc de fundação técnica** (intenção do card): flip dos itens ⚠️ pendentes — a seção **§1 "Cliente Windows"** e a decisão **D5** — de *pendente* para **ratificada**, apontando ao ADR-001. |
| `CLAUDE.md` | modificar | Seção **"Estado atual"** (no DONE): #1 ratificada. |
| `docs/projeto/roadmap.md` | modificar | Nota da ratificação da #1 (no DONE). |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema nesta feature. É uma decisão de arquitetura documentada — sem persistência.

---

## Mudanças de API (se aplicável)

Nenhuma mudança de API nesta feature.

---

## Critérios de aceitação

> A feature é uma decisão; os critérios verificam a **completude e a honestidade do ADR**, por leitura. "Gates verdes" = os 4 gates **TS** seguem passando (mudança só em docs/specs).

**Cenário 1 — A decisão é registrada e justificada (ADR + doc de fundação técnica)**
- Dado a evidência medida da SPEC-003
- Quando o ADR é escrito **e** o SDD é atualizado
- Então o **ADR** nomeia a stack ratificada, avalia os **4 candidatos**, expõe os **critérios ponderados** e nomeia o **tradeoff `footprint × velocidade`**; **e** o **SDD** tem os itens ⚠️ de stack (seção §1 "Cliente Windows" + **D5**) **flipados para ratificada**, apontando ao ADR-001 — tudo verificável por leitura.

**Cenário 2 — Orçamentos ratificados com números**
- Então o ADR **adota `<1% CPU` e `<150 MB RAM`** (process-tree) como constraints do cliente, citando os valores medidos (**0,249%** CPU / **~87 MB** RAM / **161 MB** footprint) e o hardware de teste.

**Cenário 3 — Requisitos antes silentes são registrados**
- Então o ADR registra o **requisito de code-signing** (com a ressalva EV/SmartScreen e o gap do founder BR) e o **modelo de payload de autoupdate**.

**Cenário 4 — Gate items, gatilhos e reversibilidade**
- Então o ADR lista os **gate items pós-ratificação** (soak 8 h, hardware fraco, WorkerW) como tarefas do cliente, os **gatilhos de revisão** ("o que reverteria"), e **declara a decisão reversível**.

**Cenário 5 — Web-wrapper é condicional, não Electron por outro nome**
- Então o ADR **define** que "web-wrapper ultraleve" só conta como candidato se usar **WebView2 do sistema** E **passar o gate `<1% CPU` sob build real**.

**Cenário 6 — Higiene dos gates**
- Então os 4 gates TS seguem **verdes** (nenhum arquivo em `packages/*` foi tocado).

**Cenário 7 — Kill honesto (edge)**
- Dado que, ao escrever o ADR, a evidência se mostre **insuficiente** para decidir com honestidade
- Então o ADR **documenta a insuficiência e escala** para a opção "medir alternativas" (re-spike) — **não força** uma ratificação sem base.

---

## Segurança (se aplicável)

Sem superfície de segurança **executável** nesta feature (é documentação). Porém o ADR **registra um requisito de segurança de distribuição** — **code-signing** do cliente/instalador e de cada payload de autoupdate — cujo detalhamento é da SPEC de distribuição / baseline (0.4). Reforça o invariante do projeto: o **cliente é casca não-confiável** (anti-fraude 100% server-side — OP-17), então a stack escolhida **não** embarca anti-cheat/telemetria pesada.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Ratificar sem número medido de Rust/Tauri (decisão em **um lado só**) | Média | Decisão **explicitamente reversível** (thin renderer, OP-17); gatilhos de revisão documentados; probe medido preservado como opção deferida. |
| Headroom de CPU medido só em **hardware forte** (Ryzen 5600X, 12 cores) → pode encolher em laptop fraco de 4–8 cores | Média | ADR registra a ressalva (o 0,249% é % de máquina; o custo por-core é 2–4× maior em menos núcleos) e o **check de hardware fraco** como gate item do cliente. |
| **Soak 8 h** não executado → risco residual de leak em runtime GC | Baixa/Média | Gate item **obrigatório** do build do cliente (comando pronto: `measure-usage.ps1 -Seconds 28800`); proxy de 3 min sem leak (drift **−0,6 MB**). |
| **Footprint 161 MB** vira blocker no canal de autoupdate próprio | Baixa | Mitigável (single-file ~90–120 MB / framework-dependent 0,2 MB + runtime); irrelevante no Steam; nomeado como **gatilho de revisão**. |
| **Code-signing** para founder BR (Azure Trusted Signing individual é US/CA apenas) | Média | Registrado como **requisito + sub-questão aberta** para a SPEC de distribuição (caminho via org/PJ vs cert OV). |

**Dependências:**
- **SPEC-003** (evidência medida) — insumo direto.
- **Desbloqueia:** Spike toasts acionáveis (**#3**), Spike widget na taskbar (**#4**) e a futura SPEC de **distribuição/autoupdate**.

---

## Notas de implementação

- **Deliverable é um ADR, não código.** Formato ADR: *contexto → decisão → consequências*, acrescido da **tabela de critérios ponderados** e da **landscape de candidatos**. Docs em `docs/adr/` ficam **fora** de `packages/*` (sem gates TS; i18n/determinismo N/A).
- **Recomendação de evidência (input à ratificação, não fait accompli): C#/WPF (.NET LTS)** como baseline de cliente F0. Único con = **footprint** (161 MB), reversível e mitigável; passa os dois orçamentos duros com folga; velocidade de dev mais alta para um founder solo; toasts (Windows App SDK), autoupdate e signing têm caminho real.
- **Landscape a registrar honestamente:** **WinUI3** = *dominado* por WPF (footprint maior ~200 MB, menos maduro, torna o WorkerW/Win+D **mais difícil** — janelas resistem a `SetParent`); **Tauri** = melhor footprint+velocidade mas o risco de **CPU não de-riscado** (mesmo motor Chromium do Electron) + risco de **RAM** (process tree ~120–250 MB) → só conta com build medido; **Rust/Win32** = footprint vencedor (**estimado** ~2–8 MB) ao maior custo de dev / *opportunity cost* contra o servidor.
- **RAM budget:** adotar **150 MB medido contra o process tree inteiro** (some `msedgewebview2` para qualquer candidato WebView2).
- **Números medidos a citar** (SPEC-003 — hardware: **Ryzen 5 5600X / 12 cores / Win11 26200 / 1080p @ 100%**): CPU **avg 0,249% / p95 0,518% / pico 0,649%**; RAM **86,6 avg / 87,1 pico MB**; **drift −0,6 MB**; footprint **161 MB** self-contained (**0,2 MB** framework-dependent, exige runtime .NET Desktop); janela `WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE = 0x08000080` → always-on-bottom / no-focus / fora de taskbar/Alt-Tab / multi-monitor **PASS**.
- **Ressalva de generalização:** a evidência vem de **um único ambiente forte**; o ADR deve tratar o PASS como validado **em hardware forte**, com o check de hardware fraco como gate do cliente.
- **Reversibilidade:** deixar cristalino que é uma ratificação **F0**, não uma porta de mão única — o cliente é *thin renderer* (zero engine compartilhada), então a questão do footprint fica **revisitável** depois.

---

## Checklist de aprovação

> A ser preenchido pelo arquiteto/founder antes de aprovar a SPEC.

- [x] Objetivo está claro e verificável
- [x] Escopo está bem delimitado (dentro e fora)
- [x] Arquivos listados estão corretos e completos
- [x] Mudanças de schema estão documentadas (N/A)
- [x] Critérios de aceitação são testáveis (por leitura do ADR)
- [x] Riscos e superfície de segurança foram avaliados (code-signing registrado como requisito)
- [x] Appetite é razoável para o escopo definido (1–2 dias, decisão/ADR)
- [x] Não há conflito com SPECs abertas em paralelo
- [ ] **Aprovada** — decisão de escopo ratificada pelo founder (ratificar na evidência); aguardando aprovação formal no card

---

*SPEC-004 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Deliverable: `docs/adr/ADR-001-stack-do-cliente-windows.md` + ratificação dos itens ⚠️ no `docs/projeto/sdd.md`.*
