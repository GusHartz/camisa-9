# AGENTS.md — camisa-9

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

> Leia este AGENTS.md COMPLETO antes de iniciar qualquer sessão de desenvolvimento.
> Atualize a seção "Estado atual" ao final de qualquer sessão.

### Antes de qualquer sessão
1. **Ler este AGENTS.md completo** — sem exceção.
2. **Ler `memory/MEMORY.md`** — a memória durável do projeto (decisões, gotchas, invariantes acumulados). Se ela contradiz o que você ia fazer, **ela vence** — trate como âncora.
3. **Ler o BOARD VIVO** — rode `h1ve status` (a feature da sua branch atual) e `h1ve start` (os cards iniciáveis do backlog), ou use as tools MCP `get_current_feature`/`start_feature`. **O board é a fonte da verdade do QUE construir** — as colunas `dev → pr → qa_data → main` com os cards que o time move. O `docs/roadmap.md` é **direção de longo prazo, NÃO a fila de trabalho**: nunca escolha a próxima feature a partir do roadmap. **Sem acesso ao board** (CLI não logado / MCP não conectado): **PARE e peça ao usuário para conectar** (`h1ve login` + `claude mcp add h1ve …`) — **jamais invente o backlog** a partir do roadmap ou de qualquer doc local.
4. Verificar se existe **SPEC aprovada** para a feature (o card em `spec`/`dev`); se não, criar `specs/SPEC-NNN-slug.md`, **publicá-la no card** (`h1ve spec --from specs/SPEC-NNN-slug.md`, ou a tool MCP `set_spec`) e obter a aprovação **no próprio card** antes de escrever código.
5. `git fetch origin && git rebase origin/main`
6. Confirmar que está na branch correta (`feat/{owner}/{feature-slug}`).

### Ao final de qualquer sessão
1. Criar `specs/DONE-NNN-slug.md` (mesmo número da SPEC) e **publicá-lo no card** (`h1ve done --doc specs/DONE-NNN-slug.md`, ou a tool MCP `set_done`) — obrigatório antes do PR.
2. Atualizar a seção **"Estado atual"** deste AGENTS.md.
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

*AGENTS.md gerado pelo Nexus Flow (H1VE) na fundação do projeto. Documento vivo — leia antes, atualize depois.*
