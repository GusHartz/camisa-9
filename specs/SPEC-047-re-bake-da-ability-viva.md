# SPEC-047 — Re-bake da ability viva: o treino fortalece o TIME (resultados)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-047 |
| **Feature** | Re-bake da ability viva — o treino fortalece o TIME (resultados) |
| **Slug** | re-bake-da-ability-viva-o-treino-fortalece-o-time-resultados |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 2.3/3.1 — fecha o débito de re-bake (SPEC-021/029/046): o overall vivo dirige o `clubStrength` |
| **Appetite** | 8 dias |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-21 |
| **Aprovada em** | {preencher após aprovação} |
| **Aprovada por** | {preencher após aprovação} |
| **Status** | Rascunho |

---

## Objetivo

O treino passa a fortalecer o **TIME**, não só os números pessoais: o `moodModulator` deixa de usar a
ability **CONGELADA** na entrada (SPEC-020) como base da modulação e passa a usar o **overall VIVO** do
humano (`abilityFromFocos` dos focos atuais) — então evoluir os atributos deixa o `clubStrength` maior e
rende **melhores resultados** na partida. Fecha o débito de re-bake sinalizado desde a SPEC-021/029/046.

---

## Contexto e motivação

Hoje o humano tem DOIS caminhos de "o mundo me vê":
- **A ability escalar** (base do `clubStrength` → o PLACAR): **CONGELADA** na entrada (SPEC-020,
  `world_occupation.ability`), modulada só por **Forma/Moral** (SPEC-029) — o treino **não** a atualiza.
- **As afinidades de papel** (quem marca/assiste + a nota, SPEC-046): já usam os focos **VIVOS**.

