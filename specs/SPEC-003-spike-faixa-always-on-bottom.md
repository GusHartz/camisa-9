# SPEC-003 — Spike faixa always-on-bottom

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-003 |
| **Feature** | Spike faixa always-on-bottom |
| **Slug** | spike-faixa-always-on-bottom |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | De-risking do **cliente** no F0 — viabilidade da *forma padrão* (faixa sem borda, always-on-bottom, **com cena ambiente animada**) sob a promessa **<1% CPU** e **<150 MB RAM**. Alimenta a **Ratificação de stack do cliente** (feature #1). Adjacente à Fase 3 (presença). |
| **Appetite** | 14 dias — **kill-criteria: esforço > 3 semanas OU nenhum candidato sustenta <1% CPU + <150 MB RAM com a cena animada = reavaliar a forma padrão** |
| **Prioridade** | HIGH (P0 — a forma padrão + as promessas de CPU/RAM são bloqueadores de tese) |
| **Criada em** | 2026-07-15 |
| **Aprovada em** | 2026-07-15 |
| **Aprovada por** | Gustavo Hartz (founder/architect) |
| **Status** | Concluído — validado no Windows 2026-07-15 (ver `DONE-003`) |
| **Sequência ratificada** | **Candidato A (C#/WPF) primeiro** → validar no Windows → só então o Candidato B (Rust/Win32). Reduz código não-verificado acumulado (dev em macOS). |

---

## Objetivo

Provar que a **faixa** (forma padrão do cliente) pode existir como **janela sem borda, always-on-bottom, acima da taskbar, exibindo uma cena ambiente ANIMADA** — atrás das janelas normais, sem roubar foco, sobrevivendo a "mostrar desktop" e a setups **multi-monitor** — sustentando **< 1% CPU médio** e **< 150 MB RAM** ao longo de um **soak de 8 h**. Construída em **dois candidatos de stack nativa**, gera os dados go/no-go que **alimentam a Ratificação de stack (#1)**. É o risco real da forma padrão: não basta uma janela estática — precisa provar que **uma animação ambiente cabe no orçamento de CPU/RAM por um expediente inteiro**.

---

## Contexto e motivação

F0. Duas promessas públicas do CLAUDE.md governam o cliente: **`<1% CPU`** e **Electron descartado**. A **forma padrão** é uma faixa sem borda always-on-bottom acima da taskbar, rodando *junto* com o expediente. O gênero-referência (Rusty's Retirement) é uma **cena ambiente animada** — então o de-risking honesto não é uma janela parada, é: *cabe uma animação leve em `<1% CPU` e `<150 MB RAM` por 8 h, nos monitores do usuário?*

Três riscos se cruzam: (1) o mecanismo Win32 de *always-on-bottom que sobrevive a foco / "mostrar desktop"*; (2) o **orçamento de CPU/RAM com animação** ao longo de um dia (leak, drift, custo de composição); (3) a **stack pendente** (#1) — sem dado empírico para decidir entre nativo gerenciado (C#/.NET) e nativo enxuto (Rust/Win32).

**Decisão consciente do founder:** este trabalho ramifica para o **de-risking do cliente**, à frente do sequenciamento server-first do roadmap (0.2–0.4) — escolha deliberada, não drift. O spike **não decide** a stack; produz a evidência para a #1.

**Constraint operacional:** o dev roda em **macOS**; o alvo é **Windows**. O agente **autora a SPEC, pesquisa as APIs e escreve o código + harness**, mas **não compila nem verifica** o comportamento Windows. A validação (always-on-bottom? `<1% CPU`? `<150 MB`? 8 h? multi-monitor?) é executada pelo **founder no Windows**, que cola os números; o agente itera pelos resultados.

---

## Escopo — o que está DENTRO

- [ ] **Doc de pesquisa** (`README.md`) da técnica Win32: janela sem borda (`WS_POPUP`/`WindowStyle=None`), always-on-bottom persistente (interceptar `WM_WINDOWPOSCHANGING` → `HWND_BOTTOM`), não-ativável / fora da taskbar e Alt-Tab (`WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`), posicionamento acima da taskbar (`SPI_GETWORKAREA`), sobrevivência a "mostrar desktop" (Win+D) e **comportamento multi-monitor**.
- [ ] **Cena ambiente animada (placeholder)**: uma animação leve e contínua (ex.: poucos elementos em movimento suave / loop) — representativa da forma padrão, **não** a arte final. É o que efetivamente testa o orçamento com movimento.
- [ ] **Candidato A — C# / WPF (.NET 8)**: a faixa full-width acima da taskbar, always-on-bottom, com a cena animada + um relógio.
- [ ] **Candidato B — Rust / windows-rs (Win32)**: a mesma faixa + cena animada (após o A validar).
- [ ] **Multi-monitor**: a faixa ancora corretamente no **monitor primário** e se comporta de forma **definida e estável** em setup com ≥2 monitores (não some, não duplica errado, sobrevive a hotplug/reordenação) — documentar o comportamento observado.
- [ ] **Harness de medição** (`measure-usage.ps1`): amostra **CPU (%) e RAM (working set, MB)** do processo; suporta **soak longo** (default 8 h) reportando média/p95/pico de CPU e média/pico/**drift** de RAM (detecção de leak).
- [ ] **Template de resultados** (`RESULTS.md`): por candidato — always-on-bottom OK? sobrevive Win+D? multi-monitor OK? CPU média <1%? RAM <150 MB? RAM estável em 8 h? footprint? build? — culminando numa **recomendação go/no-go para a #1**.
- [ ] **Esboço do plano B (modo compacto)**: como a mesma janela colapsa (cena menor/pausável) caso o orçamento full-width com animação não feche.
- [ ] **Instruções passo-a-passo** de build + run + medição/soak no Windows.
- [ ] **Higiene dos gates**: os diretórios do spike (não-TS) **não quebram** os 4 gates TS.

---

## Escopo — o que está FORA

- **Widget na taskbar** — feature **#4** (risco alto, APIs não-oficiais), spike separado.
- **Toasts / notificações nativas** — feature **#3**.
- **Arte/cena final** — aqui é só um **placeholder animado**; a cena real (gênero ambiente) é produto, não spike.
- **DPI misto entre monitores** — multi-monitor **homogêneo** está DENTRO; DPI *misto* (100% + 150%) é observação/stretch, não critério de aprovação.
- **Qualquer regra de negócio / conexão com o `world-engine`** — a faixa é **casca visual** (OP-17): zero lógica de jogo, zero anti-fraude.
- **Auto-update, instalador, empacotamento, code-signing** — distribuição é outra SPEC.
- **Decisão FINAL de stack** — o spike gera dados; ratificar é a **#1**.
- **Port macOS** — Fase 3. **Verificação no macOS** — impossível; validação é do founder no Windows.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `spikes/faixa-always-on-bottom/README.md` | criar | Pesquisa Win32 + cena animada + multi-monitor + instruções + plano B. |
| `spikes/faixa-always-on-bottom/csharp-wpf/FaixaSpike.csproj` | criar | Projeto WPF mínimo. |
| `spikes/faixa-always-on-bottom/csharp-wpf/App.xaml` (+ `.cs`) | criar | Bootstrap. |
| `spikes/faixa-always-on-bottom/csharp-wpf/MainWindow.xaml` (+ `.cs`) | criar | Faixa + cena animada + interop Win32 + multi-monitor. |
| `spikes/faixa-always-on-bottom/rust-win32/Cargo.toml` | criar | Crate + `windows` (após o A). |
| `spikes/faixa-always-on-bottom/rust-win32/src/main.rs` | criar | Faixa + cena animada em Win32 (após o A). |
| `spikes/faixa-always-on-bottom/measure-usage.ps1` | criar | Harness CPU + RAM + soak (8 h). |
| `spikes/faixa-always-on-bottom/RESULTS.md` | criar | Template de resultados. |
| `.prettierignore` / `.gitignore` | modificar | Ignorar `spikes/` (não-TS) e artefatos de build. |
| `docs/projeto/roadmap.md` / `CLAUDE.md` | modificar | Nota do spike + "Estado atual" (no DONE). |
| `specs/SPEC-003-...md` / `specs/DONE-003-...md` | criar | Esta SPEC + o DONE. |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema nesta feature. Spike de cliente, sem persistência.

---

## Mudanças de API (se aplicável)

Nenhuma mudança de API nesta feature.

---

## Critérios de aceitação

> Verificados pelo **founder no Windows** (10/11); o agente entrega código + harness e itera pelos números. "Gates verdes" do branch = os 4 gates **TS** seguem passando + validação Windows manual.

**Cenário 1 — Faixa sem borda always-on-bottom com cena animada**
- Dado um candidato rodando no Windows
- Quando a faixa abre
- Então aparece full-width, sem borda, acima da taskbar, com a **cena animada** rodando; fica **atrás** das janelas normais; **não** rouba foco; **não** aparece na taskbar/Alt-Tab.

**Cenário 2 — Sobrevive a foco e a "mostrar desktop"**
- Dado a faixa aberta
- Quando clico em outras janelas e aciono **Win+D**
- Então a faixa **permanece** fixada no fundo (não minimiza, não vem à frente).

**Cenário 3 — Orçamento com animação (asserção numérica)**
- Dado a faixa com a **cena animada** rodando
- Quando rodo `measure-usage.ps1`
- Então **≥ 1 candidato** sustenta **CPU média < 1%** (normalizada por núcleo) **e RAM < 150 MB** (working set).

**Cenário 4 — Soak de 8 h (endurance / leak)**
- Dado a faixa animada rodando por **8 h**
- Quando comparo início vs fim
- Então CPU média segue **< 1%** e a RAM fica **< 150 MB sem crescimento monotônico** (sem leak).

**Cenário 5 — Multi-monitor**
- Dado um setup com ≥ 2 monitores
- Quando a faixa abre (e ao reordenar/hotplug monitores)
- Então ela ancora corretamente no **monitor primário** e o comportamento é **estável e definido** (não some, não duplica errado) — documentado.

**Cenário 6 — Dados para a #1 + plano B**
- Então `RESULTS.md` traz as métricas lado a lado + **recomendação go/no-go** de stack, e o `README.md` descreve o **plano B (modo compacto)**.

**Cenário 7 — Kill honesto (edge)**
- Dado que **nenhum** candidato sustenta `<1% CPU` **+** `<150 MB` com a animação (ou não segura always-on-bottom)
- Então o spike **documenta o no-go e o motivo** — não força resultado positivo.

---

## Segurança (se aplicável)

Sem superfície de segurança relevante. Janela local, sem auth, sem segredos, sem rede, sem input não-confiável.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Animação a `<1%` CPU** é o risco central — WPF pode custar composição/GPU | **Alta** | Animação leve (poucos elementos, baixa taxa); evitar `CompositionTarget.Rendering` custoso e `AllowsTransparency`; medir cedo; kill-criteria explícito. |
| **RAM `<150 MB` com .NET/WPF** — heap gerenciado + WPF têm baseline | Média/Alta | Medir working set real; comparar com Rust (baseline nativo bem menor) — é justamente o dado da #1. |
| **Leak em 8 h** (imagens/timers acumulando) | Média | Soak com drift de RAM; sem alocação por frame; reusar recursos. |
| Always-on-bottom + Win+D frágil no Windows | Média/Alta | Pin em `WM_WINDOWPOSCHANGING`; é o cerne do Cenário 2. |
| Multi-monitor: faixa no monitor errado / some no hotplug | Média | Ancorar via work area do primário; observar hotplug; documentar. |
| Agente não compila/roda (macOS) → código com bugs | **Alta** | Código mínimo por candidato; itera pelos resultados do founder (entregar→medir→corrigir). |

**Dependências:**
- Máquina **Windows 10/11** do founder (com .NET 8 SDK + Rust toolchain, ≥2 monitores p/ o Cenário 5).
- Alimenta a **feature #1** (Ratificação de stack do cliente).

---

## Notas de implementação

- **Técnica always-on-bottom:** `WindowStyle=None`; `WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE`; interceptar `WM_WINDOWPOSCHANGING` e forçar `hwndInsertAfter = HWND_BOTTOM` (limpando `SWP_NOZORDER`); **nunca** `HWND_TOPMOST`. Posição = borda inferior da área de trabalho (`SystemParameters.WorkArea`) menos a altura da faixa.
- **Cena animada barata:** poucos elementos em movimento suave (ex.: 3–6 formas fazendo *drift* horizontal em loop). Animar um **`TranslateTransform.X`** (processado no *render/composition thread*, **sem disparar layout** por frame) — **não** `Canvas.Left` (dispara arrange na UI thread). Alvo do drift = **largura real** da faixa (cobre qualquer monitor). **Evitar** `AllowsTransparency=true` (composição por-pixel). Sem alocação por frame (evita GC/leak no soak).
- **RAM:** medir *Working Set* **total** (`Process.WorkingSet64`) do processo publicado (release) — **não** o *private* (subestima as páginas compartilhadas do WPF/.NET). Esperar WPF/.NET com baseline maior que Rust — é um eixo da decisão da #1.
- **Multi-monitor:** ancorar no primário via work area; observar `WM_DISPLAYCHANGE` (reordenação/hotplug). Se a política for "1 faixa por monitor", isso é produto — aqui basta **não quebrar** e documentar.
- **Harness:** usar **`System.Diagnostics.Process`** (NÃO `Get-Counter` — seus nomes de contador são **localizados** e quebram no Windows pt-BR). CPU = `TotalProcessorTime` Δ ÷ (tempo real × núcleos) = **% da máquina** (convenção do Gerenciador de Tarefas); RAM = `WorkingSet64` (MB, total). Reportar CPU média/p95/pico e RAM média/pico/**drift** (fim − início).
- **Layout:** spikes em `spikes/` — **fora** de `packages/*`; não entram nos gates TS; ignorados por ESLint/Prettier. **OP-17**: a faixa é casca (zero regra de negócio). i18n/determinismo: N/A.
- **Loop de trabalho:** por ser não-verificável no macOS, entregar em incrementos pequenos e pedir ao founder rodar+colar a cada marco (abre → always-on-bottom → sobrevive Win+D → CPU/RAM medidos → soak 8 h → multi-monitor).

---

## Checklist de aprovação

> A ser preenchido pelo arquiteto ou founder antes de aprovar a SPEC.

- [x] Objetivo está claro e verificável
- [x] Escopo está bem delimitado (dentro e fora)
- [x] Arquivos listados estão corretos e completos
- [x] Mudanças de schema estão documentadas (N/A)
- [x] Critérios de aceitação são testáveis (no Windows, pelo founder)
- [x] Riscos e superfície de segurança foram avaliados
- [x] Appetite é razoável para o escopo definido (14 dias)
- [x] Não há conflito com SPECs abertas em paralelo
- [x] Alinhada à descrição do card (cena animada + CPU<1% & RAM<150MB em 8h + multi-monitor)

---

*SPEC-003 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE.*
