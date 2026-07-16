# Especificação Técnica (SDD) — Camisa 9 (codinome · método H1VE)

> ⚠️ Todas as decisões técnicas marcadas com ⚠️ estão **pendentes de ratificação pelo founder** no F0.

---

## 1. Stack / Fundação técnica

### Motor do mundo (servidor)
- **Linguagem/runtime:** TypeScript (Node.js). Stack já dominada pelo time.
- **Persistência:** Postgres (Neon). Serverless, branch por ambiente.
- **Orquestração da rodada:** job agendado 3×/semana que processa todas as ligas.
- **Determinismo por seed:** simulação reproduzível a partir de seed + estado. Auditável, testável por propriedade, replay verificável.
- **Atomicidade:** resultado publicado numa única transação. **Nunca** rodada meio-publicada — a linha do tempo do mundo é all-or-nothing.
- **Protocolo de falha:** adiar com transparência > publicar errado. Definido em SPEC dedicada antes de qualquer código do motor.

**Separação de responsabilidades (padrão H1VE):**
- **Regra de negócio** (simulação, economia, química, licenciamento) → libs puras, sem I/O, testáveis isoladamente.
- **Orquestração** (transações, publicação atômica, jobs) → camada de rotas/workers.
- **UI** (cliente Windows) → apresenta estado; **zero regra de negócio**, **zero anti-fraude**.

### Cliente Windows
- ✅ **Stack RATIFICADA no F0 — `C#/WPF` (.NET LTS)** como baseline do cliente. Ver **[ADR-001](../adr/ADR-001-stack-do-cliente-windows.md)** para critérios, evidência e alternativas. Ratificada na evidência medida da SPEC-003 (CPU **0,249%** / RAM **~87 MB** — passa `<1% CPU` e `<150 MB RAM` com folga); único con = footprint (**161 MB** self-contained), aceito e **reversível** (cliente = *thin renderer*, OP-17). **Electron descartado** (trai a promessa de CPU — lição do TBH).
- **Orçamentos ratificados:** `<1% CPU` (governante, gate de CI) e `<150 MB RAM` (medido contra o **process tree inteiro**).
- **Alternativas avaliadas (ver ADR-001):** Rust/Win32 (footprint vencedor, maior custo de dev → gatilho de revisão) · Tauri/WebView2 (CPU não de-riscada, mesmo motor do Electron) · WinUI3 (dominado por WPF). "Web-wrapper ultraleve" só conta se usar **WebView2 do sistema** **e** passar o gate `<1% CPU` sob build real medido.
- **Forma padrão:** janela sem borda, always-on-bottom (validada em WPF na SPEC-003; risco baixo).
- **Modo mini — RESOLVIDO (SPEC-006, GO-com-ressalvas):** render dentro da shell da taskbar é inviável no Win11 (deskband removido; hacks colidem com "zero anti-cheat"; Widgets = MSIX). Forma ratificada: **faixa compacta ANCORADA à taskbar, postura A (topmost)** — CPU 0,186%, RAM <80 MB, sem injeção/MSIX. Postura B (AppBar) como modo opcional (reserva de borda com latência de ~15-30s no Win11 — achado L1). Pendências herdadas: multi-monitor, auto-hide/tela-cheia/Win+D ao vivo, soak, DPI≠100%.
- **Gate items pós-ratificação (no build do cliente, não bloqueiam a ratificação):** soak de 8 h · check de hardware fraco · solução WorkerW/Win+D (Win+D via DWM cloaking).

### Notificações
- Toasts nativos WinRT com botões de ação — decisões respondidas sem abrir o jogo.

### Distribuição (rev. 15/07 — Steam-only)
- **Canal ÚNICO do lançamento: Steam** (descoberta do gênero + Next Fest/Idler Fest; confiança/SmartScreen resolvidos pela plataforma).
- **Monetização na Steam:** app Free-to-Play + compra única in-app/DLC "Carreira" (R$ 49,90 / $9.99) pós-T1; DLC cosmética como live-ops. ⚠️ Calibrar preço regional Steam BR.
- **Instalador próprio: DEFERIDO** (não descartado). Gatilho de reativação: certificado de code-signing OV via CNPJ (lead time de semanas; Azure Trusted Signing individual = US/CA apenas — gap BR registrado). Iniciar emissão SE/quando o canal próprio voltar ao plano.
- **Beta:** distribuído via **Steam Playtest** (founder aprova coortes).

