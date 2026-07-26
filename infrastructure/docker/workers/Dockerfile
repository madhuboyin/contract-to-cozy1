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
RUN node -e "const sdk = require('@google/genai'); if (typeof sdk.GoogleGenAI !== 'function') throw new Error('@google/genai CommonJS export is invalid')"

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
             src/shared/backend/services/diy \
             src/shared/backend/services/maintenance \
             src/shared/backend/services/protection \
             src/shared/backend/services/seasonal \
             src/shared/backend/services/analytics \
             src/shared/backend/services/guidanceEngine \
             src/shared/backend/services/projectCompliance \
             src/shared/backend/services/financialContext \
             src/shared/backend/services/planningContext \
             src/shared/backend/types \
             src/shared/backend/lib \
             src/shared/backend/modules/gazette/services \
             src/shared/backend/modules/gazette/editorial \
             src/shared/backend/modules/gazette/types \
             src/shared/backend/modules/gazette/dto \
             src/shared/backend/modules/gazette/mappers \
             src/shared/backend/modules/homeEventRadar/domain \
             src/shared/backend/modules/homeEventRadar/services \
             src/shared/backend/modules/homeEventRadar/queues \
             src/shared/backend/modules/propertyContext/domain \
             src/shared/backend/modules/propertyContext/application \
             src/shared/backend/modules/propertyContext/catalog \
             src/shared/backend/modules/propertyContext/infrastructure \
             src/shared/backend/modules/propertyContext/policies \
             src/shared/backend/neighborhoodIntelligence \
             src/shared/backend/refinanceRadar/engine \
             src/shared/backend/refinanceRadar/config \
             src/shared/backend/refinanceRadar/mappers \
             src/shared/backend/refinanceRadar/types \
             src/shared/backend/refinanceRadar/validators \
             src/shared/backend/services/permitAdapters \
             src/shared/backend/services/taxAssessorAdapters
RUN mkdir -p src/shared/backend/services/coverage \
             src/shared/backend/productFramework/capabilities/definitions
COPY apps/backend/src/services/coverage/contextPolicy.ts src/shared/backend/services/coverage/
COPY apps/backend/src/modules/homeEventRadar/domain/propertyGeography.ts src/shared/backend/modules/homeEventRadar/domain/
COPY apps/backend/src/modules/homeEventRadar/domain/radarObservationIdentity.ts src/shared/backend/modules/homeEventRadar/domain/
COPY apps/backend/src/modules/homeEventRadar/domain/radarVisibility.ts src/shared/backend/modules/homeEventRadar/domain/
COPY apps/backend/src/modules/homeEventRadar/contracts/ src/shared/backend/modules/homeEventRadar/contracts/
COPY apps/backend/src/modules/homeEventRadar/services/radarSourceRegistry.service.ts \
     apps/backend/src/modules/homeEventRadar/services/radarSourceRun.service.ts \
     apps/backend/src/modules/homeEventRadar/services/radarEventIngestion.service.ts \
     apps/backend/src/modules/homeEventRadar/services/radarMatchDiscovery.service.ts \
     apps/backend/src/modules/homeEventRadar/services/radarIncidentPromotion.service.ts \
     src/shared/backend/modules/homeEventRadar/services/
COPY apps/backend/src/modules/homeEventRadar/queues/radarMatch.queue.ts \
     apps/backend/src/modules/homeEventRadar/queues/radarIngest.queue.ts \
     src/shared/backend/modules/homeEventRadar/queues/

COPY apps/backend/src/utils/riskCalculator.util.ts apps/backend/src/utils/FinancialCalculator.util.ts src/shared/backend/utils/
COPY apps/backend/src/config/risk-constants.ts apps/backend/src/config/workerJobRegistry.ts apps/backend/src/config/queueDefaults.ts apps/backend/src/config/workerExecutionPolicy.ts apps/backend/src/config/appConfig.ts apps/backend/src/config/smokeTestConfig.ts src/shared/backend/config/
# Maintenance reminders (WKR-001) — a plain relative-import sibling of the
# already-copied notification.service/prisma/workerExecutionPolicy shared
# tree, so it needs a COPY only, no sed rewrite.
COPY apps/backend/src/services/maintenanceReminder.service.ts src/shared/backend/services/
COPY apps/backend/src/services/homeEventRadarMatcher.service.ts \
     apps/backend/src/services/eventSignalProjection.service.ts \
     apps/backend/src/services/sharedDataObservability.service.ts \
     apps/backend/src/services/coverageGap.service.ts \
     apps/backend/src/services/inventoryCoverageState.service.ts \
     apps/backend/src/services/signal.service.ts \
     apps/backend/src/services/signalPriorityBoost.service.ts \
     apps/backend/src/services/assumptionSet.service.ts \
     apps/backend/src/services/preferenceProfile.service.ts \
     apps/backend/src/services/financialAssumption.service.ts \
     apps/backend/src/services/sharedDataBackfill.service.ts \
     src/shared/backend/services/
