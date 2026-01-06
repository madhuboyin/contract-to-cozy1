# ============================================================================
# Stage 1: Builder - Install dependencies and compile TypeScript
# ============================================================================
FROM node:20-bullseye-slim AS builder
WORKDIR /app

# Install build dependencies (OpenSSL for Prisma)
RUN apt-get update && \
    apt-get install -y openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files for both workers and backend
COPY apps/workers/package*.json ./apps/workers/
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma

# Install workers dependencies
WORKDIR /app/apps/workers
RUN npm ci

# Install backend dependencies and generate Prisma client
WORKDIR /app/apps/backend
RUN npm ci
RUN npx prisma generate

# ============================================================================
# Stage 2: Runner - Production image with Playwright/Chromium support
# ============================================================================
FROM node:20-bullseye-slim

# Set WORKDIR to the worker's root directory
WORKDIR /app/apps/workers

# Install runtime dependencies including Playwright/Chromium requirements
RUN apt-get update && \
    apt-get install -y \
    # OpenSSL for Prisma
    openssl \
    # Playwright/Chromium dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    # Additional tools
    wget \
    curl \
    fonts-liberation \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY apps/workers/package*.json ./
RUN npm ci --only=production

# Copy Prisma client from builder
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# Copy shared backend source files into worker's source tree
RUN mkdir -p src/shared/backend/utils src/shared/backend/config src/shared/backend/services/storage src/shared/backend/services/pdf/templates
COPY apps/backend/src/utils/riskCalculator.util.ts src/shared/backend/utils/
COPY apps/backend/src/utils/FinancialCalculator.util.ts src/shared/backend/utils/
COPY apps/backend/src/config/risk-constants.ts src/shared/backend/config/
COPY apps/backend/src/services/storage/reportStorage.ts src/shared/backend/services/storage/
COPY apps/backend/src/services/storage/s3Client.ts src/shared/backend/services/storage/
COPY apps/backend/src/services/pdf/renderHomeReportPackPdf.ts src/shared/backend/services/pdf/
COPY apps/backend/src/services/pdf/templates/homeReportPackHtml.ts src/shared/backend/services/pdf/templates/

# Copy worker source code and TypeScript config
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.json ./tsconfig.json 

# Install TypeScript and type definitions for compilation
RUN npm install --save-dev typescript @types/node @types/node-cron

# Rewrite import paths to use local shared directory
RUN sed -i 's/\.\.\/\.\.\/backend\/src\/utils\/riskCalculator\.util/\.\/shared\/backend\/utils\/riskCalculator\.util/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/utils\/FinancialCalculator\.util/\.\/shared\/backend\/utils\/FinancialCalculator\.util/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/config\/risk-constants/\.\/shared\/backend\/config\/risk-constants/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/storage\/reportStorage/\.\.\/shared\/backend\/services\/storage\/reportStorage/g' src/jobs/generateHomeReportExport.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/pdf\/renderHomeReportPackPdf/\.\.\/shared\/backend\/services\/pdf\/renderHomeReportPackPdf/g' src/jobs/generateHomeReportExport.job.ts

# Compile TypeScript to JavaScript
RUN npx tsc --project ./tsconfig.json \
    2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# Install Playwright browsers (as root before switching to non-root user)
RUN npx playwright install chromium --with-deps

# Clean up development dependencies
RUN npm prune --production

# Set production environment
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

# Health check for worker process
HEALTHCHECK --interval=60s --timeout=3s --start-period=60s --retries=3 \
  CMD pgrep -f "node dist/worker.js" || exit 1

# Run the worker
CMD ["node", "dist/worker.js"]