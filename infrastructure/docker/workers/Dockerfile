# infrastructure/docker/workers/Dockerfile
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
# Set WORKDIR to the worker's root directory for all setup, compilation, and execution.
WORKDIR /app/apps/workers
RUN apk add --no-cache openssl
COPY apps/workers/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# 1. Copy source files to expected relative locations (for compilation/module resolution)
RUN mkdir -p ../../backend/src/utils ../../backend/src/config
COPY apps/backend/src/utils/riskCalculator.util.ts ../../backend/src/utils/
COPY apps/backend/src/config/risk-constants.ts ../../backend/src/config/
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.docker.json ./tsconfig.json

# 2. Install TypeScript for compilation
RUN npm install --save-dev typescript @types/node @types/node-cron

# 3. FIX: Explicitly compile the worker's file and its dependencies.
# We set --outDir dist and --rootDir src to force a flat output structure: dist/worker.js.
RUN npx tsc \
    ./src/worker.ts \
    ../../backend/src/utils/riskCalculator.util.ts \
    ../../backend/src/config/risk-constants.ts \
    --outDir dist \
    --rootDir src \
    --module commonjs \
    --target ES2020 \
    --skipLibCheck true \
    2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

RUN npm prune --production
ENV NODE_ENV=production

# 4. FINAL CMD: The final WORKDIR is /app/apps/workers, so the correct local path is used.
# The path is now fixed to the expected flat output: /app/apps/workers/dist/worker.js
CMD ["node", "dist/worker.js"]