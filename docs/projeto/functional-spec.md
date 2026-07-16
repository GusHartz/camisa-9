# Especificação Funcional — Camisa 9 (codinome · método H1VE)

## Capacidades centrais

O produto é um jogo de carreira de futebol de baixa atenção, onde um mundo simulado vive continuamente no servidor e o humano ocupa a vaga de um atleta. As capacidades abaixo são o produto completo (fatiamento em SPECs fica no campo 08).

### 1. Motor do mundo (coração — money path)
- Simula **todas as ligas 3×/semana**: partidas, tabelas, transferências NPC, evolução e aposentadoria de NPCs.
- O mundo vive **sem nenhum humano presente**.
- **Determinístico e auditável**: mesma seed + mesmo estado → mesmo resultado; toda rodada é reproduzível (replay).
- **Regra de arquitetura**: toda regra de simulação vive em `lib/world-engine` (puro, testável, sem I/O). Rotas apenas orquestram (agendam rodadas, persistem resultado). UI só lê.
- **[SUPOSIÇÃO — revisar]** Rodada executada por job agendado idempotente (uma execução por rodada, protegida por lock e chave de idempotência), permitindo retry seguro após falha parcial.

### 2. Entrada por substituição + waiting list real
- Todas as ligas definidas no **dia 1**; cada humano assume a vaga de um NPC (posição, camisa, clube, cidade).
- **Pirâmide Elástica:** ramificação 2× por nível (topo único; Div 3 = 2 grupos, Div 4 = 4...); expansão a **~70% de ocupação humana** do andar de entrada (colchão NPC permanente), **somente na virada de temporada**; novatos entram **sempre no andar mais baixo**; conservação de fluxo por fronteira (rebaixados = promovidos; playoff de acesso entre campeões de grupo — números exatos por SPEC).
- Vaga em abandono **congelada por 30 dias**, depois **reverte a NPC**.
- **Entrada por quinteto fura a fila** da waiting list (unidade de aquisição é o grupo).
- **[SUPOSIÇÃO — revisar]** Estado da vaga (`humano | congelada | npc`) e o relógio de abandono são propriedade do motor, não da camada de sessão — evita divergência entre "quem está logado" e "quem ocupa a vaga".

### 3. Presença em 3 níveis
- **Faixa** acima da taskbar (vida do atleta: CT, casa, véspera).
- **Modo mini** — faixa compacta ancorada à taskbar (postura A/topmost, validada na SPEC-006; render dentro da shell é inviável no Win11).
- **Notificações nativas com botões** (decidir do meio do Outlook).
- **Regras de silêncio**: nunca em tela cheia/apresentação; horário configurável.

### 4. Dia de jogo (o evento)
- **Ter/Qui/Sáb às 15h Brasília**; quinta alterna Liga e Copa.
- ~15 min comprimidos; **câmera no SEU jogador**; nota ao vivo.
- **1–2 eventos de escolha** por partida (ex.: "min 12 — passe curto/longo/finalizar"), resolvidos por **atributos + moral**.
- **1 intervenção por tempo.**
- **Perdeu ao vivo** = resumo de 20s + nota. Presença dá cor, **nunca resultado**.

### 5. Decisões de carreira
- **3–5/dia**, do cotidiano (treino vs descanso) ao dramático (proposta 2× salário vs ficar com os amigos).
- **Sem resposta às 18h → agente decide conservadoramente.**

### 6. Resumo de Retorno
- Ao reabrir após ausência + **beat fixo de segunda** ("+2 finalização, torcida cantou seu nome…"). Dopamina de reabertura.

### 7. Simulação do atleta (faseada)
- **MVP**: barras (forma/moral/fôlego) + 12 atributos evolutivos.
- **F2**: traços de personalidade + **química com amigos** (entrosamento acumulado = bônus real — razão mecânica para recrutar humanos).

### 8. Lesões narrativas
- Raras, nunca punição cega, sempre com **arco** (recuperação → volta por cima).

