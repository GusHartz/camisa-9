# DONE-051 — Arte do momento de escolha (o handoff do Claude Design no replay)

> Artefato de conclusão do desenvolvimento (par da `SPEC-051`).

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-051 (par da SPEC-051) |
| **Feature** | Arte do momento de escolha (faixa · replay) |
| **Branch** | `feat/gustavo-hartz/arte-do-momento-de-escolha` |
| **Baseline** | `main` @ `a64fc4d` (pós SPEC-050) |
| **Testes** | **716** (709 da baseline + 7 novos; ao vivo contra Postgres real) |
| **Gates** | typecheck · eslint · prettier · `dotnet build` **0 avisos** |
| **Selo** | `resolveMatch`/`simulateSeason`/`world-season`/`match-choices.ts` e os **5 goldens byte-idênticos** (`git diff main` = 0) |
| **Migration** | **Nenhuma** |

---

## O que foi entregue

O momento de escolha deixou de ser placeholder e passou a ser o card desenhado no handoff
(projeto `4082c853-b329-4826-b4c5-8568445257da`), no **tratamento 1a** decidido pelo founder.

- **Engine (`match-choice-copy.ts`, novo):** a narrativa dos **16 desfechos** (as 4 opções
  arriscadas com `success` + `fail`; as 8 determinísticas com `na`), no tom do design system
  (*glória com deboche*, segunda pessoa) e com o fracasso **sem punir** — cravado por teste que
  varre a prosa atrás de linguagem punitiva.
- **Servidor (aditivo ao `/v1`):** `resultTitle` / `resultBody` / `moralDelta` na anotação da
  escolha resolvida, hidratados **server-side** do catálogo pelo `result` já persistido e do
  `effect` gravado. A chance do roll e o `effect` bruto continuam server-side.
- **Cliente (`View/ChoiceCard.cs`, novo):** o popup **462px** fiel ao 1a — topo 2px `#E8722A`,
  header `NO LANCE` + minuto, prompt Pixelify em caixa alta, opção segura neutra com selo
  `GARANTIDO`, opção arriscada laranja com chip `⚡ATTR` branco e o micro-texto *"sua Habilidade
  decide"* (varia por atributo) — e os estados **GLÓRIA** (ouro, sombra dura, sprite, `MORAL +N`)
  e **FOI ASSIM** (slate, sprite a 85%, **sem vermelho**). Prompt longo cai a 14px e quebra em 2
  linhas. Animações **one-shot** (entrada 320ms, pop 500ms); **zero timer novo**.

## Verificação (Cenário 1) — harness headless

Recriei o harness da SPEC-049 (STA + `RenderTargetBitmap`) ligando os **arquivos reais** do
cliente (`ChoiceCard.cs`, `CardDraw.cs`, `BandState.cs` + as fontes/mascote embarcados) e exportei
os estados em PNG, que **inspecionei um a um**: ① momento aberto · ③ deu certo · ④ não deu ·
⑤ prompt longo · ⑥ degradação sem prosa. Todos batem com o handoff.

⚠️ **Achado do harness (é do harness, não do app):** a animação de entrada deixa `Opacity = 0` até
o dispatcher tocá-la — num render headless sem message pump o PNG sai **vazio**. O harness congela
as animações no estado final antes de renderizar. Fica registrado porque qualquer verificação
visual futura de elemento animado vai tropeçar no mesmo ponto.

---

## Desvios em relação à SPEC (mecanismo, não produto)

| Item da SPEC | O que foi feito | Motivo |
|---|---|---|
| `MatchChoiceOption` ganha `outcome?`; `match-choices.ts` **modificado** | A narrativa é acessada por **LOOKUP** (`choiceOutcomeText(templateId, optionId, result)`) e o catálogo **não foi tocado** (`git diff` = 0, segue em 287 linhas) | Anexar o campo às 12 opções no literal estouraria as **300 linhas do OP-16**. O lookup ainda dá uma prova de golden-safety mais forte: a geração não muda porque o arquivo dela não muda. |
| `client/.../ChoiceCard.cs` como "o desenho" | Idem, + o popup do XAML virou um `ContentControl` que o code-behind preenche | O card tem 3 formas (oferta / glória / foi assim) com layouts distintos; em XAML seriam 3 DataTemplates com triggers. Em código fica legível e o VM segue sem visual (OP-17). |
| `goat-celebrate.png` embarcado | **NÃO entrou** — a glória usa `goat-idle.png` em opacidade cheia | Ver abaixo. |

---

## ⚠️ Pendência real: o sprite `goat-celebrate.png`

O handoff traz o sprite novo, mas **não consegui transferi-lo**: o `DesignSync` devolve o PNG em
base64 no meu contexto e, ao re-emitir a string (~9.700 chars), ela é elidida — a primeira
tentativa gravou um arquivo **corrompido** (1.918 bytes, IDAT truncado), que detectei validando os
chunks e **removi** em vez de commitar. Nenhum asset quebrado entrou no repo.

**Estado atual:** a moldura da glória está completa (ouro, headline com sombra dura, `MORAL +N`,
pop no sprite) usando o `goat-idle`. **Ação do founder:** exportar `assets/goat/goat-celebrate.png`
do projeto de design para `client/band-wpf/Assets/`, adicionar como `Resource` no `.csproj` e
trocar a linha marcada em `ChoiceCard.BuildOutcome` — é um swap de asset, sem mudança de layout.

---

## Limitações conhecidas

- **Sombra e glow** do handoff (`box-shadow`, `glow-accent`) não têm equivalente barato em WPF: a
  sombra do texto virou **texto-fantasma deslocado 2px** (sem blur) e o glow do botão foi omitido —
  o peso visual vem da cor sólida, como no card de partida (precedente SPEC-049).
- A **faixa** do mockup (sprite, badge de posição, placar `GOA×BXD`, `AO VIVO`, `SUA NOTA`) segue
  **intocada** — é o handoff de arte da faixa, fora deste card por decisão da SPEC.
- **Smoke ao vivo** (o momento abrindo no minuto durante o replay real, o clique, o orçamento
  `<1% CPU`) = **ação do founder** — aqui a verificação foi build + render headless.

---

## Devolutiva ao designer (segue pendente de envio)

Está na SPEC-051, §Devolutiva — em especial: **o `readme` do design system ainda diz "Tue/Thu/Sat
at 15h"** (falso desde o R4 FINAL: diário 7/7). Confirmei também camisa **10**; a narrativa de
desfecho foi adotada (virou dado de catálogo, exigiu fatia de servidor); o `+0.4` na nota não
existe como mecânica e virou `MORAL +N`; e o `ng-pulse` infinito não passa no orçamento de CPU.

---

## Checklist de entrega

- [x] Critérios 1-7 verificados (fidelidade por PNG, desfechos, degradação, orçamento, selo)
- [x] Testes criados e passando — **716**, ao vivo contra Postgres real
- [x] Typecheck / lint / prettier limpos
- [x] `dotnet build` com **0 avisos**
- [x] Nenhum `any`, nenhum segredo, nenhuma animação contínua
- [x] Engine de simulação e os **5 goldens** byte-idênticos; **sem migration**
- [ ] `CLAUDE.md` "Estado atual" + `roadmap.md` — a atualizar no fecho
- [ ] AI declaration submetida no card

---

*DONE-051 — método H1VE. O momento de escolha vestido: tratamento 1a, desfechos narrados vindos do
catálogo, `MORAL +N` no lugar do delta de nota inventado. Sem migration; engine e goldens
intocados; sprite de comemoração pendente de export (ação do founder).*
