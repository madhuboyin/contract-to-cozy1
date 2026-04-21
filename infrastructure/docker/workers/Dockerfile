# ============================================================================
# Stage 1: Builder - Install deps (including dev), generate Prisma, compile TS
# ============================================================================
FROM node:20-bullseye-slim AS builder
WORKDIR /app
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=120000

# Build deps (openssl for prisma)
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Copy package files for both workers and backend (for prisma client)
COPY apps/workers/package*.json ./apps/workers/
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma

# Install backend deps + generate prisma client
WORKDIR /app/apps/backend
RUN for attempt in 1 2 3; do \
      npm ci --no-audit --no-fund && break; \
      if [ "$attempt" -eq 3 ]; then \
        echo "npm ci failed after ${attempt} attempts"; \
        exit 1; \
      fi; \
      echo "npm ci failed (attempt ${attempt}), retrying in $((attempt * 10))s..."; \
      sleep $((attempt * 10)); \
    done
RUN npx prisma generate

# Install worker deps (dev deps included so TS build works)
WORKDIR /app/apps/workers
RUN for attempt in 1 2 3; do \
      npm ci --no-audit --no-fund && break; \
      if [ "$attempt" -eq 3 ]; then \
        echo "npm ci failed after ${attempt} attempts"; \
        exit 1; \
      fi; \
      echo "npm ci failed (attempt ${attempt}), retrying in $((attempt * 10))s..."; \
      sleep $((attempt * 10)); \
    done

# Copy shared backend source files into worker source tree
RUN mkdir -p src/shared/backend/utils \
             src/shared/backend/config \
             src/shared/backend/middleware \
             src/shared/backend/services \
             src/shared/backend/services/storage \
             src/shared/backend/services/pdf/templates \
             src/shared/backend/services/domainEvents \
             src/shared/backend/services/incidents \
             src/shared/backend/services/incidents/integrations \
             src/shared/backend/services/hiddenAssets \
             src/shared/backend/services/homeHabitCoach \
             src/shared/backend/services/analytics \
             src/shared/backend/services/guidanceEngine \
             src/shared/backend/types \
             src/shared/backend/lib \
             src/shared/backend/modules/gazette/services \
             src/shared/backend/modules/gazette/editorial \
             src/shared/backend/modules/gazette/types \
             src/shared/backend/modules/gazette/dto \
             src/shared/backend/modules/gazette/mappers \
             src/shared/backend/neighborhoodIntelligence \
             src/shared/backend/refinanceRadar/engine \
             src/shared/backend/refinanceRadar/config \
             src/shared/backend/refinanceRadar/types

