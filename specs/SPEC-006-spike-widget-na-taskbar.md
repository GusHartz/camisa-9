# SPEC-006 — Spike widget na taskbar

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-006 |
| **Feature** | Spike widget na taskbar (feature #4 — de-risk do cliente) |
| **Slug** | spike-widget-na-taskbar |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | De-risk do cliente (trilha paralela) — **feature #4**. O **nível 2** da presença (faixa → **mini na taskbar** → toasts). Assenta sobre a stack ratificada **C#/WPF** (ADR-001). Governado por **OP-17** (cliente = casca) e pela promessa **<1% CPU**. |
| **Appetite** | **6–8 dias** (card: teto 14). Kill-criteria: esforço > 2 semanas **OU** nenhuma das duas posturas suportadas (topmost strip / AppBar) fica ancorada de forma confiável à taskbar dentro de **<1% CPU** sem exigir **injeção em `explorer.exe`** ou **MSIX** → documentar o no-go e **suavizar o Plano B** (modo compacto = a faixa reposicionada, sem ancoragem especial). |
| **Prioridade** | MEDIUM (**nunca no caminho crítico** — Plano B já aceito no CLAUDE.md) |
| **Criada em** | 2026-07-15 |
| **Aprovada em** | {YYYY-MM-DD — preencher após aprovação} |
| **Aprovada por** | {Gustavo Hartz — founder/architect} |
| **Status** | Rascunho — aguardando aprovação |

---

## Objetivo

De-riscar o **nível 2 da presença** (a "mini na taskbar") provando se uma **faixa compacta de baixa CPU (<1%)** consegue ficar **ancorada de forma confiável à taskbar do Windows 11**, a partir de um app **C#/WPF UNPACKAGED** (sem MSIX, não-elevado), **sem renderizar dentro da shell da taskbar** (comprovadamente inviável — ver Contexto) e **sem injeção**. Compara empiricamente as **duas posturas suportadas** — (A) **janela topmost borderless** posicionada sobre/junto ao retângulo da taskbar e (B) **AppBar** (`SHAppBarMessage`, que reserva a borda) — e entrega go/no-go da **forma compacta** + qual postura, carregando o gap do **Win+D** (herdado da SPEC-003). O que o founder passa a saber: se a "mini na taskbar" é viável dentro das promessas do projeto, e em que forma.

---

## Contexto e motivação

F0, trilha de de-risk do cliente (segue #3/toasts). A visão tem **3 níveis de presença** (faixa → **mini na taskbar** → toasts); o #4 é o nível 2. O CLAUDE.md já cataloga este card como **"spike de risco alto (APIs não-oficiais)"** com **"Plano B aceito: modo compacto da própria faixa"** e **"Nunca no caminho crítico"**.

**Achado da pesquisa (fan-out de 2 pesquisadores + verificação) — renderizar DENTRO da taskbar é um no-go para o nosso caso:**
- **Deskband morreu.** A API de deskband (`IDeskBand`) está **deprecada desde o Windows 7** e a nova taskbar XAML do **Win11 removeu o suporte a componentes de terceiros** (deskbands). Sem caminho de primeira-parte.
- **Os hacks que restam são frágeis e hostis às promessas.** Reparent de janela-filha no HWND da taskbar (TrafficMonitor) é **instável** (bloqueado por AV, cai em flutuante); injeção em `explorer.exe` (Windhawk/ExplorerPatcher) **quebra em updates** (crash-loop) e é **flagada pelo Defender**. Colide com **"zero anti-cheat"** e **<1% CPU**.
- **A plataforma oficial de Widgets é a forma errada.** Exige **MSIX** ("only packaged apps can be registered as widget providers"), UI só em **Adaptive Cards JSON** (sem canvas/loop de animação), e vive **só no flyout** (Win+W) — nunca uma faixa sempre-visível na taskbar; o host suspende a renderização para poupar recurso.

**Precedente (Rusty's Retirement, líder do gênero):** janela **flutuante always-on-top** que **não** reserva espaço nem renderiza na taskbar (jogadores usam FancyZones p/ não sobrepor). **Alerta de CPU herdado:** o custo do gênero escala com **resolução/refresh + composição DWM** (relatos de 35% GPU / 70% CPU em telas altas no Rusty's) — risco a confirmar no orçamento (nosso WPF thin-renderer parte melhor).

**Conclusão que orienta o escopo:** o #4 **não** é "render dentro da taskbar" — é **de-riscar a faixa compacta ancorada à taskbar**, exatamente o **Plano B já aceito**. O spike **documenta o no-go** do caminho arriscado (não o força) e **mede** as duas posturas suportadas, ambas chamáveis de WPF unpackaged não-elevado.

> **⚠️ Reformulação sinalizada (drift-check):** o card diz "widget **na** taskbar" (render in-shell), mas a pesquisa mostra que isso é inviável sob as promessas. Esta SPEC executa o **Plano B do CLAUDE.md** (faixa compacta ancorada). Perseguir o in-shell (injeção/MSIX) seria outra decisão, a registrar antes de codar.

---

## Escopo — o que está DENTRO

- [ ] **Doc de pesquisa** (`README.md`): a landscape (deskband morto, reparent/injeção frágil+AV, Widgets=MSIX/flyout), o precedente (Rusty's flutua), as **duas posturas suportadas** (topmost strip × AppBar) com os primitivos Win32, o alerta de CPU por resolução, o Plano B e o kill-criteria.
- [ ] **App WPF de faixa compacta** (reusa padrões da SPEC-003) com **flag para alternar as duas posturas**:
  - [ ] **Postura A — janela topmost borderless** ancorada ao retângulo da taskbar (não rouba foco, fora do Alt-Tab). Estilos/bug do owner oculto em Notas.
  - [ ] **Postura B — AppBar** (`SHAppBarMessage`) que **reserva a borda** (nada sobrepõe). Sequência `ABM_*`/notificações `ABN_*` em Notas.
- [ ] **Ancoragem à taskbar** (`TaskbarAnchor.cs`): retângulo via `SHAppBarMessage(ABM_GETTASKBARPOS)`; **re-ancorar** em `WM_DISPLAYCHANGE`, `WM_DPICHANGED` (per-monitor-v2) e `ABN_POSCHANGED` — cobre taskbar movida (baixo/topo/esq/dir), Win11 centralizada, DPI e multi-monitor.
- [ ] **Detecção do Win+D** (`DwmGetWindowAttribute`/`DWMWA_CLOAKED`): **detectar e documentar** o cloaking (gap herdado da SPEC-003) — a correção WorkerW fica **fora** (tarefa do cliente real).
- [ ] **Harness de orçamento** (`measure-usage.ps1`, copiado da faixa): CPU idle **<1%** + com proxy animado, RAM **<150 MB** (process tree), sem leak, footprint.
- [ ] **Harness de validação** (`validate.ps1`): guia a checagem que o agente não vê (posição correta por monitor, re-ancoragem ao mover a taskbar/mudar DPI, auto-hide, app fullscreen, Win+D) e coleta as medidas.
- [ ] **Template de resultados** (`RESULTS.md`): formato da faixa (ambiente, tabela critério/resultado, achados numerados, bordas não observadas, **recomendação go/no-go + postura**).
- [ ] **Higiene dos gates**: o spike vive em `spikes/widget-taskbar/` — **fora** de `packages/*`; não entra nos 4 gates TS; ignorado por ESLint/Prettier; SPEC-lint do CI satisfeito.

---

## Escopo — o que está FORA

- **Render DENTRO da shell da taskbar** (deskband / reparent de janela-filha / injeção em `explorer.exe`) — **no-go documentado**, não implementado (viola zero-anti-cheat/<1% CPU).
- **MSIX + plataforma oficial de Widgets** (Adaptive Cards, `IWidgetProvider`, flyout Win+W) — forma errada (packaged, sem animação, só no flyout); só documentar.
- **A correção definitiva do Win+D/WorkerW** — herdada da SPEC-003; aqui só **detectar + documentar** (tarefa do cliente real, stack-agnóstica).
- **O conteúdo de jogo animado real** — usa placeholder/proxy da faixa (SPEC-003); arte é produto.
- **Config/persistência de posição, UI de settings, escolha automática de "quando compactar"** — produto, não spike (vira questão aberta).
- **Soak de 8 h** — aqui só o proxy de medição; o soak longo fica como pendência (igual SPEC-003/005).
- **i18n** — o spike hardcoda strings de teste.
- **Distribuição / code-signing / autoupdate** — SPEC de distribuição.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição |
|---|---|---|
| `spikes/widget-taskbar/README.md` | criar | Pesquisa (in-taskbar = no-go; 2 posturas suportadas), precedente, primitivos Win32, alerta de CPU, Plano B, kill-criteria. |
| `spikes/widget-taskbar/csharp-wpf/WidgetTaskbar.csproj` | criar | SDK bare, `WinExe`, TFM `net8.0-windows`, `UseWPF`, zero workload/NuGet (só Win32 P/Invoke). |
| `spikes/widget-taskbar/csharp-wpf/App.xaml` (+`.cs`) | criar | Bootstrap; lê a flag de postura (A/B); instância única. |
| `spikes/widget-taskbar/csharp-wpf/MainWindow.xaml` (+`.cs`) | criar | Faixa compacta (proxy animado via `TranslateTransform.X`), `WindowStyle=None`, `ShowInTaskbar=false`, `AllowsTransparency=false`. |
| `spikes/widget-taskbar/csharp-wpf/TaskbarAnchor.cs` | criar | `ABM_GETTASKBARPOS` + re-ancoragem em `WM_DISPLAYCHANGE`/`WM_DPICHANGED`/`ABN_POSCHANGED`; multi-monitor + 4 bordas + Win11 centralizada. |
| `spikes/widget-taskbar/csharp-wpf/AppBarHost.cs` | criar | Postura B: `SHAppBarMessage` (`ABM_NEW`/`QUERYPOS`/`SETPOS`/`REMOVE`), callback `ABN_*`. |
| `spikes/widget-taskbar/csharp-wpf/TopmostStrip.cs` | criar | Postura A: `WS_EX_NOACTIVATE\|TOOLWINDOW`, fix do owner oculto (`SetWindowPos HWND_TOPMOST`), detecção `DWMWA_CLOAKED` (Win+D). |
| `spikes/widget-taskbar/measure-usage.ps1` | criar | Copiado da faixa (parametrizado `-ProcessName`) — CPU idle + drift RAM. |
| `spikes/widget-taskbar/validate.ps1` | criar | Guia a validação (posição/re-ancoragem/auto-hide/fullscreen/Win+D) e coleta medidas. |
| `spikes/widget-taskbar/RESULTS.md` | criar | Template de resultados + recomendação go/no-go + postura. |
| `specs/DONE-006-spike-widget-na-taskbar.md` | criar | O DONE (ao final). |
| `CLAUDE.md` / `docs/projeto/roadmap.md` | modificar | "Estado atual" + status do #4 (no DONE). |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema. Spike de cliente puro (só Win32/WPF), sem persistência (OP-01 não se aplica).

---

## Mudanças de API (se aplicável)

Nenhuma API de produção. Sem I/O de rede — o spike só posiciona uma janela e mede. (Diferente da SPEC-005, aqui não há stub de servidor.)

---

## Critérios de aceitação

> Verificados no **Windows 11** (o agente builda+mede; o founder posiciona+observa o que o agente não vê). "Gates verdes" = os 4 gates **TS** seguem passando (spike fora de `packages/*`).

**Cenário 1 — Faixa compacta ancorada à taskbar (ambas as posturas)**
- Dado o EXE publicado; quando lanço em cada postura (A/B); então a faixa aparece **ancorada à borda da taskbar**, no **monitor correto**, com tamanho compacto.

**Cenário 2 — Não rouba foco, fora do Alt-Tab e da lista de botões**
- Dado a faixa visível; quando ela sobe e quando clico ao redor; então **não rouba foco** (`WS_EX_NOACTIVATE`), **não** aparece no Alt-Tab nem como botão de taskbar (`WS_EX_TOOLWINDOW` + `ShowInTaskbar=false`).

**Cenário 3 — Postura A (topmost strip): re-ancoragem**
- Dado a janela topmost; quando movo a taskbar (baixo/topo/esq/dir), mudo o DPI e troco de resolução/monitor; então ela **re-ancora** ao novo retângulo da taskbar; um app maximizado **pode cobri-la** (esperado — postura A não reserva espaço).

**Cenário 4 — Postura B (AppBar): reserva de borda + cleanup**
- Dado a AppBar registrada; quando ela sobe; então o SO **reserva a borda** (nada sobrepõe), ela trata `ABN_POSCHANGED`/`ABN_FULLSCREENAPP`, e ao sair faz **`ABM_REMOVE`** (a reserva de borda **não vaza** — a área de trabalho volta ao normal).

**Cenário 5 — Multi-monitor + posição da taskbar**
- Dado múltiplos monitores (taskbar primária `Shell_TrayWnd` + secundárias `Shell_SecondaryTrayWnd`) e o Win11 com **ícones centralizados**; quando a faixa ancora; então a posição está correta por monitor.
- **Nota factual (pesquisa):** a taskbar do **Win11 stock é travada embaixo** — mover para topo/lados foi removido no rewrite e não voltou (até 24H2/25H2). As 4 bordas só ocorrem com *shell replacers* (ExplorerPatcher/StartAllBack); testar se presentes, senão a ancoragem **embaixo** é o caso real.

**Cenário 6 — Auto-hide da taskbar**
- Dado a taskbar em auto-hide; quando ela some/aparece; então a faixa se comporta de forma **documentada** (segue/fica) — o comportamento é registrado, não necessariamente "perfeito".

**Cenário 7 — App em tela cheia**
- Dado um app fullscreen; então a postura A é **coberta** (esperado) e a postura B cede/recebe `ABN_FULLSCREENAPP` — comportamento registrado.

**Cenário 8 — Win+D (gap conhecido)**
- Dado o Win+D (mostrar desktop); quando ele dispara; então o spike **detecta** o cloaking via `DWMWA_CLOAKED` e **documenta** — a correção WorkerW fica para o cliente real (herdado da SPEC-003).

**Cenário 9 — Orçamento / footprint**
- Dado o caminho medido; quando a faixa está ociosa e com o proxy animado; então CPU **<1%** (process tree) sem leak, RAM **<150 MB**, footprint registrado vs. os 161 MB da SPEC-003; o **custo por resolução/refresh** (alerta do precedente) é medido.

**Cenário 10 — Kill honesto (edge)**
- Dado que **nenhuma** postura fica ancorada de forma confiável dentro de **<1% CPU** sem injeção/MSIX; então o spike **documenta o no-go** e **suaviza o Plano B** (compacto = faixa reposicionada, sem ancoragem especial) — **não força** resultado positivo nem recorre a injeção.

---

## Segurança (se aplicável)

- **OP-17 / cliente = casca:** a faixa é **política de UI pura** — posiciona uma janela e renderiza um proxy; **zero regra de jogo, zero anti-fraude**. Nada de rede.
- **Zero injeção / zero anti-cheat no cliente:** o spike **não** injeta em `explorer.exe` nem hooka a shell (reforça a promessa pública). Toda a técnica é windowing suportado (Win32 público).
- Sem segredos (OP-02/12): sem env, sem rede, sem chaves. OP-11 (sem stack trace exposto): N/A (sem backend).

---

## Riscos e dependências

| Risco | Prob. | Mitigação |
|---|---|---|
| **Postura A é coberta por app maximizado/fullscreen** (não reserva espaço) | Alta (esperado) | É a natureza da postura A (precedente Rusty's). Medir e comparar com a postura B (que reserva); decisão de produto (ambiente vs. reservado). |
| **AppBar "parece uma segunda taskbar"** (menos ambiente) | Média | Medir a sensação; a postura B é a alternativa robusta, não necessariamente a default. Recomendação sai do spike. |
| **Custo DWM escala com resolução/refresh** (precedente Rusty's: picos altos) | Média | Cap de FPS + render on-demand + `TranslateTransform.X` (memória) + `AllowsTransparency=false`; medir em resolução alta. |
| **Win+D esconde a faixa (DWM cloaking)** | Alta (conhecido) | `DWMWA_CLOAKED`=`DWM_CLOAKED_SHELL(2)` detecta; **só detectar+documentar** aqui. Achado: a correção WorkerW **afunda a janela para a camada de wallpaper** (atrás de tudo) → conflita com "sempre no topo"; os dois objetivos podem ser mutuamente exclusivos (prototipar no cliente real). |
| **Postura A: demote de topmost no 24H2** | Média | Abrir apps (Paint/Photos) rebaixa janelas `WS_EX_TOPMOST` mesmo com o estilo setado (24H2, sem fix MS; não ocorre no Win10). Re-assertar `HWND_TOPMOST` via hook de foreground. Ponto **a favor da postura B** (AppBar não depende de topmost). |
| **Re-ancoragem falha em DPI/multimon/troca de borda** | Média | Reagir a `WM_DPICHANGED`/`WM_DISPLAYCHANGE`/`ABN_POSCHANGED`; `ABM_GETTASKBARPOS` por monitor; testar as 4 bordas + Win11 centralizada. |
| **`ABM_REMOVE` esquecido vaza a reserva de borda** (área de trabalho encolhida após sair) | Média | Registrar cleanup no shutdown/crash-guard; `validate.ps1` confere que a área de trabalho volta ao normal. |

**Dependências:**
- **SPEC-003 (faixa)** — reusa a infra de windowing/medição; **ADR-001** (WPF ratificado); **.NET SDK 8** (presente); **founder** para posicionar/observar (mover taskbar, DPI, multimon, Win+D reais).
- **Desbloqueia:** o nível 2 da presença (produto) e informa se a "mini" precisa de postura A ou B.

---

## Notas de implementação

- **Duas posturas atrás de uma flag** (ex.: `--posture=appbar|topmost`) para comparar lado a lado no mesmo build.
- **Postura B (AppBar):** `ABM_NEW` (registrar msg de callback) → `ABM_QUERYPOS` → `ABM_SETPOS` → tratar `ABN_POSCHANGED`/`ABN_FULLSCREENAPP` no wndproc → **`ABM_REMOVE` no exit**. Referência conhecida: `PhilipRieck/WpfAppBar` (unpackaged, não-admin, comprovado).
- **Postura A (topmost strip):** `WindowStyle=None` + `ShowInTaskbar=false` + `Topmost=true` + estender `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`; **fix do owner oculto** — quando `ShowInTaskbar=false`, o WPF cria um owner oculto que **perde o topmost**; corrigir com `SetWindowPos(owner, HWND_TOPMOST, …, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE)`.
- **Retângulo da taskbar:** `SHAppBarMessage(ABM_GETTASKBARPOS)` dá borda+rect da taskbar; re-ancorar em `WM_DISPLAYCHANGE`, `WM_DPICHANGED`, `ABN_POSCHANGED`. Per-monitor-v2 no manifesto para o DPI reportar certo.
- **Animação barata:** `TranslateTransform.X` (memória: roda no render thread, sem layout/frame; 0,249% medido na SPEC-003) e **`AllowsTransparency=false`** (memória: composição por-pixel custa CPU).
- **Win+D:** `DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, …)` = `DWM_CLOAKED_SHELL(2)` sinaliza o cloaking do shell — logar/expor no proxy; **não** tentar a correção WorkerW (fora; e ela afunda para a camada de wallpaper, conflitando com "no topo").
- **Reposicionar por EVENTO, não por polling** (crítico p/ <1% CPU): `SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE)` dispara só quando a taskbar move; `EVENT_SYSTEM_FOREGROUND` para re-checar fullscreen. Sem timer de 1s (o "polling timer" é o que estoura CPU nos mods equivalentes).
- **Achar a taskbar certa:** enumerar `Shell_TrayWnd` e pegar a **owned por `explorer.exe`** — `FindWindow("Shell_TrayWnd")` cru pode retornar janela de terceiros (YASB/Cairo). Secundárias = `Shell_SecondaryTrayWnd`.
- **Fullscreen (reusa achado da SPEC-005):** `SHQueryUserNotificationState` sozinho **não** pega borderless-fullscreen (só `QUNS_BUSY`) — combinar com checagem de geometria (`GetForegroundWindow`→`GetWindowRect` cobre o monitor) para esconder a faixa sobre jogos.
- **Medição:** `measure-usage.ps1` reusado (locale-independent, process tree); rodar o **EXE publicado** (não `dotnet run`) para números realistas; medir também em **resolução/refresh altos** (alerta do precedente).
- **Gate hygiene:** `spikes/widget-taskbar/` fora de `packages/*`; herdar ignores da SPEC-003 (Prettier/ESLint ignoram `spikes/`; `.gitignore` cobre `bin/obj/publish*`).

**Questões abertas para o founder** (documentadas; não bloqueiam o spike):
1. **Postura default** — tensão real **ambiente × robustez**: (A) flutuante = mais fiel ao ethos ambiente, mas coberta por maximizado + carrega Win+D / demote-de-topmost 24H2 / DPI; (B) AppBar = **suportada, determinística, mais barata de manter <1% CPU** (recomendação do lado técnico), mas reserva borda e "parece segunda taskbar". O spike **mede as duas**; a escolha pondera ethos × robustez — decisão do founder no DONE.
2. **Quando compactar** — a "mini" é um **toggle manual** ou entra automaticamente (ex.: quando a faixa cheia sobreporia um app maximizado)? (produto).
3. **Auto-hide** — a mini deve **seguir** a taskbar em auto-hide ou ficar fixa?
4. **Prioridade do Win+D para a mini** — investir na WorkerW agora ou deferir (como na SPEC-003)? (Perseguir o caminho **in-shell** via injeção/MSIX: recomendação **não** — fora do ethos.)

---

## Checklist de aprovação

- [x] Objetivo está claro e verificável
- [x] Escopo está bem delimitado (dentro e fora) — **inclui a reformulação in-taskbar → faixa compacta ancorada (Plano B)**
- [x] Arquivos listados estão corretos e completos
- [x] Mudanças de schema estão documentadas (N/A)
- [x] Critérios de aceitação são testáveis (Windows; agente builda/mede, founder posiciona/observa)
- [x] Riscos e superfície de segurança foram avaliados (OP-17; zero injeção)
- [x] Appetite é razoável para o escopo definido (6–8 dias, spike com kill-criteria)
- [x] Não há conflito com SPECs abertas em paralelo
- [x] Alinhada à descrição do card **via o Plano B aceito no CLAUDE.md** (a reformulação está sinalizada para aprovação)
- [ ] **Aprovada** — aguardando aprovação do founder no card

---

*SPEC-006 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Assenta sobre o ADR-001 (stack WPF) e reusa a infra da SPEC-003 (faixa).*
