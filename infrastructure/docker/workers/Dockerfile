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
# Set WORKDIR to the worker's root directory for all subsequent commands.
WORKDIR /app/apps/workers
RUN apk add --no-cache openssl
COPY apps/workers/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# 1. Copy source files to the expected monorepo structure
RUN mkdir -p ../../backend/src/utils ../../backend/src/config
COPY apps/backend/src/utils/riskCalculator.util.ts ../../backend/src/utils/
COPY apps/backend/src/config/risk-constants.ts ../../backend/src/config/
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.json ./tsconfig.json 

# 2. Install TypeScript for compilation (Happens in WORKDIR /app/apps/workers)
RUN npm install --save-dev typescript @types/node @types/node-cron

# 3. FIX: Compile Backend Dependencies from the current WORKDIR.
# Input is relative to current directory (../../backend/src/...)
# Output is explicitly set to the final location (../../backend/src/...)
# This resolves the 'tsc not found' error by using the locally installed binary.
RUN npx tsc ../../backend/src/utils/riskCalculator.util.ts --outDir ../../backend/src/utils --module commonjs
RUN npx tsc ../../backend/src/config/risk-constants.ts --outDir ../../backend/src/config --module commonjs

# 4. Compile Worker (Output goes to ./dist/worker.js due to tsconfig rootDir)
RUN npx tsc --project ./tsconfig.json \
    2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# Final cleanup and execution
RUN npm prune --production
ENV NODE_ENV=production

# The final WORKDIR is /app/apps/workers. The entry file is at ./dist/worker.js.
CMD ["node", "dist/worker.js"]