# DONE-052 — O corpo da faixa: as 3 cenas + o recorte de 3 alturas (fatia 1 de 3)

> Artefato de conclusão do desenvolvimento (par da `SPEC-052`).

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-052 (par da SPEC-052) |
| **Feature** | O corpo da faixa — cenário pixel-art (fatia 1) |
| **Branch** | `feat/gustavo-hartz/o-corpo-da-faixa-as-3-cenas` |
| **Baseline** | `main` @ `399ad4b` |
| **Gates** | typecheck · eslint · `dotnet build` **0 avisos** |
| **Selo** | `packages/*` e `services/*` **intocados** (`git status` = 0); sem migration |
| **Verificação** | harness headless — **12 PNGs** inspecionados + teste de determinismo |

---

## O que foi entregue

A faixa deixou de ser blocos de cor: ganhou **cenário pixel-art** atrás do conteúdo, portado do
handoff do Claude Design (projeto `222a226c`) **por primitivas** — nenhuma dependência nova, nenhum
asset binário (o gotcha que travou a SPEC-051 não se aplica aqui).

- **`ScenePalette.cs`** — a paleta do handoff congelada, com a mesma nomenclatura (`n0..n6`, `or*`,
  `gold*`, `f*`, `clay*`, `dawn*`, `night*`, `wall*`), memoizada por hex. Fonte única, pronta para a
  fatia 2.
- **`PixelCanvas.cs`** — as duas primitivas do design (`R`/`P`) sobre `DrawingContext` + a fonte
  bitmap 3×5 dos dígitos. Escala fixa **4 DIP por pixel lógico**.
- **`SceneRenderer.cs`** — as 4 pinturas no grid 120×28: **CT ao amanhecer** (céu em faixas, sol,
  prédios, alambrado, campo, gol com rede, meia-lua de cal, cones, barro, bola, banco, banca de
  jornal), **pensão** (reboco descascado, janela para a laje, lâmpada, pôster, tábuas, colchão,
  engradado, TV de tubo), **cobertura** (skyline de 18 prédios, lua, sofá, TV de parede, estante de
  troféus, planta, tapete) e **véspera** (arquibancada com torcida, refletores, placas, gramado,
  vestiário, banco, prancheta, mala) com a variação **pré × pós-jogo**.
- **`SceneModel.cs`** — projeta o `BandState` numa `SceneKey` (record). Thin renderer (OP-17).
- **Composição por chave + cache**: o cenário é composto uma vez e reusado; a View assina **só** a
  chave, nunca o `PropertyChanged` genérico.
- **As 3 alturas**: `112 → 28 linhas · 88 → 22 · 64 → 16`, corte **ancorado embaixo**, uma arte só.
  A altura é lida do `config.json` (valores válidos 64/88/112; qualquer outro cai no default).

---

## As 3 correções sobre o handoff (decididas na SPEC)

1. **Determinismo** — os dois `Math.random()` (janelas do prédio no CT, luzes da laje na pensão)
   viraram máscara determinística na mesma densidade. **Provado**: o harness compõe a mesma chave
   duas vezes e compara os bytes → `IDENTICO`.
2. **O placar aceso saiu de cima da linha segura** — estava nas linhas 2-9, acima da faixa segura
   que o próprio handoff define, e **sumia por completo na altura de 64**. Movido para as linhas
   14-21 e desenhado por último. **Provado**: `vespera-pos-vitoria-64.png` mostra o `2 - 1` verde
   inteiro no recorte compacto.
3. **112 DIP em vez de 110** — escala inteira 4× nas três alturas.

Além disso, o placar passou a usar o **placar real** (`goalsFor`/`goalsAgainst`) no lugar dos
literais `2`/`1` do mockup, e o número da camisa vem do contrato.

---

## Bug encontrado durante a implementação

**Ordem de inicialização estática em C#** — `ScenePalette` declarava o dicionário de cache
**depois** dos brushes que o consomem; como inicializadores de campo estático rodam em ordem de
declaração, o primeiro `B(...)` encontrava `Cache` nulo e o type initializer explodia
(`TypeInitializationException`). O harness pegou na primeira execução. Corrigido movendo o cache
para o topo, com comentário explicando por quê — é uma armadilha que se repete.

---

## Verificação (harness headless, técnica da SPEC-049/051)

Um projeto console `net8.0-windows/UseWPF` que **linka os arquivos reais** do cliente e compõe pelo
**mesmo `SceneRenderer`** da faixa. Gerou e eu inspecionei:

- **3 fases × 3 alturas** (CT, pensão, cobertura, véspera-pré em 112/88/64);
- **véspera pós-jogo** em vitória, empate e derrota;
- **véspera pós-jogo em 64** (a prova do fix do placar);
- **determinismo**: duas composições da mesma chave, byte a byte.

O recorte de 64 preserva o essencial em todas as cenas (campo, gol, cones, bola, banco e banca no
CT; piso, colchão e TV na pensão; placar e banco na véspera) — a regra da faixa segura se sustenta.

---

## Limitações conhecidas

- **Kit neutro na véspera**: a camisa pendurada usa o laranja do acento, não as cores do clube —
  as cores indexadas são a fatia 2 (o contrato manda 12 primárias × 12 secundárias e o handoff
  entregou 6 uniformes nomeados).
- **Escada da casa**: 2 cenas para 4 degraus (`0-1 → pensão`, `2-3 → cobertura`), conforme a
  decisão 3. Some quando a arte da quitinete e do apê chegar.
- **Layout compacto (64)**: esta fatia recorta o **cenário**; o que a UI mostra em 64 continua
  como está — decidir o que sobrevive nessa altura é decisão de UI, não de arte.
- **Smoke ao vivo** (a faixa na tela com o cenário + o orçamento `<1% CPU`) = **ação do founder**.

---

## Devolutiva ao designer (pendente de envio — está na SPEC-052 §Devolutiva)

Oito itens, com destaque para: os dois `Math.random()`; o placar acima da própria linha de
segurança; a **3ª barra (FÔLEGO) que não existe no jogo**; o seletor de número 1-99 que contraria a
SPEC-040; o `ESCALAR ⚡` sem dado; e — pela **terceira vez** — a cadência "Tue/Thu/Sat" no `readme`
do design system. Mais o pedido dos **ativos que destravam a fatia 2**: 12+12 cores de kit
indexadas, 16 escudos, as 2 cenas de casa que faltam e o glifo `?`.

---

## Checklist de entrega

- [x] Critérios 1-8 verificados (fases, alturas, determinismo, casa, véspera pré/pós, orçamento,
      degradação, selo)
- [x] `dotnet build` com **0 avisos**
- [x] `packages/*` e `services/*` intocados; **sem migration**; gates TS verdes
- [x] Nenhuma animação contínua introduzida; cenário composto por chave e cacheado
- [ ] `CLAUDE.md` "Estado atual" + `roadmap.md` — a atualizar no fecho
- [ ] AI declaration submetida no card

---

*DONE-052 — método H1VE. A faixa ganhou cara: 4 pinturas pixel-art portadas por primitivas,
determinísticas, recortadas para 3 alturas a partir de uma arte só e cacheadas por chave. 100%
cliente. O avatar é a fatia 2, bloqueada pelos ativos que faltam.*
