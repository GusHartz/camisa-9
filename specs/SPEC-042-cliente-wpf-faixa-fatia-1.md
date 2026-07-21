# SPEC-042 — Cliente WPF da faixa · fatia 1 (o pipe vertical fino)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-042 |
| **Feature** | Cliente WPF da faixa — o shell + o pipe de dados ao vivo (fatia 1 de N do card 4 de 4 "Faixa: a vida no CT") |
| **Slug** | cliente-wpf-faixa-fatia-1 |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | **3.4** — a faixa visual (card 4 de 4 de "Faixa: a vida no CT") |
| **Appetite** | 3 a 4 dias (portar o shell dos spikes + login/DPAPI + o loop de poll + o render estrutural + o smoke medido) |
| **Prioridade** | HIGH — o payoff VISÍVEL da série; a estratégia server-first (SPEC-037/038/041) foi montada para ele |
| **Criada em** | 2026-07-21 |
| **Aprovada em** | {a preencher após aprovação no card} |
| **Aprovada por** | {a preencher — founder/architect} |
| **Status** | Rascunho — aguardando aprovação no card |

---

## Decisões travadas com o founder (2026-07-21)

1. **Smoke manual medido, SEM C# na CI.** Os 4 gates da CI são npm/TS; C# não tem lugar no `npm run build`. Seguindo o precedente dos 3 spikes (todos validados à mão, fora da CI), esta fatia valida por um **smoke medido com método documentado no README** — um workflow Windows+dotnet fica para uma fatia futura.
2. **Formulário de login mínimo no cliente** (e-mail+senha → `POST /v1/auth/login`). Não há signup no v1 (contas nascem por `harness/create-account.ts`); o smoke ao vivo exige uma **conta semeada + base URL de dev** (fornecidas pelo founder no bring-up).
3. **Win+D ratificado como aceitável:** a faixa **some** no "Mostrar Desktop" (Win11 usa DWM cloaking, ininterceptável por mensagem). O parenting à WorkerW fica **deferido** — comportamento ambiente defensável, não bloqueador.
4. **SÓ-LEITURA nesta fatia.** A **presença é escrita de graça**: abrir a faixa (`GET /v1/band`) já dispara o `markActive` no servidor (throttle 1×/dia, SPEC-038). As 4 escritas de gameplay são a **fatia 2**, trivial de somar sobre o mesmo cliente+auth.
5. **Defaults (padrão, sem re-decisão):** token via **DPAPI** (`ProtectedData`, `CurrentUser` — requisito do ADR-003, nunca arquivo plano); runtime **`net8.0-windows`** (o piso PROVADO nos spikes); build **framework-dependent** para dev/smoke; poll do `/v1/band` a **60s**; **Postura A** (topmost flutuante); altura **fixa 88px**.

---

## Objetivo

Entregar o **primeiro cliente C#/WPF do repo** como um pipe vertical fino: uma faixa que boota ancorada acima da taskbar (portando o interop dos spikes), faz login real, faz **poll do `GET /v1/band` autenticado** e desenha o dia do atleta com **primitivas WPF** (texto/retângulos/blocos de cor). Hoje o jogador não consegue **ver** o próprio dia em lugar nenhum — o motor está completo, mas inalcançável fora de um terminal; esta fatia dá **a primeira tela**.

---

## Contexto e motivação

Card 4 de 4 de "Faixa: a vida no CT" (roadmap 3.4), desbloqueado agora que suas dependências duras estão em `main`: SPEC-037 (login + sessão Bearer), SPEC-038 (`GET /v1/band` + o contrato `BandState`) e SPEC-040 (número da camisa, aditivo no contrato). O card inteiro é enorme (interop + 3 alturas + arte + avatar em camadas + `appearanceFromId` + 3 cenas ilustradas); **não cabe numa fatia**, e o **design handoff (arte/mockups/sprites) NÃO está no repositório** (vivia numa zip em Downloads, nunca commitada). Esta fatia 1 de-risca o **maior desconhecido**: que as peças provadas **isoladamente** — o shell/interop always-on-bottom (spikes SPEC-003/006) e o auth+read-model (SPEC-037/038) — se sustentam **JUNTAS, ao vivo, dentro do orçamento** (`<1% CPU` / `<150MB RAM` process-tree, ADR-001). O **loop de rede** (poll + JSON + re-render) é carga que **nenhum spike exerceu** — medir isso é o gate. A arte fica deferida (não há assets); a fatia renderiza estrutural.

