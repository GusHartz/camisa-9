# DONE-022 — Regen: renascimento de carreira + Hall of Fame

> Registro de conclusão (par obrigatório da SPEC-022). O que foi construído, como foi verificado,
> onde divergiu da SPEC (e por quê), e o que fica deferido.

---

## Metadados

| Campo | Valor |
|---|---|
| **SPEC** | SPEC-022 — Regen (renascimento de carreira + Hall of Fame) |
| **Roadmap item** | 4.2 (Carreira com fim + hall de lendas) — 1ª fatia |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/regen` |
| **Concluída em** | 2026-07-17 |
| **Status** | **CONCLUÍDA** — gates verdes; aguardando duplo sign-off QA+Data e merge do arquiteto |

---

## O que foi entregue (o loop completo)

Quando uma carreira humana termina — **forçado aos 42**, ou **por escolha a partir dos 25** (`requestRegen`) — o atleta **renasce no mesmo clube**: a carreira antiga vira **lenda permanente** no Hall of Fame (nome antigo preservado), e nasce um **atleta novo ativo** na mesma conta — jovem (17), atributos resetados (overall 34), com um **banco de pontos de legado** = `floor(pontos da carreira anterior × 25%)`. É o gancho de FOMO/compra, com o **paywall isolado num seam** (`canRegen`, default permitido).

**A) Lib pura `packages/player` — o legado (determinística, sob o guardrail):**
- `regen.ts` (novo): `regenLegacyPoints(oldPointsEarned)` = `floor(max(0, p) × REGEN.legacyPct / 100)` — inteira, guardrail-safe. Bloco `REGEN = { legacyPct: 25 }` tunável em `constants.ts`. Reusa `pointsEarnedTotal` (a métrica de legado) — o "reset+bônus" é `attributes` frescos + `free_points` = legado.

**B) `services/world-store` — Hall of Fame + gatilho + entrada corrigida:**
- **Entrada aos 17 (corrige a SPEC-020):** `occupyNpcSlot` grava **`age: WORLD.youthAge`** na vaga — o humano **não herda mais a idade do NPC** (era decisão provisória de implementação, não do founder). A idade vira o **relógio de carreira** (sobe +1/temporada pelo `ageAndRetire` imune da SPEC-021).
- **Migration aditiva `0005`** (OP-01): tabela **`legend`** (`world_seed, human_athlete_id, season_ended, human_name, club_id, position, ability, age, legacy_points, created_at`; PK `(world_seed, human_athlete_id, season_ended)` — N lendas por humano ao longo dos renascimentos) + `world_occupation.regen_requested boolean NOT NULL DEFAULT false`.
- `legend-repo.ts` (novo): `archiveLegend` (idempotente por PK), `readLegends` (o Hall of Fame), `readRegenEligible` (**`age ≥ 42` OU (`regen_requested` E `age ≥ 25`)**, join `world_occupation`×`athlete`). `requestRegen` (liga a flag voluntária; trava idade ≥ 25). `REGEN_AGE = { voluntary: 25, forced: 42 }`.

**C) `services/player-store` — o renascimento da identidade:**
- `rebirthAthlete(db, oldAthleteId, newName, attributes)` — transação: o velho vira `active=false` (a lenda); nasce um atleta novo ativo (mesma conta/posição/aparência, atributos frescos, `free_points` = legado). **Idempotente** (se o velho já é inativo → devolve o ativo existente, sem duplicar). Reusa o índice parcial `athlete_one_active_per_account`.

**D) `services/regen` (workspace novo) — a costura do renascimento (borda impura, typecheck-only):**
- `regenAthlete(worldDb, playerDb, candidate, canRegen?)`: (1) `rebirthAthlete` (player); (2) `archiveLegend` (mundo, idempotente); (3) **`reassignSlot`** — reatribui a MESMA vaga ao renascido. `runRegenPass(worldDb, playerDb, seed, canRegen?)` — pós-virada, itera os elegíveis com **isolamento por candidato**. `canRegen` **seam** (default `allowAll`).

**E) Wiring:** documentado — o scheduler chama `runRegenPass` **após** `runDailyRound` reportar `season_rolled`. `daily-round`/`turnover-repo` intocados. Na fatia, `runRegenPass` é testado direto.

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

Rodada a revisão (dimensões: **idempotência/correção cross-schema**, **gatilho/legado**, **OP/escopo/cobertura**), cada achado verificado adversarialmente (default REFUTED se não reproduzir). A dimensão **gatilho/legado** voltou **limpa** (elegibilidade, matemática do legado e rebirth confirmados corretos). Os achados reais estavam **todos na orquestração** — e foram corrigidos:

**CRITICAL (corrigido) — janela órfã irrecuperável.** A ordem original da SPEC (`vacate` a vaga → `reoccupy`) deletava a linha `world_occupation` que ancora o candidato: um crash entre soltar e reocupar deixaria o renascido (já commitado no player-store) **permanentemente invisível** ao mundo, **sem passe futuro capaz de reencontrá-lo** (o `readRegenEligible` deriva de `world_occupation`) — um humano pagante caindo do mundo em silêncio. **Fix:** `reassignSlot` — a MESMA vaga é reapontada ao renascido numa **ÚNICA transação** (a linha de ocupação **nunca é deletada**). Qualquer falha ANTES do reassign deixa o candidato elegível (idade não-resetada) → o próximo passe o reencontra. Elimina a janela por construção.

**MAJOR (corrigido) — idempotência sob re-invocação no mesmo candidato.** Consequência da mesma ordem (`vacateSlot(candidate.athleteId)` deletava a ocupação do próprio renascido no caso same-slot). Resolvido pelo mesmo `reassignSlot` (reset in-place; re-rodar não acha o candidato porque a idade virou 17).

**MAJOR (corrigido) — sem isolamento por candidato.** O loop do `runRegenPass` não tinha `try/catch` → um candidato que estoura abortaria o passe inteiro. **Fix:** `try/catch` por candidato (log genérico OP-11); a ocupação antiga sobrevive → o próximo passe retenta.

**MAJOR (corrigido) — o flag do regen VOLUNTÁRIO não sobrevivia à viragem.** `reapplyOccupations` (SPEC-021) re-inseria `world_occupation` **sem** `regen_requested` → o flag era zerado a cada virada, e como o passe roda pós-virada, o gatilho voluntário (25–41) **nunca dispararia**. **Fix:** `OccupationView`/`reapplyOccupations` passam a carregar `regen_requested`.

**PLAUSIBLE (endurecido) — string-match frágil + OP-11 no rebirth.** O `/já ocupad/` do `reoccupy` sumiu junto com o `reoccupy` (o `reassignSlot` não depende de match de mensagem). `rebirthAthlete` ganhou envelope de erro genérico (espelha `createAccountWithAthlete`).

**Reforço defensivo (além da revisão):** `reassignSlot` **muta a ability** do atleta-mundo (reset) → adicionei a mesma **guarda de gênese** do `occupyNpcSlot` (temporada com rodada publicada → rejeita), blindando o snapshot contra um scheduler futuro que chame fora de hora. A REFUTED confirmou que o passe roda em gênese por design; a guarda torna a hipótese de misuse **segura e recuperável** (o candidato retenta na próxima gênese).

---

## Desvio de MECANISMO (não de produto) — critério #5 refinado

A SPEC (critério #5 + escopo D passo 3/4 + a mitigação "Loop de vaga" na tabela de risco) descrevia a vaga **revertendo a NPC** (`delete world_occupation` + `is_human=false`) e depois sendo **re-ocupada**. A revisão provou que essa ordem abre a janela órfã CRITICAL acima. O mecanismo virou um **reassign atômico in-place** (`reassignSlot`), com **o mesmo estado final observável**: o renascido ocupa o MESMO clube, o humano antigo **sai do mundo** (`readOccupation(oldId)` → null), o clube segue com 16 (15 NPC + 1 renascido). A diferença é que a vaga **nunca vira NPC no meio** — o que, aliás, **elimina** o risco "Loop de vaga" que a própria SPEC listava. O primitivo `vacateSlot` (reverter uma vaga a NPC) permanece implementado e testado como peça standalone (para um futuro "humano abandona o mundo"), apenas não é usado no fluxo do Regen. *(Sinalizado ao founder no fecho; reversível para a redação literal da SPEC se preferir a semântica "reverte a NPC".)*

---

## Verificação (gates)

- **263/263 testes** (247 preservados da SPEC-021 + 16 novos), estável em 2 execuções. Novos: 3 puros (`regenLegacyPoints`: fração, truncamento do `floor`, saturação de negativo), 6 ao vivo em `legend-repo` (entrada aos 17, `requestRegen` trava <25, `readRegenEligible` forçado/voluntário, Hall of Fame idempotente, `vacateSlot` reverte), 1 ao vivo de flag-sobrevive-viragem (`turnover-repo`), 6 ao vivo na costura `regen` (loop completo, idempotência de passe, seam que nega, **voluntário ponta-a-ponta**, **recuperação pós-crash**, **guarda de gênese**). Sem `DATABASE_URL`: os puros sempre rodam; os ao vivo dão skip.
- **`npm run typecheck` · `npx eslint .` · `npm run build` · prettier** — verdes (OP-14/15/16 + guardrail de determinismo).
- **`world-engine` e os 4 goldens INTOCADOS** — `git status --short packages/world-engine/src/__fixtures__/` = vazio (byte-idêntico). O único toque no engine foi **exportar `athleteName`** do barrel (o nome do renascido é determinístico; sem mudança de comportamento/golden).
- **Postgres real (CI):** o `postgres:16` + migrate do world-store já aplica `0000..0005`; nenhuma mudança de pipeline.

---

## Critérios de aceitação — status

1. **Entrada aos 17** — ✅ (teste ao vivo; corrige a herança de idade da SPEC-020).
2. **Legado (puro)** — ✅ (`floor(p×25/100)`, `=0` em 0, satura negativos).
3. **Elegibilidade** — ✅ (`≥42` OU `requested`&`≥25`; `requestRegen` trava <25).
4. **Renascimento (o loop)** — ✅ (lenda arquivada; velho inativo; novo ativo com nome novo + overall 34 + legado; ocupa o MESMO clube aos 17).
5. **A vaga antiga sai do mundo** — ✅ **com mecanismo refinado** (reassign in-place em vez de reverter-a-NPC-e-reocupar; ver "Desvio de mecanismo").
6. **Idempotência** — ✅ (passe 2× → 0 na 2ª; sem duplicar lenda/ativo; + recuperação pós-crash testada).
7. **Seam de compra** — ✅ (`canRegen` que nega pula sem erro).
8. **OPs & gates** — ✅ (todos verdes; engine/goldens intocados).

---

## Escopo deferido (honesto)

- **Paywall real** (Steam/entitlement) — `canRegen` fica seam default-permitido.
- **UI de rename** — nome auto-gerado determinístico nesta fatia; o nome antigo fica na `legend`.
- **Wiring do scheduler de produção** — `runRegenPass` é callable; o gatilho de deploy é fatia futura (o mesmo scheduler do `runDailyRound`).
- **Regen mid-season** — só na fronteira de temporada (a re-ocupação exige gênese; a guarda protege).
- **Durabilidade transacional distribuída cross-schema** — best-effort idempotente com recuperação por passe (a ocupação antiga ancora o candidato até o reassign atômico). Débito honesto: não há transação distribuída (padrão do projeto).
- **Traços de veterano / química / recordes ricos** no Hall of Fame — snapshot mínimo por ora.

---

## Fecho

- **Estado atual** (CLAUDE.md): SPEC-022 adicionada; SPEC-021 flipada → **PR #24**.
- **`docs/roadmap.md`**: 4.2 (Carreira com fim + hall de lendas) — 1ª fatia ✅.
- **Memória do projeto**: fato durável do Regen (reassign atômico + gatilho voluntário sobrevivendo à virada) capturado.

*DONE-022 — método H1VE. O fim virou começo, e a revisão adversarial pagou o maior dividendo até aqui: pegou uma janela órfã irrecuperável no money path (um humano pagante caindo do mundo em silêncio) e a fechou por construção. Engine e goldens intocados.*
