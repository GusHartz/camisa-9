# Imagem da API (SPEC-037) — o web service da camada HTTP/sessão.
# Diferente do scheduler (que roda um tick e SAI), este processo fica VIVO escutando a porta: a
# plataforma o trata como web service com healthcheck em `GET /healthz` (que de propósito NÃO toca
# o banco — ver docs/ops/scheduler-deploy-runbook.md, seção "API (web service)").
# Os services/* rodam via `tsx` (fonte), então o runtime precisa do toolchain + os packages/*
# BUILDADOS (tsc -b → dist).
FROM node:20-slim

WORKDIR /app

# Build com **contexto = raiz do repo**: `docker build -f services/api/Dockerfile .`
# O `.dockerignore` da RAIZ (não um em services/api/, que seria inerte) exclui node_modules/dist/.git
# e QUALQUER `.env*` (OP-12) → COPY traz só a fonte + manifestos.
COPY . .

RUN npm ci && npm run build

ENV NODE_ENV=production

# `PORT` é injetada pela plataforma; `DATABASE_URL` e `TRUST_PROXY_HOPS` entram como env server-only
# (OP-12) — ver .env.example. ⚠️ `TRUST_PROXY_HOPS` NÃO é opcional atrás do proxy da plataforma:
# com o default 0 todos os clientes caem num balde de rate limit só (auto-DoS).
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "services/api"]
