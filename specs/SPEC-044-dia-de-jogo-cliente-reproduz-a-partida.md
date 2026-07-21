# SPEC-044 — Dia de jogo ao vivo · fatia 2 (o cliente reproduz a partida)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-044 |
| **Feature** | Dia de jogo ao vivo — o cliente reproduz a partida ~15min ao vivo (fatia 2 de N; roadmap 3.1/3.4) |
| **Slug** | dia-de-jogo-cliente-reproduz-a-partida |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | **3.1** (Dia de jogo ao vivo) + **3.4** (o cliente/faixa) — o **payoff que se SENTE**: o "assistir" |
| **Appetite** | 3 a 4 dias (o motor de replay + o estado no ViewModel + a UI estrutural + o smoke medido) |
| **Prioridade** | HIGH — é o "assistir" da série; o gancho do north star (≥3 humanos às 15h) |
| **Criada em** | 2026-07-21 |
| **Aprovada em** | {a preencher após aprovação no card} |
| **Aprovada por** | {a preencher — founder/architect} |
| **Status** | Rascunho — aguardando aprovação no card |

---

## Decisões travadas com o founder (2026-07-21)

> **Régua do founder:** prender o jogador **assistindo**. A fatia 1 (SPEC-043) deu a timeline; esta a torna **sentida** — a partida se desenrola ao vivo na faixa.

