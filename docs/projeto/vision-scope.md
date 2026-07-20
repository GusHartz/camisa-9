# Visão & Escopo — Camisa 9 (codinome · método H1VE)

> **Nome oficial: NEXT GOAT — Taskbar Football** (decidido 15/07; "Camisa 9" segue apenas como codinome interno do repositório). Mascote canônico: **o bode coroado, camisa 10** — malandro, digno, debochado. Subtítulo PT na comunicação BR: "futebol na sua taskbar". Condições pré-página-Steam: verificação INPI 9/41 + TESS/EUIPO (atenção: GOAT Games, publisher mobile) e garantia de domínios/handles.

## Problema

A dor é real e verificada, em três camadas:

- **Usuário primário (torcedor que trabalha em desktop):** quem passa 6–10h/dia no computador e ama futebol só consome o esporte de forma passiva no expediente (placar do Sofascore, zoeira no grupo, portal). Não há forma de *viver* futebol nesse contexto:
  - jogos de futebol exigem atenção integral (Football Manager consome ~40h/temporada; *Football Rising* é tela cheia com deckbuilding);
  - alternativas vivem no celular com monetização odiada (*Idle Eleven*: "paguei pra tirar os ads e não tirou").
- **Lacuna de gênero (verificada):** o *desktop ambiente* — jogos que rodam na borda da tela enquanto você trabalha — é demanda comprovada e massiva (*Rusty's Retirement* 550 mil+ cópias; *TBH* 266 mil simultâneos em 8 dias na taskbar). Porém o gênero é 100% solitário: sem servidor, sem eventos, sem esporte. A Valve (GDC 2026) confirma que esporte converte bem e é subofertado no Steam. A interseção **ambiente + futebol + social síncrono está vaga** (varredura de ~40 títulos, 13–14/07).
- **O que NÃO estamos resolvendo (honestidade de fundação):** isto é entretenimento de carreira num mundo fictício. **Não** é fantasy de jogadores reais (Cartola), **não** é aposta, **não** é produtividade. Não prometemos nada disso.

## Visão

**Você vive a carreira de UM jogador de futebol — da várzea às lendas — numa faixa discreta acima da taskbar, no mesmo time dos seus amigos, num mundo persistente que joga TODO DIA às 15h com ou sem você.**

Quatro pilares sustentam a tese:

- **Presença ambiente:** o jogo trabalha *junto* com o expediente, nunca contra. Três níveis — faixa em 3 alturas (compacta 64px · normal 88px [padrão] · cena 110px) → modo mini — faixa compacta ancorada à taskbar (postura A/topmost, validada na SPEC-006; render dentro da shell é inviável no Win11) → fechado (só notificações nativas). Promessa pública: **<1% CPU, zero anti-cheat no cliente** (o anti-*TBH* como posicionamento).
- **Cooperação, não gestão:** você **é** o atleta; seus amigos estão no **mesmo** time. "Meu passe, seu gol" — frase que nenhum manager produz. O clube é palco (NPC), não propriedade.
- **Ritual coletivo sincronizado:** jogo diário (7/7) às 15h Brasília — liga de 20, temporada de 38 rodadas ≈ 6 semanas — o mesmo pull de "conferir o placar" que já existe em milhões de pessoas, redirecionado para um placar onde *você* joga, todo dia.
- **Mundo vivo com história permanente:** o mundo nasce 100% NPC e jogando; cada humano substitui um NPC (escassez real via waiting list); carreiras terminam e viram lendas permanentes (hall, recordes, camisas aposentadas).

**North star:** times com **≥3 humanos presentes** no jogo das 15h.
**Guardrails:** D30 ≥30% · presença ao vivo ≥50% dos ativos · conversão T1→paga ≥8% · uptime de rodada 100%.

## Usuários

| Perfil | Quem é | O que quer | Papel no crescimento |
|---|---|---|---|
| **Primário — Torcedor de desktop BR** | 25–45, trabalha em computador, joga/jogou futebol, grupo de WhatsApp de futebol, ex-Cartola, sem tempo para FM | Viver futebol sem culpa e sem custo de atenção; zoeira com amigos; a fantasia da carreira | Early adopters; converte o grupo inteiro |
| **Secundário — O quinteto** | Grupos de 5 amigos/colegas com resenha estabelecida | Time próprio, camisa própria, subir juntos | Unidade de aquisição é o grupo; entrada por quinteto fura a fila da waiting list |
| **Terciário — Público global do gênero (fase EN)** | Compradores de *Rusty's*/*Spirit City* no Steam | Novidade no formato que já amam | Escala pós-PMF BR; o gênero é comprovadamente global |
| **Quaternário — O amigo convidado** | Não-usuário que vê a faixa numa tela compartilhada ou é chamado para uma vaga | Curiosidade ("que placar é esse?") → vaga com a camisa dele | Loop de convite; auto-demonstração em reunião/live |

**Anti-usuário (deliberado):** quem quer controlar as partidas (FIFA/eFootball); o hardcore de gestão min-max (FM já o serve); o apostador (nenhuma ponte com betting, nunca).

## No escopo

**Capacidades centrais (o produto completo — fatiamento no bloco 08):**

- **Motor do mundo (server-side, o coração):** simula TODAS as ligas todo dia (jogo diário 7/7) — partidas, tabelas, transferências, evolução e aposentadoria de NPCs. O mundo vive sem nenhum humano. **Determinístico e auditável** (rigor de money path).
- **Entrada por substituição + waiting list real:** todas as ligas definidas no dia 1; cada humano assume a vaga de um NPC (posição/camisa/clube/cidade); o mundo cresce em Pirâmide Elástica: topo único e eterno, ramificação 2× por nível descendo; expansão (novos grupos no andar de entrada; novo andar quando a largura satura) disparada a ~70% de ocupação humana da base, só na virada de temporada. Novatos entram sempre no andar mais baixo. Escassez eterna = altitude (Div 1) e identidade, não entrada. Vaga congelada 30 dias em abandono, depois reverte a NPC.
- **Cadastro solo/team com código de time:** solo = vaga em clube NPC; team = código distribuível — amigos entram direto no elenco escolhendo posição. Jogável desde o humano nº 1 (o 11º humano completa o **primeiro onze**, o 16º fecha o **elenco completo** — vagas até 16, marcos celebrados; nunca fecha o jogo). Posições marcáveis como NPC fixo (goleiro default). Fundação em massa só na divisão de entrada (absorve o takeover de quinteto).
- **Presença em 3 níveis:** faixa acima da taskbar → modo mini ancorado à taskbar → notificações nativas com botões (decisões respondidas do meio do Outlook). Regras de silêncio: nunca em tela cheia/apresentação; horário configurável.
- **Dia de jogo (o evento):** jogo diário (7/7) às 15h (Brasília) — liga de 20, temporada de 38 rodadas ≈ 6 semanas (encaixe da Copa no calendário diário = pendência de SPEC); ~15 min comprimidos; câmera no SEU jogador; nota ao vivo; 1–2 eventos de escolha/partida (resolvidos por atributos + moral); 1 intervenção por tempo; a stamina de partida guia as substituições do técnico NPC (até 5/jogo). Perdeu ao vivo = resumo de 20s + nota — presença dá cor, nunca resultado.
- **Decisões de carreira (3–5/dia):** do cotidiano (treino extra vs. descanso) ao dramático (proposta 2× salário vs. ficar com os amigos). Sem resposta = agente decide conservadoramente às 18h.
- **Treino & progressão diária:** cada treino gera pontos de atributo a distribuir sob um FOCO do dia (Físico/Técnico/Tático/Mental; sem escolha = o técnico decide); pontos ACUMULAM se o jogador faltar (nunca expiram — anti-culpa); distribuir no dia dá bônus pequeno de "treino focado", com rendimento decrescente ao repetir o mesmo foco.
- **Batida diária — o Dia do Jogador (a novela em volta do jogo):** manhã = jornal do mundo + FOCO DO TREINO + pontos de ontem · 12h escalação do dia · 13–15h pré-jogo (ambiente) · 15h JOGO · pós-jogo nota + card + entrevista ocasional · 18h deadline de decisões · noite livre (domingo à noite: resumo semanal do mundo). Carga: mínimo 0s, típico ~3min, máximo ~18min; nada obrigatório. Linha de design: **o FOMO diário vem do MUNDO, não da partida** (R4 FINAL: jogo diário 7/7 ratificado; riscos aceitos = fadiga do horário fixo e fim de semana fraco; rede de segurança = telemetria de presença por dia da semana no beta como gate, antes do público).
- **Salário & estilo de vida:** salário/luvas/prêmios viram poder de compra pessoal em itens com trade-off narrativo (carro = moral+fama+eventos de risco; academia em casa = físico−vestiário). **A casa da mãe** = marco de carreira com card compartilhável próprio. O patrimônio aparece NA FAIXA (cena de casa evolui: pensão → quitinete → casa → cobertura), amarrado ao gradiente várzea→elite. **Trava inegociável:** dinheiro do jogo jamais comprável com dinheiro real.
- **Resumo de Retorno:** ao reabrir após ausência + beat fixo de segunda ("+2 finalização, torcida cantou seu nome…"). Dopamina de reabertura.
- **Simulação do atleta (faseada):** DUAS barras persistentes — Forma e Moral (fôlego diário cortado) — + 12 atributos evolutivos no MVP; a stamina existe só DENTRO da partida (drena por atributos físicos — Resistência = tanque —, define rendimento e as substituições do técnico NPC, invisível fora dos 90 min); traços de personalidade + química com amigos (entrosamento = bônus real, razão mecânica para recrutar humanos) na F2.
- **Lesões narrativas:** raras, nunca punição cega, sempre com arco.
- **Carreira com fim + lendas permanentes:** ~15–20 temporadas com declínio físico; aposentadoria → hall de lendas, recordes, camisa aposentada; novo atleta herda legado.
- **Gradiente várzea→elite:** Div 4 = campo de terra, "Copa da Baixada", uniforme desparelho; elite = estádio, "Liga Nacional", transmissão. Subir de divisão muda o mundo visualmente.
- **Card compartilhável:** fim de partida e fim de temporada — desenhado para o WhatsApp (a "grade do Wordle" deste produto).
- **Live-ops pelo calendário do futebol:** janelas de transferência, Copa (encaixe no calendário diário = pendência de SPEC), temporadas temáticas; F2 amplia (seleções, amistosos, Copa do Mundo fictícia).
- **i18n desde o dia 1** (PT nativo; EN na F3).

**F2 (comprometida na visão, fora do beta):** técnico com personalidade; reputação ídolo vs. mercenário por torcida; fama como economia secundária; comissão pessoal (preparador/nutricionista/psicólogo).

**Baseline técnico não-negociável (H1VE)** — arquitetura e qualidade já **ratificadas/provadas** (SPECs 001-006, ADR-001); a baseline de segurança foi **exercida na SPEC-037** (roadmap 0.4): autenticação → autorização → validação de input em toda rota, sessão opaca revogável, respostas de erro genéricas, segredos em variáveis de ambiente:
- **Arquitetura:** toda regra de negócio e progressão em libs no servidor; rotas só orquestram; cliente **apenas renderiza** (posiciona F3/Mac). Motor do mundo isolado como serviço determinístico.
- **Segurança, nesta ordem:** autenticação → autorização → validação de input em toda superfície. Nenhum segredo hardcoded (variáveis de ambiente); menor privilégio por serviço; respostas de erro genéricas (sem stack/SQL). Progressão 100% server-side.
- **Qualidade:** gates de CI obrigatórios; testes onde há lógica crítica (motor de simulação, waiting list, money path); duplo sign-off **QA + Data** e merge pelo arquiteto.

## Modelo de negócio

**Temporada 1 grátis → compra única vitalícia (R$ 49,90 / $9.99) + DLC cosmética.** Canal ÚNICO do lançamento: **Steam** (decisão 15/07 — resolve confiança/SmartScreen, é onde o gênero vive; instalador próprio deferido com gatilho). Na Steam, o modelo materializa-se como **Free-to-Play + compra única in-app/DLC "Carreira"**. Validação de demanda: página Coming Soon (wishlist) + Discord ("monte seu quinteto") + Steam Playtest para o beta.

## Fora do escopo

**NUNCA — com o porquê registrado:**

- ❌ Nomes reais de clubes, jogadores ou ligas — inclusive no marketing ("o Brasileirão da sua firma" = não pode). Mundo 100% fictício (caminho NUTMEG/Hattrick). *Licenciamento é a mina jurídica do vertical.*
- ❌ Punir ausência com resultado. O time joga sem você; presença dá cor e escolha, nunca gols. *Anti-culpa é a tese (a lição do fardo do BeReal).*
- ❌ Vantagem esportiva paga. DLC vende conteúdo e cosmético (uniformes, estádios, arcos), jamais stats. *O "sistema de cartas com bônus" foi convertido em comissão pessoal com moeda do jogo.*
- ❌ Ads. *O flanco aberto do Idle Eleven é nosso argumento.*
- ❌ Anti-cheat no cliente / telemetria além do mínimo. *A crise de confiança do TBH (CPU, dados, falsos positivos) é nosso contraste de venda.*
- ❌ Qualquer ponte com apostas — nem odds, nem "bolão com prêmio", nem integração com casas. *Blindagem regulatória e de marca.*

**AGORA NÃO — com o porquê e o marco:**

- ❌ **Futsal/society (5→7→11)** — custaria 3 simulações + 3 artes de venue para entregar o que o gradiente de divisões e a waiting list já entregam. Formato único campo/11 (v1.2).
- ❌ **Começar nas categorias de base** — quebra o evento coletivo, separa os amigos, faz da T1 grátis uma antessala. A várzea É a base (R12); base existe como sistema NPC.
- ❌ **Pós-carreira de gestão** (técnico, diretor, presidente, empresário) — o jogo é sempre sobre SER jogador (corte v1.3).
- ❌ **Assinatura** — colapso de conversão no gênero (vizinhos são compra única $4–12). Reavaliar só com retenção excepcional comprovada.
- ❌ **Chat/DM interno** — a resenha acontece no WhatsApp de propósito (loop de viralidade nº 2). Moderação mínima (filtro de nomes + report) só como gate de lançamento público; adiada no beta.
- ❌ **Mac (Fase 3)** — a superfície lá é menu bar, não taskbar (redesenho, não port). Provisão na SPEC-001: toda lógica no