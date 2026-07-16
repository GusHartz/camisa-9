# DONE-006 — Spike widget na taskbar

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-006 |
| **SPEC correspondente** | SPEC-006-spike-widget-na-taskbar.md |
| **Feature** | Spike widget na taskbar (feature #4 — de-risk do cliente, nível 2 da presença) |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/spike-widget-na-taskbar` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado** | 2026-07-15 |
| **Desenvolvimento concluído** | 2026-07-15 |
| **Dias utilizados vs appetite** | <1 dia vs 8–10 dias (spike) |

---

## Resumo do que foi feito

De-riscado o **nível 2 da presença** (a "mini na taskbar" da visão) no **Windows 11 build 26200** (Ryzen 5 5600X,
non-elevated, .NET SDK 8.0.423, monitor único 1920×1080 @100%). **Achado de pesquisa** (fan-out de 4 agentes, fontes
primárias Microsoft): renderizar **dentro** da shell da taskbar do Win11 é **inviável** para o nosso caso — o **deskband**
foi removido (sem host XAML), os hacks restantes (reparent no HWND da taskbar / injeção em `explorer.exe`) **quebram em
updates** e são **flagados por AV** (colidem com "zero anti-cheat" e `<1% CPU`), e a plataforma **oficial de Widgets**
exige **MSIX** + Adaptive Cards e só aparece no flyout (Win+W). Então o spike **reformula o #4** (com aprovação do founder
na SPEC) **como faixa compacta ANCORADA à taskbar** — o **Plano B** que o CLAUDE.md já aceita — e compara as **duas posturas
suportadas** (unpackaged, não-elevado, sobre WPF/ADR-001): **A — topmost flutuante** vs **B — AppBar (`SHAppBarMessage`
reserva a borda)**.

**Veredito: GO-com-ressalvas → postura A (topmost) como padrão, B (appbar) como modo opcional.** As duas ancoram de forma
confiável **sem injeção nem MSIX** e **dentro de <1% CPU** — o **kill-criteria NÃO disparou**. Orçamento medido: **A 0,186% /
B 0,189%** de CPU (média, máquina), RAM pico **78,5 / 79,7 MB**; footprint **159,8 MB** self-contained (vs. ~161 MB da
SPEC-003) / **0,2 MB** framework-dependent. A preferência por A é de **ethos** (ambiente — cede a tela ao trabalho, não
parece 2ª taskbar) e **robustez** (evita a reserva preguiçosa do AppBar e o vazamento sob force-kill).

