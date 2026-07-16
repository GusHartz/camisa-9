# CLAUDE.md — camisa-9

## O que é este projeto

**camisa-9** (nome de fundação: Nexus Flow / H1VE) é um jogo de carreira de futebol de **baixa atenção** que roda numa faixa discreta acima da taskbar, enquanto o usuário trabalha no desktop.

**A visão em uma frase:** você vive a carreira de UM jogador de futebol — da várzea às lendas — numa faixa acima da taskbar, no mesmo time dos seus amigos, num mundo persistente que joga **TODO DIA às 15h (Brasília)** com ou sem você.

**O problema.** Quem passa 6–10h/dia no computador e ama futebol só consome o esporte de forma passiva no expediente (placar, zoeira no grupo, portal). Jogos de futebol exigem atenção integral (Football Manager, tela cheia) ou vivem no celular com monetização odiada (ads). Existe uma lacuna verificada: o gênero de *desktop ambiente* (Rusty's Retirement, TBH) é demanda massiva, mas 100% solitário — sem servidor, sem eventos, sem esporte. A interseção **ambiente + futebol + social síncrono está vaga**.

**Quatro pilares da tese:**
- **Presença ambiente** — o jogo trabalha *junto* com o expediente, nunca contra. Promessa pública: **<1% CPU, zero anti-cheat no cliente**.
- **Cooperação, não gestão** — você **é** o atleta; seus amigos estão no **mesmo** time. O clube é palco (NPC), não propriedade.
- **Ritual coletivo sincronizado** — jogo diário (7/7) às 15h Brasília (liga de 20, 38 rodadas ≈ 6 semanas), redirecionando o pull de "conferir o placar".
- **Mundo vivo com história permanente** — nasce 100% NPC; cada humano substitui um NPC (escassez via waiting list); carreiras terminam e viram lendas permanentes.

**North star:** times com **≥3 humanos presentes** no jogo das 15h.
**Guardrails:** D30 ≥30% · presença ao vivo ≥50% dos ativos · conversão T1→paga ≥8% · uptime de rodada 100%.

**Usuários:**
- **Primário** — Torcedor de desktop BR (25–45, trabalha em computador, ex-Cartola, sem tempo para FM). Quer viver futebol sem culpa nem custo de atenção.
- **Secundário** — O quinteto (grupos de 5 amigos). Time próprio, camisa própria, subir juntos; entrada por quinteto fura a fila da waiting list.
- **Terciário** — Público global do gênero (fase EN, Steam).
- **Quaternário** — O amigo convidado (curiosidade → vaga com a camisa dele; loop de convite).

**Anti-usuários (rejeição deliberada):** quem quer controlar as partidas (FIFA/eFootball); o hardcore de gestão min-max (FM já o serve); o apostador — **NUNCA** qualquer ponte com betting.

**O que NÃO é:** não é fantasy de jogadores reais (mundo 100% fictício), não é aposta, não é produtividade. Nomes de clubes/jogadores/ligas são fictícios inclusive no marketing.

## Stack

**Motor do mundo (servidor) — o coração / money path:**
- **Linguagem/runtime:** TypeScript (Node.js).
- **Persistência:** Postgres (Neon), serverless, branch por ambiente.
- **Orquestração da rodada:** job agendado diário (uma rodada/dia às 15h Brasília) que processa todas as ligas; idempotente, protegido por lock e chave de idempotência (retry seguro).
- **Determinismo por seed:** simulação reproduzível a partir de seed + estado; auditável, testável por propriedade, replay verificável.
- **Atomicidade:** resultado publicado em transação única. **Nunca** rodada meio-publicada — a linha do tempo do mundo é all-or-nothing.
- **Protocolo de falha:** adiar com transparência > publicar errado.

**Separação de responsabilidades (padrão H1VE):**
- **Regra de negócio** (simulação, economia, química, licenciamento) → libs puras, sem I/O, testáveis isoladamente (ex.: `lib/world-engine`).
- **Orquestração** (transações, publicação atômica, jobs) → camada de rotas/workers.
- **UI** (cliente Windows) → apresenta estado; **zero regra de negócio, zero anti-fraude**.

**Cliente Windows:**
- ⚠️ **Decisão de stack pendente no F0**, governada pela promessa **<1% CPU**. Candidatos: nativo (C#/WinUI3 ou similar) vs. web-wrapper ultraleve. **Electron descartado** (trai a promessa de CPU — lição do TBH).
- **Forma padrão:** janela sem borda, always-on-bottom.
- **Widget na taskbar:** spike de risco alto (APIs não-oficiais). **Plano B aceito:** modo compacto da própria faixa. Nunca no caminho crítico.
- **Notificações:** toasts nativos WinRT com botões de ação.

**Distribuição & contas:**
- **Canais:** Steam (descoberta + Next Fest/Idler Fest) + instalador próprio com autoupdate.
- **Preço:** R$ 49,90 / $9.99 vitalício, liberado pós-T1 (⚠️ calibrar preço regional Steam BR).
- **Auth:** e-mail + Steam auth. Conta **obrigatória** (o atleta vive no servidor). Coleta mínima.

**Anti-fraude:** 100% server-side (janela de pres

---

> **⚠️ AGENTE DE IA — LEIA ISTO PRIMEIRO.** Este é o arquivo de contexto e método deste projeto (padrão
> H1VE). Leia-o por **COMPLETO** e **SIGA todas as regras abaixo em TODA sessão de desenvolvimento** —
> não é opcional. Vale para **qualquer** agente de IA que trabalhe neste repositório (Claude Code,
> Cursor, Copilot, Codex, etc.). Se você é um agente, trate as regras abaixo como restrições rígidas.

> **📓 Memória do projeto — leia também `memory/MEMORY.md`.** É a memória DURÁVEL do projeto (decisões,
> gotchas, invariantes) capturada **automaticamente** pelo H1VE a partir do histórico. Carregue-a no início
> de toda sessão, junto deste arquivo. **É gerada — NÃO edite à mão** (é sobrescrita a cada atualização;
> correções vão na SPEC ou no código, nunca nela). Se ela ainda não existe, o projeto simplesmente não
> acumulou fatos duráveis ainda.

## Ritual obrigatório de desenvolvimento

> Leia este CLAUDE.md COMPLETO antes de iniciar qualquer sessão de desenvolvimento.
> Atualize a seção "Estado atual" ao final de qualquer sessão.

### Antes de qualquer sessão
1. **Ler este CLAUDE.md completo** — sem exceção.
2. **Ler `memory/MEMORY.md`** — a memória durável do projeto (decisões, gotchas, invariantes acumulados). Se ela contradiz o que você ia fazer, **ela vence** — trate como âncora.
3. **Ler o BOARD VIVO** — rode `h1ve status` (a feature da sua branch atual) e `h1ve start` (os cards iniciáveis do backlog), ou use as tools MCP `get_current_feature`/`start_feature`. **O board é a fonte da verdade do QUE construir** — as colunas `dev → pr → qa_data → main` com os cards que o time move. O `docs/roadmap.md` é **direção de longo prazo, NÃO a fila de trabalho**: nunca escolha a próxima feature a partir do roadmap. **Sem acesso ao board** (CLI não logado / MCP não conectado): **PARE e peça ao usuário para conectar** (`h1ve login` + `claude mcp add h1ve …`) — **jamais invente o backlog** a partir do roadmap ou de qualquer doc local.
4. Verificar se existe **SPEC aprovada** para a feature (o card em `spec`/`dev`); se não, criar `specs/SPEC-NNN-slug.md`, **publicá-la no card** (`h1ve spec --from specs/SPEC-NNN-slug.md`, ou a tool MCP `set_spec`) e obter a aprovação **no próprio card** antes de escrever código.
5. `git fetch origin && git rebase origin/main`
6. Confirmar que está na branch correta (`feat/{owner}/{feature-slug}`).

### Ao final de qualquer sessão
1. Criar `specs/DONE-NNN-slug.md` (mesmo número da SPEC) e **publicá-lo no card** (`h1ve done --doc specs/DONE-NNN-slug.md`, ou a tool MCP `set_done`) — obrigatório antes do PR.
2. Atualizar a seção **"Estado atual"** deste CLAUDE.md.
3. Atualizar o status no `docs/roadmap.md`.
4. Abrir PR com a AI declaration preenchida.

### Durante a sessão — auto-checagem de drift

> A cada bloco de trabalho, compare o que você está fazendo com a **SPEC aprovada**, as **OPs** e a **memória do projeto** (`memory/MEMORY.md`).

Se perceber que **divergiu** — está construindo algo diferente do que a SPEC descreve, o escopo cresceu além do combinado, uma OP está sendo violada, ou você está contradizendo uma decisão já registrada na memória — **PARE e sinalize ao usuário ANTES de continuar**. Diga: (1) o que você ia fazer, (2) contra qual âncora isso conflita (a SPEC-NNN, a OP-XX ou uma decisão em `memory/MEMORY.md`), e (3) as duas saídas: **atualizar a âncora** (revisar a SPEC/roadmap, se a mudança é intencional) ou **corrigir o rumo** (voltar ao escopo). Nunca "sigo em frente e conserto depois" — o alinhamento se resolve na hora, com o usuário.

## Padrão SPEC → DONE

```
specs/SPEC-{NNN}-{slug}.md   ← antes do desenvolvimento
specs/DONE-{NNN}-{slug}.md   ← depois do desenvolvimento
```
Nenhum PR é válido sem a SPEC aprovada e o DONE correspondente.

> **Publique o artefato NO CARD — não só no repositório.** O H1VE lê a SPEC e o DONE **do card** (é lá que ficam os gates de fluxo e a aprovação). Depois de escrever o arquivo, publique-o: `h1ve spec --from specs/SPEC-NNN-slug.md` (SPEC) e `h1ve done --doc specs/DONE-NNN-slug.md` (DONE) — ou as tools MCP `set_spec`/`set_done`. Escrever apenas o arquivo do repositório **não** faz o artefato chegar ao card nem move o fluxo.

## Regras inegociáveis (OPs)

- **OP-01** Nunca alterar o schema sem criar migration.
- **OP-02** Nunca commitar segredos (`.env`, tokens, chaves).
- **OP-08** Handlers de webhook validam a assinatura antes de processar qualquer payload.
- **OP-09** Toda rota valida **autenticação primeiro, autorização segundo, input terceiro** — nesta ordem.
- **OP-11** Respostas de erro nunca expõem stack trace, SQL ou detalhes internos — só mensagem genérica + código.
- **OP-12** Nenhum segredo hardcoded — variáveis de ambiente, server-only.
- **OP-14** Sem `any` no TypeScript.
- **OP-15** Nenhuma função com mais de 50 linhas.
- **OP-16** Nenhum arquivo com mais de 300 linhas.
- **OP-17** Nenhuma lógica de negócio dentro de componentes de UI.
- **OP-20** Merge em `main` é exclusividade do arquiteto.

## Roles

| Role | Resumo de capacidade |
|---|---|
| `founder` | Visão completa; gestão de conta/projeto/usuários; input de saúde |
| `architect` | Aprovar specs e DONEs, review final, merge em `main` |
| `dev` | Suas features; mover `dev → pr`; AI declaration; blockers |
| `qa` | Features em `qa_data`; sign-off funcional |
| `data` | Features em `qa_data`; sign-off de integridade de dados |

## Gates de qualidade

- CI verde obrigatório antes do merge.
- **Duplo sign-off QA + Data** antes de uma feature sair de `qa_data`.
- O arquiteto faz o squash merge em `main`.

---

## Estado atual

> Atualizado ao final de cada sessão. Última atualização: **2026-07-16** (SPEC-011).

**Nome oficial: NEXT GOAT — Taskbar Football** (decidido 15/07; codinome interno `camisa-9` mantido; mascote = bode coroado, camisa 10). **Fase:** F0 — **fundação técnica completa** (money path provado na SPEC-002 + os 3 de-risks de cliente fechados + docs de fundação sincronizados: v1.4/Steam-only/R13/R14/identidade + **R4 FINAL**). **R4 FINAL (design doc v2.0):** o mundo joga **TODO DIA às 15h Brasília** (jogo diário 7/7; liga de 20; 38 rodadas ≈ 6 semanas), com o **Dia do Jogador** (batida diária: manhã treino+foco+jornal · 12h escalação · 15h jogo · 18h decisões · noite notas), **duas barras persistentes (Forma e Moral)** — fôlego diário cortado, stamina só dentro da partida — e **elenco de 16** (11+5). **Fase 1 (motor do mundo) iniciada:** SPEC-009 (pirâmide + elenco NPC) **concluída e mergeada** (PR #12). Próxima frente: **ajuste de tunáveis (elenco 16 — spec de código curta) + camada de dados (0.2) + spec de rodadas diárias (1.2)** e **Trilha GTM (arte/identidade)**.

**Concluído:**
- **SPEC-001 — Bootstrap de repositório + CI** (roadmap 0.1): monorepo TypeScript (npm workspaces) com os 4 gates verdes — `lint`, `typecheck`, `test`, `build`. OPs no lint (OP-14/15/16) + guardrail de determinismo. *(Mergeado em `main` — PR #1.)*
- **SPEC-002 — Spike do motor do mundo** (roadmap 0.1.5): lib pura `packages/world-engine` — PRNG por seed (uint32, sem transcendentais), partida "chances × conversão", tabela turno-returno completo (90 partidas), classificação, runner de temporada com sub-seed por partida `(seed, liga, temporada, rodada, ids)`, store transacional + publicador atômico (all-or-nothing + idempotência sob lock), âncora de fuso 15h Brasília sem `Date`/`Intl` (offset fixo UTC-3). Golden vectors cross-ambiente. 48 testes. Review adversarial de 5 dimensões (5 defeitos corrigidos, incl. 1 major: seam de pré-commit async). **R1: GO** (~1 ms/temporada). *(Mergeado em `main` — PR #2.)*
- **SPEC-003 — Spike faixa always-on-bottom** (de-risking do **cliente** no F0; alimenta a Ratificação de stack #1): **candidato A (C#/WPF) validado no Windows 11** (Ryzen 5 5600X) — antes rodava no macOS sem compilar. **Orçamento: PASS com folga** — CPU média **0,249%** (<1%), RAM **~87 MB** (<150 MB), sem leak no proxy de 3 min; era o **risco central** → **GO**. Always-on-bottom, não-rouba-foco, fora de taskbar/Alt-Tab, multi-monitor: **PASS**. **1 bug corrigido:** `ClipToBounds` no `<Window>` crashava o startup (único diff de código). **1 gap deferido:** Win+D (mostrar desktop) esconde a faixa no Win11 via DWM cloaking → exige parenting à WorkerW (tarefa do cliente real). **Footprint:** 161 MB self-contained (WPF sem trim) — insumo da #1. **Candidato B (Rust) não implementado** (A passou → sem kill; B vira dado de footprint da #1). `RESULTS.md` + `DONE-003` preenchidos; gates TS verdes (spike fora de `packages/*`). **Pendências:** soak de 8 h; decisão sobre o Win+D. *(A #1 — WPF vs. Rust — foi **ratificada na SPEC-004**: WPF.)* **(Mergeado em `main` — PR #3.)**
- **SPEC-004 — Ratificação de stack do cliente** (a "#1"): **stack do cliente ratificada = `C#/WPF` (.NET LTS)**, na evidência medida da SPEC-003 (CPU **0,249%** / RAM **~87 MB**, ambos com folga; único con = footprint **161 MB**, aceito e **reversível** — cliente é *thin renderer*, OP-17). Decisão registrada em **`docs/adr/ADR-001`** (primeiro ADR do projeto) + os itens `⚠️` de stack do **SDD** (§1 "Cliente Windows" + **D5**) flipados para **ratificado**, apontando ao ADR. Adota formalmente os orçamentos `<1% CPU` e `<150 MB RAM` (process tree) e registra requisitos antes silentes (**code-signing** + modelo de payload de autoupdate). Fundamentado por fan-out de pesquisa (WPF/Rust/Tauri/WinUI3) + **verificado adversarialmente** (7/7 critérios PASS; 1 erro factual .NET 8/10 corrigido). Desbloqueia os spikes de cliente (#3 toasts, #4 taskbar) e a futura SPEC de distribuição. `DONE-004` preenchido; gates TS verdes (docs-only). *(Escolha de escopo: ratificar na evidência + literatura — sem re-spike; probes medidos de Rust/Tauri ficam como gatilho de revisão.)* **(Mergeado em `main` — PR #7.)**
- **SPEC-005 — Spike toasts acionáveis** (#3 — nível 3 da presença; assenta sobre WPF/ADR-001): toast WinRT nativo com **2 botões**, app WPF/.NET 8 **unpackaged** (zero workload/MSIX), validado no Windows 11 (Ryzen 5 5600X, non-elevated) — **GO**. **Prova central (cold-start):** com o app **morto**, cada clique cold-startou um processo **novo** (PIDs 13708/19784/**5812**) **headless**, POST ao stub, `ack:true` — sustentado só pelo auto-registro AUMID+COM do `ToastNotificationManagerCompat` (sem atalho/instalador). Warm sem roubar foco; decisão correta gravada (`play`/`rest`). Orçamento **PASS** (CPU idle **0,095%**, RAM pico 99 MB); footprint **185,3 MB** self-contained / 25,7 MB framework-dep. **6 achados** (2 major): **fix aplicado** = `ToastScenario.Reminder` (senão os botões somem na Central e o cold-click perde a decisão); **brecha** = `SHQueryUserNotificationState` no Win11 não cobre borderless-fullscreen nem DND-manual → precisa de **heurística suplementar**. `RESULTS.md` + `DONE-005` preenchidos; gates TS verdes (spike fora de `packages/*`). **Pendências:** heurística de silêncio, soak longo (RAM drift +9,8 MB/60s), spot-check positivo D3D/PowerPoint. **Kill-criteria não acionado.** **(Mergeado em `main` — PR #8.)**
- **SPEC-006 — Spike widget na taskbar** (#4 — nível 2 da presença, a "mini na taskbar"; assenta sobre WPF/ADR-001): **achado de pesquisa** — render **dentro** da shell da taskbar do Win11 é **inviável** (deskband removido; hacks por injeção/reparent quebram + AV, colidem com "zero anti-cheat"; Widgets oficiais = MSIX/flyout Win+W) → o spike **reformula o #4 como faixa compacta ANCORADA** (o Plano B que o CLAUDE.md já aceita, **aprovado no card** antes do código) e compara **2 posturas**: **A — topmost flutuante** vs **B — AppBar** (`SHAppBarMessage` reserva a borda). **Veredito: GO-com-ressalvas → A padrão, B opcional.** Ambas ancoram **sem injeção/MSIX** e **dentro de <1% CPU** (A **0,186%** / B **0,189%** média-máquina; RAM pico **78,5/79,7 MB**; reposiciona por **evento** via `SetWinEventHook`, não polling); footprint **159,8 MB** sc / **0,2 MB** fd. Revisão adversarial **15→6** corrigidos. **2 achados ao vivo:** **(L1)** a reserva de work-area do AppBar assenta com **latência** no Win11 26200 (~15–30s; liberação por `ABM_REMOVE` idem) — funciona, **sem leak** na saída graciosa, mas enfraquece a vantagem única de B (pró-A); **(L2)** `CloseMainWindow()` é **no-op** numa janela `WS_EX_TOOLWINDOW` → fecha por `WM_CLOSE` direto ao HWND. `RESULTS.md` + `DONE-006` preenchidos; gates TS verdes (spike fora de `packages/*`). **Pendências:** multi-monitor; auto-hide/tela-cheia/Win+D **ao vivo** (mecanismos presentes, não estressados); Win+D/WorkerW (herdado da SPEC-003); soak longo; DPI≠100%. **Kill-criteria não acionado.** **(Mergeado em `main` — PR #9.)**
- **SPEC-007 — Docs de fundação (v1.4 + Steam-only + SPEC-006):** sincroniza os 4 docs de fundação (16 patches, docs-only): naming dos títulos → *Camisa 9 (codinome · método H1VE)*; **v1.4** (treino com banking, batida semanal, salário & estilo de vida); **Steam-only** (canal único de lançamento, F2P + compra *Carreira*, instalador próprio deferido com gatilho); modo mini = **faixa compacta ancorada** (SPEC-006); **Trilha GTM** + monetização/moderação/telemetria no roadmap; corte do beta ratificado (P6). ADR-001/código/CI inalterados. **(Mergeado em `main` — PR #10.)**
- **SPEC-008 — Docs de fundação: R13 (Pirâmide Elástica) + R14 (código de time):** aplica os adendos (patches A1-A6) aos 4 docs + sincroniza este *Estado atual*. **R13 — Pirâmide Elástica:** o mundo cresce por ramificação 2× por nível; expansão a **~70% de ocupação humana** da base **só na virada de temporada** (**revoga o gatilho “pool 100% humano”**); gradiente ancora na altitude percentual; motor de temporada ciente de grupos paralelos. **R14 — Cadastro solo/team:** bifurcação **solo** (vaga NPC) / **team** (código de time — amigos entram direto no elenco escolhendo posição); jogável desde o humano nº 1 (11 fecha as vagas, não o jogo); NPC fixo por posição; **absorve o takeover de quinteto** (puxado da F2 para a F1/beta). Docs-only; ADR-001/código/CI inalterados. **(Mergeado em `main` — PR #11.)**
- **SPEC-009 — Pirâmide completa do mundo** (cobre 1.2 multi-divisão + 1.3 ciclo de vida NPC + 1.4 transferências placeholder): a lib pura `packages/world-engine` cresceu de 1 liga/10 clubes escalares para uma **pirâmide de 4 divisões × 20 clubes com elenco NPC** (20 atletas: idade+habilidade+posição) que **roda 1 temporada inteira e faz a viragem** sozinha — promoção/rebaixamento **3↑3↓ por fronteira**, envelhecimento, aposentadoria (≥35), 12 transferências placeholder (intra-liga, mesma posição) e reposição de base **posicional** (jovens 17). **Determinístico por seed**, sem tocar `simulateSeason`/`resolveMatch`/`season.golden.json` (força de clube virou **derivada** = média das 11 melhores; faixas por tier **sobrepostas**). Fundações de specs futuras já plantadas (exigências do founder): `WorldState` modela **tier→[leagues]** (R13); `WorldClub` nasce com **archetype+weights sorteados por seed** na criação (não desloca o stream do PRNG da 1.4). Golden de ciclo = **11 hashes** (semeado + 10 viragens) cross-ambiente; `turnoverReport` por DIFF puro (auditoria 1.5). Ordem canônica da viragem = a da SPEC. **89 testes** (48 golden da SPEC-002 preservados + 41 novos), typecheck/build/**ESLint** verdes (OP-14/15/16 + guardrail de determinismo). **Review adversarial** (workflow 5 dimensões + verificação de cada achado): 7 achados → 2 corrigidos (incl. **drift de ordem da viragem pego e reconciliado** com a SPEC) + 2 guardas de hardening. *(Nota R4 final: o `rosterSize` 20 desta SPEC será ajustado para **16** — 11+5 — em spec de código futura; SPEC-009 fica com 20 até lá.)* **(Mergeado em `main` — PR #12.)**
- **SPEC-010 — Docs de fundação: R13 + R14 + identidade Next Goat:** aplica o **ADENDO 3** (patches A7-A9, docs-only) — **identidade oficial NEXT GOAT — Taskbar Football** (bode coroado camisa 10; codinome interno mantido) no *vision-scope*; **lei de arte** (dois níveis de pixel art: JOGO canônico / KEY ART derivada, **D11**) + **inteligência do mundo por heurística + personalidade + seed** (**D12**) no *SDD*; **inteligência de mercado NPC** (heurística ranqueada + arquétipo/pesos por seed na criação, determinístico) na cap. 1 da *functional-spec*; consistência do nome (roadmap G.1/G.2). Sincroniza este *Estado atual*. *(A1-A6 já estavam em `main` via SPEC-008 — SPEC-010 entrega só o ADENDO 3.)* **(Mergeado em `main` — PR #13.)**
- **SPEC-011 — Docs de fundação: identidade Next Goat + R4 final (diário) + Dia do Jogador:** aplica o **ADENDO 4 + Complemento** (patches A10-A12, docs-only) — **R4 FINAL: jogo diário (7/7) às 15h Brasília, liga de 20, 38 rodadas ≈ 6 semanas** (inverte o antigo pilar "3 jogos/semana ter/qui/sáb"); **Dia do Jogador** (batida diária comprimida; treino com **FOCO** Físico/Técnico/Tático/Mental + rendimento decrescente); **duas barras persistentes (Forma e Moral)** + **fôlego diário cortado** + **stamina só dentro da partida** (drena por físico; guia as substituições do técnico NPC, até 5/jogo); **elenco de 16** (11 titulares + 5 reservas — R14: 11 = primeiro onze, 16 = elenco completo); pendência do **encaixe da Copa** no calendário diário; **gate de cadência** (telemetria de presença por dia da semana no beta). **Registra** o ajuste de tunáveis **`rosterSize` 20→16 como spec de código futura** (não implementado aqui). Toca vision-scope/functional-spec/roadmap + consistência de cadência em sdd + charter do CLAUDE.md. *(A1-A9 já em `main` via SPEC-008 #11 / SPEC-010 #13 — SPEC-011 entrega só o ADENDO 4.)* **(PR pendente.)**

**Convenções cravadas (ver `README.md`):**
- Layout: libs de domínio puras sob `packages/*` (docs falam `lib/world-engine` ⇒ `packages/world-engine`); borda impura só em `harness/`.
- Camadas (OP-17): libs puras = toda a lógica · orquestração fina · cliente só renderiza.
- Determinismo (money path): sem `Math.random`/`Date.now`/`new Date()`/`Intl`/transcendentais/relógio/entropia em `packages/*/src` (lint + golden cross-ambiente).
- i18n: sem texto de UI hardcoded; libs puras sem strings localizáveis.
- Runtime: Node ≥ 20.19.

**Próximo:** com o F0 técnico fechado, a SPEC-009 mergeada e os docs de fundação sincronizados com o **R4 FINAL (jogo diário)**, as frentes destravam — escolher no **board vivo** (`h1ve start`; o board é a fila, **não** o roadmap, ritual SPEC-176): **(1) ajuste de tunáveis** (elenco 16 — `rosterSize` 20→16 no `world-engine`, spec de código curta que decorre do R4 final); **(2) Fase 0.2 — camada de dados + seed do mundo** (persistir o `WorldState` que a SPEC-009 provou em memória, já ciente da **Pirâmide Elástica** / grupos paralelos); **(3) spec de rodadas diárias (1.2)** com o encaixe da Copa; **(4) Trilha GTM — G.1 briefing de identidade visual** (destrava o relógio da wishlist na Steam). Depois, a trilha server-first: 0.3 RNG/auditoria → 0.4 segurança. *(A antiga “Landing waiting list” saiu de cena — o Steam-only substituiu a landing própria pela página Coming Soon na Steam, SPEC-007.)*

---

*CLAUDE.md gerado pelo Nexus Flow (H1VE) na fundação do projeto. Documento vivo — leia antes, atualize depois.*
