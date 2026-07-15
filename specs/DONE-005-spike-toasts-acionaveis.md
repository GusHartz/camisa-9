# DONE-005 — Spike toasts acionáveis

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-005 |
| **SPEC correspondente** | SPEC-005-spike-toasts-acionaveis.md |
| **Feature** | Spike toasts acionáveis (feature #3 — de-risk do cliente) |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/spike-toasts-acionaveis` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado** | 2026-07-15 |
| **Desenvolvimento concluído** | 2026-07-15 |
| **Dias utilizados vs appetite** | <1 dia vs 8–10 dias (spike) |

---

## Resumo do que foi feito

Provado no **Windows 11** (Ryzen 5 5600X, non-elevated, .NET SDK 8.0.423) que um **toast WinRT nativo com 2 botões**,
disparado de um app **WPF/.NET 8 unpackaged** (zero workload, zero MSIX), **registra a decisão do botão num servidor
sem abrir/roubar foco** — inclusive com o app **totalmente fechado** (a **ativação COM em cold-start**, o risco central
e "Win+D" desta feature). A cadeia foi validada contra um **stub local** (`HttpListener`), stand-in do world-engine.

**A prova central (cold-start):** com o app morto (PIDs 6660/18252 confirmados encerrados), cada clique gerou um
**processo novo** — PIDs **13708, 19784** (clique no corpo, Central de Ações) e **5812** (clique no botão `REST`) — que
**cold-startou headless** (nenhuma janela), fez **POST** ao stub e recebeu `ack:true` (HTTP 200), sustentado **apenas**
pelo auto-registro AUMID + COM activator do `ToastNotificationManagerCompat` no primeiro `.Show()` (sem atalho de Start
Menu, sem instalador). **Kill-criteria NÃO acionado.** Orçamento ambiente **PASS** (CPU idle **0,095%**, RAM pico 99 MB);
footprint **185,3 MB** self-contained (+24 MB de projeção WinRT sobre os ~161 MB da SPEC-003) / 25,7 MB framework-dependent.

A sessão foi **orquestrada pelo agente** (publish → stub → launch → kill → verify, lendo os arquivos de prova) via dois
modos de launch adicionados ao app (`--auto-toast`, `--gate-check`); o founder só **clicou** (warm + cold) e **segurou**
os estados de silêncio. **6 achados** (2 major), com **1 fix aplicado no código** (cenário `Reminder`). Detalhes e prova
verbatim em [`spikes/toasts-acionaveis/RESULTS.md`](../spikes/toasts-acionaveis/RESULTS.md).

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `spikes/toasts-acionaveis/README.md` | Pesquisa: WCT vs WinAppSDK vs raw; modelo warm/cold; regras de silêncio; como-rodar; Plano B; kill-criteria. |
| `spikes/toasts-acionaveis/csharp-wpf/ToastSpike.csproj` | SDK bare, `WinExe`, TFM `net8.0-windows10.0.22621.0`, `UseWPF`, `Microsoft.Toolkit.Uwp.Notifications 7.1.3`, zero workload. |
| `spikes/toasts-acionaveis/csharp-wpf/App.xaml` (+`.cs`) | Bootstrap: subscrição **early** de `OnActivated`; branch `WasCurrentProcessToastActivated` → headless vs janela-gatilho; modos `--auto-toast`/`--gate-check` (orquestração). |
| `spikes/toasts-acionaveis/csharp-wpf/MainWindow.xaml` (+`.cs`) | Janela-gatilho de teste (enviar / matar / estado). |
| `spikes/toasts-acionaveis/csharp-wpf/ToastEmitter.cs` | `ToastContentBuilder` + `ToastScenario.Reminder` + 2 `ToastButton` (`AddArgument`+`SetBackgroundActivation`); consulta o gate antes de `Show()`. |
| `spikes/toasts-acionaveis/csharp-wpf/ToastActivation.cs` | `OnActivated`: parseia args, **POST bloqueante** ao stub, grava prova (`proof.jsonl`) + gate (`gate.jsonl`). |
| `spikes/toasts-acionaveis/csharp-wpf/NotificationGate.cs` | P/Invoke `SHQueryUserNotificationState` (allowlist `== QUNS_ACCEPTS_NOTIFICATIONS`), fail-open. |
| `spikes/toasts-acionaveis/server-stub/stub-server.ps1` | `HttpListener` local; append durável `{receivedAt,payload}` + `200`/ack JSON. |
| `spikes/toasts-acionaveis/validate.ps1` | Harness de validação (publica o EXE real, sobe o stub, orquestra warm/cold). |
| `spikes/toasts-acionaveis/measure-usage.ps1` | Orçamento (copiado da faixa, parametrizado, locale-independent). |
| `spikes/toasts-acionaveis/RESULTS.md` | Resultados preenchidos + prova verbatim + recomendação **GO**. |
| `specs/SPEC-005-spike-toasts-acionaveis.md` | A SPEC desta feature. |
| `specs/DONE-005-spike-toasts-acionaveis.md` | Este documento. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `.gitignore` | `spikes/**/publish/` → `spikes/**/publish*/` (cobre `publish-sc/` da medição de footprint). |
| `CLAUDE.md` | Seção "Estado atual" atualizada (spike #3 validado — GO). |
| `docs/projeto/roadmap.md` | Status do #3 (toasts) → validado. |

---

## Mudanças de schema aplicadas

Nenhuma migration. Spike de cliente; o stub loga num arquivo, sem persistência de produção (OP-01 não se aplica).

---

## Mudanças de API entregues

Nenhuma API de produção. O stub local expõe **um** endpoint de teste (`POST localhost:5599/`, body = payload opaco de
decisão, resposta `200` + `{ack:true,receivedAt}`) — **contrato provisório** só para provar a cadeia; o contrato real
é da SPEC do servidor.

---

## Critérios de aceitação — verificação

> Verificado no Windows 11 (agente builda/mede/orquestra; founder clica/observa). Prova nos arquivos
> `proof.jsonl`/`server-log.jsonl`/`gate.jsonl`.

| Cenário (SPEC-005) | Status | Evidência |
|---|---|---|
| 1 — Toast com 2 botões renderiza (identidade AUMID auto-registrada) | ✅ **PASS** | Banner `PLAY`/`REST`; founder clicou; sem atalho manual. |
| 2 — Warm: clique com app rodando não rouba janela | ✅ **PASS** | `pid 8156, cold:false, decision:play, http 200, ack:true`; janela não veio à frente. |
| 3 — **Cold-start (A PROVA CENTRAL)** | ✅ **PASS** | app morto → PIDs **novos** 13708/19784/**5812** cold-startam headless, postam, `ack:true`, timestamps alinhados no stub. |
| 4 — Servidor registra a decisão correta | ✅ **PASS** | `play` (warm) **e** `rest` (cold via botão, pid 5812) gravados; cliente emite só payload opaco (OP-17). |
| 5 — Silêncio: fullscreen / apresentação | ⚠️ **PARCIAL** | Gate é `if(estado!=Accepts)` — correto por inspeção; estados D3D-exclusivo/PPT **não acesos** nesta máquina (sem jogo/PPT). **Achado 3:** browser-fullscreen **não** vira o QUNS. |
| 6 — Silêncio: Do-Not-Disturb (Win11) | ⚠️ **DESVIO documentado** | `NotificationMode` (previsto na SPEC) **não existe** (Achado 1). DND **manual** do Win11 **não** vira o QUNS — é suprimido pela **plataforma** (Achado 4). Net-behavior correto. |
| 7 — Clique tardio / idempotência | ✅ **PASS** | Os cold-clicks 13708/19784 vieram da Central (tardios); 5 cold-starts, todos `error:""`. |
| 8 — Orçamento / footprint / cleanup | ✅ **PASS** (c/ watch) | CPU **0,095%** / RAM pico 99 MB (`measure-usage`: PASS); footprint **185,3 MB** sc / 25,7 MB fd; `Uninstall()` deferido; RAM drift +9,8 MB/60s a observar (Achado 6). |
| 9 — Kill honesto (edge) | ✅ **N/A** | **Não acionado** — cold-activation provada sem processo residente e sem MSIX. |

**Gates TS:** os 4 gates (`lint`/`typecheck`/`test`/`build`) seguem verdes — o spike vive em `spikes/` (fora de
`packages/*`), ignorado por ESLint/Prettier; SPEC-lint do CI satisfeito.

---

## Como testar manualmente

```
Pré: notificações do app ON; Focus Assist/Não Perturbe OFF; NÃO-elevado.
1. cd spikes/toasts-acionaveis
2. dotnet build .\csharp-wpf\ToastSpike.csproj -c Release          # compila 0/0
3. .\validate.ps1                                                   # publica o EXE real, sobe o stub,
                                                                    #  orquestra warm + cold (clique)
   — NUNCA `dotnet run` (registraria dotnet.exe no LocalServer32 → cold-activation quebra).
4. Ler %LOCALAPPDATA%\camisa9-toast-spike\proof.jsonl:
   - warm: pid X, cold:false, decision correto, http 200
   - cold: pid NOVO (≠ do app morto), cold:true, http 200  ← a prova central
5. .\measure-usage.ps1 -ProcessName ToastSpike -Seconds 60          # CPU idle ~0%, RAM < 150 MB
```

**Dados de teste necessários:** nenhum backend — o stub local é stand-in do world-engine.

---

## Testes automatizados

Nenhum teste automatizado neste DONE (spike de cliente; a validação é medida/observada no Windows, não unit-testável
sem o COM da plataforma). Os gates TS existentes seguem cobrindo `packages/*`, inalterados por esta feature.

**Comando para rodar (inalterados):**
```bash
npm run lint && npm run typecheck && npm test && npm run build
```

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| Todo o spike (`spikes/toasts-acionaveis/**`) + `SPEC-005`/`DONE-005` | ~100% | Sim — código compilado 0/0; **validação orquestrada pelo agente e clicada pelo founder** no Windows real; prova lida verbatim dos arquivos. 6 achados registrados; 1 fix (`Reminder`) aplicado e re-testado (pid 5812). |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → dentro do ethos do spike (de-riscar honestamente), aplicadas na sessão:
  - **`ToastScenario.Reminder`** adicionado ao `ToastEmitter` (fix do Achado 2 — sem ele, os botões somem na Central e o cold-click perde a decisão). É o cenário correto para o ritual das 15h.
  - Modos de launch **`--auto-toast`** e **`--gate-check`** adicionados ao `App` — permitem o agente orquestrar publish/fire/kill/verify e sondar o gate **sem** o founder tocar no PowerShell (o founder só clica). Não alteram o caminho de produção.

---

## Desvios em relação à SPEC

| Item da SPEC | O que foi feito | Motivo do desvio |
|---|---|---|
| Gate com camada `NotificationMode` (DND Win11) | **Removida** — `Windows.UI.Notifications.NotificationMode` **não existe** nessa projeção (suposição da pesquisa; não compila). Gate ficou só no `SHQueryUserNotificationState`. | **Achado 1.** Não há API pública limpa de DND fino no Win11; a SPEC já previa fail-open no ausente. DND fino via registry/WNF fica como follow-up (§ FORA). |
| Cenário 6 (DND vira o gate) | DND **manual** do Win11 **não** vira o `SHQueryUserNotificationState`. | **Achado 4:** o Win11 trata DND na **plataforma de notificação** (o Windows suprime o banner sozinho), não na API legada. Net-behavior correto; o gate não precisa. |
| `ToastScenario` (não especificado) | Adicionado **`Reminder`**. | **Achado 2:** com o app fechado, o Win11 recolhe o toast na Central e **esconde os botões**; `Reminder` mantém o banner fixo com botões → cold-click no botão carrega a decisão. |
| Silêncio validado ao vivo em fullscreen/PPT | **Parcial** — estados que viram o QUNS (D3D-exclusivo, PowerPoint) **não acesos** nesta máquina desktop. | Sem jogo/PPT na sessão; `PresentationSettings` é laptop-only. Gate é allowlist trivial (correto por inspeção); ver Limitações. |
| `--auto-toast`/`--gate-check` | Modos de launch **adicionados** (não no arquivo-lista da SPEC). | Habilitar validação **orquestrada pelo agente** (founder só clica). Fora do caminho de produção. |

---

## Limitações conhecidas

- **Silêncio não aceso ao vivo** para os dois estados que o QUNS **de fato** vira (fullscreen exclusivo D3D / PowerPoint
  presentation) — sem jogo/PPT na máquina desktop da sessão. O gate é um allowlist trivial (`estado != Accepts → suprime`),
  correto por inspeção; falta um spot-check positivo com um jogo/PPT real.
- **Brecha de borderless-fullscreen (Achado 3):** `SHQueryUserNotificationState` no Win11 **não** vira para browser-FS
  (borderless/DWM) e pode **não** virar para jogos borderless-fullscreen → o toast poderia aparecer por cima. Exige
  **heurística suplementar** (foreground cobre monitor + topmost).
- **RAM drift +9,8 MB/60s (Achado 6):** distinguir warm-up de leak exige **soak mais longo** (análogo ao soak de 8 h da SPEC-003).
- **`Uninstall()`** (limpeza do registro AUMID/COM) não executado ao vivo — vai no instalador (SPEC de distribuição).
- **App-gatilho encerrou após o handling warm** (Achado 5) — detalhe do harness; o cliente real é a faixa residente (SPEC-003), não este app.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Heurística suplementar de silêncio para borderless-fullscreen (Achado 3) | **Alto** (promessa ambiente) | Cliente real / SPEC do nível 3 de presença. |
| Adotar `ToastScenario.Reminder` no toast de produção (Achado 2) | Médio | Cliente real (já provado aqui). |
| Soak longo do app + cravar RAM drift (Achado 6) | Médio | Antes do GO definitivo do cliente. |
| Spot-check positivo de silêncio (jogo D3D / PowerPoint) | Baixo | Oportunístico (gate já correto por inspeção). |
| DND fino Win11 via registry/WNF (se necessário) | Baixo | Só se o fail-open da plataforma não bastar. |
| Atalho de Start Menu / AUMID no instalador + code-signing + `Uninstall()` | Médio | SPEC de distribuição. |

---

## Resposta empírica às questões abertas da SPEC

- **Q3 (atalho de Start Menu / AUMID para cold-activation?):** **Não necessário** no F0 — o auto-registro do
  `ToastNotificationManagerCompat` no primeiro `.Show()` basta para cold-startar um EXE unpackaged. O atalho/AUMID
  do instalador entra por **higiene de distribuição** (identidade estável, code-signing), não por bloqueio técnico.
- **Q2 (fail-open vs fail-safe no gate):** implementado **fail-open** (perder o ritual das 15h é pior que um toast
  ocasional) — a confirmar com o founder.

---

## Checklist de entrega

- [x] Critérios de aceitação verificados (cold-start **PASS** — risco central retirado; 6/9 PASS, 1 parcial, 1 desvio doc., 1 N/A)
- [x] Prova lida verbatim dos arquivos (`proof.jsonl`/`server-log.jsonl`/`gate.jsonl`)
- [x] Sem `any` / sem segredo / sem stack trace exposto (stub local, payload opaco — OP-17)
- [x] Gates TS inalterados/verdes (spike fora de `packages/*`)
- [x] AI Declaration preenchida acima
- [x] `RESULTS.md` preenchido com dados reais + recomendação GO
- [x] `CLAUDE.md` seção "Estado atual" atualizada
- [x] `docs/projeto/roadmap.md` atualizado
- [ ] Este DONE commitado na branch *(commit/PR pendente de confirmação do founder)*

---

*DONE-005 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Assenta sobre o ADR-001 (stack WPF).*
