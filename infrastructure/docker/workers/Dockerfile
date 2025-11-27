FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY apps/workers/package*.json ./apps/workers/
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma
WORKDIR /app/apps/workers
RUN npm ci
WORKDIR /app/apps/backend
RUN npm ci
RUN npx prisma generate

FROM node:20-alpine
# Set WORKDIR to the worker's root directory for all setup and execution.
WORKDIR /app/apps/workers
RUN apk add --no-cache openssl
COPY apps/workers/package*.json ./
# Install production dependencies and ts-node/typescript for runtime execution
RUN npm ci --only=production
RUN npm install typescript ts-node --force # Install ts-node for direct execution

COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# 1. Copy ALL source files required by the worker's source file (worker.ts)
# The file structure MUST match the relative imports in worker.ts
RUN mkdir -p ../../backend/src/utils ../../backend/src/config
COPY apps/backend/src/utils/riskCalculator.util.ts ../../backend/src/utils/
COPY apps/backend/src/config/risk-constants.ts ../../backend/src/config/
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.docker.json ./tsconfig.json 

# 2. Cleanup dev dependencies (already handled by the npm install above, but safe to keep)
RUN npm prune --production

ENV NODE_ENV=production
# FIX: Execute the worker directly using ts-node. This eliminates the compilation step and runtime path resolution issues.
CMD ["ts-node", "src/worker.ts"]