A sessão foi **orquestrada pelo agente** (publish → launch → medir → fechar gracioso → ler work area); o founder **posicionou
e observou** o que o agente não vê (ancoragem, foco/Alt-Tab, cobertura, "achei ótimo" na reserva do AppBar). **Revisão
adversarial** (workflow 5 dimensões → verificação): **15 reportados → 6 confirmados e corrigidos**. **2 achados novos ao
vivo** (L1 reserva preguiçosa do AppBar; L2 `CloseMainWindow` no-op). Detalhes e medidas verbatim em
[`spikes/widget-taskbar/RESULTS.md`](../spikes/widget-taskbar/RESULTS.md).

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `spikes/widget-taskbar/README.md` | Pesquisa (por que "dentro da taskbar" é no-go) + as 2 posturas + decisões de engenharia (evento, não polling) + como-rodar + kill-criteria. |
| `spikes/widget-taskbar/csharp-wpf/WidgetTaskbar.csproj` | SDK bare, `WinExe`, TFM `net8.0-windows`, `UseWPF`, `ApplicationManifest` — **zero workload/NuGet** (só Win32 P/Invoke). |
| `spikes/widget-taskbar/csharp-wpf/app.manifest` | `dpiAwareness` **PerMonitorV2** (geometria da taskbar é px físico por monitor). |
| `spikes/widget-taskbar/csharp-wpf/App.xaml` (+`.cs`) | Bootstrap: single-instance (Mutex), `ParsePosture` (`--posture=appbar\|topmost`, default topmost), `ShutdownMode.OnMainWindowClose`. |
| `spikes/widget-taskbar/csharp-wpf/MainWindow.xaml` (+`.cs`) | Coordenador: postura + âncora + observador por-evento; renderiza estado (postura/edge/rect/cloaked/fullscreen) p/ o founder; animação por `TranslateTransform`; duplo-clique fecha. OP-17. |
| `spikes/widget-taskbar/csharp-wpf/TaskbarAnchor.cs` | Postura A: `Compute` (rect da taskbar → banda ancorada à borda), `GetTaskbarRect`/`EdgeOf`/`BandRect`. |
| `spikes/widget-taskbar/csharp-wpf/TopmostStrip.cs` | Estilos Win32 `WS_EX_NOACTIVATE\|TOOLWINDOW` (+`TOPMOST` na A), `Reassert` (demote 24H2), `IsCloaked` (Win+D via `DWMWA_CLOAKED`). |
| `spikes/widget-taskbar/csharp-wpf/AppBarHost.cs` | Postura B: `SHAppBarMessage` `ABM_NEW→QUERYPOS→SETPOS`, `Remove` (`ABM_REMOVE`), espessura por-chamada (escala DPI). |
| `spikes/widget-taskbar/csharp-wpf/TaskbarWatcher.cs` | `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` — reposiciona **por evento, não por polling** (crítico p/ <1% CPU). |
| `spikes/widget-taskbar/csharp-wpf/Fullscreen.cs` | `SHQueryUserNotificationState` **+** checagem de geometria (reusa achado da SPEC-005) → esconde a faixa sobre jogos. |
| `spikes/widget-taskbar/csharp-wpf/Interop/NativeTypes.cs` | Structs `RECT`/`APPBARDATA`/`MONITORINFO` + constantes Win32 (`ABM_*`/`ABE_*`/`ABN_*`/`WS_EX_*`/`DWMWA_*`/`QUNS_*`/`EVENT_*`). |
| `spikes/widget-taskbar/csharp-wpf/Interop/NativeMethods.cs` | P/Invoke (`SHAppBarMessage`/`SetWindowPos`/`Get\|SetWindowLongW`/`MonitorFromWindow`/`DwmGetWindowAttribute`/`SetWinEventHook`). |
| `spikes/widget-taskbar/validate.ps1` | Harness: publica o EXE real, lança a postura escolhida, fecha a instância anterior de forma **graciosa** (`WM_CLOSE` por HWND), `-Footprint`. |
| `spikes/widget-taskbar/measure-usage.ps1` | Orçamento (copiado da SPEC-003/005, parametrizado, locale-independent). |
| `spikes/widget-taskbar/RESULTS.md` | Resultados preenchidos + medidas verbatim + achados L1/L2 + recomendação **GO-com-ressalvas**. |
| `specs/SPEC-006-spike-widget-na-taskbar.md` | A SPEC desta feature (reformulação #4 → faixa ancorada, aprovada no card). |
| `specs/DONE-006-spike-widget-na-taskbar.md` | Este documento. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `CLAUDE.md` | Seção "Estado atual" atualizada (spike #4 validado — GO-com-ressalvas). |
| `docs/projeto/roadmap.md` | Blockquote de de-risk do cliente para o #4 (widget na taskbar) — validado. |

> `.gitignore` já cobre `spikes/**/publish*/` (ajustado no DONE-005) — `publish/` e `publish-sc/` ficam fora do controle.

---

## Mudanças de schema aplicadas

Nenhuma migration. Spike de **cliente** puro (renderer); sem persistência (OP-01 não se aplica).

---

## Mudanças de API entregues

Nenhuma. O cliente é **thin renderer** (OP-17) — nenhuma regra de negócio, nenhum endpoint. Não há stub de servidor
nesta feature (diferente da SPEC-005): o que se prova aqui é **posicionamento/orçamento** de janela, 100% local.

---

## Critérios de aceitação — verificação

> Verificado no Windows 11 (agente builda/mede/orquestra; founder posiciona/observa). Legenda:
> ✅ validado · ✅⚠️ validado com ressalva · ⚪ mecanismo presente, não estressado ao vivo · N/A não testável nesta máquina.

| Cenário (SPEC-006) | A (topmost) | B (appbar) | Evidência |
|---|---|---|---|
| 1 — Ancora à taskbar, monitor certo | ✅ | ✅ | HWND rect `L0 T992 R1920 B1032`; founder: "tudo OK" (A) / "achei ótimo" (B). |
| 2 — Não rouba foco / fora do Alt-Tab | ✅ | ✅ | `WS_EX_NOACTIVATE\|TOOLWINDOW` nas duas; founder confirmou. |
| 3 — A re-ancora (tela/DPI); coberta por maximizado (esperado) | ✅ | — | cobertura = por design; handlers `WM_DISPLAYCHANGE`/`WM_DPICHANGED` presentes (DPI-change não exercido: 1 monitor @100%). |
| 4 — B reserva a borda; `ABM_REMOVE` limpa | — | ✅⚠️ | **reserva E liberação funcionam, com LATÊNCIA do shell** (Achado L1); **sem leak** na saída graciosa (992→1032). |
| 5 — Multi-monitor | N/A | N/A | máquina tem **1 monitor** — pendência. |
| 6 — Auto-hide da taskbar | ⚪ | ⚪ | caminho `WM_SETTINGCHANGE`→`ReAnchor` presente; toggle não estressado ao vivo. |
| 7 — App em tela cheia esconde/cede | ⚪ | ⚪ | mecanismo `SHQueryUserNotificationState`+geometria presente; status auto-reporta; jogo real não exercido. |
| 8 — Win+D (`DWMWA_CLOAKED` detecta) | ⚪ | ⚪ | `DwmGetWindowAttribute` presente; status auto-reporta; correção WorkerW **fora** (SPEC-003). |
| 9 — Orçamento CPU<1% / RAM<150 MB / sem leak | ✅ | ✅ | **A 0,186% / RAM 78,5 MB** · **B 0,189% / RAM 79,7 MB** (`measure-usage`: PASS). |
| 9 — Footprint | **159,8 MB** sc / 0,2 MB fd | (mesmo binário) | vs. ~161 MB SPEC-003. |
| 10 — Kill honesto | ✅ | ✅ | **não acionado** — ambas ancoram <1% CPU sem injeção/MSIX. |

**Gates TS:** os 4 gates (`lint`/`typecheck`/`test`/`build`) seguem verdes — o spike vive em `spikes/` (fora de
`packages/*`), ignorado por ESLint/Prettier; SPEC-lint do CI satisfeito.

---

## Como testar manualmente

```
Pré: NÃO-elevado; taskbar Win11 stock (embaixo).
1. cd spikes/widget-taskbar
2. dotnet build .\csharp-wpf\WidgetTaskbar.csproj -c Release       # compila 0/0
3. .\validate.ps1 -Posture topmost        # postura A (flutuante)
   .\validate.ps1 -Posture appbar         # postura B (AppBar — reserva a borda)
   .\validate.ps1 -Posture topmost -Footprint    # + mede o self-contained
   — NUNCA `dotnet run` (geometria/perf irreais).
4. Observar (o agente não vê): a faixa ancora? não rouba foco / fora do Alt-Tab?
   A: app maximizado a cobre (esperado). B: reserva a borda (NADA sobrepõe) — mas a
   work area só encolhe ~15-30s DEPOIS (Achado L1); confirme com um app maximizado.
5. .\measure-usage.ps1 -ProcessName WidgetTaskbar -Seconds 90     # CPU <1%, RAM <150 MB
6. Fechar: duplo-clique na faixa (dispara ABM_REMOVE). Na postura appbar, NÃO
   Stop-Process -Force (vaza a reserva de borda até restart do explorer).
```

**Dados de teste necessários:** nenhum backend — o spike é 100% local (posicionamento/orçamento de janela).

---

## Testes automatizados

Nenhum teste automatizado neste DONE (spike de cliente; a validação é medida/observada no Windows, não unit-testável sem
o shell/DWM real). Os gates TS existentes seguem cobrindo `packages/*`, inalterados por esta feature.

**Comando para rodar (inalterados):**
```bash
npm run lint && npm run typecheck && npm test && npm run build
```

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| Todo o spike (`spikes/widget-taskbar/**`) + `SPEC-006`/`DONE-006` | ~100% | Sim — código compilado 0/0; **revisão adversarial** (15→6 achados corrigidos); **validação orquestrada pelo agente e observada pelo founder** no Windows real; medidas lidas verbatim. 2 achados novos ao vivo (L1/L2), ambos corrigidos/documentados. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → dentro do ethos do spike (de-riscar honestamente), aplicadas na sessão:
  - **Reformulação #4 "dentro da taskbar" → "faixa compacta ancorada" (Plano B)** — não é desvio silencioso: renderizar na
    shell é inviável no Win11 (pesquisa); a reformulação foi **escrita na SPEC-006 e aprovada pelo founder no card** antes do código.
  - **Correção do harness (Achado L2):** `validate.ps1` passou a fechar via `WM_CLOSE` direto ao HWND (o `CloseMainWindow`
    anterior era no-op numa tool-window) — corrige a própria medição do Cenário 4. Fora do caminho de produção.

---

## Desvios em relação à SPEC

| Item da SPEC | O que foi feito | Motivo do desvio |
|---|---|---|
| #4 "widget **na** taskbar" (render dentro da shell) | **Reformulado** para faixa compacta **ancorada** (Plano B). | Render dentro da taskbar Win11 é **inviável** sem injeção/MSIX (deskband removido; hacks quebram/AV). Reformulação aprovada no card antes do código. |
| Cenário 4 (reserva "instantânea" do AppBar) | Reserva/liberação **funcionam**, mas com **latência do shell** (~15–30s). | **Achado L1** — recompute de work-area do Win11 26200 é preguiçoso, não do nosso código. Sem leak na saída graciosa. |
| Cenário 5 (multi-monitor) | **Não testado.** | Máquina de validação tem **1 monitor**. Pendência herdada. |
| Cenários 6/7/8 (auto-hide / tela cheia / Win+D **ao vivo**) | **Mecanismos presentes + auto-reporte no status**; não estressados ao vivo. | Sessão não acendeu esses estados (sem jogo em tela cheia, sem toggle de auto-hide). Gate/detecção corretos por inspeção. |

---

## Limitações conhecidas

- **Reserva preguiçosa do AppBar (Achado L1):** no Win11 26200 o encolhimento da work area assenta ~15–30s após o
  `ABM_SETPOS` (e a liberação por `ABM_REMOVE`, ~15s). Funciona e não vaza na saída graciosa, mas medir cedo lê falso
  "delta 0". Enfraquece a vantagem única da postura B → pró-postura A.
- **Vazamento sob force-kill (Achado 2 da revisão):** `Stop-Process -Force` (TerminateProcess) é ininterceptável → o
  `ABM_REMOVE` não roda e a reserva de borda vaza até um restart do `explorer.exe`. Há redes de segurança
  (`SessionEnding`/`ProcessExit`/exceção) para os caminhos que SÃO interceptáveis; o force-kill não é um deles.
- **`CloseMainWindow` no-op (Achado L2):** janela `WS_EX_TOOLWINDOW`+`ShowInTaskbar=false` não tem `MainWindowHandle`;
  fecha-se por `WM_CLOSE` direto ao HWND (ou duplo-clique).
- **Multi-monitor, DPI≠100% e troca de DPI** não exercidos (1 monitor @100%).
- **Auto-hide, jogo em tela cheia real e Win+D ao vivo** não estressados (mecanismos presentes + auto-reporte).
- **Win+D / WorkerW** (herdado da SPEC-003) e **soak longo** seguem em aberto.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Confirmar postura no cliente real (A padrão; B opcional) | **Alto** (ethos ambiente) | Cliente real / SPEC do nível 2 de presença. |
| Reserva preguiçosa do AppBar (L1) — decidir se B vale o custo | Médio | Só se B for adotado. |
| Multi-monitor / appbar em 2º monitor ("ghost registration") | Médio | Quando houver 2º monitor. |
| Auto-hide / tela cheia / Win+D — spot-check positivo ao vivo | Baixo | Oportunístico (mecanismos já corretos por inspeção). |
| Win+D/WorkerW (parenting p/ sobreviver a "mostrar desktop") | Médio | Cliente real (herdado da SPEC-003). |
| Soak longo (drift de RAM, demote de topmost 24H2 na prática) | Médio | Antes do GO definitivo do cliente. |

---

## Resposta empírica às questões abertas da SPEC

- **Postura padrão (A vs B):** **A (topmost)** — mesmo custo de CPU (~0,19%), fiel ao ethos ambiente (cede a tela ao
  trabalho) e sem a latência/leak do AppBar. B fica como modo "nada sobrepõe" opcional, ciente do delay de reserva.
- **Render dentro da taskbar é possível sem injeção/MSIX?** **Não** — é o achado central que justifica o Plano B.
- **Reposicionamento cabe em <1% CPU?** **Sim** — por **evento** (`SetWinEventHook`), não por polling: 0,186–0,189% média.

---

## Checklist de entrega

- [x] Critérios verificados (ancoragem/foco/orçamento **PASS** nas 2 posturas; Cenário 4 resolvido — reserva lazy, sem leak)
- [x] Medidas lidas verbatim (`measure-usage`, work area antes/depois, footprint)
- [x] Sem `any` / sem segredo / sem regra de negócio no cliente (OP-17)
- [x] Gates TS inalterados/verdes (spike fora de `packages/*`)
- [x] AI Declaration preenchida acima
- [x] `RESULTS.md` preenchido com dados reais + recomendação GO-com-ressalvas
- [x] `CLAUDE.md` seção "Estado atual" atualizada
- [x] `docs/projeto/roadmap.md` atualizado
- [ ] Este DONE commitado na branch *(commit/PR pendente de confirmação do founder)*

---

*DONE-006 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Assenta sobre o ADR-001 (stack WPF).*