### 9. Carreira com fim + lendas permanentes
- ~15–20 temporadas com **declínio físico real**.
- Aposentadoria → **hall de lendas** do clube, recordes, camisa aposentada.
- Novo atleta inicia com **herança de legado**.

### 10. Gradiente várzea→elite
- Div 4 = campo de terra, "Copa da Baixada", uniforme desparelho.
- Elite = estádio, "Liga Nacional", transmissão.
- Subir de divisão **muda o mundo visualmente**.

### 11. Card compartilhável
- Fim de partida (nota + momento) e fim de temporada.
- Desenhado para o **grupo de WhatsApp** (a "grade do Wordle" do produto).

### 12. Live-ops pelo calendário do futebol
- Janelas de transferência, Copa das quintas, temporadas temáticas.
- **F2**: seleções (convocação), amistosos em semanas mortas, Copa do Mundo fictícia a cada N temporadas.

### 13. i18n desde o dia 1
- **PT nativo**; EN na F3. Nenhuma string hardcoded na UI.

### 14. Treino & progressão diária
- Treino gera **pontos de atributo** que o jogador distribui.
- Pontos **acumulam sem expirar** (ausência nunca perde); distribuir no dia dá **bônus de treino focado**.

### 15. Batida semanal & mundo vivo (dias sem jogo)
- **Jornal do mundo** (resultados, lesão do rival, artilharia, transferências NPC) — consumo passivo.
- **Entrevista pós-jogo** (qua) com escolha de tom → moral/fama/torcida.
- **Trash talk** do adversário de sábado → modificador de moral do jogo.
- **Escalação da véspera às 18h** (seg/qua/sex) — conferir leva 5s; banco gera evento.
- **Resenha de domingo** — resumo mundial passivo, zero decisão.
- Regra: **um beat de ~30s por dia; nada obrigatório**. O FOMO vem do mundo, não da partida.

### 16. Salário & estilo de vida
- Salário/luvas/prêmios → compras pessoais com **trade-off narrativo** (nunca loja de stats).
- **Casa da mãe** = marco de carreira com card próprio.
- **Patrimônio visível na faixa** (cena de casa evolui com a carreira).
- **Trava:** dinheiro do jogo **jamais** comprável com dinheiro real.

### 17. Monetização (Steam)
- App **Free-to-Play** + compra única in-app/DLC **"Carreira"** (R$ 49,90 / $9.99) liberada ao fim da T1.
- **Oferta antecipada** no pico emocional do meio da T1 (mitigação do paywall tardio).
- DLC cosmética como live-ops. Checada contra as regras NUNCA em toda SPEC.

### 18. Cadastro solo/team + código de time (R14)
- **Bifurcação no cadastro:** SOLO (vaga em clube com elenco NPC) ou TEAM (código de time).
- **Código de time:** distribuível em mensagem; amigo se cadastra com ele e cai **direto no elenco**, escolhendo posição entre as vagas restantes.
- **Jogável desde o humano nº 1** — completar 11 fecha as vagas (código expira), nunca bloqueia o jogo; tranca manual do fundador disponível. 11 humanos = **marco celebrado** (card + histórico do mundo).
- **NPC fixo por posição** (goleiro como default sugerido) — fora do código; ganha nome/personalidade.
- **Fundação em massa só na divisão de entrada** (integridade dos andares de cima; em clubes existentes, o código só preenche vagas NPC preexistentes). Absorve o takeover de quinteto.

### Fora do beta (F2 — comprometido na visão)
Técnico com personalidade, reputação ídolo/mercenário por torcida, fama como economia secundária, comissão pessoal.

---

## Por tipo de usuário

### Primário — Torcedor de desktop BR (25–45, ex-Cartola)
- **Objetivo**: viver futebol sem culpa nem custo de atenção.
- **Capacidades-chave**: presença 3 níveis, dia de jogo comprimido, decisões 3–5/dia com fallback conservador às 18h, resumo de retorno.
- **Regra**: nunca exigir sessão longa; ausência nunca destrói a carreira (vaga congela 30 dias, agente decide).