Resultado: treinar melhora os SEUS eventos/nota (SPEC-046), mas **não** os RESULTADOS do time — o
overall que evolui não chega ao `clubStrength`. Esse é o débito nomeado desde a SPEC-021 ("o re-baker do
`ability` na virada") e SPEC-029/046. Este card fecha o loop **treino → time mais forte → mais vitórias**,
com uma mudança **cirúrgica** (a base do `effectiveAbility` no `moodModulator`), reusando o que a
SPEC-046 já lê (`readFocosByIds`) e a fn que a SPEC-020 usou para congelar (`abilityFromFocos`).

**100% servidor, in-memory, SEM migration; golden-safe por construção** (os goldens são all-NPC → sem
ocupação → sem modulação → byte-idênticos). ⚠️ **Muda o placar das rodadas HUMANAS** — é o objetivo,
intencional e documentado.

---

## Escopo — o que está DENTRO

- [ ] `services/world-entry/src/mood-modulator.ts`: a base da ability efetiva passa de `o.ability`
  (congelada) para **`abilityFromFocos(focosVivos, o.position)`** (o overall vivo — a MESMA fn que a
  SPEC-020 usou para congelar, agora com os focos atuais). Reusa o `focos` já lido (`readFocosByIds`,
  SPEC-046). **Fallback** ao congelado `o.ability` se os focos faltarem (robustez). As afinidades
  (SPEC-046) seguem iguais.
- [ ] Testes (`mood-modulator.test.ts`): provar que o **overall VIVO** dirige a ability/força — treinar
  (mudar os focos) DEPOIS da entrada muda a ability efetiva e o `clubStrength` (a base congelada **não**
  é mais usada quando os focos diferem); um humano mais forte → clube mais forte que a base congelada;
  o fallback (sem focos) cai no congelado; sem humano → no-op.

---

## Escopo — o que está FORA

- **Persistir/atualizar a `world_occupation.ability` congelada** — ela permanece como registro de
  ENTRADA/auditoria e fallback; o re-bake é **in-memory** (não reescreve o snapshot). Sem migration.
- **Snapshot da ability por rodada** (replay/auditoria): a rodada humana passa a depender dos focos
  vivos no momento da simulação → não é recomputável só do snapshot congelado. É o MESMO débito da
  SPEC-029 (mood) / SPEC-046 (nota) — card de auditoria futuro.
- **Calibração/balance** (um humano evoluído dominar o tier): o overall é capado em 99 e a modulação de
  Forma/Moral é ±12%; ajuste fino de balance é tunável/futuro, não desta fatia.
- **Tocar o engine, o placar puro ou os goldens** — `applyMoodToWorld` já recomputa `clubStrength`; nada
  no `packages/world-engine` muda.
- **A viragem** (re-bake da ability na virada de temporada, SPEC-021): esta fatia é o re-bake **da
  partida diária**; a ability persistida na viragem é outro caminho (fora).

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `services/world-entry/src/mood-modulator.ts` | modificar | Base do `effectiveAbility` = `abilityFromFocos(focosVivos, position)` (overall vivo), fallback ao congelado. |
| `services/world-entry/test/mood-modulator.test.ts` | modificar | Provar que o overall VIVO dirige ability/força; fallback; treinar-pós-entrada muda o resultado. |
| `specs/SPEC-047-...md` / `specs/DONE-047-...md` | criar | Esta SPEC + o DONE. |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema. O re-bake é **in-memory** (o `moodModulator` já lê `readFocosByIds` da
SPEC-046). A `world_occupation.ability` congelada permanece (entrada/fallback). **Sem migration.**

---

## Mudanças de API (se aplicável)

Nenhuma mudança de API. Nenhuma rota, nenhum contrato `/v1`. O efeito (melhores resultados) aparece no
`todayMatch`/tabela que a faixa **já** lê (SPEC-038/044/046).

---

## Critérios de aceitação

**Cenário 1 — o overall VIVO dirige a ability efetiva**
- Dado um humano no mundo com forma/moral neutras (50/50)
- Quando os focos vivos dele sobem (treino) DEPOIS da entrada
- Então a ability efetiva no mundo modulado = `effectiveAbility(abilityFromFocos(focosVivos), 50, 50)`
  (o overall vivo, **não** o congelado da entrada).

**Cenário 2 — o time fica mais forte com o treino**
- Dado um humano que evoluiu acima da ability congelada de entrada
- Quando o `moodModulator` roda
- Então o `clubStrength` do clube dele é MAIOR que com a base congelada (a força reflete o treino).

**Cenário 3 — fallback e no-op**
- Dado um humano sem linha de focos (borda) → a base cai no congelado `o.ability` (sem crash);
- E um mundo SEM humanos → o modulador é no-op (mundo NPC deep-equal).

**Cenário 4 — o selo (golden-safe)**
- Dado o build completo
- Então `packages/world-engine` + os 5 goldens são byte-idênticos (`git diff` = 0); sem migration; os
  testes NPC não mudam.

---

## Segurança (se aplicável)

Sem superfície de segurança nova. Leitura in-memory dos focos do próprio ocupante (autorizado por
construção). Sem input externo.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Muda o placar das rodadas humanas (money path) | Alta (intencional) | É o OBJETIVO; goldens all-NPC intactos (o selo DURO se mantém); documentado. |
| Um humano evoluído domina o tier (balance) | Média | Overall capado em 99; modulação ±12%; balance é calibração/futuro, não corretude. |
| A rodada humana deixa de ser recomputável do snapshot congelado | Média | MESMO débito da SPEC-029/046 (mood/nota); snapshot por rodada = card de auditoria futuro. |
| O teste da SPEC-029 fica ambíguo (frozen==live quando focos não mudam) | Baixa | Atualizar o teste: mudar os focos pós-entrada → provar que a LIVE dirige (frozen ≠ live). |

**Dependências:** SPEC-046 (`readFocosByIds` + a costura de afinidades) · SPEC-029 (o `moodModulator`) ·
SPEC-020 (`abilityFromFocos` + a ability congelada) — todas em `main`.

---

## Notas de implementação

- **Mudança cirúrgica:** no loop do `moodModulator`, a base do `effectiveAbility` vira
  `f ? abilityFromFocos(f, o.position) : o.ability` (o `f` é o focos já lido pela SPEC-046; `o.position`
  vem do `OccupationView`). `abilityFromFocos` é a fn que a SPEC-020 usou para congelar → o re-bake é o
  análogo VIVO (pesos por posição neutros hoje, mas consistente quando virarem específicos).
- **Golden-safe:** `applyMoodToWorld` já recomputa `clubStrength` do roster modulado; nada no engine
  muda. Goldens all-NPC (sem ocupação) → sem override → byte-idênticos. Provar com `git diff`.
- **Teste do seam (lição SPEC-029/046):** exercitar o caminho que chega ao money path — treinar o humano
  (mudar focos) DEPOIS da entrada e assertar que a ability/força modulada segue os focos VIVOS, com
  valores DISTINTOS do congelado (senão frozen==live não distingue).
- **Revisão adversarial** por Workflow (lentes: a corretude do re-bake + golden-safety · a costura/seam ·
  balance/edge), cada achado verificado.

---

## Checklist de aprovação

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora)
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas (nenhuma)
- [ ] Critérios de aceitação são testáveis
- [ ] A mudança de comportamento do money path (placar humano) está aceita e é intencional
- [ ] Appetite é razoável para o escopo definido

---

*SPEC-047 — método H1VE. O treino fortalece o TIME: o `moodModulator` passa a usar o overall VIVO
(`abilityFromFocos` dos focos atuais) como base do `effectiveAbility`, no lugar do congelado → evoluir
deixa o clube mais forte e rende melhores resultados. 100% servidor, in-memory, SEM migration, engine e
os 5 goldens INTOCADOS. Fecha o débito de re-bake da SPEC-021/029/046.*
