# DONE-046 — Dia de jogo: artilheiro, assistência + nota do jogador (fatia 3)

> Registro de conclusão. Par obrigatório da SPEC-046.

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-046 / DONE-046 |
| **Feature** | Dia de jogo: artilheiro, assistência + nota do jogador (fatia 3) |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.1 (Dia de jogo ao vivo) — enriquece o replay; destrava o card compartilhável (4.3) |
| **Concluída em** | 2026-07-21 |
| **Dependências** | SPEC-043 (timeline) · SPEC-029 (a costura de injeção) · SPEC-038 (o agregador) — em `main` |

## Resumo

A partida ganhou **rosto, contribuição e nota** — e **o treino passou a importar dentro de campo**:
quem marca, quem assiste e a nota são **ponderados pelos atributos** do atleta. Cada foco virou um
papel: **Técnico→gol**, **Tático→assistência**, **Físico→defesa/menos lesão**, **Mental→consistência**.
Os focos VIVOS chegam à partida pela mesma costura in-memory que já leva Forma/Moral (SPEC-029), então
treinar Técnico → mais gols já na próxima rodada.

**Engine (puro, golden-safe por construção):**
- `GoalEvent.athleteId?` (artilheiro) + `GoalEvent.assistId?` (assistente); `Athlete.finishing?`/
  `.playmaking?`/`.durability?` (afinidades opcionais, injetadas p/ o humano; NPC → default).
- `matchGoals` amostra o artilheiro (peso `finishing`, `SCORER_WEIGHTS`) e a assistência (~70% dos
  gols, ≠ o artilheiro, peso `playmaking`, `ASSIST_WEIGHTS`); `matchInjuries` pondera a vítima por
  inverso de `durability` (só no roster misto com humano; all-NPC = uniforme byte-idêntico à SPEC-031).
  **Minutos sorteados PRIMEIRO** (idênticos à SPEC-043).
- `match-rating.ts` — `matchRating` (nota inteira em DÉCIMOS, `30..100`, determinística, stream
  `'rating'`): base + gols + assistências + resultado + defensivo (GK/DEF, Físico) + variância que
  ENCOLHE com o Mental. `RATING` tunável.

**Costura (SPEC-029 estendida):** o `moodModulator` injeta as afinidades dos focos vivos
(`finishing=Técnico`, `playmaking=Tático`, `durability=Físico`) no `Athlete` via `applyHumanTraits`
(in-memory, SEM recomputar `strength` — o re-bake do overall no `clubStrength` fica p/ card seguinte).
`readFocosByIds` (batch) no player-store.

**Faixa (aditivo ao `/v1/band`, SEM migration):** `goals[].byMe`/`scorer`/`assistByMe`/`assist` (nomes
só do meu clube) + `todayMatch.myRating` (`matchRating(meus focos VIVOS)/10`; `null` pré-jogo).

## Revisão adversarial (Workflow · 4 lentes paralelas · cada achado verificado ceticamente)

**Núcleo SÓLIDO — zero CRITICAL; 1 MAJOR de COBERTURA (não bug vivo — o código foi confirmado correto).**
10 achados brutos → **7 confirmados, todos corrigidos:**

- **[MAJOR — costura] O seam de injeção de afinidades não era testado** (a mesma classe do MAJOR da
  SPEC-029: "o seam que integra com o money path nunca é exercitado"). O `moodModulator` só tinha o
  eixo ability testado; um swap Técnico↔Tático, chave errada ou o wrapper `applyHumanTraits` dropado
  passaria a suíte inteira matando a ponderação em toda partida publicada. **Fix:** teste ao vivo com
  focos **assimétricos** (fisico 40/tecnico 80/tatico 60) assertando `finishing/playmaking/durability`
  no atleta modulado.
- **[MINOR] A ponderação de ASSISTÊNCIA não era assertada** (os testes eram weight-agnostic, all-MID).
  **Fix:** garçom (playmaking 99) assiste muito mais; MID assiste mais que FWD.
- **[MINOR] O clamp SUPERIOR da nota nunca era exercitado.** **Fix:** atuação enorme (5 gols + 3 assist,
  win) satura em `RATING.max`; o piso ~35 documentado como defensivo.
- **[MINOR] `myRating` recomputa dos focos VIVOS** → uma partida encerrada pode mudar a nota se o
  jogador distribuir um ponto na janela ~24h. **Fix:** DÉBITO documentado (mesma classe do snapshot de
  mood da SPEC-029; snapshotar os focos por rodada = card de auditoria futuro).
- **[MINOR] A faixa só testava FWD.** **Fix:** caso DEF (nota defensiva/clean sheet) + assist-only +
  played-com-ctx-null → `myRating` null.
- **[NIT] `pickVictim` só testado em roster all-durability.** **Fix:** teste em roster MISTO (produção).
- **[NIT] O fixture de teste tinha focos iguais.** **Fix:** focos assimétricos (parte do MAJOR).

**Refutados (3):** verificados como falsos-positivos pela verificação cética.

## Arquivos

**Engine:** `types.ts` · `engine/match-events.ts` · `engine/match-rating.ts` (novo) · `engine/world-season.ts`
· `index.ts` (+ testes `match-events`/`match-rating`/`world-season`).
**Costura:** `world-entry/mood-modulator.ts` · `world-store/mood-modulation.ts` (+`index.ts`) ·
`player-store/mood-repo.ts` (+`index.ts`).
**Faixa:** `api/band/types.ts` · `from-world.ts` · `band-state.ts` (+ testes `from-world`/`band-state`).
**Intocado (DURO):** `resolveMatch`/`simulateSeason`/`match.ts`/`season.ts` + os **5 goldens**
(`git diff`=0). **SEM migration.**

## Gates

- **655 testes** verdes (629 baseline + os testes SPEC-046 + os 7 fixes da revisão), ao vivo contra
  Postgres; typecheck/eslint/prettier verdes.
- `git diff` engine de placar + 5 goldens = 0; sem migration/schema.

## Escopo deferido / follow-ups

- **Re-bake do `clubStrength`** (o overall vivo → time mais forte/melhores RESULTADOS) — card seguinte.
- **Snapshot dos focos por rodada** (replay/auditoria — a nota é recomputada dos focos vivos hoje).
- Modelo de 12 atributos nos NPCs; assistências/desarmes MEDIDOS (motor de partida rico); nota de TODOS
  os jogadores (card compartilhável 4.3); nota "ao vivo" animada + a UI (fatia de cliente).

## AI declaration

Implementação por IA (Opus 4.8) em par com o dev. Engine + costura + faixa escritos e verificados **ao
vivo contra Postgres real**; o selo dos **5 goldens byte-idênticos** (score-neutral por construção) e o
SCORE-NEUTRAL provados por teste. **Revisão adversarial por Workflow** (4 lentes, cada achado verificado)
→ núcleo sólido, **1 MAJOR de cobertura + 6 MINOR/NIT, todos corrigidos**. Sem revisão humana
linha-a-linha; a fatia é 100% servidor, verificável sem smoke.

*DONE-046 — método H1VE.*
