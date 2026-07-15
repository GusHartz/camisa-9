# Spike — toasts acionáveis (SPEC-005, feature #3)

De-risca o **nível 3 da presença**: um **toast WinRT nativo com 2 botões** que, ao ser clicado,
**registra a decisão num servidor sem abrir/roubar foco** — inclusive com o app **fechado** — e que
**silencia** durante tela cheia / apresentação. Stack ratificada: **C#/WPF** (ADR-001).

> **O risco real não é mostrar o toast.** É a **ativação COM em cold-start**: com o app fechado, o
> Windows precisa reativar o processo via um COM activator registrado para o handler encaminhar a
> decisão. Essa perna é a historicamente instável para apps **unpackaged** — o "Win+D" desta feature.

---

## A técnica

**Caminho escolhido: CommunityToolkit `ToastNotificationManagerCompat`** (`Microsoft.Toolkit.Uwp.Notifications` **7.1.3**, TFM `net8.0-windows10.0.22621.0`).

- É a **única** opção feita para **Win32/WPF unpackaged**: no primeiro `.Show()` auto-registra um
  **AUMID** + um **COM activator in-proc** em `HKCU`, **sem** atalho de Start Menu e **sem** você
  escrever a classe `INotificationActivationCallback` à mão.
- **NuGet puro, ZERO workload** (verificado nesta máquina: `dotnet build` 0 warn / 0 erro com SDK 8.0.423).
- **Rejeitados:** `AppNotificationManager` (Windows App SDK) arrasta o **runtime WinAppSDK** — no
  unpackaged self-contained ele ainda tenta carregar DLL de runtime e lança (issue #6071); peso
  desproporcional para toasts. `Windows.UI.Notifications` **cru** funciona mas força escrever à mão
  tudo que o toolkit faz (AUMID, COM server, activator) — mais frágil, sem upside.

### Warm vs. cold — o coração

Warm (app rodando) **e** cold (app fechado, relançado pelo clique) saem pelo **mesmo**
`ToastNotificationManagerCompat.OnActivated`. O que os distingue é
**`WasCurrentProcessToastActivated()`**:

| Situação | `WasCurrentProcessToastActivated()` | O que fazemos |
|---|---|---|
| Launch normal (você abre o app) | `false` | Abre a **janela-gatilho** de teste |
| Clique com app **aberto** (warm) | `false` no processo, mas `OnActivated` dispara | Encaminha a decisão; **não** traz a janela à frente |
| Clique com app **fechado** (cold) | `true` | Roda **HEADLESS** (nenhuma janela), encaminha e **sai** |

> **Verdade franca:** "sem abrir o app" = **sem janela / sem foco** — mas **um processo sempre
> cold-starta** para atender o clique. Ele roda headless, faz um POST **opaco** (OP-17) e encerra.
> Toda validade (janela de presença, rate, replay) é **server-side** (futuro).

Fluxo no código: [`App.xaml.cs`](csharp-wpf/App.xaml.cs) subscreve `OnActivated` **antes** de qualquer
janela e ramifica; [`ToastActivation.cs`](csharp-wpf/ToastActivation.cs) faz o **POST bloqueante** (o
processo cold **não** pode morrer antes do ack) e grava um **arquivo de prova**.

### Regras de silêncio

[`NotificationGate.cs`](csharp-wpf/NotificationGate.cs) — `SHQueryUserNotificationState`, allowlist
`== QUNS_ACCEPTS_NOTIFICATIONS`. Cobre o que o card pede e mais: fullscreen exclusivo
(`QUNS_RUNNING_D3D_FULL_SCREEN`), **borderless-fullscreen** (`QUNS_BUSY` — o caso comum dos jogos),
apresentação (`QUNS_PRESENTATION_MODE`) e quiet hours / Focus Assist (`QUNS_QUIET_TIME`). **Fail-open**
em erro (perder o ritual das 15h é pior que um toast ocasional).

> **Descoberta na implementação:** **não há API pública limpa** de "Foco/DND ligado" no Win11 —
> `Windows.UI.Notifications.NotificationMode` (suposição da pesquisa) **não existe** nessa projeção e
> não compila. O sinal confiável é o `SHQueryUserNotificationState` acima (o `QUNS_QUIET_TIME` captura
> o Focus Assist em quiet hours). Detecção fina de DND via registry/WNF fica como **follow-up
> documentado**, não implementada (SPEC-005 § FORA).

---

## Como rodar (Windows 11, NÃO-elevado)

Pré-teste: **notificações do app LIGADAS** e **Focus Assist OFF** no happy-path.

```powershell
# 1) Build (verificação de compilação):
dotnet build .\csharp-wpf\ToastSpike.csproj -c Release

# 2) Fluxo guiado (publica o EXE real, sobe o stub, orquestra warm + cold):
.\validate.ps1
#    — o script pede o clique nos botões DO TOAST (warm, depois cold com o app fechado)
#      e verifica novo PID + log do stub + arquivo de prova.

# 3) Orçamento (app-gatilho ocioso) + footprint:
.\measure-usage.ps1 -ProcessName ToastSpike -Seconds 120
dotnet publish .\csharp-wpf\ToastSpike.csproj -c Release -r win-x64 --self-contained true -o .\csharp-wpf\publish-sc
#    — medir o tamanho de publish-sc\ e comparar com o ~161 MB da SPEC-003 (datum da #1).
```

> **NUNCA `dotnet run`** para o teste de ativação: o `LocalServer32` registraria `dotnet.exe` e a
> **cold-activation quebra**. Sempre o **EXE publicado**.

Artefatos de prova (ambos em `%LOCALAPPDATA%\camisa9-toast-spike\`):
`proof.jsonl` (cliente: PID, `cold`, decision, HTTP status, ack) e `server-log.jsonl` (stub: cada POST).

Limpeza do registro (AUMID/COM) ao desinstalar: `ToastNotificationManagerCompat.Uninstall()` (o
instalador real chamará; aqui é nota para a SPEC de distribuição).

---

## Plano B (escape hatch)

O repo do WCT foi **arquivado read-only (2026-02-25)**. Ele é um **wrapper fino** sobre a API estável
`Windows.UI.Notifications`; se algum dia quebrar, o fallback é **registrar o AUMID + o COM activator à
mão** (exatamente o que o toolkit faz internamente): uma classe `[Guid][ComVisible] : INotificationActivationCallback`,
`RegClass` do CLSID em `HKCU\Software\Classes\CLSID\{guid}\LocalServer32` → caminho do EXE, e o AUMID em
`HKCU\Software\Classes\AppUserModelId\{aumid}` com `DisplayName`/`IconUri`. Documentado como saída, não
implementado (sem necessidade enquanto (a) funcionar).

---

## Kill-criteria (honesto)

Se a **cold-activation COM não disparar de forma confiável** de um EXE **unpackaged sem atalho/instalador**,
**ou** só funcionar com um **processo residente** (violaria o ethos ambiente / `<1% CPU`), **ou** exigir
**MSIX** → o spike **documenta o no-go e o motivo** e escala o requisito (atalho/AUMID/empacotamento) para
a **SPEC de distribuição**. Não se força resultado positivo.

---

## Estado

- ✅ **Compila** (0 warn / 0 erro, SDK 8.0.423, zero workload).
- ✅ **Validado no Windows 11** (Ryzen 5 5600X, non-elevated) — **GO**. Cold-activation COM provada
  (PIDs novos cold-startam headless, postam ao servidor, `ack:true`); warm sem roubar foco; orçamento
  PASS (0,095% CPU, RAM pico 99 MB); footprint 185,3 MB self-contained. **6 achados** (2 major: cenário
  `Reminder` para os botões persistirem; silêncio precisa de heurística suplementar no Win11). Detalhes
  e prova verbatim em [`RESULTS.md`](RESULTS.md). Kill-criteria **não** acionado.
