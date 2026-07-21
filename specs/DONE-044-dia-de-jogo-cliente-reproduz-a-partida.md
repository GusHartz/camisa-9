# DONE-044 — Dia de jogo ao vivo · fatia 2 (o cliente reproduz a partida)

> Registro de conclusão. Par obrigatório da SPEC-044. Nenhum PR é válido sem este DONE.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-044 / DONE-044 |
| **Feature** | Dia de jogo ao vivo — o cliente reproduz a partida ~15min ao vivo (fatia 2; roadmap 3.1/3.4) |
| **Slug** | dia-de-jogo-cliente-reproduz-a-partida |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.1 (Dia de jogo ao vivo) + 3.4 (o cliente/faixa) — o "assistir" |
| **Concluída em** | 2026-07-21 |
| **Dependência DURA** | SPEC-043 (`todayMatch.goals`, PR #46 — **não mergeada**; esta branch está EMPILHADA sobre a 043) · SPEC-042 (o cliente WPF), em `main` |

---

## Resumo do que foi feito

O jogador agora **assiste** ao próprio jogo. A SPEC-043 entregou a timeline de gols (invisível); esta fatia a **reproduz** na faixa: o cliente baixa a `todayMatch.goals` 1× e a reproduz **localmente por um relógio** — durante ~3–5 min (default 4, tunável), o relógio corre 0'→90' e o placar **sobe minuto-a-minuto** (0–0 → 1–0 aos 23' → empate aos 71'), com o seu gol destacado (⚽). **Zero stream** (o determinismo faz "amigos assistem o mesmo jogo" de graça), render **estrutural**, `<1% CPU`.

**Camadas (100% cliente; `packages/*`, os 5 goldens e todo `services/*` INTOCADOS — `git diff` vs a base SPEC-043 = 0; SEM MIGRATION):**
- **Espelho do contrato** (`Api/BandState.cs`): record `BandGoal {Minute, IsMine}` + `BandMatch.Goals` (`IReadOnlyList<BandGoal>?`, tolerante — ausente/null pré-jogo/cliente-antigo).
- **O motor** `State/MatchReplay.cs`: `DispatcherTimer` que comprime os 90' na duração-alvo; a cada NOVO minuto emite o minuto + o **placar corrente** (contagem `min(minuto,90) <= relógio`, por lado) + o flag de gol (flash). Tick coarse (500ms, dispara por-minuto). A CONTAGEM é a autoridade (converge ao `goalsFor`/`goalsAgainst`).
- **A integração** (`View/BandViewModel.cs`): estado de replay (`ReplayActive`, `MatchLine` dirigido, `MyGoalFlashOpacity`/`TheirGoalFlashOpacity`), **auto-play 1×** (dedup por `seasonId:round`), **re-assistir** (`ReWatch`), o **guard** que impede o poll de sobrescrever o `MatchLine` durante o replay, e a **restauração** ao fim.
- **A UI** (`MainWindow.xaml`+`.cs`): o `MatchLine` vira `⏱ NN'  M–N` durante o replay; o flash ⚽ (Opacity 0/1, render thread — §184); o gesto **↻ re-assistir** (`e.Handled` não fecha a faixa). `App.xaml.cs` injeta o `replayWatchSeconds` do config no ViewModel.

---

## Desvios da SPEC (mecanismo/necessidade, não de produto) — registrados

1. **`client/band-wpf/App.xaml.cs` tocado (fora da lista da SPEC).** É o composition-root: lê o `replayWatchSeconds` do `config.json` (`LoadReplayWatchSeconds`) e injeta no `new BandViewModel(...)`. Necessário para o config-knob chegar ao motor. **26 linhas.** (Pego pela revisão — Achado 1.)
2. **Implementado ANTES do merge da SPEC-043 (#46).** A branch está EMPILHADA sobre a 043 (tem o `todayMatch.goals`), então o código constrói. **O PR contra `main` e o merge esperam a #46 mergear** (rebase sobre `main` → os commits da 043 saem do PR desta fatia). Até lá, o card fica em `dev`.
3. **Sem projeto de teste C#** (o cliente não tem `*.Tests.csproj`) — o motor de replay é verificado por `dotnet build` + a revisão adversarial + o smoke do founder. (Observação da revisão.)

---

## Revisão adversarial (2 dimensões em paralelo · cada achado verificado)

**Núcleo SÓLIDO.** A dimensão **contrato/OP-17/escopo voltou LIMPA** — o replay é uma CONTAGEM (não recomputa/fabrica placar; converge ao autoritativo), 100% cliente (`git diff` vs a base = 0), o espelho C# é fiel ao contrato, o orçamento é coarse (tick por-minuto, só durante o replay), o dedup é correto (`seasonId:round` estável; viragem muda a chave). **1 MAJOR + 5 MINOR/LOW corrigidos:**

- **[MAJOR — ciclo de vida] O `DispatcherTimer` do replay não era parado no fechamento** → no reauth (401, o app NÃO morre) o timer seguia tocando ~4 min a 2Hz num ViewModel órfão, churnando `PropertyChanged` → furava o `<1% CPU`. **Fix:** `BandViewModel.StopReplay()` + chamada no `MainWindow.Cleanup` (guardada — thread-afim no `ProcessExit`).
- **[MINOR] Flash ⚽ preso ligado** após um gol no 90' (nada o limpava) + **MatchLine preso em "⏱ 90' x–y"** até o próximo poll (~60s). **Fix:** `OnReplayEnded` apaga o flash + restaura o `MatchLine` estático (via o `_lastClub`).
- **[MINOR — latente] O clock capado em 90 DROPAVA gol >90'** (hoje minutos são [1,90], mas viola o invariante "a soma converge"). **Fix:** contar `min(minuto,90)` — a contagem é a autoridade, nunca dropa.
- **[MINOR — fidelidade] O clamp `[30,900]` contradizia a faixa travada** (§31 "3–5 min" / §64 "180–300"). **Fix:** clamp `[180,300]` (honra a decisão do founder).
- **[LOW — fidelidade §184] O flash usava `Visibility` (afeta layout), não `Opacity`.** **Fix:** bind de `Opacity` (0/1, render thread) — sem passe de layout.
- **[MINOR — aceito] Imprecisão do flash** em tick que pula minutos / 2 gols no mesmo passo: a CONTAGEM é sempre exata; só o flash mostra 1 ⚽ por tick (comentado no código). Aceito (cosmético).

**Verificados OK:** re-`Play` idempotente (não cria 2º timer), threading (tudo UI-thread — sem race), o dedup, o minuto chega EXATAMENTE a 90 + gol-no-90' contado, o ↻ NÃO fecha a faixa (`e.Handled`), o espelho fiel, o orçamento.

---

## Arquivos modificados

**Novos:** `client/band-wpf/State/MatchReplay.cs` · `specs/{SPEC,DONE}-044-dia-de-jogo-cliente-reproduz-a-partida.md`.

**Editados:** `client/band-wpf/Api/BandState.cs` · `View/BandViewModel.cs` · `MainWindow.xaml` (+`.cs`) · `App.xaml.cs` (o config-knob — desvio registrado) · `config.json` · `README.md`.

**Intocado (o critério DURO):** `packages/world-engine` + os 5 goldens + **todo `services/*`** (`git diff` vs a base SPEC-043 = 0). **SEM MIGRATION.**

---

## Critérios de aceitação

⚠️ **Verificação:** o **Cenário 1** (compila) e o **Cenário 7** (selo — 100% cliente) foram verificados **aqui** (`dotnet build` verde + `git diff` vs base = 0); os **Cenários 2–6 são smoke ao vivo** (GUI + stack no ar + uma rodada tickada com gols) — método no `README.md`; a evidência atual é o build + a revisão adversarial (2 dimensões) + a análise estática. **O smoke medido é a ação do founder.**

1. **Compila + espelha o contrato** ✅: `dotnet build` 0 avisos; `BandGoal`/`BandMatch.Goals` tolerante a null/ausente.
2–6. *(smoke)*: auto-play 1× (dedup por rodada) · o placar sobe 0'→90' (soma == final) · re-assistir · orçamento durante o replay · degradação (sem `goals` → sem replay, sem crash) — implementados; método no README.
7. **O selo** ✅: `packages/world-engine` + 5 goldens + `services/*` byte-idênticos (`git diff` vs base = 0); `client/` fora do prettier/eslint; sem migration; os gates TS verdes (o cliente é isolado).

---

## Gates de qualidade

- **`dotnet build` verde** (0 avisos/erros) — antes E depois dos 6 fixes da revisão.
- **`git diff` vs a base (SPEC-043) para `services/**`/`packages/**`/goldens = 0** (100% cliente); os gates TS não são afetados (cliente fora dos workspaces npm).
- ⚠️ O **smoke ao vivo** (o replay rodando, o orçamento medido) é a **ação do founder** (headless aqui).

---

## Escopo deferido / follow-ups (nomeados)

- **A arte** (câmera no seu jogador, cenas ilustradas) — fatia de arte.
- **A NOTA + o artilheiro** — card ④ (fatia 3, servidor; enriquece o replay).
- **Eventos de escolha (3.2)** — o "interagir"; **resumo de 20s (3.3)**.
- **Persistir o "já assisti"** entre reinícios (hoje o dedup é em memória por sessão).
- **Um projeto de teste C#** para o motor de replay (unidade sobre `MatchReplay`/`MaybeAutoPlay`).

---

## AI declaration

Implementação conduzida por agente de IA (Claude Code / Opus 4.8) em par com o dev: a implementação escrita e **build-verificada localmente** (`dotnet build`, 0 avisos; `git diff` vs base = 0), e uma **revisão adversarial por 2 agentes paralelos** (ciclo-de-vida/threading · contrato/OP-17/escopo/orçamento), cada achado verificado — que confirmou o núcleo sólido (contagem-não-recomputa, 100% cliente, dedup, threading, espelho fiel) e pegou **1 MAJOR** (o timer de replay não parado no reauth) + 5 MINOR/LOW, **todos corrigidos** e re-buildados verdes. **Não houve revisão humana linha-a-linha**, e **o smoke ao vivo (Cenários 2–6) ainda não foi rodado** (ambiente headless) — o rigor veio do build, da análise estática e da revisão; o **smoke medido é a ação do founder**. Os desvios (o `App.xaml.cs`, a branch empilhada, a ausência de teste C#) estão registrados acima.

---

*DONE-044 — método H1VE. A fatia 2 de "Dia de jogo ao vivo": o cliente WPF baixa a timeline (SPEC-043) e a REPRODUZ ~3–5 min ao vivo na faixa — o placar subindo minuto-a-minuto, o gol destacado. Render estrutural, zero stream, `<1% CPU`. 100% cliente: `services/*`, engine e os 5 goldens INTOCADOS. SEM MIGRATION. ⚠️ PR/merge gated na #46 (SPEC-043).*
