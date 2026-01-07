# ============================================================================
# Stage 1: Builder - Install deps (including dev), generate Prisma, compile TS
# ============================================================================
FROM node:20-bullseye-slim AS builder
WORKDIR /app

# Build deps (openssl for prisma)
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Copy package files for both workers and backend (for prisma client)
COPY apps/workers/package*.json ./apps/workers/
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma

# Install backend deps + generate prisma client
WORKDIR /app/apps/backend
RUN npm ci
RUN npx prisma generate

# Install worker deps (dev deps included so TS build works)
WORKDIR /app/apps/workers
RUN npm ci

# Copy shared backend source files into worker source tree
RUN mkdir -p src/shared/backend/utils src/shared/backend/config src/shared/backend/services/storage src/shared/backend/services/pdf/templates
COPY apps/backend/src/utils/riskCalculator.util.ts src/shared/backend/utils/
COPY apps/backend/src/utils/FinancialCalculator.util.ts src/shared/backend/utils/
COPY apps/backend/src/config/risk-constants.ts src/shared/backend/config/
COPY apps/backend/src/services/storage/reportStorage.ts src/shared/backend/services/storage/
COPY apps/backend/src/services/storage/s3Client.ts src/shared/backend/services/storage/
COPY apps/backend/src/services/pdf/renderHomeReportPackPdf.ts src/shared/backend/services/pdf/
COPY apps/backend/src/services/pdf/templates/homeReportPackHtml.ts src/shared/backend/services/pdf/templates/
COPY apps/backend/src/services/domainEvents/domainEvents.service.ts src/shared/backend/services/domainEvents/
# Copy worker source code + TS config
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.json ./tsconfig.json

# Rewrite import paths (same as you had, but do it in builder)
RUN sed -i 's/\.\.\/\.\.\/backend\/src\/utils\/riskCalculator\.util/\.\/shared\/backend\/utils\/riskCalculator\.util/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/utils\/FinancialCalculator\.util/\.\/shared\/backend\/utils\/FinancialCalculator\.util/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/config\/risk-constants/\.\/shared\/backend\/config\/risk-constants/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/storage\/reportStorage/\.\.\/shared\/backend\/services\/storage\/reportStorage/g' src/jobs/generateHomeReportExport.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/pdf\/renderHomeReportPackPdf/\.\.\/shared\/backend\/services\/pdf\/renderHomeReportPackPdf/g' src/jobs/generateHomeReportExport.job.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/services\/domainEvents\/domainEvents\.service/\.\/shared\/backend\/services\/domainEvents\/domainEvents\.service/g' src/runners/claimFollowUpDue.poller.ts
# Compile TS -> dist/
RUN npx tsc --project ./tsconfig.json

# Prune to production dependencies
RUN npm prune --omit=dev


# ============================================================================
# Stage 2: Runtime - Small image with system Chromium + prod deps + dist
# ============================================================================
FROM node:20-bullseye-slim AS runner
WORKDIR /app/apps/workers

# Install only runtime libs + Chromium (NO playwright browser downloads)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    chromium \
    ca-certificates \
    fonts-liberation \
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
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Critical: prevent Playwright from downloading browsers at runtime
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_PATH=/usr/bin/chromium

# Copy prod node_modules + dist from builder
COPY --from=builder /app/apps/workers/package*.json ./
COPY --from=builder /app/apps/workers/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/apps/workers/dist ./dist

# Health check (same as before)
HEALTHCHECK --interval=60s --timeout=3s --start-period=60s --retries=3 \
  CMD pgrep -f "node dist/worker.js" || exit 1

CMD ["node", "dist/worker.js"]
