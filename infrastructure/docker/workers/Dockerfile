# ============================================================================
# Stage 1: Builder - Install deps (including dev), generate Prisma, compile TS
# ============================================================================
FROM node:20-bullseye-slim AS builder
WORKDIR /app
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=120000

# Build deps (openssl for prisma)
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Copy package files for both workers and backend (for prisma client)
COPY apps/workers/package*.json ./apps/workers/
COPY apps/workers/scripts/sync-prisma-client.js ./apps/workers/scripts/
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma

# Install backend deps + generate prisma client
WORKDIR /app/apps/backend
RUN for attempt in 1 2 3; do \
      npm ci --no-audit --no-fund && break; \
      if [ "$attempt" -eq 3 ]; then \
        echo "npm ci failed after ${attempt} attempts"; \
        exit 1; \
      fi; \
      echo "npm ci failed (attempt ${attempt}), retrying in $((attempt * 10))s..."; \
      sleep $((attempt * 10)); \
    done
RUN npx prisma generate

# Compile the complete backend once. Worker TypeScript consumes its emitted
# declarations, and the runtime exposes its dist tree as @worker-shared.
COPY apps/backend/tsconfig.json ./tsconfig.json
COPY apps/backend/src ./src
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Install worker deps (dev deps included so TS build works)
WORKDIR /app/apps/workers
RUN for attempt in 1 2 3; do \
      npm ci --no-audit --no-fund && break; \
      if [ "$attempt" -eq 3 ]; then \
        echo "npm ci failed after ${attempt} attempts"; \
        exit 1; \
      fi; \
      echo "npm ci failed (attempt ${attempt}), retrying in $((attempt * 10))s..."; \
      sleep $((attempt * 10)); \
    done
RUN node -e "const sdk = require('@google/genai'); if (typeof sdk.GoogleGenAI !== 'function') throw new Error('@google/genai CommonJS export is invalid')"

# Preserve the worker image's established safe overrides while consuming the
# complete backend artifact for dependency closure.
COPY apps/workers/stubs ./stubs
COPY apps/workers/scripts/build-worker-backend-overrides.js ./scripts/
RUN node ./scripts/build-worker-backend-overrides.js ../backend/dist ./stubs

# Copy worker source code + TS config
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.json ./tsconfig.json
COPY apps/workers/tsconfig.docker.json ./tsconfig.docker.json

# W5 (items 1/2/4): worker source no longer imports backend files via
# `../../../backend/src/...`-style relative paths that need per-file `sed`
# rewriting — every such import now goes through the `@worker-shared/*`
# alias. tsconfig.docker.json resolves the alias against backend declarations;
# the runtime package link below resolves the unchanged emitted alias.
RUN NODE_OPTIONS=--max-old-space-size=4096 npx tsc --project ./tsconfig.docker.json \
  && npx tsc-alias -p ./tsconfig.docker.json

# Prune to production dependencies
RUN npm prune --omit=dev
WORKDIR /app/apps/backend
RUN npm prune --omit=dev


# ============================================================================
# Stage 2: Runtime - Small image with system Chromium + prod deps + dist
# ============================================================================
FROM node:20-bullseye-slim AS runner
WORKDIR /app/apps/workers

# Install runtime libs + Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    chromium \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_PATH=/usr/bin/chromium

# Copy prod node_modules + dist from builder
COPY --from=builder /app/apps/workers/package*.json ./
COPY --from=builder /app/apps/workers/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/apps/workers/dist ./dist
COPY --from=builder /app/apps/backend/package*.json /app/apps/backend/
COPY --from=builder /app/apps/backend/node_modules /app/apps/backend/node_modules
COPY --from=builder /app/apps/backend/dist /app/apps/backend/dist

# Node treats @worker-shared/<area>/<module> as a scoped package subpath.
# Linking the scope to backend/dist keeps every emitted worker import stable.
RUN ln -s /app/apps/backend/dist /app/apps/workers/node_modules/@worker-shared \
  && node -e "const fs = require('fs'); const p = require.resolve('@worker-shared/services/decisionPlatform/homeActionProactiveDelivery.service'); if (!p.startsWith('/app/apps/backend/dist/')) throw new Error(p); const notification = fs.readFileSync(require.resolve('@worker-shared/services/notification.service'), 'utf8'); if (!notification.includes('workerPersisted')) throw new Error('worker notification override missing')"

RUN node -e "const sdk = require('@google/genai'); if (typeof sdk.GoogleGenAI !== 'function') throw new Error('@google/genai CommonJS export is invalid')"

HEALTHCHECK --interval=60s --timeout=3s --start-period=60s --retries=3 \
  CMD pgrep -f "node dist/worker.js" || exit 1

CMD ["node", "dist/worker.js"]