1. **Quando toca:** **auto-play 1×** quando a partida liquidada aparece (a janela das 15h), + um **re-assistir** manual. Dedup por rodada mostrada (não re-toca a cada poll).
2. **Compressão / duração da watch: 3 a 5 minutos** (tunável; default ~4 min = 240s) — os 90' da partida comprimidos nesse tempo real. Ambiente, não maratona.
3. **Render ESTRUTURAL** (sem arte): o placar que sobe + o relógio 0'→90' + o flash do gol (`isMine` destacado) com primitivas WPF — coerente com a SPEC-042. A **câmera no seu jogador / arte** fica pra fatia de arte.
4. **Zero stream / server-first:** o cliente baixa a `todayMatch.goals` (SPEC-043) 1× e **reproduz localmente por um relógio** — nenhuma rota nova, nenhum websocket/SSE (o determinismo faz "amigos assistem o mesmo jogo" de graça). Dentro de `<1% CPU`.
5. **⚠️ Dependência:** consome o `todayMatch.goals` da **SPEC-043** (PR #46). Esta branch está **empilhada** sobre a 043; o PR desta fatia só fecha limpo (rebase sobre `main`) **depois** da #46 mergear.

---

## Objetivo

Fazer o jogador **assistir** ao próprio jogo. A SPEC-043 entregou a timeline de gols (invisível); esta fatia a **reproduz** na faixa: durante ~3–5 min, o relógio da partida corre de 0' a 90' e o placar **sobe minuto-a-minuto** (0–0 → 1–0 aos 23' → empate aos 71'), com o seu gol destacado. É o payoff que se SENTE — a dopamina das 15h.

---

## Contexto e motivação

Roadmap **3.1** (a dopamina ao vivo). A SPEC-042 entregou o cliente WPF (só-leitura, render estrutural do `GET /v1/band`); a SPEC-043 entregou o **`todayMatch.goals: {minute, isMine}[]`** (a timeline determinística). Falta **reproduzi-la** — hoje o cliente mostra só o placar final estático. Como não há feed ao vivo (server-first, `<1% CPU`, autosuspend Neon), a arquitetura correta é **baixar a timeline 1× + replay local por relógio**: o cliente comprime os 90' num tempo real curto, e do ponto de vista do jogador a partida "acontece ao vivo" na janela das 15h.

**Fatos verificados no repo (SPEC-042):**
- `client/band-wpf/Api/BandState.cs` espelha o contrato `/v1` — mas o `BandMatch` **ainda NÃO tem `goals`** (a SPEC-042 precede a 043); esta fatia adiciona o record.
- `client/band-wpf/View/BandViewModel.cs` (`INotifyPropertyChanged`, diff-update) monta o `MatchLine`/estado a partir do `BandState`.
- `client/band-wpf/State/BandPoller.cs` faz poll do `/v1/band` a 60s (o momento em que a partida liquidada aparece).
- `client/band-wpf/MainWindow.xaml` é a faixa 88px estrutural.

---

## Escopo — o que está DENTRO

### A) O espelho do contrato (o cliente aprende `goals`)
- [ ] `client/band-wpf/Api/BandState.cs`: record `BandGoal { minute, isMine }` + `BandMatch.goals` (`IReadOnlyList<BandGoal>?`, tolerante — pode vir null/ausente). Espelha o campo aditivo da SPEC-043.

### B) O motor de replay (client-side, puro-ish)
- [ ] `client/band-wpf/State/MatchReplay.cs`: dado a timeline (`goals`) + a duração-alvo (config), dirige um `DispatcherTimer` que avança o **minuto da partida** de 0 a 90 ao longo dos ~3–5 min reais; a cada tick expõe `matchMinute` + o **placar corrente** (contando os gols cujo minuto já passou) + o gol recém-ocorrido (pro flash). `Start()`/`Stop()`; termina em 90' com o placar final == `goalsFor`/`goalsAgainst`. Tick coarse (não por-frame) pro orçamento.
- [ ] Config: `replayWatchSeconds` (default 240; faixa 180–300) em `config.json` (tunável sem recompilar).

### C) O gatilho + o estado no ViewModel
- [ ] `BandViewModel`: estado de replay (`IsReplaying`, `MatchMinuteLabel`, `ReplayScore`, `GoalFlash`/`GoalFlashIsMine`), consumido pela XAML.
- [ ] **Auto-play 1×:** quando um `BandState` chega com o `todayMatch` **liquidado + com `goals`** e a **rodada mostrada mudou** (dedup por `seasonId+round`), dispara o replay uma vez; guarda a chave (não re-toca nos polls seguintes).
- [ ] **Re-assistir:** um comando/gesto (ex.: clique simples na faixa) reinicia o replay da última partida liquidada, ignorando o dedup.

### D) A UI do replay (estrutural)
- [ ] `MainWindow.xaml`(+`.cs`): durante o replay, a área do `todayMatch` mostra o **relógio `NN'`** (0'→90') + o **placar corrente** (subindo) + um **flash** no gol (cor/realce distinto quando `isMine`). Fora do replay, o placar final estático de hoje (comportamento SPEC-042). Animação barata (opacidade/`TranslateTransform` no render thread; nunca layout por frame).

### E) Higiene
- [ ] `README.md` do cliente: o roteiro do smoke do replay (bring-up + medição do orçamento durante a janela de replay).

---

## Escopo — o que está FORA

- **A arte** (a câmera no seu jogador, cenas ilustradas, avatar em camadas). Motivo: fatia de arte; a fatia 2 é estrutural.
- **A NOTA do jogador ao vivo + o artilheiro.** Motivo: card ④ (fatia 3, servidor) — ainda não estão na timeline.
- **Eventos de ESCOLHA + intervenção (3.2).** Motivo: card próprio (o "interagir").
- **O resumo de 20s (3.3).** Motivo: card próprio (quem perdeu ao vivo).
- **Server / API / stream.** Motivo: zero mudança de servidor — o cliente consome o `/v1/band` que já existe. Nenhum websocket/SSE/rota nova.
- **Persistir o "já assisti" entre reinícios do cliente.** Motivo: dedup **em memória por sessão** basta na fatia 2 (reabrir re-toca — aceitável); persistência = refinamento.
- **Sincronização real entre amigos.** Motivo: sai de graça do determinismo (mesmo `published_round`).

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `client/band-wpf/Api/BandState.cs` | modificar | record `BandGoal` + `BandMatch.goals?` (espelho do contrato SPEC-043) |
| `client/band-wpf/State/MatchReplay.cs` | criar | o motor de replay (DispatcherTimer, 90' comprimidos em ~3–5 min; placar corrente + flash) |
| `client/band-wpf/View/BandViewModel.cs` | modificar | estado de replay + auto-play 1× (dedup por rodada) + re-assistir |
| `client/band-wpf/MainWindow.xaml` (+`.cs`) | modificar | a UI do replay (relógio + placar que sobe + flash `isMine`) + o gesto de re-assistir |
| `client/band-wpf/config.json` | modificar | `replayWatchSeconds` (default 240) |
| `client/band-wpf/README.md` | modificar | o roteiro do smoke do replay |
| `specs/SPEC-044-…`, `specs/DONE-044-…` | criar | esta SPEC + o DONE |

**Intocado (o critério DURO):** `packages/world-engine` + os 5 goldens + **todo `services/*`** (`git diff` = 0 — a fatia é 100% cliente). **SEM MIGRATION.**

---

## Mudanças de schema (se aplicável)

**Nenhuma mudança de schema nesta feature.** A fatia é 100% cliente; consome o `todayMatch.goals` já entregue pela SPEC-043. Sem migration.

---

## Mudanças de API (se aplicável)

**Nenhuma mudança de API nesta feature.** O cliente é consumidor puro do `GET /v1/band` (o campo `todayMatch.goals` já existe desde a SPEC-043). Não cria nem modifica endpoint.

---

## Critérios de aceitação

**Cenário 1 — Compila + espelha o contrato (automatizável)**
- Dado o SDK .NET 8
- Quando `dotnet build client/band-wpf`
- Então 0 avisos/erros; `BandState.cs` tem `BandGoal`/`BandMatch.goals?` (tolerante a null/ausente).

**Cenário 2 — Auto-play 1× na janela das 15h (smoke)**
- Dado a faixa aberta e uma partida do dia que liquida (com gols)
- Quando o poll traz o `todayMatch` liquidado + `goals`
- Então o replay dispara **uma vez**; polls seguintes (mesma rodada) NÃO re-disparam (dedup por `seasonId+round`).

**Cenário 3 — O replay sobe o placar minuto-a-minuto (smoke)**
- Dado a timeline `goals` (ex.: 23' meu, 71' deles)
- Quando o replay roda (~3–5 min)
- Então o relógio corre 0'→90'; o placar **sobe** nos minutos dos gols; o gol `isMine` é destacado; ao fim, o placar == `goalsFor`/`goalsAgainst`; um 0-0 corre o relógio até 90' sem gol.

**Cenário 4 — Re-assistir (smoke)**
- Dado uma partida já assistida
- Quando o jogador aciona o re-assistir
- Então o replay reinicia do 0' (ignora o dedup).

**Cenário 5 — Orçamento durante o replay (smoke medido, método no README)**
- Dado o replay rodando (~4 min)
- Quando medir CPU/RAM (process-tree)
- Então CPU média `<1%` da máquina E RAM `<150MB` (o tick é coarse, animação no render thread).

**Cenário 6 — Degradação (smoke)**
- Dado um `todayMatch` sem `goals` (pré-jogo / não liquidado / cliente antigo)
- Quando renderiza
- Então nenhum replay dispara, sem crash (o campo ausente/null é tolerado).

**Cenário 7 — O selo (o critério DURO, automatizável)**
- Dado a fatia (100% cliente)
- Quando rodar os gates
- Então `packages/world-engine` + os 5 goldens + `services/*` byte-idênticos (`git diff`=0); `npm run lint/typecheck/build/test` verdes; `client/` fora do prettier/eslint; sem migration.

---

## Segurança (se aplicável)

- **Sem nova superfície:** zero rota/endpoint novo; o cliente só LÊ o `/v1/band` (autorização por construção herdada da SPEC-038; o `athleteId` vem da sessão).
- **OP-17 (thin renderer):** o replay é apresentação — não recomputa placar nem fabrica gols; reproduz a timeline que o servidor computou. A soma corrente sempre converge ao `goalsFor`/`goalsAgainst` autoritativo.
- **Orçamento:** o tick do replay é coarse e só roda durante a watch; fora dela, sem timer.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Dep SPEC-043 não mergeada** (PR #46) — a branch está empilhada | Alta | Escrever a SPEC agora (plano); implementar/mergear após a #46 (rebase sobre `main`) |
| Orçamento durante o replay (tick + animação) | Média | Tick coarse (~1–2/s), animação no render thread (opacidade/Translate), nunca layout por frame; MEDIR (o smoke é o gate) |
| Dedup do auto-play fraco → re-toca a cada poll (irritante) | Média | Chave estável `seasonId+round`; guardar em memória; testar 2 polls seguidos = 1 replay |
| "Ao vivo" mal-interpretado → tentar stream/poll rápido | Baixa | Timeline baixada 1× + replay local; zero rota nova (o determinismo cobre "amigos assistem") |
| Cliente C# fora da CI | Alta | Smoke manual medido (precedente dos spikes + SPEC-042) |

**Dependências:** SPEC-043 (`todayMatch.goals`, PR #46) · SPEC-042 (o cliente WPF + o poller + o ViewModel), em `main`. **Precede:** as fatias de arte (câmera/cenas) e o card ④ (artilheiro/nota, que enriquece o replay).

---

## Notas de implementação

- **O relógio do replay:** `matchMinute = round(90 * elapsedReal / replayWatchSeconds)`, clampado a [0,90]; o placar corrente = a contagem de `goals` com `minute <= matchMinute` (por lado). O flash dispara quando um gol novo entra na contagem.
- **Auto-play sem feed:** o replay não é "ao vivo do servidor" — é local. Dispara quando o `todayMatch` liquidado com `goals` aparece pela 1ª vez (dedup). Do jogador, parece ao vivo na janela das 15h.
- **Tolerância:** `goals` ausente/null (cliente antigo, pré-jogo) → sem replay (o `System.Text.Json` já ignora desconhecidos; o record é nullable).
- **Orçamento:** o `DispatcherTimer` só existe durante a watch; anima `Opacity`/`TranslateTransform` (render thread), nunca `Canvas.Left`/layout.
- **⚠️ Ritual do board:** aprovação da SPEC no card; `set_done` antes do PR. **Implementação e merge após a #46 (SPEC-043) em `main`.**
- **⚠️ CI:** o DONE precisa de `## Resumo do que foi feito` · `## Arquivos modificados` · `## Critérios de aceitação` · `## AI declaration`; `client/` fora do prettier/eslint (já garantido na SPEC-042).

---

## Checklist de aprovação

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (replay estrutural; arte/nota/artilheiro/3.2/3.3 FORA)
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas (Nenhuma — sem migration)
- [ ] Mudanças de API estão documentadas (Nenhuma — consumidor puro)
- [ ] Critérios de aceitação são testáveis (7; `dotnet build` + smoke medido + selo)
- [ ] Riscos e superfície de segurança foram avaliados (dep SPEC-043; orçamento no replay)
- [ ] Appetite é razoável para o escopo definido (3-4 dias)
- [ ] Não há conflito com SPECs abertas em paralelo (empilhada sobre a SPEC-043)

---

*SPEC-044 — método H1VE. A fatia 2 de "Dia de jogo ao vivo": o cliente WPF baixa a timeline (SPEC-043) e a REPRODUZ ~3–5 min ao vivo na faixa — o placar subindo minuto-a-minuto, o gol `isMine` destacado. Render estrutural, zero stream, `<1% CPU`. 100% cliente: `services/*`, engine e os 5 goldens INTOCADOS. SEM MIGRATION.*
