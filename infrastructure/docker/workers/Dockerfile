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
# Set WORKDIR to worker for setting up local dependencies (ts-node)
WORKDIR /app/apps/workers
RUN apk add --no-cache openssl
COPY apps/workers/package*.json ./
RUN npm ci --only=production

# FIX: Install ts-node and typescript for runtime execution via npx
RUN npm install typescript ts-node

COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# 1. Copy all source files required by the worker, maintaining the relative path structure
RUN mkdir -p ../../backend/src/utils ../../backend/src/config
COPY apps/backend/src/utils/riskCalculator.util.ts ../../backend/src/utils/
COPY apps/backend/src/config/risk-constants.ts ../../backend/src/config/
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.docker.json ./tsconfig.json

# 2. FIX: Switch WORKDIR to the monorepo root (/app) for execution
# This allows ts-node to resolve all relative paths correctly.
WORKDIR /app

ENV NODE_ENV=production

# 3. FINAL CMD: Use npx and the path relative to the new WORKDIR (/app)
CMD ["npx", "ts-node", "apps/workers/src/worker.ts"]