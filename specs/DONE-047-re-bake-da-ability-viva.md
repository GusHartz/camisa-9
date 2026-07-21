# DONE-047 — Re-bake da ability viva: o treino fortalece o TIME (resultados)

## Metadados
| Campo | Valor |
|---|---|
| **Número** | SPEC-047 / DONE-047 |
| **Owner** | gustavo-hartz (dev) |
| **Concluída em** | 2026-07-21 |
| **Roadmap** | 2.3/3.1 — fecha o débito de re-bake (SPEC-021/029/046) |
| **Dependências** | SPEC-046 (`readFocosByIds`) · SPEC-029 (`moodModulator`) · SPEC-020 (`abilityFromFocos`) — em `main` |

## Resumo

O treino passou a fortalecer o **TIME**, não só os números pessoais: o `moodModulator` deixou de usar a
ability **CONGELADA** na entrada (SPEC-020) como base da modulação e passou a usar o **overall VIVO**
(`abilityFromFocos` dos focos atuais — a MESMA fn que a SPEC-020 usou para congelar) → evoluir os
atributos deixa o `clubStrength` maior e rende **melhores RESULTADOS**. Fecha o débito de re-bake nomeado
desde a SPEC-021/029/046. **Mudança cirúrgica** (a base do `effectiveAbility`), reusando o `readFocosByIds`
(SPEC-046) e o `abilityFromFocos` (SPEC-020).

**100% servidor, in-memory, SEM migration.** A `world_occupation.ability` congelada permanece (registro
de entrada + fallback). `applyMoodToWorld` já recomputava o `clubStrength` → o engine e os 5 goldens
ficam INTOCADOS (goldens all-NPC → sem ocupação → sem modulação). ⚠️ **Muda o placar das rodadas
HUMANAS** (intencional); humanos não-treinados têm overall vivo == congelado → **zero regressão** (656
testes verdes o confirmam).

## Revisão adversarial (Workflow · 2 lentes · cada achado verificado)

**Núcleo SÓLIDO — zero CRITICAL/MAJOR** (a corretude do re-bake confirmada). 2 MINOR, ambos corrigidos:
- **[MINOR — corretude] O cast `o.position as Position` virou superfície de crash.** A coluna
  `world_occupation.position` é `text` sem CHECK; pré-SPEC-047 a posição era inerte no modulador, agora
  `abilityFromFocos(f, o.position)` a torna load-bearing — uma posição corrompida → `positionWeights`
  undefined → TypeError → a rodada do MUNDO INTEIRA cai (sem isolamento, antes do publish). Não alcançável
  hoje (os writers validam via `isPosition`), mas o raio é mundial. **Fix:** `isPosition(o.position)` guarda
  em vez do cast + fallback ao congelado `o.ability`.
- **[MINOR — seam] O efeito no placar PUBLICADO não era testado end-to-end via o modulador real** (a 3ª
  vez da lição SPEC-029/046: as duas metades eram testadas, a composição não). **Fix:** teste ao vivo —
  entra um humano, publica a rodada 1 (baseline), TREINA os focos para 99, limpa a rodada e republica →
  assert que o placar do clube do humano MUDOU (o treino chega ao RESULTADO publicado).

## Arquivos
- `services/world-entry/src/mood-modulator.ts` (a base do `effectiveAbility` = overall vivo, guardada por
  `isPosition`) · `services/world-entry/test/mood-modulator.test.ts` (re-bake in-memory + end-to-end).
- **Intocado (DURO):** `packages/world-engine` + os **5 goldens** (`git diff`=0). **SEM migration.**

## Gates
- **657 testes** verdes (656 da rodada anterior + o end-to-end da revisão), ao vivo contra Postgres;
  typecheck/eslint/prettier verdes. **Zero regressão** no placar (humano não-treinado: vivo==congelado).
- `git diff` engine + 5 goldens = 0; sem migration/schema.

## Escopo deferido
Snapshot da ability por rodada (replay/auditoria — a rodada humana passa a depender dos focos vivos no
momento da simulação; mesma classe do débito de mood/nota SPEC-029/046) · calibração/balance (um humano
evoluído dominar o tier — overall capa em 99; ajuste é futuro) · o re-bake na VIRAGEM (a ability persistida
na virada de temporada, SPEC-021).

## AI declaration
Implementação por IA (Opus 4.8) em par com o dev; verificada **ao vivo contra Postgres** (in-memory +
end-to-end publicado); 5 goldens byte-idênticos. Revisão adversarial por Workflow (2 lentes) → núcleo
sólido, 2 MINOR corrigidos (crash-surface da posição; seam end-to-end). Sem revisão humana linha-a-linha;
100% servidor, verificável sem smoke.

*DONE-047 — método H1VE.*
