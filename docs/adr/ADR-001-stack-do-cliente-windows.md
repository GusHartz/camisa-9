# ADR-001 — Stack do cliente Windows

| Campo | Valor |
|---|---|
| **Status** | ✅ **Aceito / Ratificado** |
| **Data** | 2026-07-15 |
| **Decisor** | Gustavo Hartz (founder / architect) |
| **SPEC** | SPEC-004 — Ratificação de stack do cliente |
| **Evidência** | SPEC-003 / DONE-003 (`spikes/faixa-always-on-bottom/RESULTS.md`) |
| **Substitui** | SDD §1 "Cliente Windows" + decisão **D5** (antes ⚠️ pendente de ratificação) |
| **Escopo** | Cliente Windows (a "casca" — OP-17). Não toca o motor do mundo (servidor TS). |

---

## Decisão

**Ratificamos `C#/WPF` (.NET LTS) como a stack de UI do cliente Windows no F0**, como *baseline* da forma padrão (faixa animada always-on-bottom) e de toda a trilha de cliente (toasts, presença, distribuição).

Ratificamos também, junto:

- **Orçamentos do cliente como constraints:** **`< 1% CPU`** (já governante, gate de CI) **e** **`< 150 MB RAM`** — este medido contra o **process tree inteiro** do cliente (relevante para qualquer candidato baseado em WebView2).
- **Definição de "web-wrapper ultraleve":** só conta como candidato se usar o **WebView2 do sistema** (não Chromium empacotado — senão é Electron por outro nome) **e** passar o gate `< 1% CPU` **sob um build real medido**.
- **Electron:** descartado definitivamente (trai a promessa de CPU — lição do TBH). A antiga `[SUPOSIÇÃO — revisar]` do SDD sobre isso fica resolvida.

Esta é uma decisão **reversível** de F0 (ver *Reversibilidade*), tomada **na evidência medida + literatura** — escolha de escopo explícita do founder na SPEC-004, sem re-spike de alternativas.

---

## Contexto

Duas promessas públicas governam o cliente: **`< 1% CPU`** e **Electron descartado**. A forma padrão é uma **faixa sem borda always-on-bottom** acima da taskbar, com uma **cena ambiente animada** rodando *junto* com o expediente. O risco central nunca foi a janela parada — era: *cabe uma animação contínua em `< 1% CPU` e `< 150 MB RAM` por um expediente inteiro?*

A **SPEC-003** construiu e mediu a forma padrão em **C#/WPF** no Windows 11 e **deixou a decisão de stack explicitamente para esta ratificação** (a "#1"): *"o spike não decide a stack; produz a evidência para a #1."* Três fatos resultantes moldam a decisão:

1. **O risco central foi retirado** — WPF passou os dois orçamentos duros com folga (CPU ~4×, RAM ~1,7×).
2. **O único con medido do WPF é o footprint** (161 MB self-contained) — o eixo em que um nativo enxuto (Rust) claramente venceria.
3. **Nenhuma alternativa foi construída/medida** para este app — o candidato B (Rust) foi deliberadamente não implementado (A passou → sem *kill*). Toda comparação com Rust/Tauri/WinUI3 é **literatura/estimativa**.

---

## Critérios de decisão (ponderados)

