# DONE-010 — Docs de fundação: R13 + R14 + identidade Next Goat

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-010 |
| **SPEC correspondente** | SPEC-010-docs-r13-r14-identidade.md |
| **Feature** | Docs de fundação: R13 + R14 + identidade Next Goat |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/docs-r13-r14-identidade` |
| **PR** | *pendente de confirmação do founder* |
| **Desenvolvimento iniciado** | 2026-07-16 |
| **Desenvolvimento concluído** | 2026-07-16 |
| **Dias utilizados vs appetite** | <½ dia vs ½ dia |

---

## Resumo do que foi feito

Continuação direta da SPEC-007/008. Aplicado o **ADENDO 3** do relatório (`auditoria-docs-camisa9.md`) — **identidade oficial + leis de arte e de inteligência do mundo**, patches **A7-A9** — e sincronizado o bloco **"Estado atual" do CLAUDE.md**.

- **A7 · vision-scope** — bloco de identidade após o título: **nome oficial NEXT GOAT — Taskbar Football** (Camisa 9 = codinome interno), mascote (bode coroado camisa 10), subtítulo PT, condições pré-página-Steam (INPI 9/41 + TESS/EUIPO — risco GOAT Games — + domínios).
- **A8 · sdd** — subseção **"Arte e assets"** (dois níveis de pixel art como lei: JOGO canônico / KEY ART derivada + regra-ponte do mascote) + **D11** (dois níveis de pixel art) e **D12** (inteligência do mundo por heurística + personalidade + seed).
- **A9 · functional-spec** — cap. 1 (Motor do mundo): bullet de **inteligência de mercado NPC** (heurística em camadas → arquétipo/pesos por seed na criação → fechamento determinístico via PRNG).
- **CLAUDE.md "Estado atual"** — SPECs **001-010** listadas; SPEC-008 (#11) e SPEC-009 (#12) promovidas a **mergeadas**; nome oficial **Next Goat**; R13/R14 ratificados; próxima frente = camada de dados (0.2) + Trilha GTM.
- **Consistência** — roadmap G.1/G.2 reconciliados (o nome **foi decidido**: Next Goat; P1 encerrado — não figura mais como funil pendente).

**Desvio central (registrado):** a tarefa pediu "patches A1-A9", mas **A1-A6 (ADENDOS 1+2) já estavam em `main`** via SPEC-008 (PR #11, merged). SPEC-010 **não os reaplicou** (impossível — texto-alvo já substituído); entregou o **ADENDO 3 (A7-A9)** + Estado atual + consistência. Conflito registrado na Nota de baseline da SPEC-010 e abaixo (protocolo registrar-e-seguir).

Docs-only; ADR-001, código, CI e specs antigas inalterados; gates TS intocados.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `specs/SPEC-010-docs-r13-r14-identidade.md` | A SPEC (A7-A9 + Nota de baseline sobre A1-A6). |
| `specs/DONE-010-docs-r13-r14-identidade.md` | Este documento. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `docs/projeto/vision-scope.md` | A7 (bloco de identidade Next Goat após o título). |
| `docs/projeto/sdd.md` | A8 (subseção "Arte e assets" na stack + D11/D12 na tabela de decisões). |
| `docs/projeto/functional-spec.md` | A9 (bullet inteligência de mercado NPC na cap. 1). |
| `docs/projeto/roadmap.md` | Consistência: G.1 (veste identidade Next Goat) + G.2 (nome decidido → só verificação jurídica). |
| `CLAUDE.md` | **Apenas** o bloco "Estado atual": nome Next Goat; SPECs 001-010; 008/#11 e 009/#12 mergeadas; +SPEC-010 (PR pendente). |

---

## Mudanças de schema aplicadas

Nenhuma migration. Docs-only.

## Mudanças de API entregues

Nenhuma. Docs-only.

---

## Critérios de aceitação — verificação

| Cenário (SPEC-010) | Status | Evidência |
|---|---|---|
| 1 — A7-A9 aplicados fielmente | ✅ | grep encontra "Next Goat" (vision-scope), "Arte e assets" (sdd), "Inteligência de mercado" (functional-spec); texto conforme o ADENDO 3. |
| 2 — A1-A6 intactos | ✅ | grep: "Pirâmide Elástica" + "Cadastro solo/team" seguem presentes (não reaplicados, não removidos). |
| 3 — CLAUDE.md "Estado atual" | ✅ | Só o bloco mudou; SPECs 001-010; 008/009 mergeadas; nome Next Goat; próxima frente 0.2 + GTM. |
| 4 — Consistência | ✅ | grep: sem "funil de nomes"/"finalistas de nome"/"Decisão do NOME" pendente; "pool 100% humano" só como registro histórico "revoga o gatilho"; "takeover" só em "absorve o takeover" (R14). |
| 5 — Docs-only | ✅ | `git diff --stat`: só `docs/projeto/*` + `CLAUDE.md` (+ specs/); nada em `packages/` ou `.github/`. |

---

## Como testar manualmente

```
1. git diff origin/main -- docs/projeto/ CLAUDE.md   # revisar o diff cirúrgico
2. Conferir A7-A9 contra o ADENDO 3 de auditoria-docs-camisa9.md.
3. grep -niE "Next Goat|Arte e assets|Inteligência de mercado" docs/projeto/
4. grep -niE "finalistas de nome|Decisão do NOME|pool 100% humano|takeover" docs/projeto/
   → sem funil pendente; "pool"/"takeover" só em contexto histórico/absorvido.
```

**Dados de teste necessários:** nenhum — revisão de diff.

---

## Testes automatizados

Nenhum (docs-only). Os gates TS existentes seguem cobrindo `packages/*`, inalterados. `.md` é ignorado pelo Prettier — CI de docs verde (precedente SPEC-007/008).

**Comando (inalterado):** `npm run lint && npm run typecheck && npm test && npm run build`

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `docs/projeto/{vision-scope,functional-spec,sdd,roadmap}.md` (diffs) + `CLAUDE.md` (bloco "Estado atual") + `SPEC-010`/`DONE-010` | ~100% | Sim — A7-A9 aplicados verbatim do ADENDO 3; diff revisado; consistência por grep. Founder revisa no diff do PR. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → (1) **não reaplicou A1-A6** (já em `main` — ver desvio); (2) reconciliação de consistência do roadmap G.1/G.2 (nome decidido). Nenhuma inventa conteúdo.

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **A1-A6 já em `main`** | **Não reaplicados.** SPEC-010 entregou só o ADENDO 3 (A7-A9). | SPEC-008 (PR #11) já os mergeou; reaplicar geraria conflito/no-op. Verificado por grep; registrado na Nota de baseline da SPEC-010. **Protocolo de conflito: registrar-e-seguir** (a própria tarefa autoriza). |
| **Consistência roadmap G.1/G.2** | Reconciliados (nome decidido: Next Goat; P1 encerrado). Não estavam na lista literal A7-A9. | Step 5 da tarefa exige "nenhuma menção a nome pendente/funil fora de contexto histórico"; A7 encerra o P1. Consistência, não patch novo. |

**Protocolo de conflito (parar+registrar):** **acionado uma vez** — a discrepância A1-A9 vs. baseline (A1-A6 já merged). Registrado (Nota de baseline + este desvio) e seguido, conforme a instrução da tarefa.

---

## Limitações conhecidas

- **Lei de arte é referência** — os números/estilo exatos (paleta final, grid, tamanhos) materializam na Trilha GTM (G.1 briefing).
- **Inteligência de mercado NPC** descreve o shape (heurística + arquétipo/pesos por seed); a implementação plena é a spec 1.4 (o shape `archetype`/`weights` já nasce na fundação — entregue na SPEC-009).
- **Verificação jurídica do nome** (INPI/TESS/domínios) é tarefa do founder — o doc registra a condição, não a executa.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| SPEC executável da lei de arte (tokens de paleta, grid, pipeline de export) | Médio | Trilha GTM G.1. |
| SPEC 1.4 (mercado NPC pleno: janelas, valores, renovações) | Médio | Fase 1.4. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (5/5)
- [x] Testes criados e passando (N/A — docs-only; gates TS inalterados)
- [x] Typecheck limpo (inalterado — nada em `packages/*`)
- [x] Lint limpo (`.md` ignorado pelo Prettier; sem TS novo)
- [x] Nenhum log de debug / `any` / segredo (N/A — docs-only)
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` seção "Estado atual" atualizada (**desta vez no escopo**)
- [x] `docs/projeto/roadmap.md` atualizado (consistência G.1/G.2)
- [x] Este DONE está completo e commitado na branch *(commit no fluxo do PR)*

---

*DONE-010 — método H1VE. Continuação da SPEC-007/008; docs-only; ADR-001 inalterado. A1-A6 já em `main` (SPEC-008 #11); esta feature entregou o ADENDO 3 (A7-A9) + Estado atual.*
