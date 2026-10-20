# syntax=docker/dockerfile:1

# --- Build: install everything, build the SPA and the server bundle ---
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# Drop dev dependencies, then regenerate the Prisma client into what is left.
RUN npm prune --omit=dev && npx prisma generate

# --- Runtime: production dependencies and build output only ---
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/app/uploads
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Migrations run on every start; prisma takes an advisory lock, so replicas
# starting together do not race. exec hands signals straight to node.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/server.cjs"]
