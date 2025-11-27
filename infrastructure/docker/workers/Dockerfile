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

# FIX START: Ensure external TS dependencies are copied and compiled into the correct final location.

# 1. Set up the expected directory structure for the dependencies relative to the worker's root.
RUN mkdir -p ../../backend/src/utils ../../backend/src/config

# 2. Copy the external TS source files to their build-time location (/app/backend/src/...).
COPY apps/backend/src/utils/riskCalculator.util.ts ../../backend/src/utils/
COPY apps/backend/src/config/risk-constants.ts ../../backend/src/config/

# 3. Copy the worker's source files.
COPY apps/workers/src ./src

# 4. Install dev dependencies needed for compilation.
COPY apps/workers/tsconfig.docker.json ./tsconfig.json
RUN npm install --save-dev typescript @types/node @types/node-cron

# 5. Explicitly COMPILE the external dependencies and output the resulting .js files 
# into the location Node.js will expect them from inside the compiled worker.js.
# Path resolution: worker.js imports '../../backend/src/utils/...' which resolves at runtime to 'dist/apps/backend/src/utils/...'
RUN npx tsc --outDir dist/apps/backend/src --module commonjs ../../backend/src/utils/riskCalculator.util.ts
RUN npx tsc --outDir dist/apps/backend/src --module commonjs ../../backend/src/config/risk-constants.ts

# 6. Compile the worker's own source code.
RUN npx tsc --project ./tsconfig.json --listFiles --traceResolution 2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# FIX END.

RUN npm prune --production
ENV NODE_ENV=production
CMD ["node", "dist/apps/workers/src/worker.js"]