# DONE-{NNN} — {Nome da Feature}

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Deve ser criado ANTES de abrir o PR — é pré-requisito para o arquiteto fazer review.
> Copie este template para `specs/DONE-{NNN}-{slug}.md` e preencha todos os campos.
> O número {NNN} deve ser o mesmo do SPEC correspondente.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-{NNN} |
| **SPEC correspondente** | SPEC-{NNN}-{slug}.md |
| **Feature** | {nome legível da feature} |
| **Owner** | {quem desenvolveu} |
| **Branch** | `feat/{owner}/{slug}` |
| **PR** | {link para o PR} |
| **Desenvolvimento iniciado** | {YYYY-MM-DD} |
| **Desenvolvimento concluído** | {YYYY-MM-DD} |
| **Dias utilizados vs appetite** | {N dias utilizados} vs {N dias appetite} |

---

## Resumo do que foi feito

> Descrição em 3 a 5 linhas do que foi implementado.
> Deve ser compreensível por alguém que não participou do desenvolvimento.

[PREENCHER]

---

## Arquivos criados

> Liste todos os arquivos novos adicionados ao repositório.

| Arquivo | Descrição |
|---|---|
| `{caminho/do/arquivo}` | {o que faz} |

---

## Arquivos modificados

> Liste todos os arquivos existentes que foram alterados e o que mudou.

| Arquivo | O que mudou |
|---|---|
| `{caminho/do/arquivo}` | {descrição da mudança} |
| `CLAUDE.md` | Seção "Estado atual" atualizada |
| `docs/roadmap.md` | Status do item atualizado |

---

## Mudanças de schema aplicadas

> Descreva as migrations criadas. Se não houve, escreva "Nenhuma migration neste DONE."
> ⚠️ Se o deploy não roda migration automaticamente, registre aqui que ela precisa ser
> aplicada manualmente no ambiente de produção.

| Migration | Descrição |
|---|---|
| `{arquivo de migration}` | {o que criou/alterou} |

---

## Mudanças de API entregues

> Liste endpoints implementados. Se nenhum, escreva "Nenhuma mudança de API neste DONE."

| Método | Endpoint | Status |
|---|---|---|
| POST | `/api/recurso/:id/acao` | ✅ implementado |
| GET  | `/api/recurso` | ✅ atualizado |

---

## Critérios de aceitação — verificação

> Retome cada critério do SPEC e confirme se foi atendido.

| Critério | Status | Observação |
|---|---|---|
| Cenário 1 — {nome} | ✅ / ❌ / ⚠️ parcial | {observação se necessário} |
| Cenário 2 — {nome} | ✅ / ❌ / ⚠️ parcial | |
| Cenário 3 — {nome} | ✅ / ❌ / ⚠️ parcial | |

---

## Como testar manualmente

> Passo a passo para o arquiteto ou QA verificar o funcionamento.
> Deve ser reproduzível sem conhecimento prévio da implementação.

```
1. [ação 1]
2. [ação 2]
3. Resultado esperado: [o que deve aparecer]
```

**Dados de teste necessários:**
- {pré-condição 1}
- {pré-condição 2}

---

## Testes automatizados

> Liste os testes criados ou atualizados neste desenvolvimento.

| Arquivo de teste | O que testa |
|---|---|
| `{caminho/do/teste}` | {cenário coberto} |
| `{caminho/do/teste}` | {happy path + erro de auth/role} |

**Comando para rodar:**
```bash
npm test
```

---

## AI Declaration

> Declaração obrigatória sobre o uso de IA neste desenvolvimento.

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `{caminho/do/arquivo}` | {ex: 80%} | {sim/não} |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [ ] Não
- [ ] Sim → {descreva o que foi sugerido e como foi tratado}

---

## Desvios em relação à SPEC

> O que foi feito de forma diferente do especificado e por quê.
> Se não houve desvio, escreva "Implementação seguiu a SPEC sem desvios."

| Item da SPEC | O que foi feito | Motivo do desvio |
|---|---|---|
| {item} | {o que foi feito} | {motivo} |

---

## Limitações conhecidas

> O que não foi feito mas está parcialmente funcional, ou funciona com restrições.
> Diferente de bugs — são limitações aceitas conscientemente nesta entrega.

- {limitação e impacto}

---

## Débito técnico gerado

> Código ou decisão tomada conscientemente que precisa ser revisitada.
> Cada item deve ter uma sugestão de quando/como resolver.

| Item | Impacto | Quando resolver |
|---|---|---|
| {item} | {Baixo/Médio/Alto} | {próximo ciclo / SPEC separada} |

---

## Checklist de entrega

> A ser preenchido pelo desenvolvedor antes de solicitar review do arquiteto.

- [ ] Todos os critérios de aceitação verificados
- [ ] Testes criados e passando
- [ ] Typecheck limpo
- [ ] Lint limpo
- [ ] Nenhum log de debug em código de produção
- [ ] Nenhum tipo `any` introduzido (ou justificado)
- [ ] Nenhum segredo hardcoded
- [ ] AI Declaration preenchida acima
- [ ] `CLAUDE.md` seção "Estado atual" atualizada
- [ ] `docs/roadmap.md` status do item atualizado
- [ ] Este DONE está completo e commitado na branch

---

*Template DONE — H1VE. Copie para `specs/DONE-{NNN}-{slug}.md` antes de usar. Ver `specs/README.md` para o fluxo SPEC→DONE.*
