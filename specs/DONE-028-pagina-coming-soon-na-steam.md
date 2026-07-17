# DONE-028 — Página Coming Soon na Steam

> Artefato de conclusão do desenvolvimento. Docs/GTM-only — o "desenvolvimento" aqui é a produção
> dos artefatos de repositório; o **go-live é externo e gated** (não faz parte desta entrega).

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-028 |
| **SPEC correspondente** | SPEC-028-pagina-coming-soon-na-steam.md |
| **Feature** | Página Coming Soon na Steam |
| **Owner** | Gustavo (founder/solo) — handle de branch `24bit` |
| **Branch** | `feat/24bit/pagina-coming-soon-na-steam` |
| **PR** | {preencher ao abrir} |
| **Desenvolvimento iniciado** | 2026-07-17 |
| **Desenvolvimento concluído** | 2026-07-17 |
| **Dias utilizados vs appetite** | <1 dia (artefatos de repo) vs 14 dias (card; go-live externo gated) |

---

## Resumo do que foi feito

Entregou, **no repositório**, todos os artefatos da página Coming Soon na Steam de **Next Goat** que **não** dependem da fase de arte: a **copy fonte-de-verdade** (nome, short description ≤300 chars, "About This Game" em BBCode, tags/gêneros, aviso legal; PT-BR + EN stub), o **runbook operacional do Steamworks** (enrollment, assets, submissão, wishlist tracking, festivais, gates de pré-publicação) e a **definição do gate de demanda** (≥2.000 wishlists em 90 dias + 1 festival, com métrica precisa). Introduziu a pasta **`docs/gtm/`** (convenção nova, aprovada pelo founder). A **publicação** da página permanece **gated** em G.1 (capsule), G.2 (jurídico) e num build de cliente que renderize gameplay real — execução externa, fora desta entrega. Docs/GTM-only: zero código, zero schema, zero API.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `docs/gtm/store-copy.md` | Copy fonte-de-verdade (nome, short description, About This Game em BBCode, tags/gêneros, aviso legal) + EN stub. |
| `docs/gtm/steamworks-runbook.md` | Runbook operacional do Steamworks + tabela de asset specs + gate de demanda + checklist de pré-publicação. |
| `docs/gtm/README.md` | Índice da pasta GTM (nova convenção). |
| `specs/SPEC-028-pagina-coming-soon-na-steam.md` | A SPEC. |
| `specs/DONE-028-pagina-coming-soon-na-steam.md` | Este DONE. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `docs/projeto/roadmap.md` | G.3 → 🚧 (artefatos prontos / go-live bloqueado) + referência à SPEC-028. |
| `CLAUDE.md` | Seção "Estado atual": tag de atualização + bullet da SPEC-028. |

---

## Mudanças de schema aplicadas

Nenhuma migration. Docs/GTM-only.

---

## Mudanças de API entregues

Nenhuma. Docs/GTM-only.

---

## Critérios de aceitação — verificação

| Critério | Status | Observação |
|---|---|---|
| Cenário 1 — Identidade e nome | ✅ | `grep -ni "camisa-9" docs/gtm/store-copy.md` → 0. |
| Cenário 2 — Campos da Steam preenchidos | ✅ | short desc 257 chars; About com 4 pilares + promessas; "pra quem é/não é"; EN stub; tags (19); gêneros; aviso legal. |
| Cenário 3 — Mundo 100% fictício | ✅ | blocklist de nomes reais em `docs/gtm/` → 0 (idioma "troca de pele" trocado p/ "muda de cara" p/ evitar colisão com "pelé"). |
| Cenário 4 — Zero aposta | ✅ | única ocorrência whole-word de "aposta" é a negação honesta ("Não é aposta"). |
| Cenário 5 — Cadência correta | ✅ | diária presente (6 hits); antiga (ter/qui/sáb) → 0. |
| Cenário 6 — Runbook completo | ✅ | $100+recoup, 4 capsules + Page Background + ≥5 screenshots + trailer, review 3–5 dú + 2 semanas + hold 30 dias, wishlist tracking, Next Fest demo-obrigatória + um-por-jogo, ≥2 festivais sem demo. |
| Cenário 7 — Gate de demanda documentado | ✅ | gross adds cumulativos / 90 dias do go-live / "+1 festival" AND. |
| Cenário 8 — Gates de pré-publicação (hard stop) | ✅ | 4 gates de bloqueio no runbook (§6): capsule, jurídico, screenshots reais, enrollment. |
| Cenário 9 — Índice e âncoras | ✅ | README linka os 2 docs; roadmap G.3 → 🚧; CLAUDE.md Estado atual registra SPEC-028. |
| Cenário 10 — Gates verdes / docs-only | ✅ | `git diff` só toca `.md` (docs/gtm, docs/projeto/roadmap, CLAUDE.md, specs); Prettier ignora `**/*.md`. |

---

## Como testar manualmente

