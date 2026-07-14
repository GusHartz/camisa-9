# Roadmap — Nexus Flow (H1VE)

> **Contexto operacional:** founder solo (Gustavo) em todos os papéis H1VE, operando agentes como ferramentas. Cada spec deve ser autocontida, testável por um único operador e mergeada por gate humano. O sequenciamento abaixo prioriza **provar o coração (motor do mundo)** antes de qualquer camada de superfície.

---

## Fases (cada item vira uma spec)

### Fase 0 — Fundação técnica e money path
Objetivo: infra determinística e auditável antes de qualquer feature de jogador.

| # | Spec | Entrega |
|---|------|---------|
| 0.1 | **Bootstrap de repositório + CI** ✅ | Monorepo, gates de lint/type/test, pipeline de build. *(SPEC-001 — concluído 2026-07-14.)* |
| 0.1.5 | **Spike — motor do mundo** ✅ | De-risca R1 (compute/determinismo/atomicidade/fuso) **antes** de 0.2: 1 liga fictícia, 10 clubes NPC, 18 rodadas determinísticas por seed, publicação atômica, âncora de fuso sem `Intl`/`Date`, golden vectors cross-ambiente e bench K-ligas. Lib descartável/evoluível `packages/world-engine`; valida antecipadamente partes de 0.3 (RNG+auditoria) e 1.1/1.2. *(SPEC-002 — concluído 2026-07-14.)* |
| 0.2 | **Camada de dados + seed do mundo** | Schema de ligas/clubes/atletas/temporadas; migrations versionadas. Persiste o que o spike (0.1.5) provou em memória. |
| 0.3 | **RNG determinístico + auditoria** | Seed por temporada, log replayable de toda tick do mundo (rigor money path). |
| 0.4 | **Baseline de segurança** | Auth, autorização por recurso, validação de input, segredos em env. |

### Fase 1 — Motor do mundo (o coração)
Objetivo: **o mundo vive sem nenhum humano.** Esta é a fatia que valida a tese.

| # | Spec | Entrega |
|---|------|---------|
| 1.1 | **Simulação de partida (server-side)** | Resolução determinística por atributos+moral; resultado auditável. |
| 1.2 | **Motor de temporada (3×/semana)** | Ter/qui/sáb; tabelas, rodadas, calendário do futebol. |
| 1.3 | **Ciclo de vida do NPC** | Evolução, declínio físico, aposentadoria, criação de novos atletas. |
| 1.4 | **Transferências NPC** | Janelas, movimentação entre clubes/divisões. |
| 1.5 | **Painel de auditoria interno** | Inspeção de qualquer tick/temporada (ferramenta de founder). |

### Fase 2 — Entrada humana e o atleta
Objetivo: um humano assume uma vaga e vive uma carreira.

| # | Spec | Entrega |
|---|------|---------|
| 2.1 | **Substituição de NPC + waiting list** | Humano assume vaga (posição/camisa/clube); vaga congela 30 dias em abandono → reverte a NPC. |
| 2.2 | **Pool 100% humano → criação de times** | Divisão de entrada gera times automaticamente. |
| 2.3 | **Simulação do atleta (MVP)** | Barras (forma/moral/fôlego) + 12 atributos evolutivos. |
| 2.4 | **Decisões de carreira (3-5/dia)** | Cotidiano → dramático; sem resposta = agente decide conservador às 18h. |
| 2.5 | **Lesões narrativas com arco** | Raras, sempre recuperação → volta por cima. |

### Fase 3 — Dia de jogo (o evento) e presença
Objetivo: a dopamina ao vivo e a presença de 3 níveis.

| # | Spec | Entrega |
|---|------|---------|
| 3.1 | **Dia de jogo ao vivo** | ~15 min comprimidos, câmera no seu jogador, nota ao vivo. |
| 3.2 | **Eventos de escolha + intervenção** | 1-2 escolhas/partida (atributos+moral); 1 intervenção/tempo. |
| 3.3 | **Resumo 20s (perdeu ao vivo)** | Presença dá cor, nunca resultado. |
| 3.4 | **Presença 3 níveis** | Faixa acima da taskbar → mini na taskbar → notificações nativas com botões. |
| 3.5 | **Regras de silêncio** | Nunca em tela cheia/apresentação; horário configurável. |
| 3.6 | **Resumo de Retorno + beat de segunda** | Dopamina de reabertura. |

### Fase 4 — Mundo visível e viralidade
Objetivo: fazer o mundo ser sentido e compartilhado.

