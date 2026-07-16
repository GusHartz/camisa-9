# Roadmap — Camisa 9 (codinome · método H1VE)

> **Contexto operacional:** founder solo (Gustavo) em todos os papéis H1VE, operando agentes como ferramentas. Cada spec deve ser autocontida, testável por um único operador e mergeada por gate humano. O sequenciamento abaixo prioriza **provar o coração (motor do mundo)** antes de qualquer camada de superfície.

---

## Fases (cada item vira uma spec)

### Fase 0 — Fundação técnica e money path
Objetivo: infra determinística e auditável antes de qualquer feature de jogador.

| # | Spec | Entrega |
|---|------|---------|
| 0.1 | **Bootstrap de repositório + CI** ✅ | Monorepo, gates de lint/type/test, pipeline de build. *(SPEC-001 — concluído 2026-07-14.)* |
| 0.1.5 | **Spike — motor do mundo** ✅ | De-risca R1 (compute/determinismo/atomicidade/fuso) **antes** de 0.2: 1 liga fictícia, 10 clubes NPC, temporada determinística por seed (turno-returno), publicação atômica, âncora de fuso sem `Intl`/`Date`, golden vectors cross-ambiente e bench K-ligas. Lib descartável/evoluível `packages/world-engine`; valida antecipadamente partes de 0.3 (RNG+auditoria) e 1.1/1.2. *(SPEC-002 — concluído 2026-07-14; a SPEC-009 expandiu para liga de 20 → 38 rodadas.)* |
| 0.2 | **Camada de dados + seed do mundo** 🚧 | Schema de ligas/clubes/atletas/temporadas; migrations versionadas. Persiste o que o spike (0.1.5) provou em memória. *(Fatiada em 5: **Fatia 1 — snapshot consultável do mundo semeado em Postgres** ✅ SPEC-013 (2026-07-16); **Fatia 2 — publicador de rodada transacional** ✅ SPEC-014 (2026-07-16): `published_round` (migration `0001`) + `publishRound` transacional (advisory lock + idempotência por PK + seam à prova de rollback), o contrato da SPEC-002 agora durável em Postgres. Próximas: 3 — persistir viragens · 4 — Neon branch-por-ambiente · 5 — Pirâmide Elástica.)* |
| 0.3 | **RNG determinístico + auditoria** | Seed por temporada, log replayable de toda tick do mundo (rigor money path). |
| 0.4 | **Baseline de segurança** | Auth, autorização por recurso, validação de input, segredos em env. |

