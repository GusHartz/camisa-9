# Design record — Atributos & evolução (treino)

> **Não é uma SPEC ainda.** É o registro de design co-desenhado com o founder (2026-07-16) durante a
> SPEC-016. Vira a base da SPEC do **card 13 "Atributos e evolução"** (+ card 9 "Treino com banking")
> quando esse card for iniciado no board. A **SPEC-016 (conta + criação)** planta só a fundação:
> os 4 focos, a régua 0..99, a primitiva de alocação e o campo `training_xp` (o seam da barra).
> A **matemática abaixo é do card 13** — não implementar na SPEC-016.

> **✅ IMPLEMENTADO na SPEC-017 (2026-07-16).** Decisões travadas com o founder ao iniciar o card 13:
> **(1) Model A — barra ÚNICA + ponto LIVRE** (o que o record descreve): o FOCO do dia multiplica a
> TAXA (seam neutro em v1); barra cheia → +1 flutuante gasto em qualquer foco (`applyPoint`, teto 99);
> o limiar cresce com o overall (curva de 3 zonas). Efeito colateral aceito: um 99 num foco isolado
> sai mais barato. **(2) DLC + idade = seams neutros e adiados** (`speedMultiplierPct`/`ageFactorPct`
> = 100). **(3) Refinamentos de mecanismo:** a curva é **inteira/piecewise** (o guardrail proíbe
> `exp`/`pow`); o gasto usa `applyPoint` (+1, teto 99), **não** a `allocateAttributes` (que é trava de
> criação, soma===136). Ver `specs/SPEC-017-atributos-e-evolucao.md` / `DONE-017`.

## Modelo de atributos (fundação plantada na SPEC-016)

- **4 focos:** Físico · Técnico · Tático · Mental — os mesmos FOCOs de treino do R4 FINAL (criação e evolução falam a mesma língua).
- **Escala 0..99** por foco. `overall = média(4 focos)` (o mapa `ability = f(focos, posição)` para quando o atleta entra no mundo — card 21 — é ponderado por posição; fora de escopo aqui).
- **Criação (point-buy):** `piso 20 · pool 56 · teto de criação 50` → overall ~34 = fundo da banda várzea (tier 4 = `34..66` no `world-engine`). Nasce cru; a carreira é a subida.

## Progressão por treino (CARD 13 — a implementar)

- **Barra de XP única** (por atleta, não por foco). O treino diário deposita XP; quando a barra enche → **+1 ponto livre** para o jogador distribuir **onde quiser** (até 99). Reusa a primitiva `allocateAttributes` da SPEC-016, agora com +1.
- **A barra cresce a cada ponto ganho** (retornos decrescentes) → chegar ao 99 é grind, nunca brinde.

### Curva de 3 zonas (feeling alvo)

| Zona | Faixa | Ritmo |
|---|---|---|
| Início | várzea → ~60 | ~1 ponto a cada 2–4 treinos (rápido — as primeiras semanas dão gosto, ninguém desanima) |
| Meio | ~60 → ~85 | ~1 a cada ~8 treinos (compromisso de meses) |
| Elite | ~85 → 99 | ~1 a cada 15+ treinos (o grind orgulhoso — **DLC acelera aqui**) |

### Envelope da carreira (âncoras do engine)

- Entra aos **17**, aposenta aos **35** (`WORLD.youthAge`/`retirementAge`) → 18 temporadas de teto, MAS pico real ~27–30 e depois declínio (o engine já envelhece/aposenta) → janela de crescimento efetiva ~17→~28.
- Temporada = 38 rodadas ≈ 6 semanas ≈ ~40 dias de treino → **~720 sessões** numa carreira inteira.
- **Alvo (calibração de LENDA — decidido pelo founder na SPEC-019):** com os tunáveis atuais (`sessionXp 100`, limiares 300/800/1500), uma carreira **dedicada** (~720 sessões, rotacionando o foco) chega a **~overall 72**; **85+ é grind de LENDA** (multi-carreira, ~1112+ sessões), coerente com "da várzea às lendas". **99 num foco isolado** é a cauda brutal (~195 sessões nele). *(O antigo "carreira → ~85" era incompatível com os ritmos 3/8/15 — corrigido aqui; a curva/limiares ficam intactos.)*
- **FOCO do dia = viés de taxa (SPEC-019):** treinar o **mesmo** foco em dias consecutivos aplica **rendimento decrescente** (degraus com piso — `focusRepeatStepPct`/`focusRepeatFloorPct`); rotacionar rende **100%** (o teto = o pace acima). Sem escolha, o **técnico treina o foco mais baixo**. O ponto segue **flutuante** (o build é o gasto, não o treino — Model A).

## DLC — "tempo, não poder" (decisão de valores do founder)

O charter posiciona o jogo **contra** monetização odiada e **a favor** de justiça/cooperação. Para o DLC de progressão não virar pay-to-win:

- O DLC **acelera a cauda 85→99** (compra *velocidade* que qualquer um alcançaria grindando), **nunca** um teto exclusivo ou atributo só-de-quem-paga.
- Alternativa/complemento: DLC de **prestígio/cosmético pós-99**.
- **Princípio:** o free chega ao 99. O pago chega mais rápido. Poder igual, tempo diferente.

## Ganchos para a SPEC do card 13

- Reusar `packages/player` (`allocateAttributes`) para gastar o +1.
- Ler/escrever `athlete.training_xp` (o seam já criado na SPEC-016).
- Definir: XP por sessão de treino, papel do FOCO escolhido (multiplica a barra? enviesa o ponto?), a fórmula de crescimento da barra, o soft-cap, e a mecânica do DLC.
- Interação com idade/declínio (card 21/lifecycle do engine).