| Critério | Por que importa | Peso |
|---|---|---|
| **CPU sob animação contínua (`<1%`)** | A promessa pública governante e o *kill-criterion* de stack (SDD: quem não sustenta `<1%` é eliminado); gate de CI. É **o eixo decisivo** — o resto é desempate depois que este passa. | **Máximo / gate** (passa-ou-elimina) |
| **RAM steady-state (`<150 MB`)** | Segundo orçamento duro; julgado contra o **process tree inteiro** (crítico para WebView2). | Alto / gate secundário |
| **Footprint / download + payload de autoupdate** | O **único eixo que separa as stacks** depois que CPU/RAM passam — a decisão WPF-vs-nativo reduz-se a *aceitar 161 MB (ou dependência de runtime) vs. binário de poucos MB*. | Alto — o diferenciador real |
| **Velocidade de dev & manutenção (founder solo)** | O *money path* é o servidor TS; o cliente não pode virar sorvedouro de tempo. **Contrapeso direto ao footprint.** | Alto — contrapeso ao footprint |
| **Toasts WinRT com botões de ação** (alimenta o spike #3) | Requisito de produto (decidir do meio do Outlook). C#-família = first-class; Rust/Tauri viável com activator COM manual; web puro **não** faz activation em background. | Médio — favorece C#-família |
| **Widget na taskbar** (alimenta o spike #4) | Explicitamente alto risco / fora do caminho crítico / Plano B aceito. **Não deve** decidir a stack, mas premia alcance Win32 cru. | Baixo — desempate |
| **Always-on-bottom / WorkerW (Win+D)** | A forma padrão. Básico provado em WPF e portável. O Win+D/WorkerW é stack-agnóstico *em princípio*, mas **materialmente mais difícil em WinUI3** (janelas resistem a `SetParent`). | Médio (+ penalidade WinUI3) |
| **Auto-update + code-signing** | Exigido pelo canal "instalador próprio com autoupdate". Capacidade neutra entre stacks; difere na **contagem de artefatos** e no **custo de assinatura** (gap do founder BR). | Médio — nota a restrição BR |
| **i18n (PT dia-1, EN na F3, sem string hardcoded)** | Exigido desde o dia 1. WPF/.resx e WinUI3/RESW turnkey; web (i18next) maduro; Rust (fluent/gettext) mais fraco. | Baixo-médio |
| **Risco de manutenção / plataforma (multi-ano, solo)** | WPF é LTS-estável; windows-rs é pré-1.0 (churn alto); WinUI3 tem incerteza estratégica; Tauri herda churn do WebView2/Edge. | Médio |
| **Reversibilidade** | Ratificação de F0, não porta de mão única. O cliente é *thin renderer* (zero engine compartilhada, OP-17) → re-port futuro barato. | Médio — favorece o default provado |

---

## Candidatos avaliados

| Stack | CPU (o gate) | Footprint | Velocidade (solo) | Toasts | Taskbar | Risco de destaque | Veredito |
|---|---|---|---|---|---|---|---|
| **C#/WPF** (.NET LTS) | ✅ **medido 0,249%** (4× de folga) | ⚠️ 161 MB self-contained **medido em .NET 8** (WPF não faz trim; literatura: segue sem trim nas LTS seguintes — não verificado); est. ~90–120 MB single-file (não medido); 0,2 MB framework-dependent + runtime | ✅ **a mais alta** — dia-um produtivo, P/Invoke já provado | ✅ first-class (Windows App SDK `AppNotificationManager`) | limite do OS; alcance P/Invoke total | 161 MB + endurance de runtime GC (soak 8 h) não provada | **ESCOLHIDO** — único candidato medido; passa todos os gates duros com folga |
| **Rust/Win32** (windows-rs) | est. excelente (não medido) | ✅ **~2–8 MB** — vitória decisiva | ❌ **a mais lenta** — construir o toolkit de UI à mão, semanas/meses | via windows-rs; activator COM manual | limite do OS; alcance Win32 cru | *opportunity cost* vs. servidor; windows-rs pré-1.0; **tudo estimado** | Gatilho de revisão (footprint) |
| **Tauri v2** (WebView2) | ❌ **o risco — NÃO de-riscado** (mesmo motor Chromium do Electron) | ✅ est. 5–10 MB app (literatura) | ✅ rápida (UI web) | via plugin; activation unpackaged não verificada | limite do OS | CPU de animação contínua no motor do Electron + RAM do process tree (est. ~120–250 MB, literatura) | Só conta com build medido |
| **WinUI 3** (Win App SDK) | edge real mas **irrelevante** (WPF já ganhou o orçamento; não medido) | ❌ **pior** (est. ~200 MB untrimmed, literatura) | ❌ pior que WPF (designer/hot-reload frágeis) | first-class | sem vantagem | **piora** o WorkerW/Win+D (janelas resistem a `SetParent`) | **Dominado por WPF** |

---

## Evidência medida (SPEC-003)

> Hardware (ambiente **único**): AMD Ryzen 5 5600X · 12 núcleos lógicos · 15,9 GB RAM · Windows 11 Pro build 26200 · 1920×1080 @ 100% · taskbar inferior.

- **CPU** (faixa animada, % de máquina, 3 min / 180 amostras): **avg 0,249%** · p95 0,518% · pico 0,649% → **PASS** com ~4× de folga sob `<1%`. *Risco central retirado.*
- **RAM** (working set / `WorkingSet64`): **avg 86,6 MB** · pico 87,1 MB → **PASS** com ~1,7× de folga sob `<150 MB`.
- **Drift de RAM** no proxy de 3 min: **−0,6 MB** (negativo → sem leak no intervalo; animação sem alocação por frame via `TranslateTransform`).
- **Footprint** publicado, self-contained win-x64: **161 MB** (medido em **.NET 8**; WPF não faz trim). Alternativa framework-dependent: **0,2 MB**, mas exige o runtime **.NET 8 Desktop** instalado.
- **Comportamentos de janela** (via P/Invoke, `WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE = 0x08000080`): always-on-bottom · não-rouba-foco · fora de taskbar/Alt-Tab/Task View · multi-monitor → **todos PASS**.
- **Único diff de código** para rodar: remover `ClipToBounds="True"` do `<Window>` — logo os números refletem um WPF **quase intocado** (baseline justo, não hand-otimizado).

**Ressalva de generalização:** todos os números vêm de **um único ambiente forte** (12 núcleos). Em laptops de trabalho de 4–8 núcleos, o mesmo custo de um core é 2–4× maior como % de máquina. O PASS é válido **em hardware forte**; a validação em hardware fraco é gate do cliente.

---

## O tradeoff nomeado: **footprint × velocidade**

A decisão inteira reduz-se a um trade: **aceitar um download de 161 MB self-contained** (irrelevante no Steam; fricção menor no canal de instalador próprio/autoupdate; mitigável a est. ~90–120 MB por single-file — não medido —, ou a uma dependência de runtime) **em troca do caminho mais rápido, de menor risco e mais reversível** para um founder solo cujo tempo escasso pertence ao servidor.

Nenhuma alternativa de-risca algo que esteja *em risco*: WPF já passou CPU, RAM e forma. Ir para nativo de-riscaria apenas o footprint — que não é bloqueador de tese (o Steam torna 160 MB irrelevante; a promessa pública é CPU, não tamanho de download). **WPF é o default de menor arrependimento, com a questão do footprint mantida explicitamente revisitável.**

---

## Consequências

**Positivas**
- Caminho de dev mais rápido e maduro para um founder solo (VS, XAML hot-reload, C#, P/Invoke já provado na SPEC-003).
- Toasts WinRT com botões (Windows App SDK), auto-update (ex.: Velopack) e assinatura têm caminho real.
- Risco central (CPU sob animação) **já medido e retirado** — sem incógnita de performance na base.

**Negativas / custos aceitos**
- **Footprint 161 MB** self-contained (mitigável, não bloqueador). Payloads de autoupdate maiores que um binário nativo.
- Runtime **GC** carrega risco de endurance a provar (soak 8 h — ver gate items).
- Startup "perceptível" (~1–2 s framework-dependent) — irrelevante para uma faixa lançada 1×/sessão.

**Requisitos que esta decisão cria** (detalhamento é da SPEC de distribuição / baseline 0.4; aqui fica o **requisito**):
- **Code-signing** do cliente/instalador **e de cada payload de autoupdate**. Notas: **EV não limpa mais o SmartScreen instantaneamente**; **Azure Trusted Signing individual é US/Canadá apenas** → *gap do founder BR* (sub-questão aberta: caminho via org/PJ vs. cert OV). WPF self-contained assina **muitos DLLs** (vs. binário único nativo) — a contagem de artefatos favorece pipelines simples.
- **Modelo de payload de autoupdate** (full vs. delta) a definir na SPEC de distribuição — o footprint torna delta-patching desejável.

---

## Gate items pós-ratificação

> Tarefas do **build do cliente real** — **não** bloqueiam esta ratificação (a decisão é reversível e nenhuma alternativa está medida):

1. **Soak de 8 h** (endurance/leak de runtime GC) — comando pronto: `measure-usage.ps1 -Seconds 28800`. O proxy de 3 min não mostrou leak (−0,6 MB); confirmar num expediente inteiro antes de travar o GO final.
2. **Check de hardware fraco / baixo nº de cores** — validar o headroom de CPU num laptop de trabalho representativo (o 0,249% é de máquina num box de 12 cores).
3. **WorkerW / Win+D** — no Win11, "mostrar desktop" usa DWM cloaking (não interceptável por mensagem de janela); a solução é parentar a faixa à WorkerW (técnica Wallpaper Engine/Lively — que são WPF, prova que WPF resolve). **Stack-agnóstico**, deferido ao cliente real.

---

## Reversibilidade & gatilhos de revisão

**Reversível.** É uma ratificação de **F0**, não porta de mão única. O cliente é *thin renderer* (zero regra de negócio, zero engine compartilhada — OP-17), então um re-port futuro carrega **custo baixo** e não afeta o money path.

**O que reverteria a decisão (gatilhos de revisão):**
- O **soak de 8 h** revelar leak/creep real de WPF não mitigável (frame-cap / pausar-quando-oculto).
- Hardware fraco representativo mostrar o headroom de CPU **colapsando** em direção a `1%`.
- O footprint 161 MB provar-se **bloqueador real** no canal de autoupdate **e** a compressão single-file (est. ~90–120 MB, não medido) ser julgada insuficiente → dispara o custo de dev do Rust.
- Um **Tauri medido** (mesma cena, CSS compositor-only, GPU confirmada) fechar `<1%` por-core em hardware fraco **e** `<150 MB` no process tree inteiro → Tauri passa a ganhar em footprint + velocidade.
- Um **Rust/Win32 (ou Slint) medido** confirmar o footprint de poucos MB + CPU/RAM equivalentes **e** o founder julgar o custo de UI-toolkit acessível vs. o roadmap do servidor.
- **native-AOT/trimming** para WPF/WinUI3 amadurecer (re-check nas **LTS futuras** do .NET) e encolher o footprint drasticamente → apaga o único con do WPF (ou viabiliza WinUI3).

---

## Referências

- **SPEC-004** — `specs/SPEC-004-ratificacao-de-stack-do-cliente.md` (esta ratificação).
- **SPEC-003 / DONE-003** — `specs/DONE-003-spike-faixa-always-on-bottom.md`, `spikes/faixa-always-on-bottom/RESULTS.md` (evidência medida).
- **SDD** — `docs/projeto/sdd.md` §1 "Cliente Windows" + D5 (ratificados por este ADR).
- **CLAUDE.md** — promessas `<1% CPU` / "Electron descartado" / OP-17.

---

*ADR-001 — método H1VE. Registro de decisão durável; ver `docs/adr/README.md` para o fluxo de ADRs.*
