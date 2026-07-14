# specs/ — SPECs e DONEs (método H1VE)

Esta pasta guarda os **contratos de desenvolvimento** do projeto. No método H1VE, nenhuma
linha de código é escrita sem uma **SPEC aprovada**, e nenhum PR é aberto sem o **DONE**
correspondente. É o que mantém humanos e agentes de IA no mesmo trilho.

## O fluxo

```
Item do roadmap
  → criar specs/SPEC-NNN-slug.md   (a partir de SPEC-TEMPLATE.md)
  → SPEC aprovada pelo arquiteto/founder
  → desenvolvimento na branch feat/{owner}/{slug}
  → criar specs/DONE-NNN-slug.md   (a partir de DONE-TEMPLATE.md)
  → atualizar CLAUDE.md (estado) + roadmap
  → abrir o PR com a AI declaration preenchida
```

## Nomenclatura

```
specs/SPEC-{NNN}-{slug}.md   ← antes do desenvolvimento
specs/DONE-{NNN}-{slug}.md   ← depois do desenvolvimento
```

- `NNN`: número sequencial com três dígitos (`001`, `002`, `003`…).
- `slug`: kebab-case descritivo (`auth-e-roles`, `github-webhook`).
- O `NNN` e o `slug` devem ser **consistentes** entre a SPEC e o DONE da mesma feature.

## Templates

- **`SPEC-TEMPLATE.md`** — copie para `specs/SPEC-{NNN}-{slug}.md` e preencha antes de codar.
- **`DONE-TEMPLATE.md`** — copie para `specs/DONE-{NNN}-{slug}.md` e preencha antes de abrir o PR.

## Regras inegociáveis

- **Nenhum PR sem SPEC aprovada** correspondente.
- **Nenhum PR sem DONE** correspondente criado.
- A IA só toca arquivos **listados na SPEC** — qualquer arquivo fora da lista exige aprovação.
- O **`CLAUDE.md`** do projeto é autoritativo: leia-o antes e atualize o "Estado atual" depois.

---

*Método H1VE. Estes templates viajam com a fundação do projeto — mantenha-os como o padrão de todo trabalho.*
