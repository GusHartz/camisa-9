# DONE-012 — Ajuste de tunáveis: elenco de 16 (rosterSize 20→16 + transfersPerLeague 12→10)

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-012 |
| **SPEC correspondente** | SPEC-012-ajuste-elenco-16.md |
| **Feature** | Ajuste de tunáveis: elenco 16 |
| **Card (board)** | `c454a49f-de3a-4034-848a-9d6d727ca513` |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/ajuste-de-tunaveis-elenco-16` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado/concluído** | 2026-07-16 |
| **Dias utilizados vs appetite** | <½ dia vs ½ dia |

---

## Resumo do que foi feito

Primeira spec de **código** desde a SPEC-009. Alinhou o `packages/world-engine` ao **R4 FINAL** (SPEC-011): o elenco de cada clube caiu de **20 → 16** (11 titulares + 5 reservas) e, na **cascata de tunáveis vizinhos** que o card pediu, as transferências por liga na viragem caíram de **12 → 10** (valor escolhido pelo founder na faixa ~8-10; proporcional: 12/20 ≈ 10/16).

Foi um **ajuste puro de tunáveis** em `constants.ts` — **nenhuma mudança de lógica**. `buildRoster`, a reposição de base e `runTransfers` já liam `squadShape`/`transfersPerLeague` dinamicamente, então **nenhum teste foi editado** (todos derivam de `WORLD.*`). O único golden dependente do elenco/viragem (`world.golden.json`) foi **regenerado por decisão intencional** (ver justificativa abaixo); `season`/`prng`/`anchor` ficaram **bit-idênticos**.

**Verificação:** `typecheck` limpo · `eslint` limpo (OP-14/15/16 + guardrail de determinismo) · **89/89 testes verdes** (mesmo total da SPEC-009) · `build` limpo. `constants.ts` normalizado (LF) é prettier-clean — o warning local é o gotcha de CRLF do Windows, não conteúdo (CI em LF é a fonte da verdade).

---

## Justificativa da regeneração do golden (mudança de regra, NÃO drift)

O card exige que o golden regenerado venha **com justificativa**. Aqui está:

- `world.golden.json` codifica a âncora cross-ambiente do mundo (mundo semeado + 10 viragens). Reduzir o elenco de 20→16 e as transferências de 12→10 **muda quantos saques o PRNG faz** dentro de cada clube (na geração do elenco) e no passo de transferência da viragem → o `worldHash` muda **por construção**.
- Isto é uma **mudança de regra ratificada pelo founder** (R4 final: elenco 16; cascata: transfers 10), **não** um drift acidental. O próprio `note` do golden manda regerar **só** com mudança **intencional** do stream.
- A regen foi feita por um **script determinístico e auditável** (`harness/regen-world-golden.ts`) que reproduz **exatamente** o `runChain()` do teste (semeia + 10 viragens, coletando `worldHash`). Sem relógio, sem entropia — mesma seed `"decada"`, mesmo resultado em qualquer ambiente.
- **Isolamento provado:** só `world.golden.json` mudou entre os 4 goldens; `season`/`prng`/`anchor` seguem **bit-idênticos** (o ajuste não vazou para o money path escalar da SPEC-002). Os 11 hashes mudaram todos (esperado): `hashes[0]` `63ab72a6…` → `b9d56bdb…`.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `specs/SPEC-012-ajuste-elenco-16.md` | A SPEC (aprovada no card). |
| `specs/DONE-012-ajuste-elenco-16.md` | Este documento. |
| `harness/regen-world-golden.ts` | Ferramenta de regen do golden do mundo (borda impura, fora de `packages/*/src`) — documentada e reutilizável para futuras mudanças **intencionais** de stream. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `packages/world-engine/src/constants.ts` | `WORLD.rosterSize` 20→16; `WORLD.squadShape` `{GK:3,DEF:6,MID:7,FWD:4}` → `{GK:2,DEF:5,MID:5,FWD:4}` (=16); `WORLD.transfersPerLeague` 12→10; comentários (`2+5+5+4 = 16`). |
| `packages/world-engine/src/__fixtures__/world.golden.json` | 11 hashes regenerados + `note` atualizado (SPEC-012, elenco 16 + transfers 10). |
| `CLAUDE.md` | Bloco "Estado atual": SPEC-012 concluída; SPEC-011 mergeada (#14); nota do `rosterSize` na SPEC-009 fechada. |

---

## Mudanças de schema aplicadas

Nenhuma migration. É constante da lib pura (não há banco ainda — persistência é a Fase 0.2).

## Mudanças de API entregues

Nenhuma. Assinatura pública inalterada; só o valor de tunáveis internos mudou.

---

## Critérios de aceitação — verificação

| Cenário (SPEC-012) | Status | Evidência |
|---|---|---|
| 1 — `rosterSize===16`, soma `squadShape===16`, `transfersPerLeague===10` | ✅ | `constants.ts`: 16 / `{2,5,5,4}` / 10; nenhuma posição em 0. |
| 2 — pós-seed e pós-cada-viragem: `roster.length===16` e `positionCounts===squadShape` (sem editar testes) | ✅ | 89/89 verdes; `world-seed.test`, `world-turnover.test`, `roster.test` derivam de `WORLD.*` — passaram sem edição. |
| 3 — `world.golden.json` regenerado; teste "bate byte-a-byte" verde | ✅ | Regen via `harness/regen-world-golden.ts`; `world-turnover.test` verde contra o novo golden. |
| 4 — `season`/`prng`/`anchor` `.golden.json` bit-idênticos | ✅ | `git diff --name-only` dos goldens = **só** `world.golden.json`. |
| 5 — `clubStrength` = média inteira das top 11 (16≥11) | ✅ | `roster.ts` intocado; `strengthTopN` segue 11; testes de força verdes. |
| 6 — `archetype`/`weights` inalterados pela mudança | ✅ | `createClub` sorteia archetype/weights **antes** do roster, RNG por-clube; `world-turnover.test` (que assere archetype/weights) verde. |
| 7 — 4 gates CI verdes | ✅ | `typecheck` ✅ · `eslint` ✅ (OP-14/15/16 + determinismo) · `test` 89/89 ✅ · `build` ✅. Prettier: LF-normalizado limpo (CRLF local é gotcha, não conteúdo). |

---

## Como testar manualmente

```
1. git diff origin/main -- packages/world-engine/src/constants.ts
2. git diff --name-only origin/main -- 'packages/world-engine/src/__fixtures__/*.golden.json'  # só world.golden.json
3. npm run build && npm test        # 89/89; world-turnover bate com o golden
4. (opcional) npm run build && npx tsx harness/regen-world-golden.ts  # reproduz os mesmos 11 hashes
```

**Dados de teste necessários:** nenhum — determinístico por seed `"decada"`.

---

## Testes automatizados

Nenhum teste **novo** — a SPEC é ajuste de tunáveis, e as invariantes (`roster.length===16`, `positionCounts===squadShape`, força, archetype/weights) **já eram** cobertas por asserções que derivam de `WORLD.*`. A cobertura se manteve em **89 testes** (13 arquivos), agora exercendo o elenco 16.

**Comando:** `npm run lint && npm run typecheck && npm test && npm run build`

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `packages/world-engine/src/constants.ts` | ~100% | Sim — 3 constantes + comentários; diff conferido. |
| `packages/world-engine/src/__fixtures__/world.golden.json` | ~100% (gerado por script determinístico) | Sim — isolamento verificado (só este golden mudou); regen auditável. |
| `harness/regen-world-golden.ts` | ~100% | Sim — reproduz o `runChain()` do teste; lint/typecheck limpos. |
| `specs/SPEC-012`, `specs/DONE-012`, `CLAUDE.md` (Estado atual) | ~100% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC original?**
- [x] Sim → a **cascata `transfersPerLeague` 12→10** foi trazida para o escopo **após ler a descrição do card** (drift entre a SPEC inicial e a intenção do card) — **parada e sinalizada ao founder**, que escolheu o valor **10**. Reconciliado na SPEC-012 antes de codar. Nenhuma outra mudança fora do combinado.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **Cascata de transfers** | SPEC inicial escopava só `rosterSize`; ao ler o card (`get_current_feature`), a descrição pedia "cascata de tunáveis vizinhos (transferências ~8-10)". **Parei, sinalizei, o founder escolheu 10**, e a SPEC-012 foi atualizada + re-publicada antes de qualquer código. | Protocolo de drift do CLAUDE.md: divergência entre o que eu ia construir e a âncora (o card) — resolvida **na hora**, com o founder. |
| **Script de regen mantido** | `harness/regen-world-golden.ts` foi **mantido e documentado** (não deletado). | A SPEC permitia "removido **ou** documentado"; um regen canônico, determinístico e auditável é reutilizável para futuras mudanças intencionais do money-path golden. |

**Protocolo de conflito (parar+registrar):** **acionado uma vez** — a cascata de transfers ausente na SPEC inicial. Registrado e resolvido com o founder (valor 10) antes do código.

---

## Limitações conhecidas

- `transfersPerLeague` segue **placeholder** (trocas intra-liga, mesma posição) — o mercado real é a **spec 1.4**. Só o número mudou.
- A distinção **titular vs reserva** (quais 11 dos 16 jogam) é da **spec de dia de jogo** (stamina/substituições) — aqui o elenco é só o tamanho 16.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Nenhum novo. O ajuste **fecha** o débito registrado pela SPEC-011 (`rosterSize` 20→16). | — | — |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (7/7)
- [x] Testes passando (89/89; sem testes novos — invariantes já cobriam)
- [x] Typecheck limpo
- [x] Lint limpo (`eslint` ✅; prettier LF-normalizado ✅ — CRLF local é gotcha)
- [x] Nenhum log de debug / `any` / segredo
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` "Estado atual" atualizado (SPEC-012)
- [x] Este DONE está completo e commitado na branch *(commit no fluxo do PR)*

---

*DONE-012 — método H1VE. Primeira spec de código desde a SPEC-009; decorre do R4 FINAL (SPEC-011). Ajuste de tunáveis puro + regen do único golden roster/viragem-dependente; determinismo cross-ambiente preservado e isolamento do money-path escalar provado.*
