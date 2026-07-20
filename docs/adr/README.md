# ADRs — Architecture Decision Records

Registros **duráveis** de decisões de arquitetura do projeto. Um ADR captura *uma* decisão significativa: o **contexto** que a forçou, a **decisão** tomada, e as **consequências** (custos aceitos, requisitos criados, reversibilidade).

## Por que ADRs existem aqui

O `docs/projeto/sdd.md` é o **doc de fundação técnica** — o retrato *atual* da stack. Quando uma decisão marcada `⚠️ pendente` no SDD é ratificada pelo founder, ela vira um **ADR** (o raciocínio completo, permanente) e o SDD é **flipado** para refletir o resultado, apontando ao ADR. Assim o SDD fica enxuto e o "porquê" não se perde.

- **SDD** = o que a stack **é hoje** (estado).
- **ADR** = **por que** ficou assim, com a evidência da época (histórico eterno — nada é reescrito; decisões superadas ganham status `Substituído por ADR-NNN`).

## Convenção

- Arquivo: `docs/adr/ADR-{NNN}-{slug}.md` (NNN de 3 dígitos, mesma numeração do repo).
- Cabeçalho: tabela com **Status** (`Proposto` / `Aceito` / `Substituído por ADR-NNN` / `Descartado`), **Data**, **Decisor**, e a **SPEC** que o originou.
- Corpo: **Contexto → Decisão → Consequências**, mais o que a decisão exigir (critérios ponderados, landscape de alternativas, evidência, reversibilidade, gatilhos de revisão).
- **Não reescrever** um ADR aceito: uma decisão nova que o supere é um **novo** ADR que marca o anterior como substituído.

## Quando escrever um ADR

- Ratificar um item `⚠️` do SDD (ex.: stack do cliente).
- Qualquer escolha de arquitetura difícil de reverter, ou que várias SPECs futuras vão citar em vez de re-litigar.

## Índice

| ADR | Título | Status | Data |
|---|---|---|---|
| [ADR-001](ADR-001-stack-do-cliente-windows.md) | Stack do cliente Windows — **C#/WPF (.NET LTS)** | ✅ Aceito | 2026-07-15 |
| [ADR-002](ADR-002-neon-persistencia-prod.md) | Persistência de produção — **Neon (branch por ambiente)** | ✅ Aceito | 2026-07-19 |
| [ADR-003](ADR-003-camada-http-e-sessao.md) | Camada HTTP e sessão — **`node:http` puro + sessão opaca server-side** | ✅ Aceito | 2026-07-20 |
