// apps/workers/src/jobs/propertyIntelligence.job.ts
//
// W4 item 4: extracted verbatim out of worker.ts (registry key
// property-intelligence — the BullMQ Worker on property-intelligence-queue)
// so it can be unit-tested directly. Same reasoning/technique as
// propertyScoreSnapshots.job.ts (extracted alongside this, in the same
// slice — capturePropertyScoreSnapshots is shared between both). No logic
// changes from the original inline version.

import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';
import { HiddenAssetService } from '@worker-shared/services/hiddenAssets.service';
import RiskAssessmentService from '@worker-shared/services/RiskAssessment.service';
import { HomeDigitalTwinService } from '@worker-shared/services/homeDigitalTwin.service';
import { HomeDigitalTwinScenarioService } from '@worker-shared/services/homeDigitalTwinScenario.service';

export enum PropertyIntelligenceJobType {
  CALCULATE_RISK_REPORT = 'CALCULATE_RISK_REPORT',
  CALCULATE_HIDDEN_ASSETS = 'CALCULATE_HIDDEN_ASSETS',
  REFRESH_HOME_DIGITAL_TWIN = 'REFRESH_HOME_DIGITAL_TWIN',
  COMPUTE_HOME_DIGITAL_TWIN_SCENARIO = 'COMPUTE_HOME_DIGITAL_TWIN_SCENARIO',
}

export interface PropertyIntelligenceJobPayload {
  propertyId: string;
  jobType: PropertyIntelligenceJobType;
  scenarioId?: string;
  digitalTwinId?: string;
  computationRunId?: string;
}

const hiddenAssetService = new HiddenAssetService();

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern). capturePropertyScoreSnapshots
// is injected as a plain function reference (its own deps default to the real
// implementations independently) rather than trying to match its Deps shape here.
export interface PropertyIntelligenceDeps {
  logger: AppLogger;
  riskAssessmentService: Pick<typeof RiskAssessmentService, 'calculateAndSaveReport'>;
  hiddenAssetService: Pick<HiddenAssetService, 'refreshMatchesInternal'>;
}

const defaultDeps: PropertyIntelligenceDeps = {
  logger,
  riskAssessmentService: RiskAssessmentService,
  hiddenAssetService,
};

export interface HomeDigitalTwinJobDeps {
  prisma: Pick<
    typeof prisma,
    'homeDigitalTwin' | 'homeTwinComputationRun' | 'homeTwinScenario' | '$transaction'
  >;
  logger: AppLogger;
  createTwinService: () => Pick<HomeDigitalTwinService, 'refreshTwin'>;
  createScenarioService: () => Pick<HomeDigitalTwinScenarioService, 'computeScenario'>;
}

const defaultHomeDigitalTwinDeps: HomeDigitalTwinJobDeps = {
  prisma,
  logger,
  createTwinService: () => new HomeDigitalTwinService(),
  createScenarioService: () => new HomeDigitalTwinScenarioService(),
};

/**
 * Process risk assessment calculation.
 * Delegates to RiskAssessmentService.calculateAndSaveReport which fetches
 * the full property including canonical inventory items.
 */
export async function processRiskCalculation(
  jobData: PropertyIntelligenceJobPayload,
  deps: PropertyIntelligenceDeps = defaultDeps,
) {
  const { logger, riskAssessmentService } = deps;
  const { propertyId } = jobData;
  logger.info(`[${new Date().toISOString()}] Processing risk calculation for property ${propertyId}...`);

  try {
    await riskAssessmentService.calculateAndSaveReport(propertyId);
    logger.info(`✅ Risk assessment calculated and saved for property ${propertyId}.`);
  } catch (error) {
    logger.error({ err: error }, '❌ Error calculating risk assessment');
    throw error;
  }
}

/**
 * Process hidden asset scan for a single property
 */
export async function processHiddenAssetScan(
  jobData: PropertyIntelligenceJobPayload,
  deps: PropertyIntelligenceDeps = defaultDeps,
) {
  const { logger, hiddenAssetService } = deps;
  const { propertyId } = jobData;
  logger.info(`[${new Date().toISOString()}] Processing hidden asset scan for property ${propertyId}...`);

  try {
    const result = await hiddenAssetService.refreshMatchesInternal(propertyId);
    logger.info(
      `✅ Hidden asset scan completed for property ${propertyId}. ` +
      `Evaluated: ${result.programsEvaluated}, Matched: ${result.matchesFound}, ` +
      `Expired: ${result.matchesExpired}, Inactivated: ${result.matchesInactivated}`
    );
  } catch (error) {
    logger.error({ err: error }, `❌ Error running hidden asset scan for property ${propertyId}`);
    throw error;
  }
}

/**
 * Refresh an existing projection after canonical property inputs change.
 * A property without a twin is a normal no-op: initialization remains
 * homeowner-driven, while existing projections stay current automatically.
 */
export async function processHomeDigitalTwinRefresh(
  jobData: PropertyIntelligenceJobPayload,
  deps: HomeDigitalTwinJobDeps = defaultHomeDigitalTwinDeps,
) {
  const twin = await deps.prisma.homeDigitalTwin.findUnique({
    where: { propertyId: jobData.propertyId },
    select: { id: true },
  });
  if (!twin) {
    deps.logger.info(`[HomeDigitalTwin] No projection exists for ${jobData.propertyId}; refresh skipped.`);
    return;
  }
  await deps.createTwinService().refreshTwin(jobData.propertyId);
  deps.logger.info(`[HomeDigitalTwin] Projection refreshed for ${jobData.propertyId}.`);
}

export async function processHomeDigitalTwinScenarioCompute(
  jobData: PropertyIntelligenceJobPayload,
  deps: HomeDigitalTwinJobDeps = defaultHomeDigitalTwinDeps,
) {
  if (!jobData.scenarioId || !jobData.digitalTwinId) {
    throw new Error('Scenario compute job is missing scenarioId or digitalTwinId.');
  }
  try {
    await deps.createScenarioService().computeScenario(
      jobData.scenarioId,
      jobData.digitalTwinId,
      jobData.computationRunId,
    );
  } catch (err) {
    if (jobData.computationRunId) {
      const message = err instanceof Error ? err.message : 'Scenario calculation failed.';
      await deps.prisma.$transaction([
        deps.prisma.homeTwinComputationRun.updateMany({
          where: { id: jobData.computationRunId, status: { in: ['QUEUED', 'RUNNING'] } },
          data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
        }),
        deps.prisma.homeTwinScenario.updateMany({
          where: { id: jobData.scenarioId, digitalTwinId: jobData.digitalTwinId, isArchived: false },
          data: {
            status: 'FAILED',
            staleAt: new Date(),
            staleReason: 'The latest calculation failed. Previous results are not current.',
          },
        }),
      ]);
    }
    throw err;
  }
}