COPY apps/backend/src/services/storage/reportStorage.ts apps/backend/src/services/storage/s3Client.ts src/shared/backend/services/storage/
COPY apps/backend/src/services/pdf/renderHomeReportPackPdf.ts src/shared/backend/services/pdf/
COPY apps/backend/src/services/pdf/templates/homeReportPackHtml.ts src/shared/backend/services/pdf/templates/
COPY apps/backend/src/services/domainEvents/domainEvents.service.ts src/shared/backend/services/domainEvents/
COPY apps/backend/src/lib/prisma.ts \
     apps/backend/src/lib/logger.ts \
     apps/backend/src/lib/requestContext.ts \
     apps/backend/src/lib/metrics.ts \
     apps/backend/src/lib/queuePort.ts \
     apps/backend/src/lib/smokeTestCorrelation.ts \
     apps/backend/src/lib/notificationDeepLinks.ts \
     src/shared/backend/lib/
COPY apps/backend/src/services/incidents/incident.service.ts src/shared/backend/services/incidents/
COPY apps/backend/src/types/incidents.types.ts src/shared/backend/types/
# Copy the missing dependencies for the incident evaluator
COPY apps/backend/src/services/incidents/incident.utils.ts \
     apps/backend/src/services/incidents/incident.events.ts \
     apps/backend/src/services/incidents/incident.evaluator.ts \
     apps/backend/src/services/incidents/incident.orchestrator.ts \
     apps/backend/src/services/incidents/incident.scoring.ts \
     apps/backend/src/services/incidents/incident.events.ts \
     src/shared/backend/services/incidents/
COPY apps/backend/src/services/incidents/integrations/incidentNotification.service.ts src/shared/backend/services/incidents/integrations/
# Transitive dependencies used by incident notification context and coverage
# policy. Keep the source tree layout intact so backend-relative imports resolve
# inside the worker image.
COPY apps/backend/src/types/claims.types.ts src/shared/backend/types/
COPY apps/backend/src/services/protection/context.ts \
     apps/backend/src/services/protection/issueReconciliation.ts \
     src/shared/backend/services/protection/
# Copy severe weather alert service (used by severeWeatherAlerts.job.ts) + its SSRF guard dependency
COPY apps/backend/src/services/severeWeatherAlert.service.ts src/shared/backend/services/
COPY apps/backend/src/utils/ssrfGuard.ts src/shared/backend/utils/
COPY apps/backend/src/services/hiddenAssets.service.ts src/shared/backend/services/
# Risk assessment service chain (RiskAssessment.service → riskAssessmentIntegration → PropertyMaintenanceTask)
COPY apps/backend/src/config/risk-job-types.ts src/shared/backend/config/
COPY apps/backend/src/services/PropertyMaintenanceTask.service.ts \
     apps/backend/src/services/seasonalChecklistStatus.service.ts \
     apps/backend/src/services/riskAssessmentIntegration.service.ts \
     apps/backend/src/services/RiskAssessment.service.ts \
     apps/backend/src/services/riskAssetApplicability.ts \
     apps/backend/src/services/entryContextPolicy.ts \
     src/shared/backend/services/
COPY apps/backend/src/utils/maintenanceDueDate.ts \
     apps/backend/src/utils/seasonalProgress.ts \
     src/shared/backend/utils/
# Pure (Express-free) property-access resolution used by PropertyMaintenanceTask.service.ts
COPY apps/backend/src/services/propertyAccess.service.ts src/shared/backend/services/
COPY apps/backend/src/services/maintenance/applicabilityPolicy.ts src/shared/backend/services/maintenance/
COPY apps/backend/src/services/seasonal/applicabilityPolicy.ts \
     apps/backend/src/services/seasonal/seasonWindow.ts \
     src/shared/backend/services/seasonal/