**Fatos verificados no repo:**
- O shell portável já está PRONTO e é copy-paste (`spikes/widget-taskbar/csharp-wpf/`, `net8.0-windows`, x64): `Interop/` (P/Invoke), `TopmostStrip.cs` (Postura A — estilo Win32, não WPF), `TaskbarAnchor.cs`, `TaskbarWatcher.cs` (`SetWinEventHook` por evento, não polling), `Fullscreen.cs`. Zero regra de jogo (OP-17).
- Orçamento PROVADO com o shell PARADO (RESULTS SPEC-006): Postura A = CPU 0,186% / RAM pico 78,5MB. Nenhum spike fez I/O de rede.
- ADR-003/SPEC-037: `POST /v1/auth/login` → token opaco Bearer; sem cookie ⇒ CSRF inexistente; idle 7d/absoluto 30d → 401 → re-login.
- SPEC-038: `GET /v1/band` → `BandState` congelado em `/v1` (aditivo-only, `null`="não se aplica"); abrir a faixa carimba `markActive`.

---

## Escopo — o que está DENTRO

### A) O shell WPF (portar, não reescrever)
- [ ] Novo projeto `client/band-wpf/` FORA dos workspaces npm (`net8.0-windows`, `WinExe`, `UseWPF`, `Nullable`, x64) + `app.manifest` (`PerMonitorV2`/`dpiAware` + `supportedOS` Win10/11) + single-instance (`Mutex`) + `ShutdownMode.OnMainWindowClose`.
- [ ] Copiar o shell portável do spike (`Interop/{NativeMethods,NativeTypes}`, `TopmostStrip`, `TaskbarAnchor`, `TaskbarWatcher`, `Fullscreen`) + o esqueleto de coordenação da `MainWindow` (`SourceInitialized`→`AddHook(WndProc)`→`TopmostStrip.Apply`→`ReAnchor`→`watcher.Start`; DIP→px via `VisualTreeHelper.GetDpi`; `WndProc` `WM_DISPLAYCHANGE`/`WM_SETTINGCHANGE` síncrono + `WM_DPICHANGED` via `Dispatcher.BeginInvoke(Background)`; `Cleanup` idempotente; duplo-clique fecha).
- [ ] Fixar a **Postura A** (topmost flutuante, estilo `WS_EX_NOACTIVATE|TOOLWINDOW|TOPMOST` no nível Win32) + `Reassert` no foreground-change. Janela `WindowStyle=None`, `ShowInTaskbar=False`, `ShowActivated=False`, `AllowsTransparency=False` (OPACA — composição por-pixel estoura o CPU); `ClipToBounds` só no Canvas interno (nunca no `<Window>` — crash `0xE0434352`); altura fixa 88px.
- [ ] APAGAR o aparato de spike (não portar): o comparador de posturas (enum `Posture`, flag `--posture`, `AppBarHost.cs`), o `UpdateStatus()` diagnóstico, o proxy animado.

### B) Auth + token (DPAPI)
- [ ] Formulário de login mínimo (`Auth/LoginWindow`): e-mail+senha → `POST /v1/auth/login`; sucesso → persiste o token; falha → mensagem genérica (o `code`, não a frase).
- [ ] `Api/TokenStore.cs`: persiste/lê via DPAPI (`ProtectedData`, `CurrentUser`) — nunca arquivo plano; blob ilegível/expirado → degrada para re-login.

### C) O cliente HTTP + o poll
- [ ] `Api/BandApiClient.cs`: UM `HttpClient` reusado; `Authorization: Bearer`; `GET /v1/band`; erro pelo `code` (401→login; 429→respeita `Retry-After`).
- [ ] `Api/BandState.cs`: records C# do contrato `/v1`, `System.Text.Json` TOLERANTE a campos desconhecidos e a `null`.
- [ ] `State/BandPoller.cs`: `DispatcherTimer` a 60s + primeiro fetch imediato.