```bash
# 1. Travas de conteúdo (todos escopados a docs/gtm/)
grep -ni "camisa-9" docs/gtm/store-copy.md                                          # → 0 (Cenário 1)
grep -niwE "brasileirao|libertadores|neymar|pelé|messi|flamengo|corinthians|palmeiras|santos|premier league|la liga|bundesliga|serie a|uefa|fifa|conmebol|cbf" docs/gtm/   # → 0 (Cenário 3)
grep -niwE "aposta|apostar|odds|bolao|bolão|betting|casa de aposta" docs/gtm/       # → só "Não é aposta" (Cenário 4)
grep -niE "todo dia|di[áa]rio|15h" docs/gtm/store-copy.md                           # → ≥1 (Cenário 5a)
grep -niE "ter/qui/s|3 jogos/semana|3×/semana|terça.*quinta.*sábado" docs/gtm/      # → 0 (Cenário 5b)

# 2. Escopo docs-only
git diff --name-only   # → apenas *.md em docs/gtm, docs/projeto/roadmap.md, CLAUDE.md, specs/
```

**Dados de teste necessários:** nenhum (docs/GTM-only).

---

## Testes automatizados

Nenhum. Docs/GTM-only — verificação por grep/leitura (ver acima). Os 4 gates TS seguem verdes por não haver mudança em `packages/*`/`services/*` (Prettier ignora `**/*.md`).

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `docs/gtm/store-copy.md` | ~90% | Sim — revisão de travas + greps de aceitação. |
| `docs/gtm/steamworks-runbook.md` | ~95% | Sim — fatos de Steam verificados por workflow adversarial. |
| `docs/gtm/README.md` | ~95% | Sim. |
| `specs/SPEC-028-…md` | ~90% | Sim — revisão adversarial de 3 lentes + verificação. |
| `specs/DONE-028-…md` | ~90% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → (1) introduziu a pasta `docs/gtm/` (**nova convenção** — sinalizada e **aprovada pelo founder**, dentro do escopo). (2) Um rascunho inicial da SPEC afirmou um "drift de cadência" no CLAUDE.md que era **falso** (induzido pelo snapshot de instruções do harness) — **pego pela revisão adversarial + `grep` no disco e corrigido**. Nenhuma mudança fora de escopo entrou nos artefatos finais.

---

## Desvios em relação à SPEC

| Item da SPEC | O que foi feito | Motivo do desvio |
|---|---|---|
| Número da SPEC | Renumerada **026 → 028** a meio-caminho (arquivo + refs + card re-registrado). | Pedido do founder. |
| Critérios de aceitação por grep | Meta-notas dos artefatos foram **saneadas** de tokens-gatilho (`camisa-9`, `aposta` bare, `ter/qui/sáb`) e o idioma "pele" trocado. | Tensão grep-ingênuo × doc-fonte-de-verdade: os greps varrem o arquivo inteiro, incluindo notas de guardrail. Saneamento mantém a intenção do critério. |

---

## Limitações conhecidas

- **Go-live gated** — a página **não** é publicada nesta entrega: falta capsule (G.1), clearance jurídica (G.2) e um build de cliente que renderize **gameplay real** para screenshots/trailer (pós-F0).
- **Página PT-only** na janela de wishlist (EN é stub F3) — pode limitar o alcance do gate global de 2.000/90d (risco registrado na SPEC).
- **Preço** não configurado (deferido à release; calibrar regional BR).

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| **Fatiar o go-live** num card/SPEC de continuação (arte + build + jurídico + Steamworks) | Médio | Decisão de founder aberta; abrir quando a arte destravar. |
| **Owner/branch** `feat/24bit/…` vs. convenção `feat/gustavo-hartz/…` | Baixo | Reconciliar/renomear antes/junto do merge. |
| **Cenário 3 — blocklist** contém `pele` (bare) que colide com a palavra comum (pele/skin) | Baixo | Refinar para `pelé` (acentuado) numa edição futura da SPEC. |
| **Curto EN mínimo** (short desc + About) para o alcance global | Baixo/Médio | Se o gate depender de tráfego internacional. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados
- [x] Testes criados e passando (N/A — docs-only; verificação por grep)
- [x] Typecheck limpo (N/A — sem código; gates TS inalterados)
- [x] Lint limpo (N/A — sem código)
- [x] Nenhum log de debug em código de produção (N/A)
- [x] Nenhum tipo `any` introduzido (N/A — sem código)
- [x] Nenhum segredo hardcoded (o runbook referencia, nunca contém, credenciais Steamworks — OP-02/OP-12)
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` seção "Estado atual" atualizada
- [x] `docs/projeto/roadmap.md` status do item atualizado
- [x] Este DONE está completo e commitado na branch

---

*DONE-028 — método H1VE. Docs/GTM-only; go-live gated em G.1/G.2/build. Não toca a waiting-list in-game (SPEC-020/021/023). ADR-001 inalterado / não se aplica.*
