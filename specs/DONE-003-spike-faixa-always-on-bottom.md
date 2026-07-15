# DONE-003 — Spike faixa always-on-bottom

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-003 |
| **SPEC correspondente** | SPEC-003-spike-faixa-always-on-bottom.md |
| **Feature** | Spike faixa always-on-bottom (de-risca a forma padrão do cliente) |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/spike-faixa-always-on-bottom` |
| **PR** | {preencher ao abrir o PR} |
| **Desenvolvimento iniciado** | 2026-07-15 |
| **Validação no Windows** | 2026-07-15 |
| **Dias utilizados vs appetite** | <1 dia vs 14 dias (timebox do spike) |

---

## Resumo do que foi feito

Spike que **de-risca a forma padrão do cliente** (faixa sem borda, always-on-bottom, acima da taskbar,
com cena ambiente **animada**) sob as promessas públicas **< 1% CPU** e **< 150 MB RAM**. O candidato
**A (C#/WPF, .NET 8)** — escrito no macOS e nunca compilado — foi **validado no Windows 11** pelo founder
nesta sessão, no loop previsto pela SPEC (*entregar → medir → corrigir*).

**Resultado central (o risco #1 da SPEC — "a animação cabe no orçamento?"): GO com folga grande.**
A faixa animada sustentou **CPU média 0,249%** (~3% de um núcleo) e **RAM ~87 MB** (working set total),
sem leak no proxy de 3 min — folga de ~4× em CPU e ~1,7× em RAM. Comportamentos always-on-bottom,
não-rouba-foco, fora-de-taskbar/Alt-Tab e multi-monitor: todos **PASS**, confirmados na tela e por
leitura do estilo real da janela via P/Invoke (`WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE` = `0x08000080`).

**Um bug de código corrigido** (crash de startup) e **um comportamento caracterizado e deferido**
(Win+D). O footprint self-contained (**161 MB**, WPF sem trim) fica registrado como insumo direto da
Ratificação de stack (**#1**). O candidato **B (Rust/Win32) não foi implementado**: a sequência
ratificada era "A valida → só então B", e como A passou no orçamento, a pressão de kill que justificaria
o B não se materializou (a decisão B fica para a #1, pelo eixo footprint).

Toda a saída go/no-go está em **`spikes/faixa-always-on-bottom/RESULTS.md`**.

---

## Arquivos criados

Os arquivos do spike já existiam no branch (commit `6a9d471`, escritos no macOS). Esta sessão de
validação Windows **não criou** arquivos novos além do preenchimento do RESULTS e deste DONE:

| Arquivo | Descrição |
|---|---|
| `specs/DONE-003-spike-faixa-always-on-bottom.md` | Este documento. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `spikes/faixa-always-on-bottom/csharp-wpf/MainWindow.xaml` | **Fix do crash:** removido `ClipToBounds="True"` do `<Window>` (propriedade proibida em Window pelo WPF → `InvalidOperationException` no parse). É o **único diff de código** do spike; a clipagem dos orbes segue no `Canvas` interno. |
| `spikes/faixa-always-on-bottom/RESULTS.md` | Preenchido com o ambiente, as métricas medidas, os 2 achados e a recomendação para a #1. |
| `spikes/faixa-always-on-bottom/README.md` | Bloco "⏸️ Checkpoint" → "✅ Validado no Windows"; adicionada a "Limitação medida — Win+D (DWM cloaking / WorkerW)"; corrigido o item que afirmava que Win+D não esconde. |
| `.gitignore` | Ignora `spikes/**/publish/` (saída do `dotnet publish` self-contained). |
| `docs/projeto/roadmap.md` | Nota de validação do de-risk do cliente. |
| `CLAUDE.md` | Seção "Estado atual" atualizada. |

> **Instrumentação temporária revertida.** Durante a depuração foram adicionados um handler global de
> exceções (`App.xaml.cs`) e log de mensagens Win32 (`MainWindow.xaml.cs`) para achar a causa do crash
> e caracterizar o Win+D. Cumprido o papel, ambos foram **revertidos ao estado do branch** (`git checkout`)
> — o diff final de código é só a linha do `ClipToBounds`.

---

## Mudanças de schema aplicadas

Nenhuma. Spike de cliente, sem persistência (OP-01 não se aplica). A faixa é casca visual (OP-17):
zero regra de negócio, zero anti-fraude.

---

## Critérios de aceitação — verificação

| Cenário (SPEC-003) | Status | Observação |
|---|---|---|
| 1 — Faixa sem borda always-on-bottom com cena animada | ✅ **PASS** | 1920×40 acima da taskbar, orbes animando, atrás das janelas, não rouba foco, fora de taskbar/Alt-Tab/Task View. |
| 2 — Sobrevive a foco e a "mostrar desktop" | ⚠️ **PARCIAL** | Sobrevive a clicar/alternar janelas (fica no fundo). **Win+D falha** no Win11 (DWM cloaking; exige WorkerW parenting — deferido ao cliente). |
| 3 — Orçamento com animação (CPU < 1% **e** RAM < 150 MB) | ✅ **PASS** | 0,249% CPU / 87,1 MB pico. Este é o risco central da SPEC → **GO**. |
| 4 — Soak de 8 h (endurance/leak) | ⏳ **NÃO EXECUTADO** | Proxy de 3 min: drift de RAM **−0,6 MB** (sem leak). Comando de 8 h disponível no README; recomendado antes do GO definitivo. |
| 5 — Multi-monitor | ✅ **PASS** | Founder confirmou ancoragem correta no primário; re-ancora em `WM_DISPLAYCHANGE`. |
| 6 — Dados para a #1 + plano B | ✅ **PASS** | `RESULTS.md` com métricas + recomendação (footprint 161 MB é o eixo WPF vs. Rust); plano B (modo compacto) no README. |
| 7 — Kill honesto | ✅ **N/A (documentado)** | No-go do orçamento **não** foi acionado (passou com folga). O único gap (Win+D) foi documentado honestamente, sem forçar resultado positivo. |

**Gates TS:** os 4 gates (`lint`/`typecheck`/`test`/`build`) seguem verdes — o spike vive em `spikes/`,
fora de `packages/*`, ignorado por ESLint/Prettier e pelos projetos TS.

---

## Achados da validação Windows

| # | Sev. | Achado | Ação |
|---|---|---|---|
| 1 | **bug (corrigido)** | `ClipToBounds="True"` no `<Window>` → `InvalidOperationException` no parse do XAML; crash em 100% das execuções (exit `0xE0434352`), a faixa nunca aparecia. WER segurava o processo crashado ~30–60 s, o que mascarou o crash como "processo vivo em 50 MB". | Removido do `Window` (clipagem já é do `Canvas`). Único diff de código; é o build medido. |
| 2 | **gap (caracterizado, deferido)** | Win+D esconde a faixa. Instrumentação provou ser **DWM cloaking** (sem `WM_SHOWWINDOW`/`WM_SIZE`/`SWP_HIDEWINDOW`). Fixes leves (barrar `SWP_HIDEWINDOW`, engolir `SC_MINIMIZE`) não resolvem; a solução é parenting à WorkerW, não-trivial no Win11. | Deferido ao cliente real (decisão do founder). Documentado em RESULTS #2 e README. |
| — | observação | Falso positivo de "taskbar/Alt-Tab": o relato inicial era a **posição** da faixa (colada acima da taskbar) interpretada como "na taskbar". Estilo vivo confirma tool-window; founder verificou ausência em taskbar, Alt-Tab e Task View. | Nenhuma — não era bug. |

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| Fix do `ClipToBounds`, `RESULTS.md`, atualizações de README/roadmap/CLAUDE, este DONE | ~100% | Sim — o fix foi verificado por **execução real no Windows** (build limpo, sem crash) e **medição** (`measure-usage.ps1`); os comportamentos foram confirmados na tela pelo founder + leitura do estilo real da janela via P/Invoke. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → todas **dentro da intenção** da SPEC-003 e revertidas ou mínimas:
  - Instrumentação temporária de diagnóstico (handler de exceção + log de mensagens) para achar o
    root-cause do crash e caracterizar o Win+D — **revertida** ao fim (diff final não a contém).
  - `.gitignore`: `spikes/**/publish/` (higiene de artefato, alinhada ao "não versionar builds" já
    presente).
  - Nenhuma mudança de escopo de produto (sem persistência, sem UI de jogo, sem lógica de negócio).

---

## Desvios em relação à SPEC

| Item da SPEC | O que foi feito | Motivo |
|---|---|---|
| Candidato B (Rust/Win32) | **Não implementado** | Sequência ratificada "A valida → só então B". A passou no orçamento com folga → o kill que justificaria o B não ocorreu. Decisão B vira insumo da #1 (eixo footprint), não bloqueia a forma. |
| Cenário 4 — soak de 8 h | **Não executado** (proxy de 3 min) | Founder optou por "documentar e finalizar"; proxy não mostra leak. Comando de 8 h fica disponível e recomendado antes do GO definitivo. |
| Cenário 2 — sobreviver a Win+D | **Falha caracterizada, deferida** | No Win11 é DWM cloaking; a solução (WorkerW) é trabalho de cliente, não de spike. Documentado, não forçado. |

---

## Limitações conhecidas

- **Win+D não sobrevivido** — a forma padrão precisa do parenting à WorkerW (ou ratificar "sumir no
  Win+D" como comportamento ambiente desejado). Ponto aberto para a #1 / cliente real.
- **Soak de 8 h não rodado** — só proxy de 3 min (sem leak). Endurance de expediente inteiro ainda não
  provada empiricamente.
- **Um único ambiente** — Ryzen 5 5600X, Win11 build 26200, 1 monitor ativo no snapshot final (founder
  confirmou 2+ no teste). Sem cobertura de DPI misto (fora de escopo) nem de hardware fraco/integrado.
- **Footprint WPF** — 161 MB self-contained (sem trim no .NET 8) ou dependência do runtime .NET 8
  Desktop; é o principal con vs. um binário nativo enxuto.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Sobrevivência ao "mostrar desktop" (WorkerW parenting, Win11) | Alto (é comportamento da forma padrão) | Cliente real / decisão da #1. |
| Soak de 8 h (endurance/leak de expediente) | Médio | Antes do GO definitivo da forma. |
| Candidato B (Rust) para comparar footprint | Médio | Ratificação de stack #1. |
| Footprint self-contained de 161 MB (WPF sem trim) | Médio (distribuição) | #1 (aceitar WPF ou ir de Rust). |

---

## Checklist de entrega

- [x] Critérios de aceitação verificados (1,3,5,6 PASS; 2 parcial; 4 proxy; 7 N/A documentado)
- [x] Build compila e roda no Windows (0 erros, sem crash)
- [x] Métricas medidas com o harness da SPEC (`measure-usage.ps1`)
- [x] Bug de código corrigido; instrumentação de diagnóstico revertida
- [x] `RESULTS.md` preenchido com dados reais + recomendação para a #1
- [x] Gates TS seguem verdes (spike fora de `packages/*`)
- [x] Nenhuma lógica de negócio na faixa (OP-17); sem segredos (OP-02/12)
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` "Estado atual" atualizado
- [x] `docs/projeto/roadmap.md` atualizado
- [x] Este DONE está completo *(commit/PR pendente de confirmação do founder)*

---

*DONE-003 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE.*
