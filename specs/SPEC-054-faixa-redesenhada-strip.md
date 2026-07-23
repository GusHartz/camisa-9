# SPEC-054 — A faixa redesenhada: o strip da Central da Carreira (fatia 1 de N)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-054 |
| **Feature** | A faixa redesenhada — o strip sempre-visível (fatia 1: só a barra) |
| **Slug** | faixa-redesenhada-strip |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.4 (Presença 3 níveis) — a faixa ganha o layout da Central da Carreira |
| **Appetite** | 14 dias (estimativa: ~4-6 dias) |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-22 |
| **Status** | Rascunho (aguardando card no board + aprovação `spec → dev`) |

---

## Objetivo

A faixa ganha o **layout do handoff "Faixa Carreira"** (Claude Design, projeto `4b4652e8`): a barra
sempre-visível deixa o desenho estrutural atual e passa ao strip horizontal desenhado — **MENU ·
jogador (avatar + #nº nome POS OVR + clube) · FORMA/MORAL · JOGO (clube vs adversário + placar + AO
VIVO/relógio + card/re-assistir) · LOJA**. Fatia **só do strip**: o **menu-hub das 9 telas** (Perfil,
Treino, Contrato, Calendário, Histórico, Elenco, Visual, Config, Conquistas) é fatia futura.

---

## Contexto e motivação

O handoff entrega uma **Central da Carreira** completa — o strip + um menu-overlay de 9 telas. O
cruzamento com o dado real do jogo (feito na análise que precede esta SPEC) mostrou que **~60% das
telas do hub não têm dado** (contrato/mercado/valor, calendário/classificação, cartões/hat-trick/MOM,
customização de visual, áudio/gráficos/velocidade da sim, conquistas) e que **o hub usa 6 atributos
estilo FIFA** contra os **4 focos** do jogo. Por isso o founder fatiou: **fatia 1 = só o strip**, que
é a parte sempre-visível e **100% aterrada no dado que já existe** (`GET /v1/band`: forma, moral,
clube, `todayMatch` com placar/replay, atleta com nº/posição/overall).

O cliente WPF já tem esse strip em versão **estrutural** (SPEC-042/045/052 + os fixes de bring-up de
hoje). Esta fatia **re-veste** esse strip no visual do handoff — sem tocar o servidor, o engine nem
os goldens.

---

## Decisões (TRAVADAS com o founder — 2026-07-22)

1. **Fatiar: só o strip.** O menu-hub (9 telas) é fatia 2+, e a maioria dessas telas depende de
   backend que não existe (será cardeada à parte).
2. **As coisas interativas continuam funcionando.** O design move decisões/treino/regen para o hub;
   como o hub é fatia futura, esta fatia **mantém os popups atuais** (decisão/loja/escolha) e o
   treino inline **wirados e funcionando** — só o visual do strip muda. O botão **MENU** abre um
   **stub** ("Central da Carreira — em breve") até o hub existir.
3. **Avatar e escudos = blocos de cor** (assets pendentes do designer: o avatar em camadas e os 16
   escudos). O mascote `goat-idle` já embarcado pode ser o placeholder do avatar; os escudos são
   quadrados de cor por enquanto.
4. **Altura = 112 DIP** (o "cena" da SPEC-052; o design pede ~110, e 112 é a escala inteira 4×). O
   strip do handoff é denso — cabe em 112.

---

## Escopo — o que está DENTRO

- [ ] **Re-layout do strip** (`MainWindow.xaml`) no formato horizontal do handoff, em 5 blocos
      separados por divisórias verticais finas:
  - **MENU** (hambúrguer) → abre o stub da decisão 2.
  - **JOGADOR**: bloco do avatar (mascote/placeholder) + `#nº VOCÊ POS` + `OVR n` + linha do clube
    (com o escudinho de cor).
  - **FORMA/MORAL**: as 2 barras no estilo do handoff (trilho + preenchimento colorido + número),
    reusando `bars.forma`/`bars.moral`.
  - **JOGO**: nome do campeonato/divisão (do `club.tier` → nome de divisão) · clube vs adversário
    com escudos de cor · placar · durante o replay o relógio + **AO VIVO** (pulso — ⚠️ ver risco de
    orçamento) · botões **card** (SPEC-049) e **re-assistir** (SPEC-044).
  - **LOJA** (botão) → abre o popup de loja atual (SPEC-045).
- [ ] **Paleta do handoff** aplicada via brushes WPF (estende `ScenePalette` da SPEC-052 — a fonte
      única já tem navy/accent/gold/field/bar-form/bar-moral). Sem CSS; tradução token→brush.
