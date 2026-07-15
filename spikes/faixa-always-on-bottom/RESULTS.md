# RESULTS — Spike faixa always-on-bottom (SPEC-003)

> Validado pelo **founder no Windows** em 2026-07-15 (candidato A). Os números vêm do
> `measure-usage.ps1`; os comportamentos foram verificados na tela + por leitura do estilo
> real da janela (P/Invoke) durante a sessão.

**Ambiente de teste**
- Windows: **11 Pro — build 26200**
- CPU / núcleos lógicos: **AMD Ryzen 5 5600X — 12**
- RAM total: **15,9 GB**
- Monitores: **2+ (founder confirmou multi-monitor OK)**; no snapshot final 1 ativo — **1920×1080**, escala 100%
- Taskbar: **inferior (padrão)**
- Data: **2026-07-15**

---

## Candidato A — C#/WPF (.NET 8)

| Métrica | Valor |
|---|---|
| Abre sem borda, full-width, acima da taskbar? | ☑ **sim** — janela 1920×40 ancorada em `y=992` (work area 0–1032), colada acima da taskbar |
| **Cena animada** roda suave? | ☑ **sim** — orbes em drift + relógio, sem stutter |
| Fica ATRÁS de janelas normais (não rouba foco)? | ☑ **sim** — `WS_EX_NOACTIVATE` confirmado no estilo vivo (`0x08000080`) |
| Fora da taskbar e do Alt-Tab? | ☑ **sim** — `WS_EX_TOOLWINDOW` confirmado; founder verificou ausência em taskbar, Alt-Tab e Task View |
| Sobrevive a "mostrar desktop" (Win+D)? | ☒ **NÃO** — a faixa some. O "mostrar desktop" do Win11 usa **DWM cloaking** (nenhuma msg de janela dispara). Ver "Achados". |
| Sobrevive a clicar/alternar janelas? | ☑ **sim** — permanece fixada no fundo |
| **Multi-monitor:** ancora certo no primário / estável? | ☑ **sim** — founder confirmou; re-ancora em `WM_DISPLAYCHANGE` |
| **CPU média (% da máquina), 3 min** | **0,249 %** |
| CPU p95 / pico | 0,518 % / 0,649 % |
| **RAM média / pico (working set total)** | **86,6 / 87,1 MB** |
| **Soak 8 h — CPU média** | _não executado_ (ver "Pendências"; proxy de 3 min abaixo) |
| **Soak 3 min (proxy) — RAM pico / drift** | 87,1 MB / **−0,6 MB** (drift negativo → sem leak no intervalo) |
| **Veredito de orçamento** (CPU < 1% **e** RAM < 150 MB) | ☑ **PASS** — folga de ~4× em CPU, ~1,7× em RAM |
| Tamanho publicado (self-contained win-x64, MB) | **161 MB** (WPF não faz trim — con conhecido da #1) |
| Tamanho (framework-dependent, MB) | **0,2 MB** (exige runtime **.NET 8 Desktop** instalado) |
| Startup (instantâneo / perceptível / lento) | **perceptível** (~1–2 s framework-dependent; inclui JIT/WPF) |
| Complexidade de build (1 fácil – 5 difícil) | **2** — `dotnet build` trivial; custo único de instalar o SDK 8 |
| Bugs / observações | 2 achados na 1ª execução Windows — ver abaixo |

**Log do measure-usage.ps1 (proxy rápido, 3 min):**
```
Medindo 'FaixaSpike' (PID 20228) por 180 s (intervalo 1s) em 12 núcleos...
Amostras   : 180
CPU média  : 0,249 % (máquina)
CPU p95    : 0,518 %
CPU pico   : 0,649 %
RAM média  : 86,6 MB (working set total)
RAM pico   : 87,1 MB
RAM drift  : -0,6 MB (fim - início; >0 persistente = leak)
Veredito   : PASS (< 1% CPU & < 150 MB)
```

**Log do measure-usage.ps1 (soak 8 h):**
```
Não executado nesta sessão. O harness suporta (comando no README):
  .\measure-usage.ps1 -ProcessName FaixaSpike -Seconds 28800 -IntervalSeconds 5
Recomendado antes de travar o GO definitivo da forma (o proxy de 3 min não mostra leak).
```

### Achados da validação Windows (o loop "entregar → medir → corrigir")

1. **[corrigido] Crash de startup — `ClipToBounds` no `<Window>`.** O código (escrito no macOS,
   nunca compilado) tinha `ClipToBounds="True"` no elemento `Window`, propriedade que o WPF
   **proíbe em Window** → `InvalidOperationException` no parse do XAML, 100% das execuções (exit
   `0xE0434352`). A faixa nunca chegava a aparecer. **Fix:** remover do `Window` — a clipagem dos
   orbes já é feita pelo `Canvas` interno (`ClipToBounds="True"`, válido). É o único diff de código
   do spike, e é o build medido acima.

2. **[caracterizado, não corrigido] Win+D esconde a faixa.** Instrumentação por mensagens provou
   que o "mostrar desktop" do Win11 **não** dispara `WM_SHOWWINDOW`/`WM_SIZE`/`SWP_HIDEWINDOW` —
   é **DWM cloaking**, ininterceptável por mensagem de janela. As tentativas leves (barrar
   `SWP_HIDEWINDOW`, engolir `SC_MINIMIZE`) não resolvem. A solução conhecida é **parentar a faixa
   à camada WorkerW do desktop** (técnica do Wallpaper Engine/Lively, que também é WPF). Tentado
   nesta sessão: no **Win11** o `SendMessage 0x052C` não spawna a WorkerW separada como no Win10 e
   o `SetParent` no Progman não persistiu (`GetParent` volta a 0). É **solucionável mas não-trivial
   e específico do Win11** — decidido (founder) **deferir ao cliente real** e documentar aqui, em
   vez de perseguir às cegas. Ver "Recomendação".

### Bordas ainda não observadas
- **Soak de 8 h** (Cenário 4) — não rodado; proxy de 3 min sem leak.
- **Hotplug de monitor ao vivo** — código re-ancora em `WM_DISPLAYCHANGE`, mas não foi exercido
  desconectando/reconectando fisicamente durante a sessão.
- **DPI misto** (fora de escopo da SPEC) — não avaliado.

---

## Candidato B — Rust/Win32 (windows-rs)

**Não implementado.** A sequência ratificada na SPEC-003 era "A valida → só então B". O candidato A
**passou no orçamento com folga grande** (CPU 0,25%, RAM 87 MB), o que **reduz a pressão** pela
alternativa enxuta do Rust: o objetivo do B era ter uma baseline nativa caso o WPF estourasse CPU/RAM,
e ele não estourou. O único dado que o B melhoraria claramente é o **footprint** (161 MB self-contained
do WPF vs. poucos MB de um binário Win32). Decisão de implementar o B fica para a **#1** (ver abaixo),
não bloqueia a viabilidade da forma.

---

## Recomendação para a Ratificação de stack (#1)

- **Candidato recomendado:** **A (C#/WPF)** como baseline viável da forma padrão. Provou que a
  faixa animada always-on-bottom **cabe no orçamento com folga** (CPU ~0,25% / ~3% de um núcleo;
  RAM ~87 MB; sem leak no proxy) e entrega always-on-bottom, no-focus, no-taskbar e multi-monitor.
- **Justificativa (CPU × RAM × footprint × velocidade de dev × manutenibilidade):** CPU e RAM
  passam com margem; dev é rápido (interop Win32 mínimo, `dotnet build` trivial); manutenibilidade
  boa (C#/WPF). O **con real é o footprint**: 161 MB self-contained (WPF não faz trim no .NET 8) ou
  0,2 MB framework-dependent com a dependência do **runtime .NET 8 Desktop** no instalador. Esse é o
  eixo onde o candidato B (Rust) ganharia — a decisão da #1 é essencialmente **"o footprint do WPF é
  aceitável para a distribuição (Steam + instalador próprio) ou justifica o custo de dev do Rust?"**.
- **Go/No-go da forma padrão** (faixa animada always-on-bottom a < 1% CPU / < 150 MB): **GO no que a
  SPEC marcou como risco central** (o orçamento com animação). O **único ponto aberto** é sobreviver
  ao "mostrar desktop" (Win+D) no Win11, que exige o parenting à WorkerW — **conhecido e solucionável**,
  não um bloqueador da forma.
- **Plano B (modo compacto) necessário?** **Não pelo orçamento** — CPU/RAM full-width passam, então
  não há pressão de custo para colapsar a faixa. O modo compacto continua disponível como opção de
  produto, mas o spike não o exige.
- **Pendências antes do GO definitivo:** (1) rodar o **soak de 8 h**; (2) decidir o tratamento do
  **Win+D** (implementar WorkerW no cliente **ou** ratificar "sumir no Win+D" como comportamento
  ambiente desejado); (3) a **#1** decide WPF vs. Rust pelo eixo footprint.
