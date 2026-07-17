# DONE-021 — Viragem persistida (rollover de temporada) + imunidade do humano

> Fecho da SPEC-021. O mundo passa a **virar de verdade**: ao fim da temporada o tick dispara a
> viragem persistida, atômica, e o humano **sobrevive** (imune). O coração determinístico ficou
> intocado — `world.golden.json` **byte-idêntico** (o critério duro).

---

## O que foi entregue

Fecha o seam `season_complete` que a SPEC-015 deixou aberto e co-entrega a imunidade do humano que a SPEC-020 plantou (`is_human`). Quando a última rodada passa, o `runDailyRound` dispara a viragem numa transação atômica de nível-mundo: promoção/rebaixamento, envelhecer, aposentar (≥35), transferências, base nova, `seasonId++` — sobrescreve o snapshot, grava o `turnover_report`, re-aplica as ocupações humanas e semeia a próxima âncora. O mundo agora **rola sozinho**.

### A) Engine puro `packages/world-engine` — imunidade por `immuneIds` (golden byte-idêntico)
- `advanceWorld(world, results, seed, immuneIds?)` ganhou o 4º arg **opcional** (`ReadonlySet<athleteId>`, default vazio). `ageAndRetire` mantém o imune mesmo com `age≥35`; `runTransfers` **suprime** um swap que moveria um imune (guarda **no-op stream-preserving** — os saques do PRNG rodam idênticos; só o efeito é anulado). `refillYouth` intocado (o imune sobrevive → conta no elenco → sem déficit).
- **O engine fala de IDS, não de "humano"** (domínio puro não acopla). Set vazio ⇒ stream e serialização **byte-idênticos** → `world.golden.json` **inalterado** (`git diff` = 0). É engine-aware **sem** regenerar o golden.

### B) `services/world-store` — o rollover persistido
- `readWorldOccupations(seed)` (leitor em massa; deriva os `immuneIds`).
- Schema + **migration aditiva `0004`** (OP-01): tabela `turnover_report` (`world_seed, from_season_id, to_season_id, report jsonb, created_at`) — a auditoria durável que o overwrite senão apagaria.
- `turnover-repo.ts` — `persistWorldTurnover(db, seed, results, dayIndex)`: lê mundo/ocupações, roda `advanceWorld` com os imunes, e numa **única transação**: advisory lock de rollover + idempotência por `season_id` → **overwrite in-place** (DELETE ordem-das-FKs → UPDATE `season_id` → INSERT do mundo virado) → **re-aplica as ocupações** (is_human/name/ability + `season_id` novo; assert de integridade se um imune sumiu) → grava o `turnover_report` → semeia a nova âncora.

### C) Wire no tick — o rollover fica VIVO
- `daily-round.ts`: no seam `season_complete` o tick dispara `persistWorldTurnover` (novo status **`season_rolled`**; o dia da virada é de descanso). Falha/lock → **deferido** (protocolo de falha; retenta no próximo tick, rollback total).

---

## Decisões (co-desenhadas com o founder)

1. **Imunidade = `immuneIds`** (ids, não "humano") — engine-aware **sem** regen de golden. Descartadas: campo `isHuman` (regenera golden) e re-apply lossy.
2. **Overwrite in-place** (DELETE+INSERT) — snapshot = estado atual; história replayável (seed) + auditável (`turnover_report`/`published_round`).
3. **Destino do humano:** sobrevive, **sobe/desce com o clube** (a fantasia "da várzea às lendas"), envelhece mas **não é aposentado** como NPC. `assertEntryClub` segue guardando só ENTRADAS novas.
4. **Regen = card FUTURO** (registrado no roadmap): renascer no mesmo clube + reajuste de atributos + FOMO de compra. **Nota do founder:** o Regen **troca o nome** do jogador ao renascer, para a carreira antiga virar **lenda permanente no Hall of Fame**.

---

## Revisão adversarial (workflow · 4 dimensões · 19 agentes · verificação de cada achado)

Um **MAJOR real, cross-confirmado por 2 dimensões — corrigido:**
- **Rollover atrasado pulava a rodada 1 da nova temporada.** `newStart` era derivado do calendário IDEAL (`oldStart + roundsLength + 1`), independente do dia REAL da virada. Numa virada **deferida** (falha transitória/lock → retry N dias depois), a âncora nova apontava para um dia já passado → rodadas iniciais nunca publicadas (viola o critério 7 "sem pular rodada" e o guardrail "uptime de rodada 100%"). **Fix:** `newStart = dayIndex + 1` (o dia SEGUINTE ao dia REAL da virada) — o `persistWorldTurnover` recebe o `dayIndex`; a nova temporada começa no dia após a virada, atrasada ou não. Teste novo de rollover atrasado prova.

**Confirmados menores/nits — endereçados:**
- **Cobertura (3 gaps) → +3 testes:** determinismo com `immuneIds` **não-vazio** (engine); rollover **atrasado** (o fix); **concorrência** de 2 viradas → exatamente 1 vira, mundo em 2027 (não 2028).
- **Race estreito (minor) — documentado:** o read-set (ocupações) é lido fora da tx; numa temporada **100% deferida** (zero rodadas publicadas — falha catastrófica já gritando no monitor) uma ocupação concorrente na janela da tx poderia se perder. Comentário no código + este registro; endurecer (ler sob o lock) é futuro, desproporcional ao gatilho.
- **Nits (design, sem código):** o imune envelhece sem teto no engine — o "fim de carreira" é o **Regen** (card futuro); o swap suprimido não re-sorteia outro NPC — intenção de design (mercado é placeholder até 1.4).

**1 REFUTED:** a alegação de que os comentários "exageram a neutralidade do stream" — os comentários escopam corretamente a byte-identidade ao **set vazio**.

**Confirmações valiosas (sem defeito):** atomicidade all-or-nothing sólida; double-roll impedido (lock + idempotência); determinismo NPC = `advanceWorld` puro; a imunidade cobre aposentadoria+transferência; `club_id` estável na promoção.

---

## Gates

- **247/247 testes** (235 da SPEC-020 + 12 novos: 4 de imunidade no engine + 8 do rollover/tick), estável em runs repetidos; **~150 sem `DATABASE_URL`**.
- `typecheck` · `eslint` (OP-14/15/16 + guardrail) · `build` · `prettier` (LF-clean) — **verdes**.
- **`world.golden.json` byte-idêntico** (`git diff` = 0) — o critério DURO: o engine foi tocado, mas o stream determinístico não. Os demais goldens (`season`/`prng`/`anchor`) intocados.
- Migration `0004` puramente aditiva (tabela nova).

---

## Escopo deferido (inalterado)

**Regen** (renascimento + reajuste + FOMO + Hall of Fame — card a criar) · **re-baker do `ability`** do humano na virada (o `ability` congelado permanece) · **encaixe da Copa** no calendário · **scheduler de produção** (o worker que lê `Date.now()` 1×/dia e chama `runDailyRound`) · versionar o snapshot por `season_id`.

---

*DONE-021 — método H1VE. O mundo vira e persiste; o humano sobrevive à virada e sobe com o clube. A imunidade entrou por `immuneIds` (engine-aware, golden byte-idêntico — critério duro). A revisão adversarial pegou um MAJOR real (rollover atrasado pulava rodada) — corrigido ancorando a nova temporada no dia REAL da virada. Fundação Regen-ready.*