COPY apps/backend/src/services/protection/applicabilityPolicy.ts src/shared/backend/services/protection/
COPY apps/backend/src/services/propertyContextDecision.ts src/shared/backend/services/
COPY apps/backend/src/services/aggregationContext/applicabilityPolicy.ts \
     apps/backend/src/services/aggregationContext/context.ts \
     apps/backend/src/services/aggregationContext/lifecycle.ts \
     apps/backend/src/services/aggregationContext/batch.ts \
     src/shared/backend/services/aggregationContext/
COPY apps/backend/src/services/projectCompliance/applicabilityPolicy.ts \
     apps/backend/src/services/projectCompliance/context.ts \
     apps/backend/src/services/projectCompliance/workScope.ts \
     apps/backend/src/services/projectCompliance/reconciliation.ts \
     apps/backend/src/services/projectCompliance/permitWorkerContext.service.ts \
     src/shared/backend/services/projectCompliance/
COPY apps/backend/src/services/financialContext/applicabilityPolicy.ts \
     apps/backend/src/services/financialContext/context.ts \
     apps/backend/src/services/financialContext/reconciliation.ts \
     apps/backend/src/services/financialContext/reserveFundWorkerContext.service.ts \
     src/shared/backend/services/financialContext/
COPY apps/backend/src/services/planningContext/applicabilityPolicy.ts \
     apps/backend/src/services/planningContext/context.ts \
     apps/backend/src/services/planningContext/reconciliation.ts \
     apps/backend/src/services/planningContext/redaction.ts \
     apps/backend/src/services/planningContext/reportSnapshot.ts \
     src/shared/backend/services/planningContext/
COPY apps/backend/src/modules/propertyContext/index.ts src/shared/backend/modules/propertyContext/
COPY apps/backend/src/modules/propertyContext/application/getPropertyContext.ts \
     apps/backend/src/modules/propertyContext/application/getContextCompleteness.ts \
     apps/backend/src/modules/propertyContext/application/evaluateFeatureContext.ts \
     apps/backend/src/modules/propertyContext/application/capturePropertyFact.ts \
     apps/backend/src/modules/propertyContext/application/relationalCaptureAdapters.ts \
     src/shared/backend/modules/propertyContext/application/
COPY apps/backend/src/modules/propertyContext/catalog/factCatalog.ts \
     apps/backend/src/modules/propertyContext/catalog/captureRegistry.ts \
     apps/backend/src/modules/propertyContext/catalog/featureRequirementRegistry.ts \
     src/shared/backend/modules/propertyContext/catalog/
COPY apps/backend/src/modules/propertyContext/domain/contracts.ts \
     apps/backend/src/modules/propertyContext/domain/facts.ts \
     src/shared/backend/modules/propertyContext/domain/
COPY apps/backend/src/modules/propertyContext/infrastructure/prismaAssemblers.ts src/shared/backend/modules/propertyContext/infrastructure/
COPY apps/backend/src/modules/propertyContext/policies/featurePolicy.ts src/shared/backend/modules/propertyContext/policies/
# Stub: breaks the JobQueue.service ↔ RiskAssessment.service circular import
COPY apps/workers/stubs/job-queue-service.ts src/shared/backend/services/JobQueue.service.ts
COPY apps/backend/src/services/hiddenAssets/ruleEngine.ts \
     apps/backend/src/services/hiddenAssets/categoryConfig.ts \
     apps/backend/src/services/hiddenAssets/types.ts \
     src/shared/backend/services/hiddenAssets/
# Copy homeHabitCoach service files needed by habitGeneration.job.ts
COPY apps/backend/src/services/homeHabitCoach/habitGenerationEngine.ts \
     apps/backend/src/services/homeHabitCoach/applicabilityPolicy.ts \
     apps/backend/src/services/homeHabitCoach/habitRankingEngine.ts \
     apps/backend/src/services/homeHabitCoach/habitRuleEvaluator.ts \
     src/shared/backend/services/homeHabitCoach/
# Copy analytics service needed by hiddenAssets.service.ts and incident.service.ts
COPY apps/backend/src/services/analytics/index.ts \
     apps/backend/src/services/analytics/emitter.ts \
     apps/backend/src/services/analytics/service.ts \
     apps/backend/src/services/analytics/repository.ts \
     apps/backend/src/services/analytics/taxonomy.ts \
     apps/backend/src/services/analytics/northStarLineage.ts \
     apps/backend/src/services/analytics/northStarMetric.service.ts \
     apps/backend/src/services/analytics/toolLifecycle.ts \
     apps/backend/src/services/analytics/toolLifecycle.contract.ts \
     src/shared/backend/services/analytics/
