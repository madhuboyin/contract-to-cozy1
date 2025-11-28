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
# Set WORKDIR to the worker's root directory for local file compilation
WORKDIR /app/apps/workers
RUN apk add --no-cache openssl
COPY apps/workers/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# 1. Copy source files to the expected monorepo structure
# This structure is necessary for the relative import '../../backend/src/...' to work.
RUN mkdir -p ../../backend/src/utils ../../backend/src/config
COPY apps/backend/src/utils/riskCalculator.util.ts ../../backend/src/utils/
COPY apps/backend/src/config/risk-constants.ts ../../backend/src/config/
COPY apps/workers/src ./src
# We assume the user is using the copied tsconfig as the active one
COPY apps/workers/tsconfig.json ./tsconfig.json 

# 2. Install TypeScript for compilation
RUN npm install --save-dev typescript @types/node @types/node-cron

# 3. FIX: Compile dependencies and worker separately into their final runtime locations.

# --- Compile Backend Dependencies (Target: /app/backend/src/...) ---
# This ensures the files needed by the worker's relative imports are generated.
WORKDIR /app
RUN npx tsc apps/backend/src/utils/riskCalculator.util.ts --outDir backend/src/utils --module commonjs
RUN npx tsc apps/backend/src/config/risk-constants.ts --outDir backend/src/config --module commonjs

# --- Compile Worker (Target: /app/apps/workers/dist) ---
WORKDIR /app/apps/workers
RUN npx tsc --project ./tsconfig.json \
    2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# Final cleanup and execution
RUN npm prune --production
ENV NODE_ENV=production

# The final WORKDIR is /app/apps/workers. The entry file is at ./dist/worker.js.
# This successfully bypasses the TSError by ensuring the compiler output matches the final Node.js require path.
CMD ["node", "dist/worker.js"]