COPY apps/backend/src/utils/riskCalculator.util.ts src/shared/backend/utils/
COPY apps/backend/src/utils/FinancialCalculator.util.ts src/shared/backend/utils/
COPY apps/backend/src/config/risk-constants.ts src/shared/backend/config/
COPY apps/backend/src/config/workerJobRegistry.ts src/shared/backend/config/
COPY apps/backend/src/services/homeEventRadarMatcher.service.ts src/shared/backend/services/
COPY apps/backend/src/services/eventSignalProjection.service.ts src/shared/backend/services/
COPY apps/backend/src/services/sharedDataObservability.service.ts src/shared/backend/services/
COPY apps/backend/src/services/coverageGap.service.ts src/shared/backend/services/
COPY apps/backend/src/services/signal.service.ts src/shared/backend/services/
COPY apps/backend/src/services/signalPriorityBoost.service.ts src/shared/backend/services/
COPY apps/backend/src/services/assumptionSet.service.ts src/shared/backend/services/
COPY apps/backend/src/services/preferenceProfile.service.ts src/shared/backend/services/
COPY apps/backend/src/services/financialAssumption.service.ts src/shared/backend/services/
COPY apps/backend/src/services/sharedDataBackfill.service.ts src/shared/backend/services/
COPY apps/backend/src/services/storage/reportStorage.ts src/shared/backend/services/storage/
COPY apps/backend/src/services/storage/s3Client.ts src/shared/backend/services/storage/
COPY apps/backend/src/services/pdf/renderHomeReportPackPdf.ts src/shared/backend/services/pdf/
COPY apps/backend/src/services/pdf/templates/homeReportPackHtml.ts src/shared/backend/services/pdf/templates/
COPY apps/backend/src/services/domainEvents/domainEvents.service.ts src/shared/backend/services/domainEvents/
COPY apps/backend/src/lib/prisma.ts src/shared/backend/lib/
COPY apps/backend/src/lib/logger.ts src/shared/backend/lib/
COPY apps/backend/src/lib/requestContext.ts src/shared/backend/lib/
COPY apps/backend/src/services/incidents/incident.service.ts src/shared/backend/services/incidents/
COPY apps/backend/src/types/incidents.types.ts src/shared/backend/types/
COPY apps/backend/src/services/incidents/incident.utils.ts src/shared/backend/services/incidents/
COPY apps/backend/src/services/incidents/incident.events.ts src/shared/backend/services/incidents/
COPY apps/backend/src/services/incidents/incident.evaluator.ts src/shared/backend/services/incidents/
COPY apps/backend/src/services/incidents/incident.orchestrator.ts src/shared/backend/services/incidents/
# Copy the missing dependencies for the incident evaluator
COPY apps/backend/src/services/incidents/incident.scoring.ts src/shared/backend/services/incidents/
COPY apps/backend/src/services/incidents/incident.events.ts src/shared/backend/services/incidents/
COPY apps/backend/src/services/incidents/integrations/incidentNotification.service.ts src/shared/backend/services/incidents/integrations/
COPY apps/backend/src/services/hiddenAssets.service.ts src/shared/backend/services/
# Risk assessment service chain (RiskAssessment.service → riskAssessmentIntegration → PropertyMaintenanceTask)
COPY apps/backend/src/config/risk-job-types.ts src/shared/backend/config/
COPY apps/backend/src/services/PropertyMaintenanceTask.service.ts src/shared/backend/services/
COPY apps/backend/src/services/riskAssessmentIntegration.service.ts src/shared/backend/services/
COPY apps/backend/src/services/RiskAssessment.service.ts src/shared/backend/services/
# Stub: breaks the JobQueue.service ↔ RiskAssessment.service circular import
COPY apps/workers/stubs/job-queue-service.ts src/shared/backend/services/JobQueue.service.ts
COPY apps/backend/src/services/hiddenAssets/ruleEngine.ts src/shared/backend/services/hiddenAssets/
COPY apps/backend/src/services/hiddenAssets/categoryConfig.ts src/shared/backend/services/hiddenAssets/
COPY apps/backend/src/services/hiddenAssets/types.ts src/shared/backend/services/hiddenAssets/
# Copy homeHabitCoach service files needed by habitGeneration.job.ts
COPY apps/backend/src/services/homeHabitCoach/habitGenerationEngine.ts src/shared/backend/services/homeHabitCoach/
COPY apps/backend/src/services/homeHabitCoach/habitRankingEngine.ts src/shared/backend/services/homeHabitCoach/
COPY apps/backend/src/services/homeHabitCoach/habitRuleEvaluator.ts src/shared/backend/services/homeHabitCoach/
# Copy analytics service needed by hiddenAssets.service.ts and incident.service.ts
COPY apps/backend/src/services/analytics/index.ts src/shared/backend/services/analytics/
COPY apps/backend/src/services/analytics/emitter.ts src/shared/backend/services/analytics/
COPY apps/backend/src/services/analytics/service.ts src/shared/backend/services/analytics/
COPY apps/backend/src/services/analytics/repository.ts src/shared/backend/services/analytics/
COPY apps/backend/src/services/analytics/taxonomy.ts src/shared/backend/services/analytics/
# Replace zod-dependent schemas.ts with a typed pass-through stub (zod is not a workers dependency)
COPY apps/workers/stubs/analytics-schemas.ts src/shared/backend/services/analytics/schemas.ts
# Copy neighborhood intelligence files needed by refreshNeighborhoodEvents.job.ts
# and ingestNeighborhoodDummyEvents.job.ts
COPY apps/backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts src/shared/backend/neighborhoodIntelligence/
COPY apps/backend/src/neighborhoodIntelligence/neighborhoodImpactEngine.ts src/shared/backend/neighborhoodIntelligence/
COPY apps/backend/src/neighborhoodIntelligence/impactRules.ts src/shared/backend/neighborhoodIntelligence/
COPY apps/backend/src/neighborhoodIntelligence/geoUtils.ts src/shared/backend/neighborhoodIntelligence/
COPY apps/backend/src/neighborhoodIntelligence/types.ts src/shared/backend/neighborhoodIntelligence/
COPY apps/backend/src/neighborhoodIntelligence/eventConfidence.ts src/shared/backend/neighborhoodIntelligence/
# Copy refinanceRadar files needed by ingestMortgageRates.job.ts
COPY apps/backend/src/refinanceRadar/engine/mortgageRate.service.ts src/shared/backend/refinanceRadar/engine/
COPY apps/backend/src/refinanceRadar/config/refinanceRadar.config.ts src/shared/backend/refinanceRadar/config/
COPY apps/backend/src/refinanceRadar/types/refinanceRadar.types.ts src/shared/backend/refinanceRadar/types/
# Copy gazette module files needed by gazetteGeneration.job.ts
COPY apps/backend/src/modules/gazette/services/gazetteGenerationJobRunner.service.ts src/shared/backend/modules/gazette/services/
COPY apps/backend/src/modules/gazette/services/gazetteSignalCollector.service.ts src/shared/backend/modules/gazette/services/
COPY apps/backend/src/modules/gazette/services/gazetteCandidateFactory.service.ts src/shared/backend/modules/gazette/services/
COPY apps/backend/src/modules/gazette/services/gazetteRankingEngine.service.ts src/shared/backend/modules/gazette/services/
COPY apps/backend/src/modules/gazette/services/gazetteEditionAssembler.service.ts src/shared/backend/modules/gazette/services/
COPY apps/backend/src/modules/gazette/services/gazettePublish.service.ts src/shared/backend/modules/gazette/services/
COPY apps/backend/src/modules/gazette/editorial/GazetteEditorialService.ts src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/editorial/GazetteHeadlineGenerator.ts src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/editorial/GazetteSummaryGenerator.ts src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/editorial/GazetteEditorialFallbackBuilder.ts src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/editorial/GazetteEditorialPromptBuilder.ts src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/editorial/GazetteEditorialValidator.ts src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/editorial/GazetteEditorialTypes.ts src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/editorial/GazetteTickerGenerator.ts src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/editorial/gazetteFallbackEditorial.ts src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/types/gazette.types.ts src/shared/backend/modules/gazette/types/
COPY apps/backend/src/modules/gazette/dto/gazette.dto.ts src/shared/backend/modules/gazette/dto/
COPY apps/backend/src/modules/gazette/mappers/gazette.mapper.ts src/shared/backend/modules/gazette/mappers/
COPY apps/backend/src/config/ai-constants.ts src/shared/backend/config/
# Copy guidance engine service files needed by coverageLapseIncidents, freezeRiskIncidents,
# neighborhoodChangeNotification jobs and by incident.service.ts
COPY apps/backend/src/services/guidanceEngine/guidanceTypes.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceCompletionHooks.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceSignalResolver.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceDerivedData.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceFinancialContext.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceConfidence.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidancePriority.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceSuppression.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceCopy.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceValidation.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceMapper.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceBookingGuard.service.ts src/shared/backend/services/guidanceEngine/
COPY apps/backend/src/services/guidanceEngine/guidanceJourney.service.ts src/shared/backend/services/guidanceEngine/
# Stubs: replace backend-only deps with workers-safe equivalents
COPY apps/workers/stubs/error-middleware.ts src/shared/backend/middleware/error.middleware.ts
COPY apps/workers/stubs/notification-service.ts src/shared/backend/services/notification.service.ts
# Copy worker source code + TS config
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.json ./tsconfig.json