# Replace analytics validation schemas with the worker's typed pass-through stub.
COPY apps/workers/stubs/analytics-schemas.ts src/shared/backend/services/analytics/schemas.ts
# Stub: emitter.ts dynamically imports ../property.service (not copied into workers) to
# run its activation side effect — see stub file comment for why this is a safe no-op here
COPY apps/workers/stubs/property-service.ts src/shared/backend/services/property.service.ts
# Copy neighborhood intelligence files needed by refreshNeighborhoodEvents.job.ts
# and ingestNeighborhoodDummyEvents.job.ts
COPY apps/backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts \
     apps/backend/src/neighborhoodIntelligence/neighborhoodImpactEngine.ts \
     apps/backend/src/neighborhoodIntelligence/impactRules.ts \
     apps/backend/src/neighborhoodIntelligence/geoUtils.ts \
     apps/backend/src/neighborhoodIntelligence/types.ts \
     apps/backend/src/neighborhoodIntelligence/eventConfidence.ts \
     src/shared/backend/neighborhoodIntelligence/
# Copy refinanceRadar files needed by ingestion and post-ingestion evaluation.
COPY apps/backend/src/refinanceRadar/refinanceRadar.service.ts \
     apps/backend/src/refinanceRadar/refinanceRadarTransition.ts \
     apps/backend/src/refinanceRadar/refinanceAlertPreference.service.ts \
     apps/backend/src/refinanceRadar/refinanceAlertRollout.ts \
     apps/backend/src/refinanceRadar/refinanceFreshness.ts \
     apps/backend/src/refinanceRadar/refinanceEligibilityContext.ts \
     apps/backend/src/refinanceRadar/refinanceProgramGuidance.ts \
     apps/backend/src/refinanceRadar/refinanceAlternativeComparison.ts \
     apps/backend/src/refinanceRadar/refinanceObjectiveComparison.ts \
     src/shared/backend/refinanceRadar/
COPY apps/backend/src/refinanceRadar/validators/refinanceRadar.validators.ts \
     src/shared/backend/refinanceRadar/validators/
COPY apps/backend/src/refinanceRadar/engine/mortgageRate.service.ts \
     apps/backend/src/refinanceRadar/engine/refinanceCalculation.engine.ts \
     apps/backend/src/refinanceRadar/engine/refinanceRadar.engine.ts \
     src/shared/backend/refinanceRadar/engine/
COPY apps/backend/src/refinanceRadar/config/refinanceRadar.config.ts src/shared/backend/refinanceRadar/config/
COPY apps/backend/src/refinanceRadar/types/refinanceRadar.types.ts src/shared/backend/refinanceRadar/types/
COPY apps/backend/src/refinanceRadar/mappers/refinanceRadar.mapper.ts src/shared/backend/refinanceRadar/mappers/
# Copy gazette module files needed by gazetteGeneration.job.ts
COPY apps/backend/src/modules/gazette/services/gazetteGenerationJobRunner.service.ts \
     apps/backend/src/modules/gazette/services/gazetteSignalCollector.service.ts \
     apps/backend/src/modules/gazette/services/gazetteCandidateFactory.service.ts \
     apps/backend/src/modules/gazette/services/gazetteRankingEngine.service.ts \
     apps/backend/src/modules/gazette/services/gazetteEditionAssembler.service.ts \
     apps/backend/src/modules/gazette/services/gazettePublish.service.ts \
     src/shared/backend/modules/gazette/services/
COPY apps/backend/src/modules/gazette/editorial/GazetteEditorialService.ts \
     apps/backend/src/modules/gazette/editorial/GazetteHeadlineGenerator.ts \
     apps/backend/src/modules/gazette/editorial/GazetteSummaryGenerator.ts \
     apps/backend/src/modules/gazette/editorial/GazetteEditorialFallbackBuilder.ts \
     apps/backend/src/modules/gazette/editorial/GazetteEditorialPromptBuilder.ts \
     apps/backend/src/modules/gazette/editorial/GazetteEditorialValidator.ts \
     apps/backend/src/modules/gazette/editorial/GazetteEditorialTypes.ts \
     apps/backend/src/modules/gazette/editorial/GazetteTickerGenerator.ts \
     apps/backend/src/modules/gazette/editorial/gazetteFallbackEditorial.ts \
     src/shared/backend/modules/gazette/editorial/
