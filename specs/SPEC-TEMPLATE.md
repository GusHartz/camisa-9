# SPEC-{NNN} — {Nome da Feature}

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.
> Copie este template para `specs/SPEC-{NNN}-{slug}.md` e preencha todos os campos.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-{NNN} |
| **Feature** | {nome legível da feature} |
| **Slug** | {kebab-case — usado no nome da branch e no arquivo DONE} |
| **Owner** | {quem vai desenvolver} |
| **Roadmap item** | {referência ao item no roadmap} |
| **Appetite** | {N dias} |
| **Prioridade** | {HIGH / MEDIUM / LOW} |
| **Criada em** | {YYYY-MM-DD} |
| **Aprovada em** | {YYYY-MM-DD — preencher após aprovação} |
| **Aprovada por** | {nome do arquiteto ou founder} |
| **Status** | {Rascunho / Aprovada / Em desenvolvimento / Concluída} |

---

## Objetivo

> Uma a três frases descrevendo o que esta feature faz e por que existe.
> Responde: o que o usuário vai conseguir fazer que hoje não consegue?

[PREENCHER]

---

## Contexto e motivação

> Por que esta feature é necessária agora? O que ela desbloqueia?
> Referência ao roadmap, à fase atual e à dependência com outras features, se houver.

[PREENCHER]

---

## Escopo — o que está DENTRO

> Liste o que será implementado nesta SPEC. Seja específico.
> Cada item deve ser verificável — ou está feito, ou não está.

- [ ] {item 1}
- [ ] {item 2}
- [ ] {item 3}

---

## Escopo — o que está FORA

> Liste explicitamente o que NÃO será feito nesta SPEC, mesmo que pareça relacionado.
> Evita scope creep durante o desenvolvimento.

- {item fora do escopo e o motivo}
- {item fora do escopo e o motivo}

---

## Arquivos que serão tocados

> Liste todos os arquivos que serão criados, modificados ou deletados.
> A IA só toca arquivos listados aqui — qualquer arquivo fora desta lista exige aprovação.

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `{caminho/do/arquivo}` | criar | — |
| `{caminho/do/arquivo}` | modificar | — |
| `{caminho/do/arquivo}` | deletar | — |

---

## Mudanças de schema (se aplicável)

> Descreva tabelas novas, colunas adicionadas, índices, enums.
> Se não há mudança de schema, escreva "Nenhuma mudança de schema nesta feature."

```sql
-- Exemplo: nova coluna
ALTER TABLE minha_tabela ADD COLUMN novo_campo TEXT;

-- Exemplo: nova tabela
CREATE TABLE nova_entidade (
  id   UUID PRIMARY KEY,
  nome TEXT NOT NULL
);
```

---

## Mudanças de API (se aplicável)

> Liste endpoints novos ou modificados com método, path, body e response.
> Se não há mudança de API, escreva "Nenhuma mudança de API nesta feature."

```
POST /api/recurso/:id/acao
Body: { campo: tipo }
Response 200: { id, ...campos }
Response 403: { error: "Forbidden", code: "INSUFFICIENT_ROLE" }
```

---

## Critérios de aceitação

> Cenários verificáveis que definem que a feature está pronta.
> Formato: dado / quando / então. Cada um deve ser testável.

**Cenário 1 — {nome do cenário}**
- Dado que {contexto}
- Quando {ação}
- Então {resultado esperado}

**Cenário 2 — {nome do cenário}**
- Dado que {contexto}
- Quando {ação}
- Então {resultado esperado}

**Cenário 3 — erro / edge case**
- Dado que {contexto de erro}
- Quando {ação}
- Então {comportamento esperado no erro}

---

## Segurança (se aplicável)

> Esta feature toca autenticação, autorização, segredos, ou input não-confiável?
> Se sim, descreva o gate (quem pode?), a validação de input e o tratamento de segredos.
> Se não, escreva "Sem superfície de segurança relevante."

- {consideração de segurança, ou "N/A"}

---

## Riscos e dependências

> O que pode dar errado? Quais outras features ou serviços externos dependem desta?

| Risco | Probabilidade | Mitigação |
|---|---|---|
| {risco 1} | {Alta/Média/Baixa} | {como mitigar} |
| {risco 2} | {Alta/Média/Baixa} | {como mitigar} |

**Dependências:**
- {feature ou serviço do qual esta SPEC depende}

---

## Notas de implementação

> Orientações específicas para o desenvolvedor e para a IA.
> Padrões a seguir, armadilhas conhecidas, decisões já tomadas.

- {nota 1}
- {nota 2}

---

## Checklist de aprovação

> A ser preenchido pelo arquiteto ou founder antes de aprovar a SPEC.

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora)
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas
- [ ] Critérios de aceitação são testáveis
- [ ] Riscos e superfície de segurança foram avaliados
- [ ] Appetite é razoável para o escopo definido
- [ ] Não há conflito com SPECs abertas em paralelo

---

*Template SPEC — H1VE. Copie para `specs/SPEC-{NNN}-{slug}.md` antes de usar. Ver `specs/README.md` para o fluxo SPEC→DONE.*
