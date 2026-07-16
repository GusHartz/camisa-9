# Spike — widget na taskbar (SPEC-006, feature #4)

De-risca o **nível 2 da presença** (a "mini na taskbar"). **Achado da pesquisa (4 agentes, fontes
primárias Microsoft):** renderizar **dentro** da shell da taskbar do Win11 é **inviável** para o nosso
caso — então o spike **reformula o #4 como faixa compacta ANCORADA à taskbar** (o Plano B que o CLAUDE.md
já aceita) e compara as **duas posturas suportadas** (unpackaged, não-elevado, sobre WPF/ADR-001).

> **Por que não "dentro da taskbar":** **deskband** morreu (deprecado desde Win7, removido da taskbar XAML
> do Win11 — sem host); os hacks que restam (**reparent** no HWND da taskbar tipo TrafficMonitor; **injeção**
> em `explorer.exe` tipo Windhawk/ExplorerPatcher) **quebram em updates** e são **flagados por AV** — colidem
> com "zero anti-cheat" e `<1% CPU`; a **plataforma oficial de Widgets** exige **MSIX** + Adaptive Cards e só
> aparece no **flyout** (Win+W). Precedente do gênero (Rusty's Retirement): **flutua**, não renderiza na taskbar.

---

## As duas posturas (o que o spike compara)

| | **A — Topmost flutuante** (`--posture=topmost`) | **B — AppBar** (`--posture=appbar`) |
|---|---|---|
| Como | Janela borderless topmost ancorada ao retângulo da taskbar | `SHAppBarMessage` **reserva** a borda inferior |
| Feel | **Ambiente** (fiel ao ethos) | "Segunda taskbar" |
| Cobertura | App maximizado **cobre** (não reserva espaço) | **Nada sobrepõe** (reserva work area) |
| Riscos | Win+D cloaking, demote de topmost 24H2, DPI | Multimon/"ghost registration"; precisa de `ABM_REMOVE` |
| Robustez | Depende de reafirmar topmost | **Suportada, determinística, mais barata p/ <1% CPU** |

Ambas: `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` (não rouba foco, fora do Alt-Tab), `ShowInTaskbar=false`,
`AllowsTransparency=false` (memória: transparência custa CPU), animação por `TranslateTransform` (render thread).

## Decisões de engenharia (grounded na pesquisa)

- **Reposicionar por EVENTO, não por polling** (crítico p/ `<1% CPU`): `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)`
  para reafirmar topmost (demote 24H2), re-checar fullscreen e o cloak do Win+D; mudanças de tela/DPI/taskbar
  vêm pelo `wndproc` (`WM_DISPLAYCHANGE`/`WM_DPICHANGED`/`WM_SETTINGCHANGE`) e, na postura B, por `ABN_POSCHANGED`.
  *(O `EVENT_OBJECT_LOCATIONCHANGE` global é chato demais — a versão de produção o escoparia à pid do `explorer`.)*
- **DPI:** `app.manifest` PerMonitorV2 (geometria da taskbar é px físico por monitor).
- **Fullscreen (reusa achado da SPEC-005):** `SHQueryUserNotificationState` **+** checagem de geometria
  (borderless-fullscreen só reporta `QUNS_BUSY`) → esconde a faixa sobre jogos.
- **Win+D:** `DwmGetWindowAttribute(DWMWA_CLOAKED)` **detecta** o cloaking do shell — a correção WorkerW fica
  **fora** (herdada da SPEC-003; e ela afunda p/ a camada de wallpaper, conflitando com "no topo").
- **`ABM_REMOVE` no exit** (postura B) — senão a reserva de borda **vaza** (área de trabalho encolhida).

## Como rodar (Windows 11, NÃO-elevado)

```powershell
# Build (verificação de compilação):
dotnet build .\csharp-wpf\WidgetTaskbar.csproj -c Release

# Lança cada postura (publica o EXE real — NUNCA dotnet run):
.\validate.ps1 -Posture topmost
.\validate.ps1 -Posture appbar
.\validate.ps1 -Posture topmost -Footprint    # + mede o self-contained

# Orçamento (faixa ociosa + animada):
.\measure-usage.ps1 -ProcessName WidgetTaskbar -Seconds 120
```

Fechar a faixa: **duplo-clique** nela (dispara `ABM_REMOVE`). **Não** use `CloseMainWindow()` — é **no-op**
aqui (janela `WS_EX_TOOLWINDOW` + `ShowInTaskbar=false` não tem `MainWindowHandle`); o harness fecha enviando
`WM_CLOSE` direto ao HWND (via `EnumWindows` por PID). Na **postura appbar**, evite `Stop-Process -Force`:
TerminateProcess não é interceptável, então o cleanup não roda e a **reserva de borda vaza** (work area
encolhida) até um restart do `explorer.exe`. Há redes de segurança (`SessionEnding`/`ProcessExit`/exceção)
para os caminhos que SÃO interceptáveis; o kill forçado não é um deles.

## Kill-criteria (honesto)

Se **nenhuma** postura ancora de forma confiável dentro de `<1% CPU` sem **injeção** ou **MSIX** → o spike
**documenta o no-go** e **suaviza o Plano B** (compacto = a faixa reposicionada, sem ancoragem especial). Não
se recorre a injeção em `explorer.exe` (viola "zero anti-cheat").

## Estado

- ✅ **Compila** (0 warn / 0 erro, SDK 8, TFM `net8.0-windows`, zero workload/NuGet — só Win32 P/Invoke).
- ⏳ **Validação interativa no Windows** (o founder posiciona/observa): ancoragem, foco/Alt-Tab, cobertura,
  auto-hide, fullscreen, Win+D, orçamento. Resultados em [`RESULTS.md`](RESULTS.md).
