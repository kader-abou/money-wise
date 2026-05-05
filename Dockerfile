# ─── Stage 1 : Build ──────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bunx prisma generate
RUN bun run build

# ─── Stage 2 : Production ─────────────────────────────────────────────────────
FROM oven/bun:1-slim AS production
WORKDIR /app

ENV NODE_ENV=production

# Copier uniquement ce qui est nécessaire au runtime
COPY --from=builder /app/dist           ./dist
COPY --from=builder /app/node_modules   ./node_modules
COPY --from=builder /app/package.json   ./

EXPOSE 2026

CMD ["bun", "dist/server.js"]
