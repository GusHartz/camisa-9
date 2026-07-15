# Spike — faixa always-on-bottom (SPEC-003)

De-risca a **forma padrão** do cliente camisa-9: uma faixa sem borda, **always-on-bottom**,
acima da taskbar, **com uma cena ambiente animada** — atrás das janelas normais, sem roubar foco —
sustentando **< 1% CPU** e **< 150 MB RAM** por um **expediente inteiro (soak de 8 h)**, em setup
**multi-monitor**. Construída em **dois candidatos de stack** para alimentar a Ratificação de stack (#1).

> ## ✅ Validado no Windows (2026-07-15)
>
> Candidato **A (C#/WPF)** rodado e medido no Windows 11 (Ryzen 5 5600X). **Números completos em
> [`RESULTS.md`](RESULTS.md).** Resumo:
>
> - **Orçamento — PASS com folga:** CPU média **0,249%** (< 1%), RAM **~87 MB** (< 150 MB), sem leak
>   no proxy de 3 min. Este era o **risco central** do spike (animação cabe no orçamento?) → **GO**.
> - **Comportamento — PASS:** sem borda, full-width acima da taskbar, cena animada, atrás das janelas,
>   não rouba foco, fora de taskbar/Alt-Tab/Task View, multi-monitor OK.
> - **Único ponto aberto — Win+D:** o "mostrar desktop" do Win11 (DWM cloaking) esconde a faixa;
>   sobreviver exige parentar à WorkerW (ver "A técnica"). Deferido ao cliente real.
> - **Footprint:** 161 MB self-contained / 0,2 MB framework-dependent (+ runtime .NET 8 Desktop) —
>   o principal insumo da **#1** (WPF vs. Rust). Candidato **B (Rust) não implementado** (A passou no
>   orçamento → sem pressão de kill; footprint é o eixo que resta pra #1).
> - **1 bug de código corrigido:** `ClipToBounds` no `<Window>` crashava o startup (fix = remover; a
>   clipagem já é do `Canvas`). É o único diff de código do spike.
>
> Pendências antes do GO definitivo: soak de 8 h; decisão sobre o Win+D; a #1 (WPF vs. Rust).

---

## O risco real deste spike

Não é "uma janela parada fica no fundo?" — é **"uma cena ambiente ANIMADA cabe em < 1% CPU e
< 150 MB por 8 h, nos meus monitores?"**. Um relógio estático bate o orçamento trivialmente e não
prova nada. Por isso a faixa aqui tem uma **cena animada placeholder** (orbes em drift) e a medição
inclui **RAM + soak de 8 h** (detecção de leak via *drift* de memória).

---

## A técnica (Win32)

| Comportamento | Como |
|---|---|
| **Sem borda** | `WindowStyle=None`, `ResizeMode=NoResize`. |
| **Não rouba foco** | `WS_EX_NOACTIVATE` (`0x08000000`) — a faixa nunca vira a janela ativa. |
| **Fora da taskbar / Alt-Tab** | `WS_EX_TOOLWINDOW` (`0x00000080`) + `ShowInTaskbar=False`. |
| **Always-on-bottom** | `SetWindowPos(HWND_BOTTOM)` **e** interceptar **`WM_WINDOWPOSCHANGING`** forçando `hwndInsertAfter = HWND_BOTTOM` (limpando `SWP_NOZORDER`) a cada tentativa de reordenar. **Nunca** `HWND_TOPMOST`. |
| **Multi-monitor** | Ancora na work area do **primário**; re-ancora em **`WM_DISPLAYCHANGE`** (hotplug/reordenação). |

**Posição:** `SystemParameters.WorkArea` (já exclui a taskbar), full-width, `Top = wa.Bottom - altura`.

> **Limitação medida — "mostrar desktop" (Win+D) no Win11.** A técnica acima segura z-order (foco,
> alternância de janelas) mas **não** sobrevive ao Win+D: o "mostrar desktop" do Win11 esconde a
> janela por **DWM cloaking**, sem enviar `WM_SHOWWINDOW`/`WM_SIZE`/`SWP_HIDEWINDOW` (confirmado por
> instrumentação) — logo, não dá pra barrar por mensagem. A solução conhecida é **parentar a faixa à
> camada `WorkerW` do desktop** (`SetParent` sob o `Progman`/`WorkerW`, técnica do Wallpaper
> Engine/Lively). No Win11 isso é não-trivial (o `SendMessage 0x052C` não spawna a `WorkerW` separada
> como no Win10; o `SetParent` precisa de cuidado extra p/ persistir) → **tarefa do cliente real**, não
> do spike. Ver `RESULTS.md` › Achado #2.

**Cena animada barata:** a cena anima um **`TranslateTransform.X`** (não `Canvas.Left`) — transformações
rodam no *render/composition thread* **sem disparar layout** por frame; sem alocação por frame (evita
GC/leak no soak). O alvo do drift vem da **largura real** da faixa (code-behind), cobrindo qualquer
monitor. `AllowsTransparency` fica **desligado** (composição por-pixel custa CPU) — fundo sólido. É a
aposta para caber no orçamento; **medir** é o ponto.

**Como ler as métricas:** `measure-usage.ps1` usa `System.Diagnostics.Process` (independente de locale —
roda igual em Windows **pt-BR** e en-US). **CPU = % da máquina** (100% = todos os núcleos; a mesma
convenção do Gerenciador de Tarefas — dá pra conferir olho no olho). **RAM = working set total**
(`WorkingSet64`), que é o que o "< 150 MB" da SPEC mede.

---

## Candidato A — C#/WPF: rodar e medir

**Pré-requisitos:** [.NET 8 SDK](https://dotnet.microsoft.com/download) no Windows 10/11.

```powershell
cd spikes\faixa-always-on-bottom\csharp-wpf

# 1) Rodar (framework-dependent, rápido)
dotnet run -c Release

# 2) Publicar self-contained p/ medir footprint real (WPF não faz trim → grande, é dado da #1)
dotnet publish -c Release -r win-x64 --self-contained -o publish
.\publish\FaixaSpike.exe
```

Com a faixa aberta e a **cena animada rodando**, meça (noutro terminal):

```powershell
cd spikes\faixa-always-on-bottom

# Verificação rápida (5 min)
.\measure-usage.ps1 -ProcessName FaixaSpike -Seconds 300

# Soak de 8 h (amostra a cada 5 s)
.\measure-usage.ps1 -ProcessName FaixaSpike -Seconds 28800 -IntervalSeconds 5
```

Depois preencha **`RESULTS.md`** (checklist dos cenários + números).

### O que observar (critérios da SPEC-003)
1. Abre sem borda, full-width, acima da taskbar, com a **cena animada** suave.
2. Fica **atrás** das janelas; **não** rouba foco; fora da taskbar/Alt-Tab.
3. Clicar/alternar janelas **não** traz a faixa à frente. **Win+D esconde a faixa** no Win11 (DWM
   cloaking — ver "Limitação medida" acima); sobreviver a isso exige o parenting à WorkerW.
4. **CPU média < 1%** e **RAM < 150 MB** — e **sustentado em 8 h** (RAM sem crescimento persistente).
5. **Multi-monitor:** ancora certo no primário; estável ao reordenar/plugar monitores.
6. Qualquer falha é **dado**, não fracasso — anote.

---

## Plano B — modo compacto

Se o orçamento full-width com animação não fechar (`< 1%`/`< 150 MB` inatingível, ou always-on-bottom
brigando com Win+D), o fallback aceito no CLAUDE.md é o **modo compacto**: a **mesma janela** colapsa
para um bloco pequeno num canto acima da taskbar (mesmos estilos bottom-pinned), com a cena
**reduzida ou pausável**. Menos superfície, menos custo, sem reservar a tela toda. A troca é só
recalcular `Left/Width` no `Anchor()` e reduzir/parar a animação.

---

## Fora de escopo (SPEC-003)
- **DPI misto** entre monitores (multi-monitor homogêneo está dentro; DPI misto é observação).
- **Widget na taskbar** (#4) e **toasts** (#3) — spikes separados.
- **Arte/cena final** — aqui é placeholder; a cena real é produto.
- **Qualquer lógica de jogo** — a faixa é casca (OP-17).

## Kill-criteria
Se **nenhum** candidato sustentar `< 1% CPU` **+** `< 150 MB` **com a animação** (ou não segurar
always-on-bottom), o spike documenta o **no-go** e o motivo (`RESULTS.md`) — a forma padrão é
reavaliada, sem forçar resultado.
