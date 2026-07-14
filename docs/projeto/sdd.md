# Especificação Técnica (SDD) — Nexus Flow / H1VE

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
- ⚠️ **Decisão de stack no F0** — governada pela promessa **<1% CPU** (aprendizado do erro do TBH com Electron).
- **Candidatos:** nativo (C#/WinUI3 ou similar) vs. web-wrapper ultraleve. **Electron descartado** — [SUPOSIÇÃO — revisar] provavelmente trai a promessa de CPU.
- **Forma padrão:** janela sem borda, always-on-bottom (padrão do gênero, risco baixo).
- **Widget na taskbar:** spike de risco alto (APIs não-oficiais). **Plano B já aceito em design:** modo compacto da própria faixa. Nunca no caminho crítico.
- **Critério de decisão:** o spike do F0 mede CPU real sob build candidata; o candidato que não sustentar <1% em idle é eliminado.

### Notificações
- Toasts nativos WinRT com botões de ação — decisões respondidas sem abrir o jogo.

### Distribuição
- **Canais:** Steam (descoberta do gênero + Next Fest/Idler Fest) + instalador próprio com autoupdate (margem preservada).
- **Preço:** R$ 49,90 / $9.99 vitalício, liberado pós-T1.
- ⚠️ **Calibrar preço regional Steam BR** sem canibalizar o site.

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
| D5 | Cliente nativo (não Electron) ⚠️ | Promessa <1% CPU é diferencial de produto; Electron a compromete. |
| D6 | Widget taskbar como spike opcional | APIs não-oficiais = risco alto; plano B (modo compacto) garante o produto mesmo sem o widget. |
| D7 | i18n desde SPEC-001 | Retrofit de i18n é caro; externalizar cedo é barato. |
| D8 | Química social apenas na F2 | Compra tempo para desenhar anti-abuso antes de expor superfície de fraude. |

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
| R3 | Paywall tardio — compra chega após 6 semanas de trial; se a T1 vazar retenção, conversão desaba | Média | Alto | T1 é prioridade máxima de design (densidade de momentos); oferta antecipada no pico emocional do meio da temporada; **gate conversão ≥8%.** |
| R4 | Widget na taskbar falha tecnicamente (APIs não-oficiais) | Alta | Médio | Spike isolado no F0 com plano B aceito (modo compacto). Nunca no caminho crítico. |
| R5 | Cópia rápida — TBH/clones adicionam futebol; Football Rising adiciona modo ambiente | Média | Alto | Velocidade (F0-F1 em semanas); fosso = rede de times (switching cost social) + lendas acumuladas, não a mecânica. |
| R6 | Deslize de licenciamento — nome/escudo parecido demais com clube real | Baixa | Alto | Regra NUNCA nº 1 auditada