COPY apps/backend/src/modules/gazette/types/gazette.types.ts src/shared/backend/modules/gazette/types/
COPY apps/backend/src/modules/gazette/dto/gazette.dto.ts src/shared/backend/modules/gazette/dto/
COPY apps/backend/src/modules/gazette/mappers/gazette.mapper.ts src/shared/backend/modules/gazette/mappers/
COPY apps/backend/src/config/ai-constants.ts src/shared/backend/config/
# Copy guidance engine service files needed by coverageLapseIncidents, freezeRiskIncidents,
# neighborhoodChangeNotification jobs and by incident.service.ts
COPY apps/backend/src/services/guidanceEngine/guidanceTypes.ts \
     apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts \
     apps/backend/src/services/guidanceEngine/guidanceCompletionHooks.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceSignalResolver.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceDerivedData.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceFinancialContext.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceConfidence.service.ts \
     apps/backend/src/services/guidanceEngine/guidancePriority.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceSuppression.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceCopy.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceValidation.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceAdvisor.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceMapper.ts \
     apps/backend/src/services/guidanceEngine/guidanceBookingGuard.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceJourney.service.ts \
     apps/backend/src/services/guidanceEngine/guidanceGovernance.catalog.ts \
     src/shared/backend/services/guidanceEngine/
# guidanceJourney.service.ts also imports coverageJourneyReconciliation.service.ts
# (a sibling in services/, not guidanceEngine/) — its own deps
# (riskAssetApplicability.ts, inventoryCoverageState.service.ts, lib/prisma.ts)
# are already copied above.
COPY apps/backend/src/services/coverageJourneyReconciliation.service.ts src/shared/backend/services/
# Product-framework contracts used by guidance governance and analytics lineage.
COPY apps/backend/src/productFramework/recommendationGovernance.contract.ts \
     apps/backend/src/productFramework/recommendationResponse.contract.ts \
     apps/backend/src/productFramework/homeAction.contract.ts \
     apps/backend/src/productFramework/homeAssetDisplay.ts \
     apps/backend/src/productFramework/outcomeLineage.contract.ts \
     src/shared/backend/productFramework/
# Capability registry/catalog barrel (used by toolLifecycle.ts analytics
# lineage). Pure data/logic — no route/controller/Prisma coupling — so it's
# copied wholesale rather than file-by-file. Its external deps (homeAction
# and recommendationGovernance/Response contracts, modules/propertyContext,
# services/projectCompliance/workScope) are all already copied above.
COPY apps/backend/src/productFramework/capabilities/canonicalCapabilityRegistry.ts \
     apps/backend/src/productFramework/capabilities/capability.contract.ts \
     apps/backend/src/productFramework/capabilities/capabilityAvailability.ts \
     apps/backend/src/productFramework/capabilities/capabilityCandidateMatcher.ts \
     apps/backend/src/productFramework/capabilities/capabilityCatalog.service.ts \
     apps/backend/src/productFramework/capabilities/capabilityCopyReview.ts \
     apps/backend/src/productFramework/capabilities/capabilityExplanationBuilder.ts \
     apps/backend/src/productFramework/capabilities/capabilityGoldenFixtures.ts \
     apps/backend/src/productFramework/capabilities/capabilityGoldenRanking.ts \
     apps/backend/src/productFramework/capabilities/capabilityGovernanceDefinition.ts \
     apps/backend/src/productFramework/capabilities/capabilityGovernancePolicy.ts \
     apps/backend/src/productFramework/capabilities/capabilityRanking.ts \
     apps/backend/src/productFramework/capabilities/capabilityReadinessEvaluator.ts \
     apps/backend/src/productFramework/capabilities/capabilityRecommendationContext.ts \
     apps/backend/src/productFramework/capabilities/capabilityRegistry.ts \
     apps/backend/src/productFramework/capabilities/capabilityRelatedResolver.ts \
     apps/backend/src/productFramework/capabilities/capabilitySmokeCheck.ts \
     apps/backend/src/productFramework/capabilities/capabilitySuppressionPolicy.ts \
     apps/backend/src/productFramework/capabilities/index.ts \
     apps/backend/src/productFramework/capabilities/inspectionCapabilityPolicy.ts \
     apps/backend/src/productFramework/capabilities/projectComplianceCapabilitySources.ts \
     apps/backend/src/productFramework/capabilities/projectTrackerCapabilityPolicy.ts \
     src/shared/backend/productFramework/capabilities/
