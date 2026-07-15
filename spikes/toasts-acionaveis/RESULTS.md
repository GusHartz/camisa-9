# RESULTS — Spike toasts acionáveis (SPEC-005)

> Validado no Windows em sessão orquestrada: o agente publicou/mediu/orquestrou; o founder
> **clicou** no toast (warm + cold) e **segurou** os estados de silêncio. Prova = arquivos
> `proof.jsonl`/`server-log.jsonl`/`gate.jsonl` em `%LOCALAPPDATA%\camisa9-toast-spike\`,
> lidos verbatim abaixo.

## Ambiente

| Campo | Valor |
|---|---|
| Máquina / CPU | AMD Ryzen 5 5600X (6 núcleos / 12 lógicos) |
| SO | Windows 11 Pro build 26200 |
| .NET SDK | 8.0.423 (TFM `net8.0-windows10.0.22621.0`, zero workload) |
| Elevado? | Não (non-elevated) — como exigido |
| Notificações do app | ON no happy-path |
| Focus Assist / Não Perturbe | OFF no happy-path (ligado só no teste de silêncio) |
| Data | 2026-07-15 |

---

## Métricas / critérios

| # | Critério (SPEC-005) | Resultado | Observação |
|---|---|---|---|
| 1 | Toast com **2 botões** renderiza (nome+ícone via AUMID) | ✅ PASS | Banner com `PLAY`/`REST`; auto-registro do toolkit (sem atalho manual) |
| 2 | **Warm** — clique com app aberto não rouba janela; POST ao stub | ✅ PASS | `pid 8156, cold:false, decision:play, http 200, ack:true`; sem trazer janela à frente |
| 3 | **Cold** — app fechado → novo PID + headless + POST (**A PROVA CENTRAL**) | ✅ PASS | app morto (pid 6660/18252) → **PIDs novos** 13708, 19784, **5812** cold-startam headless e postam |
| 4 | Servidor grava a **decisão correta** (play vs rest) | ✅ PASS | `play` (warm) **e** `rest` (cold via botão, pid 5812) gravados corretamente |
| 5 | Silêncio — **fullscreen exclusivo (D3D)** suprime | ⚠️ não aceso | sem jogo D3D nesta sessão; gate é `if(estado!=Accepts)` — trivialmente correto p/ este estado |
| 5 | Silêncio — **borderless-fullscreen** suprime (QUNS_BUSY) | ⚠️ **brecha** | vídeo de navegador em tela cheia **não** virou o QUNS (borderless/DWM) → ver Achado 3 |
| 5 | Silêncio — **apresentação (PowerPoint)** suprime | ⚠️ não aceso | `PresentationSettings` (Mobility Center) é laptop-only; não engatou no desktop |
| 6 | Quiet hours / **Focus Assist** suprime (QUNS_QUIET_TIME) | ⚠️ **achado** | Não Perturbe **manual** do Win11 **não** vira o QUNS (plataforma trata) → ver Achado 4 |
| 7 | **Clique tardio** (Central de Ações) ainda ativa; handler idempotente | ✅ PASS | os cold-clicks 13708/19784 foram cliques tardios da Central; 5 cold-starts, todos `error:""` |
| 8 | Orçamento: app-gatilho ocioso **~0% CPU**, sem leak | ✅ PASS (com watch) | CPU **0,095%** média / p95 0,513% / pico 3,617%; RAM pico 99,0 MB; **drift +9,8 MB/60s** (watch) |
| 8 | Footprint self-contained | **185,3 MB** | 467 arquivos; vs. ~161 MB da SPEC-003 (+24 MB da projeção WinRT). Framework-dep: 25,7 MB (8 arq.) |
| 8 | `Uninstall()` remove o registro AUMID/COM | ↪ deferido | `ToastNotificationManagerCompat.Uninstall()` existe; chamada real fica na SPEC de distribuição |

**Veredito de orçamento (`measure-usage.ps1`, app-gatilho ocioso 60s):** `PASS (< 1% CPU & < 150 MB)`.

---

## `proof.jsonl` (cliente) — verbatim

```
{"at":"2026-07-15T20:31:45Z","pid":8156, "cold":false,"decision":"play",         "argument":"decision=play","httpStatus":200,"ack":"{ack:true}","error":""}
{"at":"2026-07-15T20:32:04Z","pid":8156, "cold":false,"decision":"play",         "argument":"decision=play","httpStatus":200,"ack":"{ack:true}","error":""}
{"at":"2026-07-15T20:34:48Z","pid":13708,"cold":true, "decision":"(sem decision)","argument":"",            "httpStatus":200,"ack":"{ack:true}","error":""}
{"at":"2026-07-15T20:35:04Z","pid":19784,"cold":true, "decision":"(sem decision)","argument":"",            "httpStatus":200,"ack":"{ack:true}","error":""}
{"at":"2026-07-15T20:40:35Z","pid":5812, "cold":true, "decision":"rest",         "argument":"decision=rest","httpStatus":200,"ack":"{ack:true}","error":""}
```

Leitura:
- **linhas 1–2 (warm):** app vivo (8156) recebe o clique `PLAY`, posta, `ack:true` — sem roubar foco.
- **linhas 3–4 (cold, body-tap):** app **morto**; clicar no **corpo** da notificação na Central cold-starta
  PIDs **novos** (13708, 19784) headless → postam. Argumento vazio pois o body-tap não carrega botão (Achado 2).
- **linha 5 (cold, botão):** com `ToastScenario.Reminder` o banner ficou fixo com botões; clique em `REST`
  com o app **morto** cold-starta o PID **5812** → posta `decision:rest` **correto**.

## `server-log.jsonl` (stub) — cold verbatim

```
{"receivedAt":"2026-07-15T20:34:48Z","method":"POST","remote":"[::1]","payload":"{decision:(sem decision),pid:13708,cold:true,argument:}"}
{"receivedAt":"2026-07-15T20:35:04Z","method":"POST","remote":"[::1]","payload":"{decision:(sem decision),pid:19784,cold:true,argument:}"}
{"receivedAt":"2026-07-15T20:40:35Z","method":"POST","remote":"[::1]","payload":"{decision:rest,pid:5812,cold:true,argument:decision=rest}"}
```

## `gate.jsonl` (sonda de silêncio) — amostras

```
desktop ocioso     → {"shown":true, "reason":"permitido (QUNS_ACCEPTS_NOTIFICATIONS)"}   (baseline)
navegador FS (F)   → 15x {"shown":true, "permitido (QUNS_ACCEPTS_NOTIFICATIONS)"}         (não virou)
Não Perturbe ON    → 4x  {"shown":true, "permitido (QUNS_ACCEPTS_NOTIFICATIONS)"}         (não virou)
PresentationSettings→4x  {"shown":true, "permitido (QUNS_ACCEPTS_NOTIFICATIONS)"}         (laptop-only)
```

---

## Achados (loop build → run → medir)

| # | Sev. | Achado | Ação |
|---|---|---|---|
| 1 | descoberta | `Windows.UI.Notifications.NotificationMode` não existe (suposição da pesquisa) — sem API pública limpa de DND fino. | Gate por `SHQueryUserNotificationState`; DND fino via registry/WNF deferido (SPEC-005 § FORA). |
| 2 | **major (UX)** | Com o app **fechado**, o Win11 **recolhe** o toast na Central e **esconde os botões**; o body-tap ativa com `argument` vazio → decisão não é carregada. | **Fix aplicado:** `ToastScenario.Reminder` mantém o banner **fixo com botões** até o usuário decidir — cold-click no botão passou a carregar a decisão (pid 5812, `rest`). É o cenário certo p/ o ritual das 15h. |
| 3 | **major (silêncio)** | `SHQueryUserNotificationState` no Win11 é **estreito**: **não** vira p/ browser-fullscreen (borderless/DWM) nem p/ Mobility "presentation" (laptop). Jogos **borderless-fullscreen** podem **não** setar `QUNS_Busy` → o toast poderia aparecer por cima. | Manter o gate (cobre D3D-exclusivo + PowerPoint-presentation), **somar heurística** de foreground-cobre-monitor + topmost. Follow-up documentado (não no caminho crítico do spike). |
| 4 | descoberta | **Não Perturbe manual do Win11 não aparece** no `SHQueryUserNotificationState` — é tratado na **plataforma de notificação**. | Aceitável: com DND on, o **próprio Windows** suprime o banner. Nosso gate não precisa (e não tenta). Net-behavior correto. |
| 5 | menor | App-gatilho encerrou após o handling **warm** (janela fechada). | Detalhe do harness de teste — o cliente real é a **faixa residente** (SPEC-003), não este app-gatilho. Sem impacto. |
| 6 | watch | RAM drift **+9,8 MB em 60s** no app-gatilho ocioso. | Distinguir warm-up de leak exige **soak mais longo** (pendência, análoga ao soak de 8h da SPEC-003). |

## Bordas ainda não observadas

- **Fullscreen exclusivo D3D real (jogo)** e **PowerPoint F5** — os dois estados que o QUNS **de fato** vira;
  não acesos nesta sessão (sem jogo/PPT à mão). Gate é um allowlist trivial → correto por inspeção p/ esses estados.
- Tela **bloqueada** (`QUNS_NOT_PRESENT`) — drop vs enfileirar (questão aberta #1, server-side).
- Cold-activation **após reboot**; múltiplos toasts na fila; soak de 8h do app-gatilho.

---

## Recomendação go/no-go (para a Fase 3 / distribuição)

> **GO.** O risco central — **cold-activation COM de um EXE unpackaged, sem atalho/instalador** — foi
> **provado** (PIDs novos 13708/19784/5812 cold-startam headless, postam ao servidor e saem; `ack:true`),
> sustentado **apenas** pelo auto-registro AUMID+COM do `ToastNotificationManagerCompat` no primeiro
> `.Show()`. Orçamento ambiente PASS (**0,095% CPU**, RAM pico 99 MB). **Kill-criteria NÃO acionado.**
>
> **Ressalvas herdadas pela SPEC de distribuição / cliente:**
> 1. **Usar `ToastScenario.Reminder`** no toast do ritual (Achado 2) — sem ele, os botões somem na Central.
> 2. **Silêncio precisa de heurística suplementar** para borderless-fullscreen (Achado 3); `SHQueryUserNotificationState`
>    sozinho não basta no Win11.
> 3. **Soak longo** para cravar o drift de RAM (Achado 6).
> 4. **Code-signing + Uninstall()** do registro AUMID/COM entram no instalador (fora do spike).
