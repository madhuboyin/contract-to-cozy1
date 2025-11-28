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

# 2. Compile worker locally (using the tsconfig.json copied in the step above)
# This step is preserved for completeness, as ts-node runs compilation on-the-fly, 
# but it ensures local file resolution is checked.
RUN npx tsc --project ./tsconfig.json \
    2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# 3. FIX: Switch WORKDIR to the monorepo root (/app) for execution
# This allows ts-node to resolve all relative imports from the root context correctly.
WORKDIR /app

ENV NODE_ENV=production

# 4. FINAL CMD: Use npx and explicitly point to the tsconfig file.
# The tsconfig is at 'apps/workers/tsconfig.json' and the source file is at 'apps/workers/src/worker.ts'.
CMD ["npx", "ts-node", "--project", "apps/workers/tsconfig.json", "apps/workers/src/worker.ts"]