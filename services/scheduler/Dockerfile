# Imagem do scheduler de produção (SPEC-032) — o worker que roda o tick diário às 15h Brasília.
# Um scheduled job da plataforma (Railway/Render cron — ver docs/ops/scheduler-deploy-runbook.md)
# invoca este container 1×/dia; o `main.ts` lê o relógio (Date.now, a ÚNICA borda), roda UM tick
# idempotente e sai. Os services/* rodam via `tsx` (fonte), então o runtime precisa do toolchain +
# os pacotes packages/* BUILDADOS (tsc -b → dist). Batch 1×/dia → imagem simples > imagem mínima
# (compilar os services p/ JS e enxugar devDeps = otimização futura, não bloqueia o deploy).
FROM node:20-slim

WORKDIR /app

# Build com **contexto = raiz do repo**: `docker build -f services/scheduler/Dockerfile .`
# O `.dockerignore` da RAIZ (não um em services/scheduler/, que seria inerte) exclui
# node_modules/dist/.git e QUALQUER `.env*` (OP-12) → COPY traz só a fonte + manifestos.
COPY . .

# Instala TODAS as deps (tsx/tsc/drizzle são necessários no runtime dos services) e builda os
# pacotes composite (packages/world-engine, packages/player → dist), que os services consomem.
RUN npm ci && npm run build

ENV NODE_ENV=production

# O cron invoca `docker run <img>` 1×/dia. DATABASE_URL e WORLD_SEED entram como env (server-only,
# OP-12) — ver .env.example. O tick é idempotente (rodar 2× no mesmo dia = no-op) e faz catch-up.
CMD ["npm", "run", "start", "-w", "services/scheduler"]