### Contas & identidade
- **Auth:** e-mail + Steam auth. Conta **obrigatória** (o atleta vive no servidor).
- **Coleta:** mínima. Nada além do necessário para operar a conta e a rodada.

### Anti-fraude
- **100% server-side:** janela de presença, rate limiting, replay determinístico. **Nada no cliente** — o cliente é fonte não-confiável por definição.

### i18n
- Strings externalizadas desde a SPEC-001. PT primeiro; EN na F3.

---

## 2. Decisões-chave

| # | Decisão | Justificativa |
|---|---------|---------------|
| D1 | Simulação determinística por seed | Auditabilidade, reprodutibilidade e teste por propriedade — o money path é a rodada; determinismo é a única forma de provar correção. |
| D2 | Publicação atômica da rodada | Uma rodada meio-publicada corrompe o estado do mundo de todos os jogadores simultaneamente — falha catastrófica. |
| D3 | Adiar > publicar errado | Confiança no resultado > pontualidade. Protocolo de falha pública ("evento de reparação") preserva o vínculo. |
| D4 | Anti-fraude server-side puro | Cliente sob controle do usuário nunca é confiável. Toda validação de presença/rate/replay no servidor. |
| D5 | **Cliente `C#/WPF` (.NET LTS)** — ratificado ([ADR-001](../adr/ADR-001-stack-do-cliente-windows.md)) | Único candidato medido; passa `<1% CPU` (0,249%) e `<150 MB RAM` (~87 MB) com folga na SPEC-003. Con = footprint 161 MB, aceito e reversível (thin renderer). Electron descartado. |
| D6 | Modo mini = faixa compacta ancorada (postura A/topmost) — SPEC-006 | Dentro da shell é inviável; postura A é fiel ao ethos ("cede a tela ao trabalho"), mesmo custo de CPU e sem a reserva preguiçosa/leak-em-force-kill do AppBar. |
| D7 | i18n desde SPEC-001 | Retrofit de i18n é caro; externalizar cedo é barato. |
| D8 | Química social apenas na F2 | Compra tempo para desenhar anti-abuso antes de expor superfície de fraude. |
| D9 | Steam como canal único do lançamento (15/07) | Confiança/SmartScreen de graça; code-signing (gap BR) fora do caminho crítico; foco do founder solo. Instalador próprio deferido com gatilho. |
| D10 | Validação de demanda via trilho nativo | Página Coming Soon (wishlist = waiting list nativa + crédito algorítmico) + Discord (quintetos = a validação SOCIAL que a wishlist não mede) + Playtest (beta sem infra própria). |

---

## 3. Modelo de segurança

**Baseline H1VE — ordem obrigatória em toda rota/handler: autenticação → autorização → validação de input.**

### Autenticação
- E-mail + Steam auth. Sessões com tokens de curta duração + refresh; rotação no logout.
- [SUPOSIÇÃO — revisar] Tokens assinados (JWT ou sessão server-side em Postgres); refresh armazenado httpOnly.

### Autorização
- **Menor privilégio:** cada endpoint valida que o ator (conta) só age sobre seus próprios atletas/times.
- Ações administrativas (moderação, publicação de rodada) em papel separado, nunca acessível por conta de jogador.

### Validação de input
- Schema de validação (ex.: Zod) em toda borda de entrada. Nenhum payload de cliente confiado.
- Decisões vindas de toasts revalidadas server-side contra a janela de presença.

### Segredos
- **Nenhum segredo hardcoded.** DB URL, chaves Steam, tokens de assinatura → variáveis de ambiente / secret manager.
- Segredos do cliente Windows nunca contêm chaves privadas de servidor.

### Respostas de erro
- **Genéricas ao usuário** — sem stack trace, sem SQL, sem detalhe interno. Detalhe apenas em logs server-side.

### Anti-fraude (reforço)
- Janela de presença validada por relógio do servidor.
- Rate limiting por conta e por IP.
- Replay determinístico para auditar resultados contestados.
- [SUPOSIÇÃO — revisar] Detecção de multi-conta adiada para F2 junto com química; no beta, network confiável mitiga.

---

## 4. Gates de qualidade

### Fluxo padrão
`branch → PR → CI verde → squash merge`. **Founder gate em todo merge para `main` e todo release.**

