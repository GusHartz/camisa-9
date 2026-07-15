# Memória do projeto

> Fatos DURÁVEIS destilados automaticamente do fluxo (decisões, gotchas, invariantes), ancorados por
> ENTIDADE. **Gerado pelo H1VE — não editar à mão** (é sobrescrito). Eterno: nada é apagado.

## 🧭 Invariantes (valem sempre — leia antes de mexer na área)

- **Guardrail ESLint barra Intl.DateTimeFormat e Date em packages/*/src; único Date.now permitido é no harness** — eslint.config.mjs estende o guardrail para proibir Intl.DateTimeFormat (além de Date já barrado) dentro de packages/*/src. O único ponto de impureza de relógio/fuso permitido é harness/run-season.ts. Violar isso quebra o determinismo cross-plataforma silenciosamente. · `world-engine` `guardrail` `eslint`

## 🎯 Decisões

- **Determinismo cross-plataforma: sem transcendentais, sem Intl/Date, golden commitado** — O motor usa PRNG uint32 puro (cyrb128+sfc32, saída x>>>0/2**32), CDF de Poisson pré-tabelada em inteiro (sem exp/log/pow) e âncora UTC-3 por aritmética de epoch (offset fixo -3h, sem Intl/ICU/Date). Motivo: float transcendental e ICU variam entre plataformas, corrompendo replay e auditoria. O golden (hash da temporada canônica + KAT do PRNG + vetor de âncora) é assertado no CI, provando determinismo cross-ambiente por construção. · `world-engine` `engine` `determinismo`
- **Persistência in-memory com shim transacional; atomicidade de DB adiada para SPEC-002 (0.2)** — O spike prova o contrato do publicador (rollback total, nenhum leitor vê estado intermediário via begin/stage/commit/swap) mas NÃO prova atomicidade de banco. Concorrência real, durabilidade pós-crash e lock distribuído ficam explicitamente em aberto até 0.2. Registrado como claim honesto para não ser reaberto como dívida técnica surpresa. · `world-engine` `orchestration` `store`
