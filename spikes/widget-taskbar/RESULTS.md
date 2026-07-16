# RESULTS — Spike widget na taskbar (SPEC-006)

> Preenchido ao validar no Windows. O agente **compila e mede**; o founder **posiciona e observa**
> (o que o agente não vê). O spike **reformula** o #4 como faixa compacta ancorada à taskbar (Plano B).

## Ambiente

| Campo | Valor |
|---|---|
| Máquina / CPU | AMD Ryzen 5 5600X (6 núcleos / 12 lógicos) |
| SO | Windows 11 Pro build 26200 |
| .NET SDK | 8.0.423 (TFM `net8.0-windows`) |
| Elevado? | **não** (non-elevated ✓ — restrição do spike) |
| Taskbar | stock Win11, embaixo, travada, sem auto-hide (48 px reservados: work area 1032 de 1080) |
| Monitores | **1** — DISPLAY2 1920×1080 @ 100% DPI (banda de 40 px físicos = 40 DIP) |
| Data | 2026-07-15 |

---

## Critérios (SPEC-006)

| # | Critério | Postura A (topmost) | Postura B (appbar) | Observação |
|---|---|---|---|---|
| 1 | Faixa ancora à taskbar, monitor certo | ✅ | ✅ | HWND rect `L0 T992 R1920 B1032` (largura total, 40 px acima da taskbar); founder: "tudo OK" (A) / "achei ótimo" (B) |
| 2 | Não rouba foco / fora do Alt-Tab | ✅ | ✅ | `WS_EX_NOACTIVATE\|TOOLWINDOW` nas duas; founder confirmou |
| 3 | A re-ancora em mudança de tela/DPI; coberta por maximizado (esperado) | ✅ | — | cobertura por maximizado = por design; handlers `WM_DISPLAYCHANGE`/`WM_DPICHANGED` presentes (DPI-change não exercido: monitor único @100%) |
| 4 | B reserva a borda (nada sobrepõe); `ABM_REMOVE` limpa (área volta ao normal) | — | ✅⚠️ | **reserva E liberação funcionam, mas o shell recomputa a work area com LATÊNCIA** (ver Achado L1). Sem leak na saída graciosa |
| 5 | Multi-monitor + Win11 centralizado (taskbar stock = embaixo) | N/A | N/A | **não testável** — máquina tem 1 monitor. Pendência |
| 6 | Auto-hide da taskbar — comportamento documentado | ⚪ | ⚪ | caminho `WM_SETTINGCHANGE`→`ReAnchor` presente; toggle de auto-hide não estressado ao vivo. Pendência |
| 7 | App em tela cheia — faixa esconde/cede | ⚪ | ⚪ | mecanismo `SHQueryUserNotificationState`+geometria presente; status auto-reporta `fullscreen`; jogo real não exercido ao vivo. Pendência |
| 8 | Win+D — `DWMWA_CLOAKED` detecta (status na faixa) | ⚪ | ⚪ | `DwmGetWindowAttribute` presente; status auto-reporta `Win+D-cloaked`; correção WorkerW **fora** (herdada da SPEC-003). Pendência |
| 9 | Orçamento: CPU **<1%** (ociosa + animada), RAM **<150 MB**, sem leak | ✅ | ✅ | A: CPU **0,186 %** / RAM pico **78,5 MB** · B: CPU **0,189 %** / RAM pico **79,7 MB** |
| 9 | Footprint self-contained | **159,8 MB** | (mesmo binário) | vs. ~161 MB da SPEC-003; framework-dependent = **0,2 MB** |
| 10 | Kill honesto (se nenhuma ancora dentro de <1% CPU sem injeção/MSIX) | ✅ | ✅ | **nenhuma** postura exige injeção/MSIX; ambas ancoram <1% CPU. NÃO é no-go |

Legenda: ✅ validado · ✅⚠️ validado com ressalva · ⚪ mecanismo presente, não estressado ao vivo · N/A não testável nesta máquina.

---

## Medidas (verbatim)

```
=== POSTURA A (topmost) — 90s ocioso+animado ===
Amostras   : 90
CPU média  : 0,186 % (máquina)
CPU p95    : 0,515 %
CPU pico   : 0,776 %
RAM média  : 73,5 MB (working set total)
RAM pico   : 78,5 MB
RAM drift  : 10,0 MB (fim - início; warmup de startup, não leak — medida começou 4 s pós-launch)
Veredito   : PASS (< 1% CPU & < 150 MB)

=== POSTURA B (appbar) — 90s ocioso+animado ===
Amostras   : 90
CPU média  : 0,189 % (máquina)
CPU p95    : 0,517 %
CPU pico   : 1,161 %   (blip momentâneo — GC / recompute de work-area; a MÉDIA rege o "<1%")
RAM média  : 74,1 MB (working set total)
RAM pico   : 79,7 MB
RAM drift  : 11,1 MB (warmup de startup)
Veredito   : PASS (< 1% CPU & < 150 MB)

Footprint framework-dependent: 0,2 MB (5 arquivos)
Footprint self-contained     : 159,8 MB (464 arquivos) — vs. ~161 MB da SPEC-003 (WPF sem trim)
```

---

## Achados (loop build → run → medir)

> Revisão adversarial (workflow: 5 dimensões → verificação) rodou sobre o código: **15 reportados → 6 confirmados**.
> Os achados L* são da **validação interativa ao vivo** (não vistos pela revisão estática).

