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

# First, compile the backend utility files to the expected location
# The compiled worker.js will be at dist/apps/workers/src/worker.js
# It imports ../../backend/src/utils/riskCalculator.util
# So we need files at dist/backend/src/utils/riskCalculator.util.js
RUN mkdir -p dist/backend/src/utils dist/backend/src/config
RUN cat > /tmp/backend-tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "../..",
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "baseUrl": "../..",
    "moduleResolution": "node",
    "paths": {
      "@prisma/client": ["apps/workers/node_modules/@prisma/client"]
    }
  },
  "include": [
    "../../backend/src/config/risk-constants.ts",
    "../../backend/src/utils/riskCalculator.util.ts"
  ]
}
EOF

# Compile backend files first (will output to dist/backend/src/utils and dist/backend/src/config)
RUN npx tsc --project /tmp/backend-tsconfig.json 2>&1 | tee /tmp/backend-tsc.log || (cat /tmp/backend-tsc.log && echo "Backend compilation had errors but continuing...")

# Now compile the workers (which imports the backend files)
RUN npx tsc --project ./tsconfig.json 2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# Debug: Show what was compiled
RUN echo "=== Compiled files structure ===" && \
    find dist -type f -name "*.js" | sort

# Verify the compiled files exist in the expected locations
RUN echo "=== Final verification ===" && \
    test -f dist/apps/workers/src/worker.js && \
    test -f dist/backend/src/utils/riskCalculator.util.js && \
    test -f dist/backend/src/config/risk-constants.js && \
    echo "✓ All required files found" || \
    (echo "ERROR: Required compiled files not found!" && \
     echo "Dist structure:" && find dist -type f -name "*.js" | head -20 && \
     exit 1)

RUN npm prune --production
ENV NODE_ENV=production
CMD ["node", "dist/apps/workers/src/worker.js"]