> **De-risk do cliente (paralelo, fora da sequência numerada) — SPEC-003 ✅ validado (2026-07-15).** Spike da **forma padrão** (faixa animada always-on-bottom). Candidato **A (C#/WPF)** validado no Windows 11: **CPU 0,25% / RAM ~87 MB → PASS com folga** no risco central; always-on-bottom / no-focus / no-taskbar / multi-monitor OK. Aberto: **Win+D** (DWM cloaking → exige WorkerW, deferido ao cliente) e **soak de 8 h**. Footprint **161 MB** (self-contained WPF) foi o insumo da **Ratificação de stack #1** — agora **ratificada na SPEC-004: `C#/WPF` (.NET LTS)** (ver `docs/adr/ADR-001`; candidato B/Rust não implementado — A passou, sem kill; ratificado na evidência + literatura, decisão reversível). Ver `spikes/faixa-always-on-bottom/RESULTS.md`.

> **De-risk do cliente (paralelo) — SPEC-005 ✅ validado (2026-07-15).** Spike **#3 — toasts acionáveis** (nível 3 da presença, sobre a stack WPF/ADR-001). Toast WinRT nativo com **2 botões** de um app **unpackaged** (zero workload/MSIX) → **GO**. **Risco central provado (cold-start):** com o app **fechado**, o clique cold-starta um processo **novo headless** (PIDs 13708/19784/5812), POST ao stub, `ack:true`, sustentado só pelo auto-registro AUMID+COM do `ToastNotificationManagerCompat` (sem atalho/instalador). Warm sem roubar foco; decisão correta (`play`/`rest`). Orçamento **PASS** (CPU idle 0,095% / RAM pico 99 MB); footprint 185,3 MB sc. **Fix:** `ToastScenario.Reminder` (senão os botões somem na Central). **Brecha aberta:** `SHQueryUserNotificationState` no Win11 não cobre borderless-fullscreen/DND-manual → heurística suplementar deferida. Ver `spikes/toasts-acionaveis/RESULTS.md`.

> **De-risk do cliente (paralelo) — SPEC-006 ✅ validado (2026-07-15).** Spike **#4 — widget na taskbar** (nível 2 da presença, a "mini na taskbar"). **Achado de pesquisa:** renderizar **dentro** da shell da taskbar do Win11 é **inviável** (deskband removido; hacks por injeção/reparent quebram em update + AV, colidem com "zero anti-cheat"; Widgets oficiais = MSIX + flyout Win+W) → o spike **reformula o #4 como faixa compacta ANCORADA à taskbar** (o Plano B que o CLAUDE.md já aceita) e compara **duas posturas** (unpackaged, não-elevado, sobre WPF/ADR-001): **A — topmost flutuante** vs **B — AppBar (`SHAppBarMessage` reserva a borda)**. **GO-com-ressalvas → postura A padrão, B opcional.** Ambas ancoram sem injeção/MSIX e **dentro de <1% CPU** (A **0,186%** / B **0,189%**, RAM pico <80 MB); footprint **159,8 MB** sc. **Achados ao vivo:** **(L1)** a reserva de work-area do AppBar assenta com **latência** no Win11 (~15–30 s) e a liberação por `ABM_REMOVE` também — funciona, sem leak na saída graciosa, mas enfraquece a vantagem única de B; **(L2)** `CloseMainWindow()` é **no-op** numa janela `WS_EX_TOOLWINDOW` (fecha-se via `WM_CLOSE` direto ao HWND). **Pendências:** multi-monitor; auto-hide/tela-cheia/Win+D **ao vivo**; Win+D/WorkerW (herdado da SPEC-003); soak longo; DPI≠100%. Ver `spikes/widget-taskbar/RESULTS.md`.

### Trilha GTM (paralela — destrava com a fase de arte)
Objetivo: o relógio de wishlist só começa com nome + capsule no ar.

| # | Spec | Entrega |
|---|------|---------|
| G.1 | **Briefing de identidade visual** | DNA do personagem/mundo, anti-brief (erros já cometidos documentados), paleta anti-CBF, teste de capsule em 120×45. Veste a identidade **Next Goat** (bode coroado, camisa 10) — nome já decidido (ver bloco de identidade em vision-scope). |
| G.2 | **Verificação jurídica do nome** | Nome **decidido: Next Goat** (P1 encerrado, 15/07). Resta a verificação jurídica: INPI 9/41 + TESS/EUIPO (risco nomeado: GOAT Games) + stores + domínios/handles. |
| G.3 | **Página Coming Soon na Steam** | Capsule + descrição + tags; wishlist acumulando. **Gate: ≥2.000 wishlists em 90 dias + 1 festival.** |
| G.4 | **Discord da comunidade** | Canal "monte seu quinteto" (bot simples). **Gate: ≥50 quintetos pré-beta.** |
| G.5 | **Steam Playtest** | Distribuição do beta fechado (founder aprova coortes). |

### Fase 1 — Motor do mundo (o coração)
Objetivo: **o mundo vive sem nenhum humano.** Esta é a fatia que valida a tese.

| # | Spec | Entrega |
|---|------|---------|
| 1.1 | **Simulação de partida (server-side)** | Resolução determinística por atributos+moral; resultado auditável. |
| 1.2 | **Motor de temporada (rodada diária 15h)** 🚧 | Liga de 20, temporada de 38 rodadas ≈ 6 semanas; jogo diário (7/7) às 15h Brasília; **encaixe da Copa no calendário diário** (quartas intercaladas / entre temporadas / domingos de mata-mata — dentro do escopo desta spec); tabelas, rodadas, calendário do futebol; calendário e promoção/rebaixamento cientes de grupos paralelos (fundação do R13). *(**Primeira fatia — âncora diária 7/7 + orquestrador de tick + rodada-do-mundo atômica** ✅ SPEC-015 (2026-07-16): `anchor.ts` vira diário (15h todo dia; alinha o R4 FINAL), tabela `season` (âncora `start_day_index`, migration `0002`), `publishWorldRound` (todas as ligas numa tx — all-or-nothing) e `runDailyRound(db, seed, epochMs)` com boundary `season_complete` e protocolo de falha (`deferred`). **Falta:** encaixe da Copa no calendário; scheduler de produção; viragem no fim da temporada = Fatia 3 da 0.2.)* |
| 1.3 | **Ciclo de vida do NPC** | Evolução, declínio físico, aposentadoria, criação de novos atletas. |
| 1.4 | **Transferências NPC** | Janelas, movimentação entre clubes/divisões. |
| 1.5 | **Painel de auditoria interno** | Inspeção de qualquer tick/temporada (ferramenta de founder). |

> **Ajuste de tunáveis — spec de CÓDIGO curta (pendente, decorre do R4 FINAL / Dia do Jogador):** **elenco de 16** (11 titulares + 5 reservas) — no `world-engine`: `rosterSize` 20→16, `positionCounts` rebalanceado ~2GK·5DEF·5MEI·4ATA, invariante `roster===16`, golden regenerado; `clubStrength` = top 11 **intacto**. Pode pegar carona na spec 1.2 (rodadas) ou ser spec-ajuste própria. A SPEC-009 fica com `rosterSize: 20` até esta spec. *(Docs-only até lá — nenhuma mudança de código nesta higiene de documentação.)*

### Fase 2 — Entrada humana e o atleta
Objetivo: um humano assume uma vaga e vive uma carreira.

> **Conta + criação do atleta — a primeira identidade humana ✅ SPEC-016 (2026-07-16).** *(Card 22 no board; fatiado como primeira feature da Fase 1 pelo founder — o board é a fila, não este roadmap.)* Nasce a lib pura `packages/player` (nome/posição/visual + **atributos base nos 4 focos**, point-buy calibrado para a várzea — pool fixo ⇒ overall 34) + o serviço isolado `services/player-store` (conta por e-mail **argon2id** + atleta persistido numa transação all-or-nothing; schema Postgres `player`; migration `0000`). É a **fundação** que 2.1/2.3 consomem — mas **não** coloca o atleta no mundo (isso é 2.1, o **card 21**: bloqueado pelo snapshot imutável).

> **Atributos e evolução (treino) ✅ SPEC-017 (2026-07-16).** *(Card 13 no board.)* O atleta agora **cresce**: o treino enche uma **barra de XP** → cheia → **+1 ponto livre** nos 4 focos (até 99), com **curva de 3 zonas** (Model A: barra única + ponto flutuante; limiar cresce com o overall; curva inteira/piecewise). `packages/player/training.ts` + migration aditiva `0001` (`free_points`) + `training-repo` (transação com `FOR UPDATE`). **DLC e idade = seams neutros** (adiados). Cobre parte de 2.3 e o card 9 (treino com banking). **⚠️ Calibração:** a curva atual leva uma carreira a ~overall 72 (85+ = grind de lenda) — decisão de tunável pendente do founder (os ritmos 3/8/15 e "carreira→~85" do design record eram incompatíveis).

> **Cadastro solo/team + código de time — a camada de identidade do quinteto ✅ SPEC-018 (2026-07-16).** *(Card R14 no board — item 2.6.)* Nasce o **conceito de GRUPO** (o "monte seu quinteto"): bifurcação **solo** (`team_id=NULL`) / **team** (cria com nome + **camisa própria** → **código distribuível**) / **join** (amigo entra pelo código na **posição** livre). Elenco humano de **até 16** (2 GK · 5 DEF · 5 MID · 4 FWD — espelha `WORLD.squadShape`), marcos no **11º** e **16º** (→ código tranca). Lib pura `packages/player/team.ts` (validações + slots + marcos + `isPosition`) + serviço `services/player-store` (migration aditiva `0002` — tabela `team` + `athlete.team_id`; `team-repo` com **`SELECT … FOR UPDATE`** na corrida pela vaga). Entrega a **fundação de identidade** do 2.6 — **não** coloca no mundo (fundar clube / vaga NPC = 2.1, o card 21). Química/waiting-list/furar-a-fila seguem em fatias futuras.

| # | Spec | Entrega |
|---|------|---------|
| 2.1 | **Substituição de NPC + waiting list** | Humano assume vaga (posição/camisa/clube); vaga congela 30 dias em abandono → reverte a NPC. *(Conta + atleta já existem — SPEC-016/017; falta a costura `player-store`↔`world-store` + mapa focos→`ability` p/ ocupar a vaga.)* |
| 2.2 | **Pirâmide Elástica (expansão do mundo)** | Ramificação 2× por nível; gatilho de ~70% de ocupação humana da base; novos grupos/andares só na virada de temporada; playoff de acesso entre campeões de grupo. |
| 2.3 | **Simulação do atleta (MVP)** | DUAS barras persistentes (Forma e Moral) + 12 atributos evolutivos; stamina só dentro da partida (drena por físico, guia as substituições do técnico NPC, até 5/jogo). Fôlego diário cortado. *(Evolução por treino dos 4 focos entregue — SPEC-017; falta Forma/Moral/stamina + acoplar o FOCO diferenciado.)* |
| 2.4 | **Decisões de carreira (3-5/dia)** | Cotidiano → dramático; sem resposta = agente decide conservador às 18h. |
| 2.5 | **Lesões narrativas com arco** | Raras, sempre recuperação → volta por cima. |
| 2.6 | **Cadastro solo/team + código de time (R14)** 🟡 | Bifurcação solo/team; código coloca amigos direto no elenco; jogável desde o humano nº 1; NPC fixo por posição (goleiro default); fundação em massa só na divisão de entrada. O social mínimo do beta. *(Identidade do quinteto ✅ SPEC-018; falta a colocação no mundo = card 21.)* |
| 2.7 | **Pontos de treino com banking** | Pontos acumulam sem expirar; FOCO do dia (Físico/Técnico/Tático/Mental; sem escolha = técnico decide); bônus de treino focado no dia, com rendimento decrescente ao repetir o mesmo foco. |
| 2.8 | **Salário & estilo de vida (básico)** | 4-6 compras com trade-off; casa da mãe (marco+card); patrimônio na cena de casa da faixa; trava anti-dinheiro-real. |

### Fase 3 — Dia de jogo (o evento) e presença
Objetivo: a dopamina ao vivo e a presença de 3 níveis.

| # | Spec | Entrega |
|---|------|---------|
| 3.1 | **Dia de jogo ao vivo** | Jogo diário (7/7) às 15h; ~15 min comprimidos, câmera no seu jogador, nota ao vivo; stamina de partida guia as substituições do técnico NPC (até 5/jogo). |
| 3.2 | **Eventos de escolha + intervenção** | 1-2 escolhas/partida (atributos+moral); 1 intervenção/tempo. |
| 3.3 | **Resumo 20s (perdeu ao vivo)** | Presença dá cor, nunca resultado. |
| 3.4 | **Presença 3 níveis** | Faixa acima da taskbar → mini ancorada à taskbar → notificações nativas com botões. |
| 3.5 | **Regras de silêncio** | Nunca em tela cheia/apresentação; horário configurável. |
| 3.6 | **Resumo de Retorno + beat de segunda** | Dopamina de reabertura. |
| 3.7 | **Batida diária (o Dia do Jogador)** | Manhã jornal + foco do treino, 12h escalação do dia, 15h jogo, 18h decisões, noite notas; resumo semanal no domingo à noite. Carga: 0s–~18min/dia, nada obrigatório. |

### Fase 4 — Mundo visível e viralidade
Objetivo: fazer o mundo ser sentido e compartilhado.

| # | Spec | Entrega |
|---|------|---------|
| 4.1 | **Gradiente várzea→elite** | Div 4 (terra/Copa da Baixada) até elite (estádio/transmissão); subir muda o visual. |
| 4.2 | **Carreira com fim + hall de lendas** | ~15-20 temporadas; camisa aposentada, recordes, herança de legado. |
| 4.3 | **Card compartilhável** | Fim de partida e fim de temporada — desenhado para o WhatsApp. |
| 4.4 | **Live-ops pelo calendário** | Janelas de transferência, Copa (encaixe no calendário diário), temporadas temáticas. |
| 4.5 | **Monetização Steam** | F2P + compra única "Carreira" pós-T1 + oferta antecipada do meio da T1; checada contra regras NUNCA. |
| 4.6 | **Moderação mínima (GATE de público)** | Filtro de nomes + report + fila de revisão. |
| 4.7 | **Telemetria de gates** | Presença ao vivo, D30, funil, conversão — dashboard do founder. |

### Fase 5 — Pós-beta (comprometido na visão)
| # | Spec | Entrega |
|---|------|---------|
| 5.1 | Química com amigos + traços de personalidade (razão mecânica para recrutar humanos). |
| 5.2 | Técnico com personalidade + reputação ídolo/mercenário por torcida. |
| 5.3 | Fama como economia secundária + comissão pessoal (preparador/nutri/psicólogo). |
| 5.4 | Seleções + amistosos + Copa do Mundo fictícia. |
| 5.5 | i18n EN (F3 na visão). |

> **Corte do beta — ratificado (P6):** o beta fechado (via Playtest, G.5) corta ao final da **Fase 3 + 2.6** (o núcleo social mínimo); **Fases 4 + Trilha GTM completas = lançamento público** ("escopo completo no público; beta com o núcleo"). Fases 0-1 seguem pré-requisito absoluto.

> **Gate de cadência (R4 — beta):** a **telemetria de presença POR DIA DA SEMANA** no beta decide a cadência (jogo diário 7/7) **ANTES** do lançamento público — fadiga do horário fixo diário / fim de semana fraco afundando = reavaliar (o beta é o único momento reversível).

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