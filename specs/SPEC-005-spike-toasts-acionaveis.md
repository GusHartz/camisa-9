# SPEC-005 — Spike toasts acionáveis

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-005 |
| **Feature** | Spike toasts acionáveis (feature #3 — de-risk do cliente) |
| **Slug** | spike-toasts-acionaveis |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | De-risk do cliente (trilha paralela) — **feature #3**. O **nível 3** da presença (faixa → mini → **toasts**). Assenta sobre a stack ratificada **C#/WPF** (ADR-001). Governado por **OP-17** (cliente = casca) e pela promessa **<1% CPU**. |
| **Appetite** | **8–10 dias.** Kill-criteria: esforço > 2 semanas **OU** a ativação COM em **cold-start** (app fechado, unpackaged, sem instalador/atalho) não fica confiável sem um **processo residente** (violaria o ethos ambiente/`<1% CPU`) ou sem **MSIX** → documentar o no-go e escalar o requisito de atalho/AUMID/empacotamento para a SPEC de distribuição. |
| **Prioridade** | MEDIUM–HIGH (spike de de-risk; a **cold-start** é o risco alto dentro dele — o "Win+D" desta feature) |
| **Criada em** | 2026-07-15 |
| **Aprovada em** | {YYYY-MM-DD — preencher após aprovação} |
| **Aprovada por** | {Gustavo Hartz — founder/architect} |
| **Status** | Rascunho — aguardando aprovação |

---

## Objetivo

Provar que um **toast WinRT nativo acionável** — com **2 botões** — disparado por um app **WPF / .NET 8 UNPACKAGED** (sem MSIX, sem workload) consegue **registrar a decisão do botão num servidor sem abrir/roubar foco** da janela, inclusive quando o app está **totalmente fechado** (ativação COM em **cold-start**), e ao mesmo tempo **silenciar** durante fullscreen/apresentação/DND. Entrega os dados go/no-go da **forma de notificação** (nível 3 da presença) sobre a stack já ratificada (WPF). O que o founder passa a saber: se o loop "decidir do meio do Outlook, sem abrir o jogo" é tecnicamente viável no cliente unpackaged — ou o que ele exige (atalho/AUMID/MSIX).

---

## Contexto e motivação

F0. A **SPEC-004 ratificou C#/WPF** como stack do cliente; este spike prova a capacidade que a ratificação desbloqueou. A visão exige **toasts nativos com botões de ação** ("decidir do meio do Outlook, sem abrir o jogo" — functional-spec/SDD) como o nível 3 da presença de 3 níveis (faixa → mini → toasts).

**O risco real não é mostrar um toast** — é a **ativação COM em cold-start**: quando o usuário clica um botão do toast com o app **fechado**, o Windows precisa reativar o processo via um **COM activator** registrado, para o handler encaminhar a decisão. Essa perna é **historicamente instável** para apps **unpackaged** (equivalente ao Win+D/WorkerW que a SPEC-003 deixou aberto) e é o que este spike de-risca.

**Verdade franca a assumir (OP-17):** "sem abrir o app" = **sem janela / sem foco** — mas **um processo sempre cold-starta** para atender o clique. Esse processo roda **headless**, encaminha um **payload opaco** e sai; **toda validade é server-side** (futuro). O cliente nunca decide se a resposta vale.

**O servidor não existe no F0.** O spike prova a **cadeia** contra um **stub local** (um `HttpListener` que loga a decisão e devolve `200`), stand-in do world-engine.

**Ambiente (muda vs. SPEC-003):** o agente roda **nesta máquina Windows 11** com **.NET SDK 8.0.423** e **zero workloads** — então **compila e mede localmente** (fecha a lacuna "não-verificável" do macOS da SPEC-003); o founder valida o que o agente não vê (o toast realmente popa, o clique com app fechado cold-starta sem janela, o silêncio sob fullscreen/PPT/DND reais).

---

## Escopo — o que está DENTRO

- [ ] **Doc de pesquisa** (`README.md`): por que **`ToastNotificationManagerCompat`** (CommunityToolkit) e **não** WindowsAppSDK/`AppNotificationManager` (arrasta runtime — issue #6071) nem `Windows.UI.Notifications` cru; o modelo **warm vs. cold** (`WasCurrentProcessToastActivated`); a verdade "sem janela ≠ sem processo"; as regras de silêncio; como-rodar; o **Plano B** (escape hatch: registro AUMID+COM manual cru); o kill-criteria.
- [ ] **App WPF (candidato único — WPF já ratificado)** que:
  - [ ] renderiza um toast nativo com **exatamente 2 botões** de ação (placeholders **PLAY/REST**), cada um com `AddArgument("decision", …)` + `SetBackgroundActivation()`;
  - [ ] subscreve `OnActivated` **cedo** (antes de qualquer janela) + **instância única**; ramifica em `WasCurrentProcessToastActivated()` → roda **headless** no cold-launch (nunca cria janela) vs. abre a **janela-gatilho** de teste no launch normal;
  - [ ] no handler: parseia os `ToastArguments`, faz **POST ao stub local**, **bloqueia num `ManualResetEvent`** até ack+prova gravados (nada de fire-and-forget), escreve **arquivo de prova** (PID, `coldActivated`, decision, HTTP status, ack) e sai.
- [ ] **Gate de silêncio** (`NotificationGate.cs`): P/Invoke `SHQueryUserNotificationState` (allowlist `== QUNS_ACCEPTS_NOTIFICATIONS`, cobre `QUNS_BUSY` de borderless-fullscreen + `QUNS_PRESENTATION_MODE`) **+** leitura opcional de `ToastNotificationManager.GetDefault().NotificationMode` (DND Win11, **fail-open** no Win10/erro) — síncrono, sem polling. Política de UI, **zero regra de jogo** (OP-17).
- [ ] **Stub de servidor local** (`server-stub/stub-server.ps1`): `HttpListener` em `localhost:PORT/` que faz **append durável** de `{receivedAt, payload}` e devolve `200` + ack JSON — stand-in do world-engine.
- [ ] **Harness de validação** (`validate.ps1`): **publica o EXE real** (não `dotnet run`), sobe o stub, **captura + mata** o PID (confirma nenhum processo), orquestra o clique do founder e verifica **novo PID + nova linha no log + arquivo de prova** com timestamps alinhados — automatiza a perna **cold**.
- [ ] **Harness de orçamento** (`measure-usage.ps1`): **copiado da faixa** (parametrizado por `-ProcessName`, locale-independent) — CPU idle ~0% + drift de RAM (sem leak de objetos de notificação).
- [ ] **Template de resultados** (`RESULTS.md`): no formato da faixa (ambiente, tabela Métrica|Valor ☑/☒, log verbatim, achados numerados, "bordas ainda não observadas", **recomendação go/no-go**).
- [ ] **Higiene dos gates**: o spike vive em `spikes/toasts-acionaveis/` — **fora** de `packages/*`; não entra nos 4 gates TS; ignorado por ESLint/Prettier; o SPEC-lint do CI (seções obrigatórias) é satisfeito.

---

## Escopo — o que está FORA

- **O servidor world-engine real** — não existe no F0; o spike prova a cadeia contra o **stub local** apenas.
- **Auth, validação de assinatura de webhook (OP-08) e a revalidação server-side** da decisão contra a janela de presença — do servidor real; o cliente emite **payload opaco**.
- **O sistema de presença em 3 níveis completo** e qualquer **lógica de janela de presença** — o cliente só encaminha o botão.
- **Conteúdo/design/copy do toast** — botões são placeholders (PLAY/REST); arte de notificação é produto, não spike.
- **Quando os toasts disparam / agendamento / o calendário da rodada** (ter/qui/sáb 15h) — server-driven; aqui o toast é disparado manualmente.
- **Push da nuvem (WNS/Azure)** — só notificações **locais**; a resposta é HTTP **outbound** do handler.
- **MSIX/Sparse, instalador, atalho de Start Menu, code-signing, auto-update** — SPEC de distribuição (o spike só **anota** se o cliente real precisa de atalho para cold-activation robusta).
- **Fila offline/retry** de decisão que falha o POST — anotado como follow-up.
- **Windowing always-on-bottom/Win+D/WorkerW e o orçamento da forma padrão** — cobertos pela SPEC-003; footprint **não** é re-argumentado aqui (só medido como datum).
- **DND no Windows 10** (`NotificationMode` ausente) e fallbacks WNF/registry — só documentar.
- **i18n do texto do toast** — o spike hardcoda strings de teste; produção passa pela camada i18n.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição |
|---|---|---|
| `spikes/toasts-acionaveis/README.md` | criar | Pesquisa (WCT vs WinAppSDK vs raw), warm/cold, silêncio, como-rodar, Plano B, kill-criteria. |
| `spikes/toasts-acionaveis/csharp-wpf/ToastSpike.csproj` | criar | SDK bare, `WinExe`, TFM `net8.0-windows10.0.22621.0`, `UseWPF`, `PackageReference Microsoft.Toolkit.Uwp.Notifications 7.1.3`, zero workload. |
| `spikes/toasts-acionaveis/csharp-wpf/App.xaml` (+`.cs`) | criar | Bootstrap; instância única + subscrição **early** de `OnActivated`; branch `WasCurrentProcessToastActivated` → headless vs janela-gatilho. |
| `spikes/toasts-acionaveis/csharp-wpf/MainWindow.xaml` (+`.cs`) | criar | Janela-gatilho de teste (enviar toast / matar processo / estado). |
| `spikes/toasts-acionaveis/csharp-wpf/ToastEmitter.cs` | criar | `ToastContentBuilder` + 2 `ToastButton` (`AddArgument` + `SetBackgroundActivation`); consulta o gate antes de `Show()`. |
| `spikes/toasts-acionaveis/csharp-wpf/ToastActivation.cs` | criar | `OnActivated`: parseia args, POST ao stub, bloqueia em `ManualResetEvent` até ack+prova, grava prova, sai. |
| `spikes/toasts-acionaveis/csharp-wpf/NotificationGate.cs` | criar | P/Invoke `SHQueryUserNotificationState` (allowlist) + `NotificationMode` DND (fail-open). |
| `spikes/toasts-acionaveis/server-stub/stub-server.ps1` | criar | `HttpListener` local; loga `{receivedAt,payload}` e devolve `200`+ack. |
| `spikes/toasts-acionaveis/validate.ps1` | criar | Publica o EXE, sobe o stub, captura+mata PID, orquestra a verificação cold. |
| `spikes/toasts-acionaveis/measure-usage.ps1` | criar | Copiado da faixa (parametrizado `-ProcessName`) — CPU idle + drift RAM. |
| `spikes/toasts-acionaveis/RESULTS.md` | criar | Template de resultados + recomendação go/no-go. |
| `.gitignore` | modificar | Ignorar a saída de `publish/` do spike (se necessário, alinhado à SPEC-003). |
| `specs/DONE-005-spike-toasts-acionaveis.md` | criar | O DONE (ao final). |
| `CLAUDE.md` / `docs/projeto/roadmap.md` | modificar | "Estado atual" + status do #3 (no DONE). |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema. Spike de cliente; o stub loga num arquivo, sem persistência de produção (OP-01 não se aplica).

---

## Mudanças de API (se aplicável)

Nenhuma API de produção. O stub local expõe **um** endpoint de teste (`POST localhost:PORT/`, body = payload opaco de decisão, resposta `200` + ack) — **contrato provisório** só para provar a cadeia; o contrato real é da SPEC do servidor.

---

## Critérios de aceitação

> Verificados no **Windows 11** (o agente builda+mede; o founder clica+observa). "Gates verdes" = os 4 gates **TS** seguem passando (spike fora de `packages/*`).

**Cenário 1 — Toast com 2 botões renderiza (identidade unpackaged)**
- Dado o EXE **publicado** rodando; quando o founder dispara o toast; então aparece um toast WinRT nativo com **exatamente 2 botões** (PLAY/REST) e **nome+ícone corretos** via AUMID auto-registrado no primeiro `Show()`.

**Cenário 2 — Warm: clique com app rodando não rouba janela**
- Dado o app já rodando; quando clico um botão; então `OnActivated` dispara **no mesmo processo** (instância única), o argumento é parseado, o POST vai ao stub e a **janela não vem à frente** nem rouba foco.

**Cenário 3 — Cold-start (A PROVA CENTRAL)**
- Dado o app **totalmente fechado** (PID confirmado morto); quando clico um botão no Notification Center; então o EXE **cold-starta**, `WasCurrentProcessToastActivated()==true`, roda **headless** (nenhuma janela), faz POST e recebe `200` — provado por **novo PID** (≠ do morto), **nova linha** no log do stub e **arquivo de prova** com timestamps alinhados.

**Cenário 4 — Servidor registra a decisão correta**
- Dado os 2 botões com argumentos distinguíveis; quando cada um é clicado; então o stub grava **exatamente** a decisão correspondente, e o cliente emite só **payload opaco** (OP-17).

**Cenário 5 — Silêncio: fullscreen e apresentação**
- Dado um jogo em fullscreen exclusivo **OU** PowerPoint em apresentação em foreground; quando o caminho de envio roda; então `SHQueryUserNotificationState != QUNS_ACCEPTS_NOTIFICATIONS` e o gate **suprime** o toast; num desktop normal, o toast aparece.

**Cenário 6 — Silêncio: Do-Not-Disturb (Win11)**
- Dado o DND ligado; quando leio `NotificationMode`; então `!= Unrestricted` e o gate suprime; ao desligar, o próximo toast aparece **sem estado preso** (fail-open se a API não existir no Win10).

**Cenário 7 — Clique tardio / idempotência**
- Dado um toast que caiu no Action Center; quando clico minutos depois; então a ativação ainda funciona e o handler é **idempotente** (o clique pode chegar após a rodada já ter resolvido server-side).

**Cenário 8 — Orçamento / footprint / cleanup**
- Dado o caminho do toolkit; quando meço e publico self-contained; então CPU idle **~0%** sem leak, só o NuGet é adicionado (sem runtime WinAppSDK, sem workload), o tamanho é registrado vs. o **~161 MB** da SPEC-003, e `Uninstall()` remove o registro AUMID/COM.

**Cenário 9 — Kill honesto (edge)**
- Dado que a cold-start COM **não** dispara de forma confiável de um EXE unpackaged sem atalho/instalador, **ou** só com processo residente, **ou** exige MSIX; então o spike **documenta o no-go e o motivo** e escala o requisito à SPEC de distribuição — **não força** resultado positivo.

---

## Segurança (se aplicável)

- **OP-17 / anti-fraude server-side:** o cliente é **casca não-confiável** — o botão emite um **payload opaco** de decisão; **toda** validação (janela de presença, rate, replay) é server-side (futuro). O spike **não** implementa validação de decisão.
- **OP-08 (assinatura de webhook)** e auth: do servidor real — **fora** deste spike; o stub é local e não valida assinatura (registrado como dívida do servidor).
- Sem segredos (OP-02/12): stub local em `localhost`, sem rede externa, sem chaves. Nenhum stack trace/SQL exposto (OP-11) — N/A (sem backend real).

---

## Riscos e dependências

| Risco | Prob. | Mitigação |
|---|---|---|
| **Cold-activation não dispara** com app fechado (perna flaky; bugs de pacote errado — WinUI-XAML#6133 / WinAppSDK#1632) | **Média/Alta** | Pin **`Microsoft.Toolkit.Uwp.Notifications 7.1.3`** (não o `Microsoft.Toolkit.Uwp.Notifications` renomeado 7.0.3 de WinUI); rodar o **EXE publicado real** com output path estável; `OnActivated` **early** + instância única; se irreparável sem processo residente/MSIX → **kill honesto** documentado. |
| **Processo cold sai antes do POST landar** (`WasCurrentProcessToastActivated` só sinaliza "vai disparar em breve") | Média | **Bloquear** num `ManualResetEvent` até ack+prova; nada de fire-and-forget; `validate.ps1` confere o flush pela prova. |
| **`SHQueryUserNotificationState` imperfeito** — borderless-fullscreen reporta `QUNS_BUSY`; não vê Focus Assist/DND | Média | Gate por **allowlist** (`== QUNS_ACCEPTS_NOTIFICATIONS`) cobre os alvos; camada `NotificationMode` para DND; documentar cobertura best-effort (toast vazado é degradado, não catastrófico — o OS enfileira no Action Center). |
| **WCT arquivado read-only (2026-02-25)** — sem correções futuras | Baixa/Média | Wrapper fino sobre `Windows.UI.Notifications` estável; **Plano B** = registro AUMID+COM manual cru no README (o mesmo que o toolkit faz). |
| **Identidade unpackaged** — nome/ícone genérico ou toast não aparece se AUMID/ícone mal registrado | Média | Primeiro `Show()` estabelece a identidade via AUMID auto-registrado; founder confirma nome+ícone; `Uninstall()` p/ cleanup. |
| **App elevado não mostra toast**; Focus Assist off faz o toast ir silenciosamente ao Action Center → falso "não disparou" | Baixa | Faixa roda **non-elevated**; checklist de pré-teste (notificações ON, Focus Assist OFF no happy-path). |
| **TFM `net8.0-windows10.0.22621.0`** perturba build/footprint (datum da #1) | Baixa | Medir self-contained vs. ~161 MB; a projeção WinRT (~25 MB) é feature do SDK, **não** workload — registrar o delta. |

**Dependências:**
- **SPEC-004 / ADR-001** (stack ratificada WPF) — insumo direto; o spike **não** re-litiga stack.
- **.NET SDK 8.0.423** (presente) + **founder** para a validação interativa (clique do toast, fullscreen/PPT/DND reais).
- **Desbloqueia:** o nível 3 da presença (Fase 3) e informa a SPEC de **distribuição** (se cold-activation exigir atalho/AUMID/MSIX).

---

## Notas de implementação

- **API escolhida: `ToastNotificationManagerCompat`** (`Microsoft.Toolkit.Uwp.Notifications` **7.1.3**, TFM **`net8.0-windows10.0.22621.0`**). É a **única** opção feita para Win32/WPF **unpackaged**: no primeiro `.Show()` auto-registra AUMID + COM activator in-proc em HKCU, **sem** atalho de Start Menu e **sem** `INotificationActivationCallback` manual; warm e cold saem pelo mesmo `OnActivated`. **NuGet puro, zero workload** (verificado: build 0/0 com SDK 8.0.423). Rejeitados: `AppNotificationManager` (arrasta runtime WinAppSDK — issue #6071), `Windows.UI.Notifications` cru (força escrever à mão o que o toolkit faz — mais frágil, sem upside).
- **NUNCA `dotnet run`** — rodar sempre o **EXE publicado** (o `LocalServer32` registraria `dotnet.exe` e a cold-activation quebra).
- **Cold ≠ warm:** subscrever `OnActivated` **antes** de criar janela; `WasCurrentProcessToastActivated()` → headless (encaminha e sai) vs. janela-gatilho.
- **Não sair cedo:** bloquear num `ManualResetEvent` até o **ack** + a **prova** gravados (a HTTP precisa fazer flush antes do exit).
- **Silêncio:** `SHQueryUserNotificationState` (allowlist) é síncrono e barato; `NotificationMode` p/ DND Win11 (fail-open). **Recomendação: fail-OPEN** no erro do gate (perder o ritual das 15h é pior que um toast ocasional) — *confirmar com o founder*.
- **Gate hygiene:** `spikes/toasts-acionaveis/` fora de `packages/*`; herdar os ignores da SPEC-003 (Prettier/ESLint ignoram `spikes/`; `.gitignore` cobre `publish/`). OP-17: o gate/handler são **política de UI**, zero regra de jogo.
- **Loop de trabalho:** o agente builda+mede nesta máquina; o founder clica+observa (toast aparece → warm → cold → silêncio → footprint), colando a cada marco; o agente itera pelo `RESULTS.md`. O agente **não** pode `dotnet workload install` (prompt) — por isso o caminho puro-NuGet.

**Questões abertas para o founder** (documentadas; não bloqueiam o spike):
1. `QUNS_NOT_PRESENT` (tela bloqueada/screensaver): o toast da rodada deve ser **dropado** ou **enfileirado** no Action Center? (decisão por tipo-de-toast).
2. **Fail-open vs. fail-safe** no erro do gate — recomendo **fail-open** para o ritual das 15h.
3. O cliente shipping vai precisar de **atalho de Start Menu / AUMID instalado** para cold-activation robusta, ou o auto-registro basta? (vira requisito da SPEC de distribuição — o spike responde empiricamente).
4. **Windows mínimo** suportado — define se a camada `NotificationMode` (DND, Win11 10.0.23504+) tem cobertura ou cai no fail-open Win10.
5. Algum **jogo/app fullscreen específico** do público que o founder queira testar contra o gate?
6. As **2 ações reais** do ritual de presença (PLAY/REST são placeholders) e sua copy.

---

## Checklist de aprovação

- [x] Objetivo está claro e verificável
- [x] Escopo está bem delimitado (dentro e fora)
- [x] Arquivos listados estão corretos e completos
- [x] Mudanças de schema estão documentadas (N/A)
- [x] Critérios de aceitação são testáveis (Windows; agente builda, founder clica)
- [x] Riscos e superfície de segurança foram avaliados (OP-17 central)
- [x] Appetite é razoável para o escopo definido (8–10 dias, spike com kill-criteria)
- [x] Não há conflito com SPECs abertas em paralelo
- [x] Alinhada à descrição do card (2 botões + resposta no servidor sem abrir o app + regras de silêncio)
- [ ] **Aprovada** — aguardando aprovação do founder no card

---

*SPEC-005 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE. Assenta sobre o ADR-001 (stack WPF).*
