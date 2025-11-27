#infrastructure/docker/workers/Dockerfile
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
# Set WORKDIR to worker for setting up dependencies and compilation tools
WORKDIR /app/apps/workers
RUN apk add --no-cache openssl
COPY apps/workers/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# 1. Ensure external TS files and directories are copied correctly
RUN mkdir -p ../../backend/src/utils ../../backend/src/config
COPY apps/backend/src/utils/riskCalculator.util.ts ../../backend/src/utils/
COPY apps/backend/src/config/risk-constants.ts ../../backend/src/config/
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.docker.json ./tsconfig.json

# 2. Install TypeScript for compilation
RUN npm install --save-dev typescript @types/node @types/node-cron

# 3. FIX: Compile all necessary source files explicitly from the monorepo root (/app)
# This ensures a consistent output path (dist) and correctly compiles cross-project imports.
WORKDIR /app
# We run `tsc` on all three necessary files, outputting them to the 'dist' folder.
RUN npx tsc \
    apps/workers/src/worker.ts \
    apps/backend/src/utils/riskCalculator.util.ts \
    apps/backend/src/config/risk-constants.ts \
    --outDir dist \
    --module commonjs \
    --target ES2020 \
    --skipLibCheck true \
    2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# 4. Return to the worker's directory for final cleanup steps
WORKDIR /app/apps/workers

RUN npm prune --production
ENV NODE_ENV=production
# FINAL FIX: Use the absolute path, which is the exact path Node failed to find.
CMD ["node", "/app/dist/apps/workers/src/worker.js"]