COPY apps/backend/src/productFramework/capabilities/definitions/capabilityDefinitionFactory.ts \
     apps/backend/src/productFramework/capabilities/definitions/decideCompare.ts \
     apps/backend/src/productFramework/capabilities/definitions/index.ts \
     apps/backend/src/productFramework/capabilities/definitions/maintainPrevent.ts \
     apps/backend/src/productFramework/capabilities/definitions/planBudget.ts \
     apps/backend/src/productFramework/capabilities/definitions/protectMonitor.ts \
     apps/backend/src/productFramework/capabilities/definitions/saveOptimize.ts \
     apps/backend/src/productFramework/capabilities/definitions/understandHome.ts \
     src/shared/backend/productFramework/capabilities/definitions/
# Copy DIY AI guide service and current Property Context policy used by the worker.
COPY apps/backend/src/services/diyAiGuide.service.ts src/shared/backend/services/
COPY apps/backend/src/services/diy/applicabilityPolicy.ts \
     apps/backend/src/services/diy/eligibilityPolicy.ts \
     src/shared/backend/services/diy/
# W3 (AI/DIY) — diyAiGuide.service.ts now validates the Gemini response
# against AiGuideGenerationResponseSchema before persisting it.
COPY apps/backend/src/validators/diy.validators.ts src/shared/backend/validators/
# Copy permit services and adapters (used by permit worker jobs)
COPY apps/backend/src/services/permitAdapters/permitNormalizer.ts \
     apps/backend/src/services/permitAdapters/socrata.adapter.ts \
     apps/backend/src/services/permitAdapters/accela.adapter.ts \
     src/shared/backend/services/permitAdapters/
# Permit services (used by permit worker jobs, continued) + Home Reserve Fund
# Planner services (used by reserve fund worker jobs) — merged into one COPY
# since they share a destination directory
COPY apps/backend/src/services/permitFetch.service.ts \
     apps/backend/src/services/permitDetection.service.ts \
     apps/backend/src/services/homeReserveFundCalculation.service.ts \
     apps/backend/src/services/homeReserveFundReconciliation.service.ts \
     src/shared/backend/services/
# Tax assessor adapters + fetch service (used by ingestTaxAssessmentEvents.job.ts)
COPY apps/backend/src/services/taxAssessorAdapters/taxAssessmentTypes.ts \
     apps/backend/src/services/taxAssessorAdapters/socrataTaxAdapter.ts \
     src/shared/backend/services/taxAssessorAdapters/
COPY apps/backend/src/services/taxAssessmentFetch.service.ts src/shared/backend/services/
# Provider Trust & Compliance Verification — only providerCompliance.service.ts
# and the lapse adapter are needed here; providerCredential.service.ts (CRUD,
# submission) is only used by backend routes/controllers, not worker jobs.
COPY apps/backend/src/services/providerCompliance.service.ts src/shared/backend/services/
COPY apps/backend/src/services/newHomeWarrantyDeadline.service.ts src/shared/backend/services/
COPY apps/backend/src/services/incidents/integrations/providerCredentialLapse.adapter.ts src/shared/backend/services/incidents/integrations/
# Stubs: replace backend-only deps with workers-safe equivalents
COPY apps/workers/stubs/error-middleware.ts src/shared/backend/middleware/error.middleware.ts
COPY apps/workers/stubs/notification-service.ts src/shared/backend/services/notification.service.ts
COPY apps/workers/stubs/gemini-service.ts src/shared/backend/services/gemini.service.ts
# Copy worker source code + TS config
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.json ./tsconfig.json
COPY apps/workers/tsconfig.docker.json ./tsconfig.docker.json

# W5 (items 1/2/4): worker source no longer imports backend files via
# `../../../backend/src/...`-style relative paths that need per-file `sed`
# rewriting — every such import now goes through the `@worker-shared/*`
# alias (apps/workers/tsconfig.json), which tsconfig.docker.json points at
# this same copied src/shared/backend tree. tsc-alias rewrites the alias
# back into a real relative path in the compiled dist/ output below, so no
# module-resolution shim is needed at runtime either.
RUN npx tsc --project ./tsconfig.docker.json && npx tsc-alias -p ./tsconfig.docker.json

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

RUN node -e "const sdk = require('@google/genai'); if (typeof sdk.GoogleGenAI !== 'function') throw new Error('@google/genai CommonJS export is invalid')"

HEALTHCHECK --interval=60s --timeout=3s --start-period=60s --retries=3 \
  CMD pgrep -f "node dist/worker.js" || exit 1

CMD ["node", "dist/worker.js"]
