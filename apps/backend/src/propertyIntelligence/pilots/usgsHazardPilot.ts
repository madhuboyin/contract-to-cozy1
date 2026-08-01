import {
  IntelligenceCoverageStatus,
  IntelligenceSourceFamily,
  IntelligenceSourceReviewStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
import { DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS } from '../launchGovernance';

export const USGS_HAZARD_SOURCE_KEY = 'usgs-earthquakes-property-intelligence';
export const USGS_HAZARD_OBSERVATION_TYPE = 'EARTHQUAKE_EVENT';
export const USGS_HAZARD_TERMS_VERSION = 'USGS Earthquake Catalog public-data terms reviewed';

export type UsgsHazardPilotConfig = {
  enabled: boolean;
  environment: string;
  reviewedBy: string | null;
  reviewReference: string | null;
};

const familySettingKey = (environment: string) =>
  `property-intelligence:family-gate:${environment}:${IntelligenceSourceFamily.HAZARD}`;
const json = (value: unknown) => value as Prisma.InputJsonValue;

export function readUsgsHazardPilotConfig(
  env: NodeJS.ProcessEnv = process.env,
): UsgsHazardPilotConfig {
  const enabled = env.USGS_PROPERTY_INTELLIGENCE_PILOT_ENABLED === 'true';
  const reviewedBy = env.USGS_PROPERTY_INTELLIGENCE_REVIEWED_BY?.trim() || null;
  const reviewReference = env.USGS_PROPERTY_INTELLIGENCE_REVIEW_REFERENCE?.trim() || null;
  if (enabled && (!reviewedBy || !reviewReference)) {
    throw new Error(
      'USGS Property Intelligence activation requires a named reviewer and review reference.',
    );
  }
  return {
    enabled,
    environment: env.NODE_ENV?.trim() || 'development',
    reviewedBy,
    reviewReference,
  };
}

export async function ensureUsgsHazardPilotActivation(
  config = readUsgsHazardPilotConfig(),
) {
  if (!config.enabled) return { activated: false, sourceKey: USGS_HAZARD_SOURCE_KEY };
  const existing = await prisma.intelligenceSource.findUnique({
    where: { key: USGS_HAZARD_SOURCE_KEY },
  });
  const existingSetting = await prisma.systemSetting.findUnique({
    where: { key: familySettingKey(config.environment) },
  });
  const existingPolicy = existingSetting?.value
    && typeof existingSetting.value === 'object'
    && !Array.isArray(existingSetting.value)
      ? existingSetting.value as Record<string, unknown>
      : {};
  if (
    existing?.pausedAt
    || existing?.reviewedStatus === IntelligenceSourceReviewStatus.PAUSED
    || existing?.reviewedStatus === IntelligenceSourceReviewStatus.REJECTED
  ) {
    throw new APIError(
      'The reviewed USGS hazard source is paused or rejected.',
      409,
      'USGS_HAZARD_PILOT_REVIEW_BLOCKED',
    );
  }
  if (existingPolicy.stage === 'PAUSED') {
    throw new APIError(
      'The hazard source family is paused and cannot be resumed by startup configuration.',
      409,
      'HAZARD_PILOT_PAUSED',
    );
  }
  const reviewer = config.reviewedBy as string;
  const reference = config.reviewReference as string;
  return prisma.$transaction(async (tx) => {
    const source = await tx.intelligenceSource.upsert({
      where: { key: USGS_HAZARD_SOURCE_KEY },
      create: {
        key: USGS_HAZARD_SOURCE_KEY,
        family: IntelligenceSourceFamily.HAZARD,
        provider: 'U.S. Geological Survey',
        reviewedStatus: IntelligenceSourceReviewStatus.APPROVED,
        termsVersion: `${USGS_HAZARD_TERMS_VERSION}: ${reference}`,
        supportedObservationTypes: [USGS_HAZARD_OBSERVATION_TYPE],
        refreshPolicy: {
          cadenceMinutes: 15,
          maxStalenessMinutes: 60,
          operationalResponseMinutes: 60,
        },
        enabledEnvironments: [config.environment],
        reviewedAt: new Date(),
        reviewedBy: reviewer,
      },
      update: {
        family: IntelligenceSourceFamily.HAZARD,
        provider: 'U.S. Geological Survey',
        reviewedStatus: IntelligenceSourceReviewStatus.APPROVED,
        termsVersion: `${USGS_HAZARD_TERMS_VERSION}: ${reference}`,
        supportedObservationTypes: [USGS_HAZARD_OBSERVATION_TYPE],
        enabledEnvironments: {
          set: [...new Set([...(existing?.enabledEnvironments ?? []), config.environment])],
        },
      },
    });
    await tx.intelligenceSourceCoverage.upsert({
      where: {
        sourceId_geographyType_geographyKey: {
          sourceId: source.id,
          geographyType: 'NATIONAL',
          geographyKey: 'US',
        },
      },
      create: {
        sourceId: source.id,
        geographyType: 'NATIONAL',
        geographyKey: 'US',
        coverageLimitations:
          'USGS catalog events within reviewed magnitude-dependent awareness radii. '
          + 'A match is not a shaking estimate or evidence of property damage.',
        status: IntelligenceCoverageStatus.CONFIGURED,
        qaReviewedAt: new Date(),
        qaReviewedBy: reviewer,
        qaReviewNote: `Reviewed activation: ${reference}`,
      },
      update: {
        coverageLimitations:
          'USGS catalog events within reviewed magnitude-dependent awareness radii. '
          + 'A match is not a shaking estimate or evidence of property damage.',
      },
    });
    const policy = {
      stage: 'PILOT',
      safetyApproved: true,
      privacyApproved: true,
      hazardLanguageApproved: true,
      thresholds: DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS,
      reviewedBy: reviewer,
      reviewReference: reference,
      reviewedAt:
        existingPolicy.reviewReference === reference && typeof existingPolicy.reviewedAt === 'string'
          ? existingPolicy.reviewedAt
          : new Date().toISOString(),
    };
    await tx.systemSetting.upsert({
      where: { key: familySettingKey(config.environment) },
      create: {
        key: familySettingKey(config.environment),
        value: json(policy),
        description: 'Reviewed Property Intelligence hazard-family launch policy.',
      },
      update: { value: json(policy) },
    });
    return { activated: true, sourceKey: source.key, environment: config.environment };
  });
}
