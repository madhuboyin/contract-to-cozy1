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
# Set WORKDIR to the worker's root directory for all setup and execution.
WORKDIR /app/apps/workers
RUN apk add --no-cache openssl
COPY apps/workers/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# 1. FIX: Copy external source files INTO the worker's source tree under a 'shared' folder.
# This makes them resolvable by TSC locally without complex paths configuration.
RUN mkdir -p src/shared/backend/utils src/shared/backend/config
COPY apps/backend/src/utils/riskCalculator.util.ts src/shared/backend/utils/
COPY apps/backend/src/utils/FinancialCalculator.util.ts src/shared/backend/utils/
COPY apps/backend/src/config/risk-constants.ts src/shared/backend/config/

COPY apps/backend/src/services/storage/reportStorage.ts src/shared/backend/services/storage/
COPY apps/backend/src/services/storage/s3Client.ts src/shared/backend/services/storage/
COPY apps/backend/src/services/pdf/renderHomeReportPackPdf.ts src/shared/backend/services/pdf/
COPY apps/backend/src/services/pdf/templates/homeReportPackHtml.ts src/shared/backend/services/pdf/templates/

COPY apps/workers/src ./src
COPY apps/workers/tsconfig.json ./tsconfig.json 

# 2. Install TypeScript for compilation
RUN npm install --save-dev typescript @types/node @types/node-cron

# 3. FIX: Rewrite the import paths in worker.ts using sed, as the files are now local (./shared/backend/...).
# We must install sed first.
RUN apk add --no-cache sed
RUN sed -i 's/\.\.\/\.\.\/backend\/src\/utils\/riskCalculator\.util/\.\/shared\/backend\/utils\/riskCalculator\.util/g' src/worker.ts
RUN sed -i 's/\.\.\/\.\.\/backend\/src\/utils\/FinancialCalculator\.util/\.\/shared\/backend\/utils\/FinancialCalculator\.util/g' src/worker.ts
RUN sed -i 's/\.\.\/\.\.\/backend\/src\/config\/risk-constants/\.\/shared\/backend\/config\/risk-constants/g' src/worker.ts

# Update generateHomeReportExport.job.ts imports to point to the new shared local directory
RUN sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/storage\/reportStorage/\.\.\/shared\/backend\/services\/storage\/reportStorage/g' src/jobs/generateHomeReportExport.job.ts
RUN sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/pdf\/renderHomeReportPackPdf/\.\.\/shared\/backend\/services\/pdf\/renderHomeReportPackPdf/g' src/jobs/generateHomeReportExport.job.ts
# 4. Compile Worker (tsc can now resolve all imports locally)
# Output goes to ./dist/worker.js due to tsconfig rootDir: "./src" and outDir: "./dist"
RUN npx tsc --project ./tsconfig.json \
    2>&1 | tee /tmp/tsc-output.log || (cat /tmp/tsc-output.log && exit 1)

# Final cleanup and execution
RUN npm prune --production
ENV NODE_ENV=production

# The final WORKDIR is /app/apps/workers. The entry file is at ./dist/worker.js.
CMD ["node", "dist/worker.js"]