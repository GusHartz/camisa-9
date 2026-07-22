# SPEC-051 — Arte do momento de escolha (o handoff do Claude Design no replay)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-051 |
| **Feature** | Arte do momento de escolha (faixa · replay) |
| **Slug** | arte-do-momento-de-escolha |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.2 / 3.4 — veste com arte o overlay entregue estrutural na SPEC-050 |
| **Appetite** | 7 dias |
| **Prioridade** | MEDIUM |
| **Status** | Rascunho — ⚠️ **CARD AINDA NÃO EXISTE NO BOARD** (ver §Bloqueio de processo) |

---

## Objetivo

A SPEC-050 entregou o momento de escolha **funcionando e feio**: chips cinza, prompt em texto
corrido, marcação da opção arriscada como `⚡TEC` colado no rótulo — placeholder assumido. O
Claude Design devolveu o handoff (`Momento de Escolha.dc.html`, projeto
`4082c853-b329-4826-b4c5-8568445257da`) com **3 tratamentos** da marcação da aposta e **6 estados**
desenhados. Esta SPEC **veste** o overlay com o tratamento escolhido e entrega os **estados de
desfecho** que hoje não existem.

---

## ⚠️ Bloqueio de processo (ler antes de aprovar)

**Não há card no board para esta frente.** Os dois cards do 3.2 estão fechados (SPEC-048 em
`qa_data`, SPEC-050 em `main`). Pelo ritual do CLAUDE.md, o código só começa com o card em `dev` e
a SPEC aprovada **no card**. Ação necessária do founder: **criar o card** ("Arte do momento de
escolha") e aprovar esta SPEC nele. Enquanto isso não acontece, este arquivo é rascunho.

---

## ⚠️ O achado que muda o escopo: o design pede conteúdo que o servidor não tem

Os estados ③ (deu certo) e ④ (não deu) do handoff mostram **narrativa por desfecho**:

- ③ headline `A RIVAL CALOU.` + corpo *"Dancinha na cara da torcida. Golaço assinado, craque."*
- ④ headline `ZAGUEIRO VOOU NO CANTO.` + corpo *"Peitou a jogada e não foi dessa vez. Faz parte — o próximo é seu."*

Hoje o servidor devolve **apenas** `result: 'success' | 'fail' | 'na'`. **Não existe** texto de
desfecho em lugar nenhum — nem no catálogo `MATCH_CHOICES` (que só tem `prompt` e `label`), nem no
contrato `/v1`. Implementar o design **fielmente exige fatia de servidor**; implementar só no
cliente exigiria inventar a prosa no C#, o que joga conteúdo de gameplay para o renderizador
(contra o padrão de fonte-única do repo, onde todo texto de gameplay vive na lib pura).

**Segundo achado, menor:** o estado ③ mostra `NOTA 8.7 · +0.4` — um **delta de nota causado pela
escolha**. Essa mecânica **não existe**: o efeito da escolha é `moral` (e o `focusBias`), nunca a
nota — a nota é função dos atributos e dos eventos da partida (SPEC-046). Ou se cria a mecânica
(mudança de regra de jogo, não de arte), ou o card mostra o efeito real. **Recomendo mostrar o
efeito real** (ex.: `MORAL +6`), preservando a intenção visual do design sem inventar regra.

---

## Decisões que o founder precisa travar

1. **Qual tratamento da aposta** — o designer recomenda **1a** ("aposta acesa": botão laranja
   sólido + chip `⚡ TEC` + micro-texto *"sua Habilidade decide"*), e desenhou os 6 estados com
   ele. Alternativas: **1b** (dois pesos iguais, ícone de dado vs ✓ — a arriscada não parece "a
   recomendada") e **1c** ("O TÉCNICO PEDE", laranja suave). **Recomendo 1a**, que é o que está
   desenhado por inteiro.
2. **Fidelidade dos estados de desfecho** — **(A)** narrativa no catálogo (fatia de servidor,
   fiel ao design) ou **(B)** só a moldura (ouro "GLÓRIA" / slate "FOI ASSIM" + sprite) com texto
   genérico, sem prosa por opção. **Recomendo (A)**: é aditivo, barato e é o que dá alma ao
   momento — sem a prosa, o estado ③/④ vira uma caixa colorida.
3. **O delta na nota** — substituir por `MORAL +N` (recomendado) ou criar a mecânica de nota
   (fora desta SPEC).

---

## Escopo — o que está DENTRO

### A. Engine (`packages/world-engine`, puro — só DADO, golden-safe)

- `MatchChoiceOption` ganha **`outcome?`**: `Partial<Record<'success'|'fail'|'na', { title, body }>>`
  — a narrativa por desfecho, PT-BR, no mesmo lugar onde já vivem `prompt`/`label`.
- Preencher as **12 opções** do catálogo: as 4 arriscadas com `success` + `fail`; as 8
  determinísticas com `na`. Tom do design system: *glória com deboche*, segunda pessoa, e no
  fracasso **sem punir** ("faz parte — o próximo é seu"), coerente com o anti-culpa do charter.
- **Golden-safety pela mesma prova do `risky` (SPEC-050):** é dado carregado nas opções; não toca
  trigger/rank/`minuteOf`/consumo de RNG. O teste de regressão por strip cobre (estender o strip
  para remover `outcome` também).

### B. Servidor (`services/api` — aditivo ao `/v1`, SEM migration)

- `BandMatchChoice` ganha `resultTitle?` / `resultBody?`, hidratados **server-side** do catálogo
  pelo `result` já persistido — presentes só quando a escolha está anotada (junto de
  `chosenOptionId`/`result`). Política aditiva-only preservada.
- `moralDelta?: number` na anotação (o `moral` do `effect` gravado) — o insumo do "MORAL +6" que
  substitui o delta de nota inventado. Sai da linha `match_choice.effect` que já existe.

### C. Cliente (`client/band-wpf` — o grosso)

- **Espelho** dos 3 campos novos (aditivo/tolerante, defaults null).
- **Popup redesenhado no tratamento 1a**, fiel ao spec (medidas do handoff): largura **462**,
  fundo `#1B2440` (`surface-raised`), borda 1px `rgba(255,255,255,.08)`, **borda superior 2px
  `#E8722A`**, cantos 4px só no topo, ancorado colado no topo da faixa.
  - **Header** (padding 6/12, divisória embaixo): `NO LANCE` — Pixelify 9px, tracking .06em,
    `#E8722A` — e o **minuto** à direita (Silkscreen 10px, `#6B769A`).
  - **Prompt**: Pixelify 15px, tracking .02em, line-height 1.15, CAIXA ALTA, `#EAF0FF`.
  - **Opção segura**: fundo `#232F52`, borda 1px `#3D4E80`, raio 4, padding 9/11; rótulo Segoe UI
    13px/600 `#EAF0FF`; selo **`GARANTIDO`** (Pixelify 8px, `#8A93B4`, fundo `rgba(255,255,255,.06)`,
    raio 2).
  - **Opção arriscada**: fundo `#E8722A`, sem borda, raio 4; rótulo 13px/600 `#2A1405`; chip
    **`⚡ TEC`** (Pixelify 8px, texto `#E8722A` sobre `#FFFFFF`, raio 2) + micro-texto
    *"sua Habilidade decide"* (9px, `rgba(42,20,5,.72)`). O texto do micro varia por atributo
    (Habilidade/Físico/Tático/Cabeça — mapa a fechar com o founder).
- **Estado ③ "deu certo"**: borda superior 2px `#E8C168`, header `GLÓRIA` em ouro, sprite
  **`goat-celebrate.png`** 52px, headline Pixelify 16px ouro com sombra dura `#A87E2C`, corpo 12px
  `#A9B4D0`, e a coluna à direita com o efeito real (`MORAL +6`).
- **Estado ④ "não deu"**: borda superior 2px `#5A648A`, header `FOI ASSIM` em `#8A93B4`, sprite
  `goat-idle.png` 50px a 85% de opacidade, headline 15px `#EAF0FF`, corpo 12px. **Sem vermelho.**
- **Estado ⑤ prompt longo**: prompt cai para 14px e quebra em 2 linhas; os selos ancoram na base
  do botão (o popup cresce ~20px, não mais).
- **Asset novo**: `goat-celebrate.png` (do projeto de design) embarcado como `Resource`, render
  com `NearestNeighbor` (pixel art nunca interpolada).
- **Movimento** (one-shot, nunca contínuo): entrada `ng-rise` (opacidade + 8px, 320ms,
  ease-out) e `ng-pop` no sprite da glória (500ms, bounce). Storyboard em `Opacity`/
  `RenderTransform` — nunca layout por frame.

---

## Escopo — o que está FORA

- ⚠️ **A FAIXA que aparece no mockup** (sprite do bode, badge de posição, placar `GOA 2×1 BXD`,
  pulso `AO VIVO`, painel `SUA NOTA`) — é uma **proposta de redesenho da faixa inteira**, não deste
  card. Isso é o handoff de arte da faixa (3 cenas / avatar / 3 alturas). **Nada disso entra aqui**;
  a faixa atual fica como está.
- O **pulso infinito** do `AO VIVO` (`ng-pulse` 1.1s em loop) — animação contínua conflita com o
  orçamento `<1% CPU` de uma janela aberta 8h/dia. Se entrar algum dia, entra com medição.
- Os tratamentos **1b/1c** (só o escolhido é implementado).
- A mecânica de **nota alterada pela escolha** (ver decisão 3).
- `crown.svg` / `crown-mono.svg` — WPF não carrega SVG; a coroa já existe desenhada por retângulos
  (SPEC-049) e não é usada neste overlay.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição |
|---|---|---|
| `packages/world-engine/src/engine/match-choices.ts` | modificar | `outcome?` no tipo + as 12 narrativas no catálogo. |
| `packages/world-engine/src/engine/match-choices.test.ts` | modificar | Invariante: toda opção tem a narrativa do(s) desfecho(s) que pode produzir; strip estendido. |
| `services/api/src/band/types.ts` · `from-world.ts` | modificar | `resultTitle`/`resultBody`/`moralDelta` na anotação (aditivo). |
| `services/api/test/{band-state,from-world}.test.ts` | modificar | Anotação hidratada + omissão quando pendente. |
| `client/band-wpf/Api/BandState.cs` | modificar | Espelho dos 3 campos. |
| `client/band-wpf/View/ChoicePopup.cs` (ou XAML dedicado) | criar | O popup 1a + os estados ③/④/⑤. |
| `client/band-wpf/MainWindow.xaml(.cs)` · `View/BandViewModel.cs` | modificar | Troca do popup placeholder; estado do desfecho. |
| `client/band-wpf/Assets/goat-celebrate.png` · `BandClient.csproj` | criar/modificar | Sprite novo como `Resource`. |
| `specs/SPEC-051-…md` / `specs/DONE-051-…md` | criar | Esta SPEC + o DONE. |

---

## Mudanças de schema

**Nenhuma. Sem migration.** A narrativa é dado do catálogo (lib pura) hidratado na leitura; o
`moralDelta` sai do `effect` jsonb que a SPEC-050 já grava.

---

## Critérios de aceitação

**Cenário 1 — fidelidade ao handoff:** o popup renderizado bate com o tratamento 1a em largura
(462), cores (HEX acima), tipografia (famílias/tamanhos/tracking) e espaçamentos; verificado sem
GUI pelo **harness headless** (STA + `RenderTargetBitmap`) que a SPEC-049 já estabeleceu — renderiza
os estados ①③④⑤ para PNG e eu inspeciono cada um.

**Cenário 2 — os desfechos:** responder uma arriscada com sucesso → estado ③ com a narrativa
`success` da opção + `MORAL +N` real; com falha → estado ④ com a narrativa `fail`, **sem vermelho**;
responder uma determinística → o desfecho `na`. A prosa vem do servidor — o cliente não tem
tabela de texto.

**Cenário 3 — degradação:** payload sem os campos novos (servidor antigo) → o cliente cai no
feedback genérico atual sem quebrar; opção sem `outcome` no catálogo → moldura sem prosa.

**Cenário 4 — orçamento e OP:** nenhuma animação contínua; `dotnet build` 0 avisos; a faixa fora do
replay inalterada; OP-17 preservado (o cliente não decide desfecho — recebe `result` pronto).

**Cenário 5 — o selo:** `resolveMatch`/`simulateSeason`/`world-season` e os **5 goldens
byte-idênticos**; sem migration; gates TS verdes.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Escopo vazar para o redesenho da faixa inteira | **Alta** (o mockup mostra a faixa) | Explicitamente FORA; a faixa atual não é tocada. |
| Sombra/glow do design (box-shadow, glow duplo) sem equivalente em WPF | Média | Aproximar com camadas de borda/retângulo; onde não der, documentar o desvio no DONE. |
| Prosa de desfecho inflar o catálogo (12 opções × 2 textos) | Baixa | É dado, não lógica; o arquivo já está a 287 linhas (OP-16) → a narrativa vai para `match-choice-copy.ts`. |
| Fontes substitutas (o design system marca Pixelify/Silkscreen como stand-in) | Baixa | Já embarcadas sob OFL desde a SPEC-049; troca futura é swap de asset. |

**Dependências:** SPEC-050 (o overlay funcional, em `main`) · SPEC-049 (fontes + harness headless).

---

## Devolutiva ao designer (enviar junto da resposta)

1. ⚠️ **O `readme` do design system ainda diz que o mundo joga "Tue/Thu/Sat at 15h".** É **falso**
   desde o R4 FINAL: **todo dia, 7/7, às 15h**. Já sinalizado uma vez; enquanto não corrigir, todo
   mockup novo nasce com o mesmo drift.
2. **Camisa: 10** (a pergunta do readme). O codinome do repo é `camisa-9`, mas a identidade
   ratificada é o bode coroado de **camisa 10**.
3. **A narrativa de desfecho é ótima e foi adotada** — mas exigiu fatia de servidor (o texto vira
   dado de catálogo). Se produzir mais momentos, mande sempre os pares sucesso/fracasso.
4. **O `+0.4` na nota não existe como mecânica** — a escolha mexe na moral, não na nota. Trocado
   por `MORAL +N`.
5. **`ng-pulse` infinito no "AO VIVO" não passa** no orçamento de <1% CPU para uma janela aberta o
   dia inteiro. Movimento one-shot (rise/pop) está aprovado.

---

## Checklist de aprovação

- [ ] **Card criado no board** e esta SPEC publicada nele
- [ ] Decisão 1 — tratamento **1a** (recomendado) / 1b / 1c
- [ ] Decisão 2 — narrativa no catálogo **(A, recomendado)** / só moldura (B)
- [ ] Decisão 3 — `MORAL +N` (recomendado) / criar mecânica de nota (fora) / omitir
- [ ] Objetivo, escopo dentro/fora e arquivos conferidos
- [ ] Critérios de aceitação testáveis

---

*SPEC-051 — método H1VE. Veste o momento de escolha (SPEC-050) com o handoff do Claude Design:
tratamento 1a, estados de desfecho com narrativa vinda do catálogo, sprite de comemoração. Sem
migration; engine de simulação e os 5 goldens intocados; a faixa fora do replay não é tocada.*
