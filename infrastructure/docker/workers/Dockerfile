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
RUN npx tsc --project /tmp/backend-tsconfig.json 2>&1 | tee /tmp/backend-tsc.log && \
    echo "=== Backend compilation output ===" && \
    cat /tmp/backend-tsc.log

# Debug: Show what backend files were compiled
RUN echo "=== Backend compiled files ===" && \
    find dist -type f -name "*.js" | grep -E "(backend|risk)" | sort || echo "No backend files found yet"

# Now compile the workers (which imports the backend files)
RUN npx tsc --project ./tsconfig.json 2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# Debug: Show what was compiled
RUN echo "=== All compiled files structure ===" && \
    find dist -type f -name "*.js" | sort

# CRITICAL: Ensure backend files are in the exact location the runtime import expects
# The compiled worker.js at dist/apps/workers/src/worker.js imports ../../backend/src/utils/riskCalculator.util
# So we need files at dist/backend/src/utils/riskCalculator.util.js
RUN echo "=== Ensuring backend files are in correct location ===" && \
    mkdir -p dist/backend/src/utils dist/backend/src/config && \
    if [ -f dist/backend/src/utils/riskCalculator.util.js ]; then \
        echo "✓ Backend util already in correct location"; \
    else \
        echo "⚠ Backend util not found, searching..." && \
        BACKEND_UTIL=$(find dist -name "riskCalculator.util.js" 2>/dev/null | head -1) && \
        if [ -n "$BACKEND_UTIL" ]; then \
            echo "Found at: $BACKEND_UTIL, copying to expected location" && \
            cp "$BACKEND_UTIL" dist/backend/src/utils/riskCalculator.util.js; \
        else \
            echo "ERROR: riskCalculator.util.js not found anywhere in dist!" && \
            exit 1; \
        fi; \
    fi && \
    if [ -f dist/backend/src/config/risk-constants.js ]; then \
        echo "✓ Backend config already in correct location"; \
    else \
        echo "⚠ Backend config not found, searching..." && \
        BACKEND_CONFIG=$(find dist -name "risk-constants.js" 2>/dev/null | head -1) && \
        if [ -n "$BACKEND_CONFIG" ]; then \
            echo "Found at: $BACKEND_CONFIG, copying to expected location" && \
            cp "$BACKEND_CONFIG" dist/backend/src/config/risk-constants.js; \
        else \
            echo "ERROR: risk-constants.js not found anywhere in dist!" && \
            exit 1; \
        fi; \
    fi

# Final verification with explicit error messages
RUN echo "=== Final verification ===" && \
    if [ ! -f dist/apps/workers/src/worker.js ]; then \
        echo "ERROR: worker.js not found!" && exit 1; \
    fi && \
    if [ ! -f dist/backend/src/utils/riskCalculator.util.js ]; then \
        echo "ERROR: riskCalculator.util.js not found at dist/backend/src/utils/riskCalculator.util.js" && \
        echo "Current dist structure:" && find dist -type f | head -20 && \
        exit 1; \
    fi && \
    if [ ! -f dist/backend/src/config/risk-constants.js ]; then \
        echo "ERROR: risk-constants.js not found at dist/backend/src/config/risk-constants.js" && \
        exit 1; \
    fi && \
    echo "✓ All required files verified:" && \
    ls -lh dist/apps/workers/src/worker.js && \
    ls -lh dist/backend/src/utils/riskCalculator.util.js && \
    ls -lh dist/backend/src/config/risk-constants.js

RUN npm prune --production
ENV NODE_ENV=production
CMD ["node", "dist/apps/workers/src/worker.js"]