| # | Spec | Entrega |
|---|------|---------|
| 4.1 | **Gradiente várzea→elite** | Div 4 (terra/Copa da Baixada) até elite (estádio/transmissão); subir muda o visual. |
| 4.2 | **Carreira com fim + hall de lendas** | ~15-20 temporadas; camisa aposentada, recordes, herança de legado. |
| 4.3 | **Card compartilhável** | Fim de partida e fim de temporada — desenhado para o WhatsApp. |
| 4.4 | **Live-ops pelo calendário** | Janelas de transferência, Copa das quintas, temporadas temáticas. |

### Fase 5 — Pós-beta (comprometido na visão)
| # | Spec | Entrega |
|---|------|---------|
| 5.1 | Química com amigos + traços de personalidade (razão mecânica para recrutar humanos). |
| 5.2 | Técnico com personalidade + reputação ídolo/mercenário por torcida. |
| 5.3 | Fama como economia secundária + comissão pessoal (preparador/nutri/psicólogo). |
| 5.4 | Seleções + amistosos + Copa do Mundo fictícia + takeover de clube por quinteto. |
| 5.5 | i18n EN (F3 na visão). |

> **[SUPOSIÇÃO — revisar]** O beta público corta ao final da Fase 4. Fases 0-1 são pré-requisito absoluto; Fases 2-4 formam o MVP jogável.

---

## Prioridades

**P0 — Bloqueadores de tese (sem isso, nada existe):**
- 0.1–0.4 (infra, dados, determinismo, segurança baseline)
- 1.1–1.5 (motor do mundo completo e auditável)

*Justificativa:* a proposta única é "o mundo vive sem humanos". Se o motor não for determinístico e auditável (rigor money path), toda camada acima é ilusão. Isto é provado **antes** de qualquer UI.

**P1 — MVP jogável (a experiência de carreira):**
- 2.1–2.5 (entrada + atleta + decisões)
- 3.1–3.6 (dia de jogo + presença)

*Justificativa:* é o loop que retém. Presença de 3 níveis e Resumo de Retorno são o motor de reabertura.

**P2 — Retenção e crescimento:**
- 4.1–4.4 (mundo visível, fim de carreira, card viral, live-ops)

*Justificativa:* card compartilhável = canal de aquisição orgânico ("a grade do Wordle deste produto"); gradiente e legado = retenção de longo prazo.

**P3 — Expansão pós-beta:**
- 5.1–5.5

*Justificativa:* comprometidos na visão, mas dependem de um beta validado. Química (5.1) é a de maior alavancagem — cria razão mecânica para recrutar humanos.

**Regra de corte:** i18n estruturado desde o dia 1 (PT nativo) — strings externalizadas em toda spec; **EN é P3**, mas nenhuma spec pode hardcodar texto de UI. `[SUPOSIÇÃO — revisar]`

---

## Considerando o time

Founder solo (Gustavo) em todos os papéis, com agentes como ferramentas. O roadmap é dimensionado para essa realidade:

- **Uma spec por vez, autocontida.** Cada item da tabela é escrito como SPEC completa (chat = estratégia/spec; Claude Code = implementação) antes de codar. Nada de escopo aberto.
- **Gate humano obrigatório em todo merge.** Sem paralelismo de branches longas; fluxo linear spec → implementação → review humano → merge.
- **Duplo sign-off simulado por checklist.** Sem QA e Data separados, cada merge exige checklist explícito de **QA** (testes passam, gates verdes) e **Data** (invariantes do mundo preservados, replay auditável bate). O founder assina ambos conscientemente. `[SUPOSIÇÃO — revisar: automatizar via CI]`
- **Testes onde há lógica crítica.** Cobertura obrigatória no motor do mundo (Fase 1), resolução de partida e transferências. UI e cosmético (Fase 4) toleram cobertura menor.
- **Sequenciamento server-first.** Backend/motor (P0) é construído e auditável antes da UI, reduzindo retrabalho — a UI só apresenta o que o motor já garante.
- **Live-ops como calendário, não como plantão.** Automatizar janelas/eventos (4.4) para não exigir operação manual contínua de um único operador.
- **Arte com gate humano dedicado.** Assets do gradiente várzea→elite (4.1) e cards (4.3) passam por aprovação humana explícita — agente propõe, founder aprova.

**Ritmo recomendado:** fechar Fase 0 e Fase 1 integralmente (tese provada) antes de abrir a Fase 2. Não iniciar duas fases em paralelo — o gargalo é o único gate humano.