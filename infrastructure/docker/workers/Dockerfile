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
WORKDIR /app/apps/workers
RUN apk add --no-cache openssl
COPY apps/workers/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# Copy backend source files to match the expected import paths
RUN mkdir -p ../../backend/src/utils ../../backend/src/config
COPY apps/backend/src/utils/riskCalculator.util.ts ../../backend/src/utils/
COPY apps/backend/src/config/risk-constants.ts ../../backend/src/config/

# Copy workers source and tsconfig
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.docker.json ./tsconfig.json
RUN npm install --save-dev typescript @types/node @types/node-cron

# Compile TypeScript (this will compile both workers and backend files)
RUN npx tsc --project ./tsconfig.json 2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# Verify the compiled files exist in the expected locations
RUN echo "=== Checking compiled worker file ===" && \
    ls -la dist/apps/workers/src/worker.js && \
    echo "=== Checking compiled backend files ===" && \
    ls -la dist/backend/src/utils/riskCalculator.util.js && \
    ls -la dist/backend/src/config/risk-constants.js || \
    (echo "ERROR: Required compiled files not found!" && \
     echo "Dist structure:" && find dist -type f -name "*.js" | head -20 && \
     exit 1)

RUN npm prune --production
ENV NODE_ENV=production
CMD ["node", "dist/apps/workers/src/worker.js"]