- [ ] **Preservar TODA a funcionalidade wirada** (thin renderer, OP-17): o poll, as decisões (popup),
      a loja (popup), a escolha na partida (popup+ChoiceCard), o treino, o regen, o card de partida,
      o replay, o systray (ocultar/mostrar), o cenário da SPEC-052 atrás do conteúdo.
- [ ] **Stub do MENU**: um popup/painel mínimo "Central da Carreira — em breve" (âncora do hub
      futuro), sem as 9 telas.

---

## Escopo — o que está FORA

- **O menu-hub (as 9 telas)** — fatia 2+, e cada tela sem dado real é card próprio de backend:
  Contrato&Finanças (contratos/mercado/propostas com valor), Calendário (fixtures futuras +
  classificação), Config (áudio/gráficos/velocidade da sim), Conquistas (troféus), Visual
  (uniforme/chuteira/acessório).
- **Os 6 atributos FIFA** do design (velocidade/chute/passe/drible/físico/defesa) — o jogo tem 4
  focos; a tela de Perfil/Treino do hub resolverá isso quando vier (decisão de produto).
- **Escudos reais** (16 crests) e **avatar em camadas** — assets pendentes do designer (blocos de
  cor nesta fatia).
- **Nomes oficiais de divisão** — o engine tem `tier` numérico; o nome ("4ª Divisão" etc.) é decisão
  de produto (ver devolutiva). Placeholder derivado do tier por enquanto.
- **Servidor / engine / migration** — nada. Fatia 100% cliente.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição |
|---|---|---|
| `client/band-wpf/MainWindow.xaml` | modificar | O re-layout do strip (5 blocos) + o stub do MENU. |
| `client/band-wpf/MainWindow.xaml.cs` | modificar | Handlers do MENU (stub) e de LOJA; manter o resto wirado. |
| `client/band-wpf/View/BandViewModel.cs` | modificar | Campos de render que o novo strip precise (ex.: `OpponentName`, nome da divisão) — aditivo, do dado que já existe. |
| `client/band-wpf/View/ScenePalette.cs` | modificar | Estende a paleta com os brushes do handoff que faltarem. |
| `client/band-wpf/View/BandStrip*.cs` (se preciso) | criar | Se o XAML crescer o OP-16, extrair a composição de um bloco. |
| `specs/SPEC-054-…md` · `specs/DONE-054-…md` | criar | SPEC e DONE. |

⚠️ **Nenhum arquivo de `packages/*` ou `services/*`.** Os 5 goldens ficam byte-idênticos por
construção (a fatia não os toca).

---

## Mudanças de schema (se aplicável)

**Nenhuma.** Fatia 100% cliente.

---

## Mudanças de API (se aplicável)

**Nenhuma.** O strip consome campos que o `GET /v1/band` já entrega (`athlete`, `bars`, `club`,
`club.todayMatch`). Se algum campo do design não existir (ex.: nome do adversário já vem em
`todayMatch.opponentName`; nome da divisão é derivado do `tier`), é derivação no cliente — não muda o
contrato.

---

## Critérios de aceitação

**Cenário 1 — o strip no visual novo**
- Dado a faixa aberta com um atleta no mundo
- Quando ela renderiza
- Então o strip mostra os 5 blocos do handoff (MENU · jogador · forma/moral · jogo · loja) no estilo
  do design, com os dados reais do atleta.

**Cenário 2 — funcionalidade preservada**
- Dado o strip redesenhado
- Quando eu abro decisões, loja, a escolha do intervalo, peço card, re-assisto, oculto pelo systray
- Então tudo funciona como antes (nada de regressão nas SPECs 044/045/049/050/052 e nos fixes de hoje).

**Cenário 3 — o MENU (stub)**
- Dado o botão MENU
- Quando clico
- Então abre um painel mínimo "Central da Carreira — em breve" (a âncora do hub), sem quebrar nada.

**Cenário 4 — dado ausente degrada**
- Dado um atleta na fila (sem clube) ou sem jogo do dia
- Quando a faixa renderiza
- Então os blocos sem dado somem/degradam sem crash (o strip nunca fica quebrado).

**Cenário 5 — orçamento e cena**
- Dado o strip aberto com o cenário da SPEC-052 atrás
- Quando observo CPU/RAM
- Então segue `<1% CPU`/`<150MB`; ⚠️ o pulso "AO VIVO" do design é infinito — só entra se couber no
  orçamento (senão vira estático, como a lição da SPEC-051).

**Cenário 6 — o selo**
- Dado o merge
- Quando rodo os gates
- Então `packages/*` e `services/*` intocados, sem migration, gates TS verdes, `dotnet build` 0 avisos.

---

## Segurança (se aplicável)

**Sem superfície de segurança relevante.** Fatia de renderização no cliente, sobre o estado que o
`GET /v1/band` já entrega ao dono da sessão (autorização por construção, SPEC-038). Nenhuma rota
nova, nenhum input não-confiável, nenhum segredo.

