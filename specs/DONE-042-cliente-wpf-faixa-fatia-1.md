# DONE-042 — Cliente WPF da faixa · fatia 1 (o pipe vertical fino)

> Registro de conclusão. Par obrigatório da SPEC-042. Nenhum PR é válido sem este DONE.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-042 / DONE-042 |
| **Feature** | Cliente WPF da faixa — o shell + o pipe de dados ao vivo (fatia 1 de N do card 4 de 4 "Faixa: a vida no CT") |
| **Slug** | cliente-wpf-faixa-fatia-1 |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.4 — a faixa visual (card 4 de 4) |
| **Concluída em** | 2026-07-21 |
| **Dependência DURA** | SPEC-037 (login/sessão Bearer) · SPEC-038 (`GET /v1/band` + `BandState`) · SPEC-040 (número da camisa) — todas em `main`; ADR-001/003; os spikes SPEC-003/005/006 |

---

## Resumo do que foi feito

O **primeiro cliente do repo** (C#/WPF, .NET 8, Windows) — o pipe vertical fino. Uma faixa que ancora acima da taskbar (portando o shell provado dos spikes), faz login real, faz **poll do `GET /v1/band` autenticado** e desenha o dia do atleta com **primitivas WPF** (texto/formas/blocos de cor), **sob `<1% CPU`/`<150MB`**. Prova que as peças provadas isoladamente — o shell/interop (SPEC-003/006) e o auth+read-model (SPEC-037/038) — se sustentam **juntas, ao vivo**. Zero arte (os assets não estão no repo); render **estrutural**.

**Camadas (100% cliente novo; `packages/*`, os 4 goldens e todo `services/*` INTOCADOS, `git diff` = 0; SEM MIGRATION):**
- **Shell (`client/band-wpf/Shell/`)** — portado do spike widget-taskbar: `Interop/{NativeMethods,NativeTypes}` (P/Invoke shell32/user32/dwmapi + structs/constantes), `TopmostStrip` (Postura A no nível Win32), `TaskbarAnchor` (`ABM_GETTASKBARPOS` + `rcWork`), `TaskbarWatcher` (`SetWinEventHook` por evento, não polling), `Fullscreen`. O aparato de spike (Postura B/AppBar, comparador de posturas, diagnóstico, proxy animado) **não foi portado**.
- **Auth/HTTP (`Api/`)** — `BandApiClient` (UM `HttpClient` reusado; login + `GET /v1/band` com `Bearer`; erro roteado pelo **`code`**/status, nunca pela frase — OP-11); `BandState.cs` (records fiéis ao contrato `/v1`, `System.Text.Json` tolerante a campos desconhecidos/`null`); `TokenStore` (**DPAPI CurrentUser** via P/Invoke `crypt32`, nunca texto plano).
- **Estado/render (`State/`, `View/`, `MainWindow`)** — `BandPoller` (`DispatcherTimer` 60s + primeiro fetch); `BandViewModel` (`INotifyPropertyChanged`, **diff-update** — a árvore visual nunca é reconstruída); a faixa 88px opaca (Postura A) com o render estrutural (as 2 barras Forma/Moral, atleta, fase, clube+placar [só `played=true`], elenco, decisões, fila, **e os blocos de cor de `appearance`/kit**).
- **Coordenador (`App.xaml.cs`)** — Mutex single-instance; login→faixa→saída; **401→re-login**; base URL do `config.json`.
- **Login (`Auth/LoginWindow`)** — e-mail+senha → `POST /v1/auth/login` (não há signup no v1).

**Autorização por construção:** o cliente só envia `{email,password}` no login e `Authorization: Bearer` no band — **nenhum identificador de ator** em query/body/path (verificado por 2 revisores). **Thin renderer (OP-17):** zero regra de jogo — o placar do `todayMatch` só aparece quando o servidor manda `played=true` (o cliente **não fabrica** placar).

---

## Desvios da SPEC (mecanismo/drift, não de produto) — registrados

1. **Token via `crypt32` P/Invoke, não `ProtectedData`.** A SPEC nomeia `ProtectedData` (ADR-003); a implementação usa `CryptProtectData`/`CryptUnprotectData` diretos → o cliente fica **zero-dependência NuGet** (como o spike). O **requisito duro é cumprido**: escopo **CurrentUser** (sem flag `LOCAL_MACHINE`), ciphertext em disco, nunca texto plano. Desvio de mecanismo, não de requisito.
2. **`appearance`/kit renderizados como blocos de cor** (reconciliação da revisão): a 1ª versão não desenhava os blocos que o escopo D pede ("`appearance` como blocos de cor"); a revisão pegou, e a versão final **renderiza** os swatches (avatar skin/hair + kit primary/secondary, via paleta indexada estrutural). O **avatar em camadas / a arte real** segue deferido (não há assets).
3. **i18n deferido:** o cliente tem strings PT-BR hardcoded ("Treino:", "sem clube", etc.). O guardrail de i18n do projeto mira as **libs puras**; o cliente é um renderer de smoke. Registrado como diferido consciente, não esquecido.
4. **`config.json` inline** (sem `Config.cs`): a base URL é lida inline no `App.xaml.cs` (arquivo já listado), sem criar um arquivo fora da lista da SPEC.

---

## Revisão adversarial (3 dimensões em paralelo · cada achado verificado ceticamente)

**Núcleo SÓLIDO.** A dimensão **contrato/OPs/escopo voltou LIMPA** — contrato **fiel campo-a-campo** (75 folhas; `long` p/ `epochMs`/`balance`; os dois `age` com nulabilidades distintas corretas), OP-17 respeitado (placar não fabricado, zero regra de jogo), escopo FORA fora, invariante `git diff`=0, higiene limpa, lista de arquivos exata. Os defeitos estavam concentrados no **tratamento de erro/ciclo-de-vida** — **13 corrigidos**, 2 MAJOR cross-confirmados por 2 dimensões:

- **[MAJOR, cross-confirmado seg+ciclo] Exceção de desserialização derrubava a faixa via `async void`.** Um 200 **não-JSON** (proxy/captive portal, corpo truncado) fazia `ReadFromJsonAsync` lançar `JsonException`/`NotSupportedException` — fora do `catch` filtrado — que subia pelo `async void` do `Tick` → exceção fatal no dispatcher (`DispatcherUnhandledException` não seta `Handled`). Contradiz a promessa "nunca lança". **Fix:** `catch` final nos 2 métodos → `ServerError`.
- **[MAJOR, ciclo] Requests em voo nunca cancelados → continuações tardias coordenavam após o Shutdown.** O seam `CancellationToken` existia mas estava **morto**: um poll/login que completava DEPOIS do usuário fechar a janela (→ `Shutdown()`) chamava `ShowLogin`/`ShowBand` (criar janela pós-shutdown = crash/zumbi). **Fix:** `CancellationTokenSource` no `BandPoller` (cancela no `Stop`) + guarda `_stopped`; `LoginWindow` cancela no `Closed` + guarda `_closed`.
- **[MÉDIO ×2] `TokenStore.Save` sem try/catch** (IOException no login crashava — assimétrico com `Clear`) → protegido; **`LoadBaseUrl` sem validar URI** (`config.json` com `"localhost:3000"` → `UriFormatException` no boot) → `Uri.TryCreate` absoluto + só http/https.
- **[MINOR ×3] `Cleanup` parava o `DispatcherTimer` da thread do `ProcessExit`** (thread-afim → podia lançar e pular o unhook nativo) → unhook PRIMEIRO + `Stop` protegido; **token 401'd não limpo da memória** → `BandApiClient.ClearToken()` no reauth; **NRE se `squad` tem elemento null** → `mate?.IsMe`.
- **[BAIXO/NIT] `ReadAndFree` vazava o blob nativo se `new byte[]` lançasse** → `try/finally`; **`IDisposable` morto** no `BandApiClient` (singleton de vida-do-processo) → removido; **param morto `brtHour`** → removido; **`BrushFor` por substring frágil** → `switch` nos valores canônicos de `DayPhase` (`ct`/`casa`/`vespera`); **eslint ignorava `spikes/**`** além do pedido → revertido.

**Verificados OK pelos revisores (sem defeito):** o núcleo do DPAPI (CurrentUser, ciphertext, frees balanceados, sem vazar token), a ordem do `ShutdownMode` (antes do Mutex), o não-vazamento de hook/timer por ciclo de reauth, o contrato fiel, o `HttpClient` reusado, o `Apply` null-guardado no topo.

---

## Arquivos modificados

**Novos (`client/band-wpf/`):** `BandClient.csproj` · `app.manifest` · `App.xaml`(`.cs`) · `MainWindow.xaml`(`.cs`) · `Shell/Interop/{NativeMethods,NativeTypes}.cs` · `Shell/{TopmostStrip,TaskbarAnchor,TaskbarWatcher,Fullscreen}.cs` · `Auth/LoginWindow.xaml`(`.cs`) · `Api/{BandApiClient,BandState,TokenStore}.cs` · `State/BandPoller.cs` · `View/BandViewModel.cs` · `config.json` · `.gitignore` · `README.md` · `specs/{SPEC,DONE}-042-cliente-wpf-faixa-fatia-1.md`.

**Editados:** `.prettierignore` (+`client/`) · `eslint.config.mjs` (+`client/**` no ignore).

**Intocado (o critério DURO):** `packages/world-engine` inteiro, os 4 goldens, e **todo `services/*`** (`git diff` = 0). **SEM MIGRATION** — 100% cliente novo.

---

## Critérios de aceitação

⚠️ **Verificação:** o **Cenário 1** (compila) e o **Cenário 10** (selo dos gates TS) foram verificados **aqui** (o `dotnet 8.0.423` está no ambiente); os Cenários 2-9 são **smoke ao vivo** (GUI + stack no ar) — o método está no `README.md` do cliente, e a evidência atual é o **build verde + a revisão adversarial (3 dimensões) + a análise estática**. O smoke medido é a **ação do founder** no bring-up.

1. **Compila** ✅ *(verificado)*: `dotnet build client/band-wpf` → **0 avisos, 0 erros**, `WinExe` (`BandClient.exe`); `app.manifest` com `PerMonitorV2`/`dpiAware`.
2. **A faixa ancora** *(smoke)*: Postura A no Win32 (`WS_EX_TOOLWINDOW|NOACTIVATE|TOPMOST`), 88px opaca, `ShowInTaskbar=False`, `ClipToBounds` só no Grid interno.
3. **Re-ancora por evento** *(smoke)*: `WndProc` trata `WM_DISPLAYCHANGE`/`WM_SETTINGCHANGE` (síncrono) + `WM_DPICHANGED` (deferido); `SetWinEventHook` por evento.
4. **Login + token DPAPI** *(smoke)*: `POST /v1/auth/login` → token → `crypt32` CurrentUser em `%LOCALAPPDATA%\NextGoat\` (nunca texto plano).
5. **O pipe ao vivo renderiza** *(smoke)*: `BandState` → `forma`/`moral`/atleta/fase/clube/elenco/decisões/fila + os blocos de cor; `null` esconde a seção (nunca crash — `Apply` null-guardado + `catch` no poller).
6. **Os relógios em leitura** *(smoke)*: o placar só quando `played=true` (não fabrica); `club=null` não quebra (fila mostrada).
7. **Erro pelo `code`** *(smoke)*: 401→login; 429→respeita `Retry-After` (backoff no poller); rede→"sem conexão".
8. **Orçamento SOB REDE** *(smoke medido)*: método no README (reusa `measure-usage.ps1`); mitigado por `HttpClient` único + poll 60s + diff-update + janela opaca.
9. **Saída graciosa** *(smoke)*: `Cleanup` idempotente (unhook primeiro); `Mutex` single-instance.
10. **O selo dos gates TS** ✅ *(verificado)*: **610/610 testes verdes**; `packages/world-engine` + 4 goldens + `services/*` byte-idênticos (`git diff`=0); sem migration; `client/` fora do prettier/eslint; `npm run lint`(eslint)/typecheck/build verdes.

---

## Gates de qualidade

- **`dotnet build` verde** (0 avisos/erros) — antes E depois das 13 correções da revisão.
- **610 testes TS verdes** (o cliente é isolado, fora dos workspaces npm — não afeta a suíte); **eslint** limpo; **prettier** não varre `client/` (⚠️ o "247 files" local é o falso-positivo de CRLF do Windows — CI roda em LF e é verde).
- **`packages/world-engine` + os 4 goldens + todo `services/*` INTOCADOS** (`git diff`=0). **SEM MIGRATION.**

---

## Escopo deferido / follow-ups (nomeados)

- **A fatia 2** — as 4 escritas de gameplay na faixa (`training/spend`/`decisions/answer`/`purchases`/`regen`), triviais sobre o mesmo cliente+auth.
- **As fatias de arte** — o avatar em camadas por paleta indexada + `appearanceFromId` (NPC), as 3 cenas ilustradas, as 3 alturas (64/88/110).
- **Toasts WinRT** (SPEC-005), **autoupdate + code-signing** (SPEC de distribuição), **Postura B (AppBar)**, o **fix do Win+D** (parenting à WorkerW — hoje a faixa some no Mostrar Desktop, ratificado aceitável).
- **i18n** do cliente (strings PT-BR hardcoded — diferido consciente).
- ⚠️ **`https` obrigatório para host não-loopback** (defesa-em-profundidade: hoje um `apiBaseUrl` de produção em `http://` faria o Bearer viajar em claro — sub-item BAIXO da revisão; entra com a SPEC de distribuição).
- **C# na CI** (workflow Windows+dotnet) — deferido; hoje o smoke é manual (precedente dos spikes).

---

## AI declaration

Implementação conduzida por agente de IA (Claude Code / Opus 4.8) em par com o dev (gustavo-hartz), com: um **workflow de entendimento** (5 leitores paralelos das fontes — spikes, ADRs, contrato, design) que fundamentou o escopo da fatia; o shell **portado** do spike (código provado), a lógica nova escrita e **build-verificada localmente** (`dotnet build`, 0 avisos); e uma **revisão adversarial por 3 agentes paralelos** (ciclo-de-vida/threading · segurança/DPAPI/robustez · contrato/OPs/escopo), cada achado verificado ceticamente — que confirmou o núcleo sólido (contrato fiel, OP-17, DPAPI correto, sem leak de ciclo) e pegou **2 MAJOR reais** (deserialização→crash via `async void`; requests em voo coordenando após o Shutdown) + médios/nits, **13 corrigidos** e re-buildados verdes. **Não houve revisão humana linha-a-linha** antes deste DONE, e **o smoke ao vivo (Cenários 2-9) ainda não foi rodado** (ambiente headless) — o rigor veio do build, da análise estática e da revisão adversarial; o **smoke medido é a ação do founder** (método no README). Os desvios de mecanismo (crypt32) e as reconciliações (blocos de cor, i18n) estão registrados acima.

---

*DONE-042 — método H1VE. A fatia 1 do cliente WPF da faixa: o pipe vertical fino — shell always-on-bottom portado + login/token DPAPI + poll do `GET /v1/band` REAL + render estrutural, sob `<1% CPU`/`<150MB`. `dotnet build` verde; revisão adversarial de 3 dimensões (13 fixes). SEM MIGRATION. `packages/*`, engine, os 4 goldens e `services/*` INTOCADOS.*
