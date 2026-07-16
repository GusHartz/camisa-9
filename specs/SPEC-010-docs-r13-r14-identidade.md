# SPEC-010 — Docs de fundação: R13 + R14 + identidade Next Goat

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-010 |
| **Feature** | Docs de fundação: R13 + R14 + identidade Next Goat |
| **Slug** | docs-r13-r14-identidade |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Higiene de documentação (continuação direta da SPEC-007/008). Não é item de produto. |
| **Appetite** | **meio dia** |
| **Prioridade** | MÉDIA |
| **Criada em** | 2026-07-16 |
| **Aprovada em** | 2026-07-16 |
| **Aprovada por** | Gustavo Hartz (founder/architect) |
| **Status** | Aprovada |

---

## Objetivo

Aplicar o **ADENDO 3** do relatório de auditoria (`auditoria-docs-camisa9.md`) — **identidade oficial Next Goat + leis de arte + inteligência do mundo**, patches **A7-A9** — aos docs de fundação, e **sincronizar o bloco "Estado atual" do CLAUDE.md** com a realidade pós-merge (SPECs 001-009 concluídas). Docs-only.

---

## Nota de baseline — DISCREPÂNCIA REGISTRADA (protocolo de conflito)

A tarefa pediu "aplicar os ADENDOS 1, 2 e 3 — **patches A1-A9**". **Verificação no repositório (2026-07-16):**

- **A1-A6 (ADENDOS 1+2 — R13 Pirâmide Elástica + R14 código de time) já estão em `main`**, entregues pela **SPEC-008 (PR #11, MERGED)**. Confirmado por grep: "Pirâmide Elástica" e "Cadastro solo/team" presentes em `vision-scope`, `functional-spec` (cap. 2 e 18) e `roadmap` (2.6).
- **A7-A9 (ADENDO 3) NÃO estão em `main`** (grep: "Next Goat", "Arte e assets", "Inteligência de mercado" = 0).

**Decisão (registrar-e-seguir, conforme o protocolo de conflito da própria tarefa):** SPEC-010 **não reaplica A1-A6** (impossível — o texto-alvo já foi substituído; reaplicar geraria conflito ou no-op). Entrega o que falta: **A7-A9 + Estado atual + passada de consistência** (que verifica A1-A6 presentes). A numeração "R13 + R14" no título é mantida porque o conteúdo desses adendos é o contexto onde a identidade assenta, mas o **diff real desta SPEC é A7-A9**.

---

## Escopo — o que está DENTRO

- [ ] **A7 · `vision-scope.md`** — logo após o título, bloco de identidade: **nome oficial NEXT GOAT — Taskbar Football** (Camisa 9 = codinome interno), mascote (bode coroado camisa 10), subtítulo PT, condições pré-página-Steam (INPI 9/41 + TESS/EUIPO, risco GOAT Games, domínios/handles).
- [ ] **A8 · `sdd.md`** — na seção de stack, subseção **"Arte e assets"** (dois níveis de pixel art — lei) + duas decisões na tabela (**D11** dois níveis de pixel art; **D12** inteligência do mundo por heurística + personalidade + seed).
- [ ] **A9 · `functional-spec.md`** — na capacidade 1 (Motor do mundo), bullet de **inteligência de mercado NPC** (heurística em camadas + arquétipo/pesos por seed na criação + fechamento determinístico).
- [ ] **CLAUDE.md — bloco "Estado atual"** (desta vez DENTRO do escopo — era o desvio consciente do DONE-007): SPECs **001-009 concluídas** (008/#11 e 009/#12 mergeados), **F0 técnico completo**, Steam-only, **nome oficial NEXT GOAT** (codinome interno mantido), **R13/R14 ratificados**, próxima frente = **camada de dados (0.2) + Trilha GTM**.
- [ ] **Consistência (passada final):** (a) `roadmap.md` G.1/G.2 — o nome **foi decidido** (Next Goat); reconciliar o "funil de nomes"/"decisão do NOME" para não figurar como pendente fora de contexto histórico; (b) nenhum "pool 100% humano" como gatilho de expansão (verificar — A1-A6 já removeram); (c) nenhum "takeover de quinteto" como feature própria (verificar — absorvido pelo R14).

## Escopo — o que está FORA

- **Código, CI, ADRs, specs antigas** — nada tocado.
- **Renomear o repositório** — o codinome interno `camisa-9` fica (A7 é explícito).
- **Reaplicar A1-A6** — já em `main` via SPEC-008 (ver Nota de baseline).
- **Design doc / arte real** — a lei de arte entra como decisão nos docs; produzir sprites/capsule é a Trilha GTM (G.1).

---

## Arquivos que serão tocados

| Arquivo | Ação | Patch |
|---|---|---|
| `docs/projeto/vision-scope.md` | modificar | A7 (bloco de identidade após o título). |
| `docs/projeto/sdd.md` | modificar | A8 (subseção "Arte e assets" + D11/D12). |
| `docs/projeto/functional-spec.md` | modificar | A9 (bullet inteligência de mercado, cap. 1). |
| `docs/projeto/roadmap.md` | modificar | Consistência: G.1/G.2 (nome decidido). |
| `CLAUDE.md` | modificar | Bloco "Estado atual" (001-009 concluídas + Next Goat). |
| `specs/SPEC-010-*.md`, `specs/DONE-010-*.md` | criar | Esta SPEC + o DONE. |

---

## Critérios de aceitação

1. **A7-A9 aplicados fielmente** — texto conforme o ADENDO 3; grep passa a encontrar "Next Goat", "Arte e assets", "Inteligência de mercado".
2. **A1-A6 intactos** — verificados presentes (não reaplicados, não removidos).
3. **CLAUDE.md "Estado atual"** — SPECs 001-009 como concluídas/mergeadas; nome oficial Next Goat; R13/R14 ratificados; próxima frente = 0.2 + GTM. Só o bloco muda.
4. **Consistência** — nenhum "pool 100% humano" como gatilho; nenhum "takeover" como feature própria; nenhuma menção a nome pendente/funil de nomes fora de contexto histórico.
5. **Docs-only** — `git diff` toca apenas `docs/projeto/*`, `CLAUDE.md`, `specs/*`; ADR-001, código e CI inalterados; gates TS inalterados.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Reaplicar A1-A6 por engano (conflito/duplicação) | Nota de baseline: A1-A6 verificados em `main`; SPEC-010 só aplica A7-A9. |
| Deixar o "funil de nomes" como pendente após a decisão | Passada de consistência reconcilia G.1/G.2. |
| Conflito de `CLAUDE.md` "Estado atual" com edições paralelas | Nenhuma SPEC aberta em paralelo (009 já mergeada); o bloco é reescrito por inteiro. |

---

*SPEC-010 — método H1VE. Continuação direta da SPEC-007/008; docs-only; ADR-001 não se aplica. A1-A6 já em `main` (SPEC-008 #11); esta SPEC entrega o ADENDO 3 (A7-A9) + Estado atual.*