# Rewrite import paths
RUN sed -i 's/\.\.\/\.\.\/backend\/src\/utils\/riskCalculator\.util/\.\/shared\/backend\/utils\/riskCalculator\.util/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/utils\/FinancialCalculator\.util/\.\/shared\/backend\/utils\/FinancialCalculator\.util/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/config\/risk-constants/\.\/shared\/backend\/config\/risk-constants/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/storage\/reportStorage/\.\.\/shared\/backend\/services\/storage\/reportStorage/g' src/jobs/generateHomeReportExport.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/pdf\/renderHomeReportPackPdf/\.\.\/shared\/backend\/services\/pdf\/renderHomeReportPackPdf/g' src/jobs/generateHomeReportExport.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/homeEventRadarMatcher\.service/\.\.\/shared\/backend\/services\/homeEventRadarMatcher\.service/g' src/jobs/ingestRadarSignals.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/sharedDataBackfill\.service/\.\.\/shared\/backend\/services\/sharedDataBackfill\.service/g' src/jobs/sharedDataBackfill.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/sharedDataBackfill\.service/\.\.\/shared\/backend\/services\/sharedDataBackfill\.service/g' src/jobs/sharedDataConsistencyAudit.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/signal\.service/\.\.\/shared\/backend\/services\/signal\.service/g' src/jobs/sharedSignalHealthAudit.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/signal\.service/\.\.\/shared\/backend\/services\/signal\.service/g' src/jobs/sharedSignalRefresh.job.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/services\/domainEvents\/domainEvents\.service/\.\/shared\/backend\/services\/domainEvents\/domainEvents\.service/g' src/runners/claimFollowUpDue.poller.ts && \
    # This ensures the domainEvents service can find the prisma lib in its new shared relative path
    sed -i 's/\.\.\/\.\.\/lib\/prisma/\.\.\/\.\.\/lib\/prisma/g' src/shared/backend/services/domainEvents/domainEvents.service.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/services\/incidents\/incident\.service/\.\/shared\/backend\/services\/incidents\/incident\.service/g' src/jobs/coverageLapseIncidents.job.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/services\/incidents\/incident\.service/\.\/shared\/backend\/services\/incidents\/incident\.service/g' src/jobs/freezeRiskIncidents.job.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/services\/hiddenAssets\.service/\.\/shared\/backend\/services\/hiddenAssets\.service/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/services\/RiskAssessment\.service/\.\/shared\/backend\/services\/RiskAssessment\.service/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/backend\/src\/config\/workerJobRegistry/\.\/shared\/backend\/config\/workerJobRegistry/g' src/worker.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/hiddenAssets\.service/\.\.\/shared\/backend\/services\/hiddenAssets\.service/g' src/jobs/hiddenAssetRefresh.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/neighborhoodIntelligence\/neighborhoodPropertyMatchService/\.\.\/shared\/backend\/neighborhoodIntelligence\/neighborhoodPropertyMatchService/g' src/jobs/refreshNeighborhoodEvents.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/neighborhoodIntelligence\/neighborhoodPropertyMatchService/\.\.\/shared\/backend\/neighborhoodIntelligence\/neighborhoodPropertyMatchService/g' src/jobs/ingestNeighborhoodDummyEvents.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/homeHabitCoach\/habitGenerationEngine/\.\.\/shared\/backend\/services\/homeHabitCoach\/habitGenerationEngine/g' src/jobs/habitGeneration.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/refinanceRadar\/engine\/mortgageRate\.service/\.\.\/shared\/backend\/refinanceRadar\/engine\/mortgageRate\.service/g' src/jobs/ingestMortgageRates.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/modules\/gazette\/services\/gazetteGenerationJobRunner\.service/\.\.\/shared\/backend\/modules\/gazette\/services\/gazetteGenerationJobRunner\.service/g' src/jobs/gazetteGeneration.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/guidanceEngine\/guidanceJourney\.service/\.\.\/shared\/backend\/services\/guidanceEngine\/guidanceJourney\.service/g' src/jobs/coverageLapseIncidents.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/guidanceEngine\/guidanceJourney\.service/\.\.\/shared\/backend\/services\/guidanceEngine\/guidanceJourney\.service/g' src/jobs/freezeRiskIncidents.job.ts && \
    sed -i 's/\.\.\/\.\.\/\.\.\/backend\/src\/services\/guidanceEngine\/guidanceJourney\.service/\.\.\/shared\/backend\/services\/guidanceEngine\/guidanceJourney\.service/g' src/jobs/neighborhoodChangeNotification.job.ts

# Compile TS -> dist/
RUN npx tsc --project ./tsconfig.json

# Prune to production dependencies
RUN npm prune --omit=dev


# ============================================================================
# Stage 2: Runtime - Small image with system Chromium + prod deps + dist
# ============================================================================
FROM node:20-bullseye-slim AS runner
WORKDIR /app/apps/workers

# Install runtime libs + Chromium
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
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_PATH=/usr/bin/chromium

# Copy prod node_modules + dist from builder
COPY --from=builder /app/apps/workers/package*.json ./
COPY --from=builder /app/apps/workers/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/apps/workers/dist ./dist

HEALTHCHECK --interval=60s --timeout=3s --start-period=60s --retries=3 \
  CMD pgrep -f "node dist/worker.js" || exit 1

CMD ["node", "dist/worker.js"]