### D) O render ESTRUTURAL (zero arte)
- [ ] `View/BandViewModel.cs` (`INotifyPropertyChanged`, diff-update — nunca reconstruir a árvore) + `MainWindow.xaml` só com primitivas: `phase`, `bars.forma`/`moral` (2 barras 0..100), `athlete` (nome/`shirtNumber`/`overall`/`position`/`appearance` como blocos de cor), `training`, `home`, `injury` (ou escondido se null), `club`+`todayMatch` (placar só se `played=true`), `squad` de 16 (`isMe` marcado), `pendingDecisions`, `queue` quando `club=null`.

### E) Higiene de repo (os gates TS seguem verdes)
- [ ] `client/band-wpf/.gitignore` (`bin/`,`obj/`,`publish/`) + `.prettierignore` + ignore no `eslint.config.mjs` cobrindo `client/`.
- [ ] `client/band-wpf/config.json` (base URL) + `README.md` (método do smoke + bring-up da stack viva).

---

## Escopo — o que está FORA

- **TODA a arte** (não existe no repo): cenas ilustradas (CT/casa/vespera), avatar em camadas por paleta indexada, `appearanceFromId`. Motivo: sem assets. Na fatia, avatar = blocos de cor; cena = cor de fundo + texto.
- **As 3 alturas** (64/88/110) e o crop aditivo. Motivo: dependem de arte autorada. Fatia em 88px fixo.
- **Toasts WinRT acionáveis** (SPEC-005). Motivo: nível 3 da presença, fatia futura.
- **Autoupdate + code-signing.** Motivo: vão para a SPEC de distribuição/instalador; a fatia usa build framework-dependent.
- **As 4 escritas de gameplay** (`training/spend`/`decisions/answer`/`purchases`/`regen`). Motivo: a faixa é só-leitura primeiro (a presença já é escrita via `markActive`); interatividade = fatia 2.
- **Win+D / parenting à WorkerW.** Motivo: ratificado aceitável que a faixa suma no Mostrar Desktop; só detecção (`DWMWA_CLOAKED`).
- **Postura B (AppBar).** Motivo: descartada como default (latência ~15-30s + vaza a reserva em force-kill); modo opcional futuro.
- **Signup no cliente.** Motivo: não existe no v1 (contas por script de operador); só login.
- **Gates residuais da FORMA** (soak 8h, hardware fraco, DPI≠100% ao vivo, multi-monitor, auto-hide, tela-cheia real ao vivo). Motivo: não bloqueiam a estrutura desta fatia.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `client/band-wpf/BandClient.csproj` | criar | projeto .NET 8 WPF (net8.0-windows, WinExe, x64, UseWPF, Nullable) |
| `client/band-wpf/app.manifest` | criar | PerMonitorV2/dpiAware + supportedOS Win10/11 |
| `client/band-wpf/App.xaml` (+`.cs`) | criar | bootstrap, Mutex single-instance, ShutdownMode.OnMainWindowClose |
| `client/band-wpf/MainWindow.xaml` (+`.cs`) | criar | a janela-faixa (88px, opaca) + WndProc + coordenação do shell |
| `client/band-wpf/Shell/Interop/NativeMethods.cs` | portar | P/Invoke shell32/user32/dwmapi (verbatim do spike) |
| `client/band-wpf/Shell/Interop/NativeTypes.cs` | portar | structs/constantes Win32 (verbatim do spike) |
| `client/band-wpf/Shell/TopmostStrip.cs` | portar | Postura A (estilo Win32) + Reassert |
| `client/band-wpf/Shell/TaskbarAnchor.cs` | portar | posiciona a faixa no rcWork do monitor |
| `client/band-wpf/Shell/TaskbarWatcher.cs` | portar | SetWinEventHook (por evento, não polling) |
| `client/band-wpf/Shell/Fullscreen.cs` | portar | detecção de fullscreen (SHQuery + geometria) |
| `client/band-wpf/Auth/LoginWindow.xaml` (+`.cs`) | criar | login mínimo (e-mail+senha) |
| `client/band-wpf/Api/BandApiClient.cs` | criar | HttpClient único, GET /v1/band, erro roteado por code |
| `client/band-wpf/Api/BandState.cs` | criar | records do contrato /v1 (System.Text.Json tolerante) |
| `client/band-wpf/Api/TokenStore.cs` | criar | persistência do token via DPAPI (CurrentUser) |
| `client/band-wpf/State/BandPoller.cs` | criar | DispatcherTimer 60s + primeiro fetch |
| `client/band-wpf/View/BandViewModel.cs` | criar | INotifyPropertyChanged, diff-update |
| `client/band-wpf/config.json` | criar | base URL da API para o smoke |
| `client/band-wpf/.gitignore` | criar | ignora bin/, obj/, publish/ |
| `client/band-wpf/README.md` | criar | método do smoke medido + bring-up da stack viva |
| `.prettierignore` | criar | ignora `client/` (o prettier `--check .` não varre o C#/xaml/json) |
| `eslint.config.mjs` | modificar | adiciona `client/**` ao ignore |
| `specs/SPEC-042-cliente-wpf-faixa-fatia-1.md` | criar | esta SPEC |
| `specs/DONE-042-cliente-wpf-faixa-fatia-1.md` | criar | o DONE (após o desenvolvimento) |

**Intocado (o critério DURO):** `packages/world-engine` inteiro, os 4 goldens, e todo `services/*` (`git diff` = 0).

---

## Mudanças de schema (se aplicável)

**Nenhuma mudança de schema nesta feature.** A fatia é 100% cliente novo; login e `GET /v1/band` já foram entregues (SPEC-037/038). Sem migration.

---

## Mudanças de API (se aplicável)

**Nenhuma mudança de API nesta feature.** O cliente é consumidor puro — não cria nem modifica endpoint. Consome (referência, já existentes):

```
POST /v1/auth/login            (SPEC-037)
Body:        { email: string, password: string }
Response 200:{ token: string, expiresAt: string }   // token opaco Bearer 256-bit
Response 401:{ error, code: "invalid_credentials" }
Response 429:{ error, code: "rate_limited", retryAfter }  + header Retry-After

GET /v1/band                   (SPEC-038)
Header:      Authorization: Bearer <token>
Response 200: BandState (contrato /v1, aditivo-only; null="não se aplica";
             campos: phase, bars.forma/moral, athlete{name,shirtNumber,overall,
             position,appearance}, training, home, injury?, club?, squad[16],
             pendingDecisions, queue?, serverTime, ...)
Response 401:{ error, code: "unauthorized" }   → cliente volta ao login
Response 429:{ error, code: "rate_limited", retryAfter }  → cliente respeita antes do próximo poll
```

Efeito colateral consumido (não é escrita do cliente): `GET /v1/band` dispara `markActive` server-side (throttle 1×/dia) — a presença.

---

## Critérios de aceitação

**Cenário 1 — Compila (automatizável)**
- Dado o SDK .NET 8 num Windows
- Quando rodar `dotnet build client/band-wpf`
- Então produz um `WinExe`, o `app.manifest` declara `PerMonitorV2`/`dpiAware`, e não há warning novo.

**Cenário 2 — A faixa ancora acima da taskbar (smoke)**
- Dado o exe executado no monitor primário
- Quando a faixa boota
- Então aparece UMA faixa opaca de 88px acima da taskbar, `WindowStyle=None`, `ShowInTaskbar=False`, ausente do Alt-Tab/Task View, e nunca rouba foco — o estilo estendido vivo é `WS_EX_TOOLWINDOW|NOACTIVATE|TOPMOST` (~`0x08000080`, via Spy++/`GetWindowLong`).

**Cenário 3 — Re-ancora por EVENTO (smoke)**
- Dado a faixa ancorada
- Quando ocorre `WM_DISPLAYCHANGE` / troca de resolução / mover a taskbar
- Então a faixa reposiciona corretamente, sem tick de polling entre os eventos.

**Cenário 4 — Login + token DPAPI (smoke)**
- Dado uma conta semeada e a base URL de dev
- Quando o usuário entra e-mail+senha e loga
- Então `POST /v1/auth/login` retorna 200+token, o token é persistido via DPAPI, e o blob em disco NÃO contém o token em texto plano (buscar a string do token no arquivo → ausente).

**Cenário 5 — O pipe ao vivo renderiza (smoke)**
- Dado o token armazenado
- Quando o poll do `GET /v1/band` (Bearer, ~60s) retorna um `BandState`
- Então `forma`/`moral`/`athlete`(nome/`shirtNumber`/`overall`/`position`)/`phase` renderizam; `club`/`squad`(16, `isMe` marcado)/`todayMatch`/`injury`/`home`/`pendingDecisions`/`queue` renderizam quando presentes e ficam ESCONDIDOS quando `null` (sem tratar como erro/crash).

**Cenário 6 — Os relógios do contrato em leitura (smoke)**
- Dado um `BandState` de manhã (`roundSettled=false`) com `todayMatch.played=true`
- Quando renderiza
- Então o placar de ontem aparece; e, num `BandState` com `played=false`, o cliente NÃO fabrica placar; e com `club=null` não quebra (`squad=[]`, `queue` mostrada).

**Cenário 7 — erro roteado pelo `code` (smoke / edge case)**
- Dado o token expirado (ou o limite de rate estourado)
- Quando `GET /v1/band` responde 401 (ou 429)
- Então 401 → o cliente volta ao estado de login (sem travar/spin); 429 → respeita `Retry-After`/`retryAfter` antes do próximo poll.

**Cenário 8 — Orçamento SOB REDE (smoke medido, método no README)**
- Dado ≥10 min ocioso-com-poll na máquina de referência
- Quando medir CPU/RAM (process-tree)
- Então CPU média `<1%` da máquina E RAM `<150MB`, sem crescimento ilimitado de RAM na janela (gates do ADR-001; ressalva de hardware forte registrada).

**Cenário 9 — Saída graciosa + single-instance (smoke)**
- Dado a faixa rodando
- Quando duplo-clique / `SessionEnding` / fechar o app (ou tentar abrir uma 2ª faixa)
- Então `Cleanup` (unhook do WinEvent) roda idempotente sem hook vazado, e o `Mutex` impede a 2ª instância.

**Cenário 10 — O selo dos gates TS (o critério DURO, automatizável)**
- Dado a árvore C# adicionada ao repo
- Quando rodar `npm run lint/typecheck/build/test`
- Então todos verdes; `packages/world-engine` + os 4 goldens byte-idênticos (`git diff` = 0); sem migration; `services/*` intocado; prettier/eslint não varrem `client/`.

---

## Segurança (se aplicável)

- **Token em repouso:** DPAPI `CurrentUser` (nunca texto plano — requisito ADR-003); blob per-usuário/máquina → portar entre máquinas invalida → degrada para re-login sem crash.
- **Token em trânsito:** `Authorization: Bearer` (sem cookie ⇒ CSRF inexistente por construção, SPEC-037); o cliente nunca envia identificador de ator (autorização por construção — o `/v1/band` deriva o atleta da sessão).
- **Input não-confiável:** a resposta do servidor é desserializada com tolerância (campos desconhecidos ignorados, `null` = esconde seção); erro roteado pelo `code` estável, nunca pela frase/stack (OP-11); um `code` desconhecido degrada genérico.
- **OP-17:** o cliente é thin renderer — zero regra de negócio/anti-fraude; só apresenta o estado que o servidor computou.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Orçamento SOB REDE (novo) — o shell foi medido PARADO; poll+JSON+re-render é carga não medida | Média | `HttpClient` único, poll 60s, diff-update do ViewModel (sem rebuild da árvore), janela opaca; MEDIR (o smoke é o gate) |
| Primeiro C# no monorepo TS — os 4 gates são npm; C# não compila na CI | Alta | Smoke manual (precedente dos spikes); `bin`/`obj`/`config.json`/`.xaml` fora do prettier/eslint; workflow Windows+dotnet = fatia futura |
| Bring-up da stack viva para o smoke — exige Postgres+migrations+mundo semeado+atleta+`services/api`+≥1 tick | Média | Documentar no README; estados `null`-heavy (`club=null`/fila) ainda exercem o pipe ponta-a-ponta |
| Conta para o teste — sem signup no v1 | Média | Conta pré-semeada (`harness/create-account.ts`) + base URL de dev fornecidos pelo founder; testar o caminho 401→re-login |
| Hardware do orçamento — a evidência veio de Ryzen 5 5600X (forte) | Baixa | O PASS `<1%` vale em hardware forte; validar em notebook fraco = gate da FORMA (ADR-001), não bloqueia a estrutura |
| Win+D esconde a faixa no smoke | Baixa | Ratificado aceitável; antecipar no roteiro do smoke |

**Dependências:**
- SPEC-037 (login + sessão Bearer), SPEC-038 (`GET /v1/band` + `BandState`), SPEC-040 (número da camisa) — todas em `main`.
- ADR-001 (stack WPF + orçamentos), ADR-003 (auth/sessão); os spikes SPEC-003/005/006.
- **Precede:** a fatia 2 (as escritas de gameplay na faixa) e as fatias de arte (avatar em camadas, 3 alturas, cenas ilustradas, toasts).

---

## Notas de implementação

- **Portar, não reescrever:** copiar a pasta `Interop/` inteira + os 4 arquivos de shell verbatim; a `MainWindow` reusa o esqueleto de coordenação, sem o aparato de comparação de posturas.
- **Postura A no Win32, não no XAML:** o estilo estendido é aplicado por `Get/SetWindowLong` em `SourceInitialized` — setar `Topmost`/estilo via propriedade WPF recria o HWND e perde o estado (comentado no próprio spike).
- **Poll cooperativo:** `DispatcherTimer` 60s no thread da UI; a desserialização e o diff-update são baratos; nunca reconstruir a árvore visual. Animação futura anima só `TranslateTransform.X` (render thread), nunca `Canvas.Left`/layout por frame.
- **`System.Text.Json` tolerante:** opções que ignoram campos desconhecidos (política aditiva-only do contrato); `null` = esconder a seção.
- **DPAPI:** `ProtectedData.Protect/Unprotect` com `CurrentUser`; guardar o blob em `%LOCALAPPDATA%` (fora do repo/OneDrive).
- **Gotcha do spike:** `ClipToBounds` no `<Window>` crasha o startup (`0xE0434352`) — válido só no Canvas/Grid interno.
- **⚠️ Ritual do board:** aprovação da SPEC no card antes de codar; `set_done` antes do PR.
- **⚠️ CI (SPEC-166 + prettier):** o DONE precisa de `## Resumo do que foi feito` · `## Arquivos modificados` · `## Critérios de aceitação` · `## AI declaration`; garantir `client/` fora do prettier/eslint ANTES do 1º push (senão o gate rápido morde).

---

## Checklist de aprovação

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora)
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas (Nenhuma — sem migration)
- [ ] Mudanças de API estão documentadas (Nenhuma — consumidor puro)
- [ ] Critérios de aceitação são testáveis (10 cenários; mix de `dotnet build` + smoke medido)
- [ ] Riscos e superfície de segurança foram avaliados (orçamento sob rede; token DPAPI; C# fora da CI)
- [ ] Appetite é razoável para o escopo definido (3-4 dias)
- [ ] Não há conflito com SPECs abertas em paralelo

---

*SPEC-042 — método H1VE. A fatia 1 do cliente WPF da faixa: o pipe vertical fino — o shell always-on-bottom (portado dos spikes) + login/token DPAPI + poll do `GET /v1/band` REAL + render estrutural (só formas/texto, zero arte), sob `<1% CPU`/`<150MB`. SEM MIGRATION. `services/*`, engine e os 4 goldens INTOCADOS.*