| # | Sev. | Achado | Ação |
|---|---|---|---|
| 1 | descoberta | Render **dentro** da taskbar é no-go (deskband removido; hacks frágeis/AV; Widgets=MSIX). | Reformulado como faixa compacta ancorada (Plano B) — DENTRO do escopo aprovado. |
| 2 | **major** | AppBar: `ABM_REMOVE` só rodava no `Closing` do WPF; `Stop-Process -Force` (TerminateProcess) o pula → **reserva de borda vaza**. | **Corrigido:** harness fecha **gracioso** + redes de segurança `SessionEnding`/`ProcessExit`/exceção. **Ressalva honesta:** kill forçado é ininterceptável → ainda vaza (recuperável via restart do explorer); validar o Cenário 4 fechando **gracioso**. |
| 3 | minor | `AppBarCallback = 0x0400+1` era **WM_USER+1** (comentado como WM_APP+1) — risco de colisão na classe WPF. | **Corrigido:** `0x8000+1` (WM_APP+1). |
| 4 | minor | Animação `Forever` não pausava ao esconder sobre fullscreen → timeline tickando (CPU no pior momento). | **Corrigido:** pausa (`BeginAnimation(..., null)`) ao esconder e retoma ao voltar. |
| 5 | minor | `BandWidth/Height` usados como px físico **e** DIP → tamanho quebra em DPI≠100%. | **Corrigido:** constantes em DIP, convertidas para px físico via `VisualTreeHelper.GetDpi` no anchor. |
| 6 | minor | Re-âncora em `WM_DPICHANGED` rodava **antes** do handler de DPI do WPF (que sobrescrevia). | **Corrigido:** `Dispatcher.BeginInvoke(ReAnchor, Background)` roda depois do WPF. |
| **L1** | **achado (Cenário 4)** | A **reserva de work-area do AppBar é aplicada com LATÊNCIA no Win11 26200**: a banda posiciona instantâneo (992–1032), mas o encolhimento da work area (1032→992) só "assenta" ~15–30 s depois; a liberação por `ABM_REMOVE` (992→1032) também é preguiçosa (~15 s). **Sem leak** na saída graciosa. Medir cedo demais lê "delta 0" (falso negativo — o que enganou a 1ª medição). | **Documentado.** Reserva/liberação **funcionam**; a latência é do shell, não do código. Enfraquece a vantagem única da postura B (reserva "instantânea") → insumo pró-postura A. |
| **L2** | **achado (harness)** | `CloseMainWindow()` é **no-op** nesta janela: `WS_EX_TOOLWINDOW`+`ShowInTaskbar=false` ⇒ **sem `MainWindowHandle`**. O "fechar gracioso" do validate.ps1 não fechava nada (e mascarava o Cenário 4). | **Corrigido:** harness envia `WM_CLOSE` direto ao HWND (`EnumWindows` por PID) → `Closing` → `ABM_REMOVE`. README/validate.ps1 atualizados; duplo-clique na faixa também fecha gracioso. |

## Bordas ainda não observadas

- **AppBar em monitor secundário** (glitch de work-area / "ghost registration" — pesquisa flag 25H2): não testável (1 monitor).
- **Auto-hide toggle, jogo em tela cheia real, Win+D ao vivo**: mecanismos presentes + auto-reporte no status da faixa, mas não estressados nesta sessão.
- **Win+D / WorkerW** (herdado da SPEC-003), **demote de topmost 24H2 na prática**, **soak longo**, **DPI≠100% / troca de DPI**, **taskbar movida** (shell replacer).

---

## Comparação das posturas (a decisão do founder)

| Eixo | A — topmost | B — appbar |
|---|---|---|
| Ambiente (ethos) | **fiel** — flutua, não parece 2ª taskbar | sente "2ª barra"; **reserva** espaço do usuário |
| Robustez / <1% CPU | 0,186 % média; depende de reafirmar topmost por evento | 0,189 % média; reserva **preguiçosa** (~15–30 s) no Win11 (L1) |
| Coberta por maximizado | **sim** (por design — cede a tela ao trabalho) | não (reserva a borda, quando assenta) |
| Sensação "2ª taskbar" | baixa | alta |

**Postura recomendada:** **A (topmost)** — é a fiel ao ethos ambiente ("cede a tela ao trabalho"), tem o mesmo custo de CPU (~0,19 %) e **não** carrega a latência/leak-em-force-kill da reserva do AppBar (L1/achado 2). B fica como **modo opcional** para quem quer "nada sobrepõe", ciente do delay de reserva.

---

## Recomendação go/no-go

> **GO-com-ressalvas — postura A (topmost) como padrão; B (appbar) como modo opcional.**
> As duas posturas ancoram de forma confiável **sem injeção nem MSIX** e **dentro de <1% CPU**
> (A 0,186 % / B 0,189 %, RAM <80 MB) — o **kill-criteria não disparou**. A escolha por A é de
> **ethos** (ambiente, cede a tela ao trabalho) e de **robustez** (evita a reserva preguiçosa do
> AppBar no Win11, achado L1, e o vazamento sob force-kill, achado 2).
>
> **Pendências (não bloqueiam o GO do spike):** multi-monitor/appbar em 2º monitor; auto-hide, jogo
> em tela cheia e Win+D **ao vivo** (mecanismos presentes, não estressados); Win+D/WorkerW (SPEC-003);
> soak longo; DPI≠100%. O "nível 2 da presença" (#4) fica **de-riscado** para a implementação do cliente real.