### Secundário — O quinteto (grupos de 5)
- **Objetivo**: time próprio, camisa própria, subir juntos.
- **Capacidades-chave**: entrada por quinteto (fura a fila), química com amigos (F2), cards compartilháveis.
- **Regra**: o grupo é a unidade de aquisição — o produto deve tratar o quinteto como entidade, não 5 usuários soltos.

### Terciário — Público global do gênero (fase EN)
- **Objetivo**: novidade num formato que já amam (Rusty's/Spirit City).
- **Capacidades-chave**: i18n (EN na F3), Steam.
- **Regra**: nenhuma dependência PT-only no core; separar conteúdo localizável desde o dia 1.

### Quaternário — O amigo convidado
- **Objetivo**: curiosidade → vaga com a camisa dele.
- **Capacidades-chave**: card compartilhável (auto-demonstração), fluxo de convite para vaga, entrada por substituição.
- **Regra**: o loop de convite deve levar direto a uma vaga assumível, sem fricção de onboarding.

### Anti-usuários (rejeição deliberada)
- Quem quer **controlar as partidas** (FIFA/eFootball) — o jogo resolve por atributos, humano só escolhe.
- **Hardcore min-max de gestão** (FM já o serve).
- **Apostador** — **NUNCA** qualquer ponte com betting.

---

## Gates de qualidade

### Disciplina padrão H1VE
- `branch → PR → CI verde → squash merge`.
- **Founder gate** em todo merge para `main` e todo release.
- **Duplo sign-off**: QA + Data antes do merge; merge final pelo arquiteto/founder.

### Baseline de segurança (SEMPRE presente)
- **Ordem obrigatória** em toda rota: **autenticação → autorização → validação de input**.
- **Nenhum segredo hardcoded** — seeds do motor, credenciais e chaves via variáveis de ambiente.
- **Menor privilégio**: o jogador só pode agir sobre a própria vaga/atleta; escrita no estado do mundo é exclusiva do motor.
- **Erros genéricos** ao usuário (sem stack, sem SQL); detalhe só em log interno.

### Gate do money path — a rodada
- Nenhuma SPEC que toque o motor entra sem **testes de propriedade**: determinismo, fuso, replay, falha parcial.
- **Protocolo de falha pública definido**: transparência estilo post-mortem + "evento de reparação".
- Contexto: **uma rodada de sábado falhando com todos online é o pior acidente possível** — este gate é inegociável.

### Gate de arte
- Nenhum sprite/venue entra sem aprovação do founder **em contexto real**: screenshot da faixa em **110px sobre um desktop de verdade**.
- Beleza em mockup ≠ beleza na barra.

### Gate de economia
- Qualquer SPEC que toque monetização/quota passa por checagem contra as **regras NUNCA** (campo 05) **antes** de ir ao Claude Code.
- Em especial: **nada de stats compráveis; nada de ponte com apostas.**

### Gate de lançamento público
- **Filtro de nomes + report** funcionando.
- Moderação ativa adiada no beta por decisão consciente (network confiável) — **[SUPOSIÇÃO — revisar]** documentar o gatilho de reversão (ex.: crescimento além do círculo de confiança).

### Gate externo — Steam
- Review da loja + calendário de festivais (Next Fest/Idler Fest) planejado **com folga**.
- **Nunca prometer data de rodada inaugural sem build aprovada.**

### Onde exigir testes (lógica crítica)
- **Motor do mundo**: cobertura de propriedade completa (obrigatório).
- **Resolução de eventos de escolha e decisões de carreira**: testes de atributos+moral e do fallback das 18h.
- **Máquina de estado da vaga**: humano → congelada → NPC, incluindo o relógio de 30 dias.
- UI de apresentação: sem lógica de negócio, logo sem testes de regra (apenas smoke/render).