---

## Riscos e dependências

| Risco | Prob. | Mitigação |
|---|---|---|
| O strip do design é DENSO (5 blocos + escudos + botões) — não caber em 112px / larguras | Média | Divisórias + `flex-shrink`; extrair composição se o XAML apertar; blocos de cor no lugar de arte. |
| O pulso infinito "AO VIVO" estourar o `<1% CPU` | Média | Estático se não couber (lição SPEC-051). |
| Regressão nos popups/replay/systray ao mexer no XAML | Média | Critério 2 cobre; testar cada affordance ao vivo. |
| Assets pendentes (avatar/escudos) travarem o visual | Baixa | Blocos de cor + o mascote como placeholder (decisão 3). |
| Escopo "vazar" para o hub | Média | Escopo FORA explícito; o MENU é stub. |

**Dependências** (em `main` + o PR #58 de hoje): SPEC-042 (o shell), SPEC-052 (o cenário +
`ScenePalette`), SPEC-044/045/049/050 (o replay/escritas/card/escolha que o strip preserva). Handoff
do Claude Design — projeto `4b4652e8`.

---

## Notas de implementação

- **Re-veste, não re-inventa.** O strip novo é o mesmo dado num layout novo — o `BandViewModel`
  praticamente não muda (só campos de render aditivos). Toda a lógica (poll, popups, replay, systray)
  fica intacta.
- **`ScenePalette` é a fonte única de cor** (SPEC-052) — estende ali; não espalhe hex pelo XAML.
- **Os popups já ancoram na faixa inteira** (fix de hoje, PR #58) — o re-layout do strip não deve
  quebrar isso (o `BandRoot` continua sendo o alvo).
- **Verificação:** `dotnet build` 0 avisos + o **smoke ao vivo** (a faixa na tela, cada affordance) —
  o método que os fixes de hoje estabeleceram como indispensável (o build não pega bug de runtime do
  XAML). Reusar o harness headless da SPEC-049/052 para inspecionar o strip em PNG se ajudar.
- **Não fabricar dado** (instrução do founder): onde o design pede algo que não existe (campeonato,
  escudo, valor de mercado), derivar do que há (tier→nome placeholder) ou omitir — nunca inventar.

---

## Devolutiva ao designer (enviar junto)

1. ⚠️ **"TER/QUI/SÁB 15h"** aparece de novo (nos fixtures e num comentário do mock) — é a **4ª vez**.
   A cadência é **diária, 7/7, às 15h**. O `readme` do design system precisa ser corrigido na fonte,
   senão todo handoff nasce com o erro.
2. **6 atributos vs 4 focos:** o Perfil/Treino do design usa velocidade/chute/passe/drible/físico/
   defesa (FIFA). O jogo tem **Físico/Técnico/Tático/Mental**. Precisamos alinhar: adotar os 4 focos
   na UI, ou é uma proposta de mudar o modelo do jogo? (decisão de produto — bloqueia a tela de
   Perfil do hub).
3. **As telas sem dado** (Contrato&Finanças, Calendário/Classificação, Config de áudio/gráficos/sim,
   Conquistas, Visual) pressupõem mecânicas que **não existem** — cada uma é um card de backend antes
   de virar UI. Confirmar quais entram no beta e quais são visão de longo prazo.
4. **Escudos (16) e avatar em camadas** — os assets que a fatia 2 (e o strip final) precisam.
5. **Nomes de divisão** — o engine só tem `tier`. Precisamos da nomenclatura oficial (e gerável, pela
   Pirâmide Elástica) — mesma pendência da SPEC-053.

---

## Checklist de aprovação

- [ ] Objetivo claro e verificável
- [ ] Escopo delimitado (dentro/fora)
- [ ] Arquivos corretos
- [ ] Sem schema (nenhuma migration)
- [ ] Critérios testáveis
- [ ] Riscos e segurança avaliados
- [ ] Appetite razoável
- [x] Decisão 1 — só o strip (hub é fatia futura)
- [x] Decisão 2 — funcionalidade interativa preservada; MENU = stub
- [x] Decisão 3 — avatar/escudos = blocos de cor (assets pendentes)
- [x] Decisão 4 — 112 DIP
- [ ] **Card criado no board** e esta SPEC publicada nele
- [ ] **Aprovação no card (`spec → dev`)** — gate do arquiteto; o código não começa antes

---

*SPEC-054 — método H1VE. A faixa sempre-visível ganha o layout do handoff "Faixa Carreira", aterrada
no dado que já existe, preservando toda a funcionalidade. O menu-hub das 9 telas — e as mecânicas que
a maioria delas pressupõe — são fatias futuras. 100% cliente: `packages/*`/`services/*` intocados.*