### CI (gate automático)
- Lint + typecheck + testes unitários + testes de propriedade do motor.
- Build do cliente Windows + medição de CPU idle (falha se ≥1%).
- Checagem de segredos (nenhum secret no diff).
- [SUPOSIÇÃO — revisar] Migrations validadas contra branch Neon efêmero.

### Duplo sign-off (QA + Data)
- **QA:** valida comportamento, protocolo de falha da rodada, UX dos toasts, forma da faixa em contexto real.
- **Data:** valida integridade do estado do mundo, gates de métrica (presença ≥50%, D30 ≥30%, conversão ≥8%), reprodutibilidade da rodada por replay.
- **Nenhum merge sem ambos os sign-offs** em SPECs que tocam motor ou economia.

### Merge do arquiteto
- O merge final para `main` é feito **pelo arquiteto/founder**, nunca automático, após CI verde + duplo sign-off.

### Gates específicos
| Gate | Regra |
|------|-------|
| **Money path — a rodada** | Nenhuma SPEC que toque o motor entra sem testes de propriedade (determinismo, fuso, replay, falha parcial) **e** protocolo de falha pública definido. Rodada de sábado falhando com todos online = pior acidente possível. |
| **Arte** | Nenhum sprite/venue sem aprovação do founder em contexto real — screenshot da faixa a 110px sobre desktop de verdade. |
| **Economia** | Toda SPEC de monetização/quota checada contra as regras NUNCA (campo 05) antes do Claude Code: nada de stats compráveis, nada de ponte com apostas. |
| **Lançamento público** | Filtro de nomes + report funcionando. Moderação plena adiada no beta (decisão consciente — network confiável). |
| **Steam (externo)** | Review da loja + calendário de festivais planejado com folga. Nunca prometer data de rodada inaugural sem build aprovada. |

---

## 5. Testes & harness

### Testes de propriedade (motor — crítico)
- **Determinismo:** mesma seed + estado → mesmo resultado, sempre.
- **Fuso:** rodada consistente independente do fuso do processador (âncora 15h Brasília).
- **Replay:** resultado publicado reproduzível a partir do log.
- **Falha parcial:** interrupção no meio da rodada nunca deixa estado meio-publicado.

### Testes unitários
- Libs de regra de negócio (simulação, economia, licenciamento/blocklist de nomes) testadas isoladamente, sem I/O.

### Harness de rodada
- Runner que executa uma rodada completa contra um snapshot de estado, compara com resultado esperado e mede tempo/custo (alimenta o kill-criteria de R1).

### Cliente Windows
- Teste de CPU idle automatizado no CI (gate <1%).
- Verificação manual de faixa em contexto real (gate de arte).

### Segurança
- [SUPOSIÇÃO — revisar] Testes de autorização (conta A não acessa dados de conta B) e de validação de input em toda rota nova.

---

## 6. Riscos técnicos

| # | Risco | Prob. | Impacto | Mitigação |
|---|-------|-------|---------|-----------|
| R1 | Motor do mundo mais caro que o estimado — simular todas as ligas com consistência é a peça técnica central | Alta | Alto | Primeiro spike do F0; arquitetura determinística simples antes de qualquer feature. **Kill-criteria: spike >3 semanas = reavaliar.** |
| R2 | Ritual das 15h não pega em desktop — aposta comportamental inédita | Média | Fatal | Gates de beta (presença ≥50%, D30 ≥30%); perder ao vivo nunca custa resultado; resumo de 20s; horário único BR. |
| R3 | Paywall tardio — compra chega após 6 semanas de trial; se a T1 vazar retenção, conversão desaba | Média | Alto | T1 é prioridade máxima de design (densidade de momentos); oferta antecipada no pico emocional do meio da temporada; **gate conversão ≥8%.** Modelo Steam F2P+compra muda a mecânica do trial (conta Steam, reviews de não-pagantes) — detalhar na SPEC de monetização. |
| R4 | Widget na taskbar — **RESOLVIDO (SPEC-006):** faixa compacta ancorada validada nas duas posturas <1% CPU | — | — | Pendências residuais (multi-monitor, soak, DPI) herdadas pelo cliente real. |
| R5 | Cópia rápida — TBH/clones adicionam futebol; Football Rising adiciona modo ambiente | Média | Alto | Velocidade (F0-F1 em semanas); fosso = rede de times (switching cost social) + lendas acumuladas, não a mecânica. |
| R6 | Deslize de licenciamento — nome/escudo parecido demais com clube real | Baixa | Alto | Regra NUNCA nº 1 auditada