# RESULTS — Spike toasts acionáveis (SPEC-005)

> Preenchido pelo founder ao validar no Windows. O agente **compila e mede**; o founder
> **clica e observa** (o que o agente não vê). Cole a saída de `validate.ps1` verbatim.

## Ambiente

| Campo | Valor |
|---|---|
| Máquina / CPU | {ex.: AMD Ryzen 5 5600X, 12 núcleos lógicos} |
| SO | {ex.: Windows 11 Pro build 26200} |
| .NET SDK | {ex.: 8.0.423} |
| Elevado? | {não — deve ser non-elevated} |
| Notificações do app | {ON no happy-path} |
| Focus Assist | {OFF no happy-path} |
| Data | {YYYY-MM-DD} |

---

## Métricas / critérios

| # | Critério (SPEC-005) | Resultado | Observação |
|---|---|---|---|
| 1 | Toast com **2 botões** renderiza (nome+ícone via AUMID) | ☐ ☑ / ☒ | {nome/ícone observado?} |
| 2 | **Warm** — clique com app aberto não rouba janela; POST ao stub | ☐ | |
| 3 | **Cold** — app fechado → novo PID + headless + POST (A PROVA CENTRAL) | ☐ | {PID morto → PID novo?} |
| 4 | Servidor grava a **decisão correta** (play vs rest) | ☐ | |
| 5 | Silêncio — **fullscreen exclusivo** suprime | ☐ | {jogo usado} |
| 5 | Silêncio — **borderless-fullscreen** suprime (QUNS_BUSY) | ☐ | {jogo usado} |
| 5 | Silêncio — **apresentação (PowerPoint)** suprime | ☐ | |
| 6 | Quiet hours / **Focus Assist** suprime (QUNS_QUIET_TIME) | ☐ | (DND fino: sem API pública — ver README) |
| 7 | **Clique tardio** (Action Center) ainda ativa; handler idempotente | ☐ | |
| 8 | Orçamento: app-gatilho ocioso **~0% CPU**, sem leak | ☐ | CPU ___ % / drift ___ MB |
| 8 | Footprint self-contained | ___ MB | vs. ~161 MB da SPEC-003 |
| 8 | `Uninstall()` remove o registro AUMID/COM | ☐ | |

---

## Saída de `validate.ps1` (verbatim)

```
{colar aqui}
```

## `proof.jsonl` (cliente) — linhas relevantes

```
{colar}
```

## `server-log.jsonl` (stub) — linhas relevantes

```
{colar}
```

---

## Achados (loop build → run → medir)

| # | Sev. | Achado | Ação |
|---|---|---|---|
| 1 | descoberta | `Windows.UI.Notifications.NotificationMode` não existe (suposição da pesquisa) — DND fino sem API pública limpa. | Gate por `SHQueryUserNotificationState` (cobre fullscreen/apresentação/quiet-time); DND via registry/WNF deferido. |
| — | — | {preencher no loop} | |

## Bordas ainda não observadas

- {ex.: tela bloqueada / QUNS_NOT_PRESENT — drop vs enfileirar (questão aberta #1)}
- {ex.: cold-activation após reboot; múltiplos toasts na fila}

---

## Recomendação go/no-go (para a Fase 3 / distribuição)

> {GO / NO-GO / GO-com-ressalvas}. Ex.: "GO — cold-activation confiável com o auto-registro do
> toolkit (sem atalho manual)" **ou** "GO-com-ressalva — cold-activation exige atalho de Start Menu
> instalado → requisito da SPEC de distribuição" **ou** "NO-GO — {motivo}".}
