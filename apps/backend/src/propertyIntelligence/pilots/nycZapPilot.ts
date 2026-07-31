import {
  IntelligenceCoverageStatus,
  IntelligenceSourceFamily,
  IntelligenceSourceReviewStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
import { recordAdminAction } from '../../services/adminAudit.service';
import { DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS } from '../launchGovernance';

export const NYC_ZAP_SOURCE_KEY = 'nyc-dcp-zap-projects';
export const NYC_ZAP_OBSERVATION_TYPE = 'NYC_ZONING_APPLICATION';
export const NYC_ZAP_TERMS_VERSION =
  'NYC Open Data Terms of Use reviewed 2026-07-30';
export const NYC_ZAP_DATASET_URL =
  'https://data.cityofnewyork.us/City-Government/Zoning-Application-Portal-ZAP-Project-Data/hgx4-8ukb';

export const NYC_ZAP_COUNTY_TO_BOROUGH = {
  'NEW YORK COUNTY': 'Manhattan',
  'BRONX COUNTY': 'Bronx',
  'KINGS COUNTY': 'Brooklyn',
  'QUEENS COUNTY': 'Queens',
  'RICHMOND COUNTY': 'Staten Island',
} as const;

const FAMILY_SETTING_PREFIX = 'property-intelligence:family-gate';
const DEFAULT_PILOT_COUNTIES = ['NEW YORK COUNTY'];
const SOURCE_LIMITATIONS =
  'Monthly NYC Department of City Planning ZAP project lifecycle data. '
  + 'The pilot is matched at county/borough precision only; it does not establish distance, '
  + 'property impact, construction activity, value change, or comprehensive local coverage.';

export type NycZapPilotConfig = {
  enabled: boolean;
  environment: string;
  reviewedBy: string | null;
  reviewReference: string | null;
  counties: Array<keyof typeof NYC_ZAP_COUNTY_TO_BOROUGH>;
};

function normalizeCounty(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function readNycZapPilotConfig(
  env: NodeJS.ProcessEnv = process.env,
): NycZapPilotConfig {
  const enabled = env.NYC_ZAP_PILOT_ENABLED === 'true';
  const requestedCounties = (env.NYC_ZAP_PILOT_COUNTIES ?? DEFAULT_PILOT_COUNTIES.join(','))
    .split(',')
    .map(normalizeCounty)
    .filter(Boolean);
  const unsupported = requestedCounties.filter(
    (county) => !(county in NYC_ZAP_COUNTY_TO_BOROUGH),
  );
  if (unsupported.length > 0) {
    throw new Error(`Unsupported NYC ZAP pilot counties: ${unsupported.join(', ')}`);
  }
  const reviewedBy = env.NYC_ZAP_PILOT_REVIEWED_BY?.trim() || null;
  const reviewReference = env.NYC_ZAP_PILOT_REVIEW_REFERENCE?.trim() || null;
  if (enabled && (!reviewedBy || !reviewReference)) {
    throw new Error(
      'NYC ZAP pilot activation requires NYC_ZAP_PILOT_REVIEWED_BY and '
      + 'NYC_ZAP_PILOT_REVIEW_REFERENCE.',
    );
  }
  return {
    enabled,
    environment: env.NODE_ENV?.trim() || 'development',
    reviewedBy,
    reviewReference,
    counties: [...new Set(requestedCounties)] as NycZapPilotConfig['counties'],
  };
}

function familySettingKey(environment: string) {
  return `${FAMILY_SETTING_PREFIX}:${environment}:${IntelligenceSourceFamily.PLANNING}`;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function ensureNycZapPilotActivation(
  config = readNycZapPilotConfig(),
) {
  if (!config.enabled) {
    return {
      activated: false,
      sourceKey: NYC_ZAP_SOURCE_KEY,
      environment: config.environment,
      counties: config.counties,
    };
  }
  const reviewerId = config.reviewedBy as string;
  const reviewReference = config.reviewReference as string;
  const settingKey = familySettingKey(config.environment);

  return prisma.$transaction(async (tx) => {
    const [existingSource, existingSetting] = await Promise.all([
      tx.intelligenceSource.findUnique({ where: { key: NYC_ZAP_SOURCE_KEY } }),
      tx.systemSetting.findUnique({ where: { key: settingKey } }),
    ]);
    if (
      existingSource?.reviewedStatus === IntelligenceSourceReviewStatus.PAUSED
      || existingSource?.reviewedStatus === IntelligenceSourceReviewStatus.REJECTED
      || existingSource?.pausedAt
    ) {
      throw new APIError(
        'The NYC ZAP source is paused or rejected and cannot be resumed by startup configuration.',
        409,
        'NYC_ZAP_PILOT_REVIEW_BLOCKED',
      );
    }
    const existingPolicy =
      existingSetting?.value
      && typeof existingSetting.value === 'object'
      && !Array.isArray(existingSetting.value)
        ? existingSetting.value as Record<string, unknown>
        : {};
    if (existingPolicy.stage === 'PAUSED') {
      throw new APIError(
        'The Planning source family is paused and cannot be resumed by startup configuration.',
        409,
        'PLANNING_PILOT_PAUSED',
      );
    }

    const source = await tx.intelligenceSource.upsert({
      where: { key: NYC_ZAP_SOURCE_KEY },
      create: {
        key: NYC_ZAP_SOURCE_KEY,
        family: IntelligenceSourceFamily.PLANNING,
        provider: 'New York City Department of City Planning',
        reviewedStatus: IntelligenceSourceReviewStatus.APPROVED,
        termsVersion: NYC_ZAP_TERMS_VERSION,
        supportedObservationTypes: [NYC_ZAP_OBSERVATION_TYPE],
        refreshPolicy: {
          cadenceMinutes: 1440,
          maxStalenessMinutes: 46_080,
          operationalResponseMinutes: 1440,
        },
        enabledEnvironments: [config.environment],
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      },
      update: {
        family: IntelligenceSourceFamily.PLANNING,
        provider: 'New York City Department of City Planning',
        reviewedStatus: IntelligenceSourceReviewStatus.APPROVED,
        termsVersion: NYC_ZAP_TERMS_VERSION,
        supportedObservationTypes: [NYC_ZAP_OBSERVATION_TYPE],
        refreshPolicy: {
          cadenceMinutes: 1440,
          maxStalenessMinutes: 46_080,
          operationalResponseMinutes: 1440,
        },
        enabledEnvironments: {
          set: [...new Set([
            ...(existingSource?.enabledEnvironments ?? []),
            config.environment,
          ])],
        },
        reviewedAt: existingSource?.reviewedAt ?? new Date(),
        reviewedBy: existingSource?.reviewedBy ?? reviewerId,
      },
    });

    for (const county of config.counties) {
      await tx.intelligenceSourceCoverage.upsert({
        where: {
          sourceId_geographyType_geographyKey: {
            sourceId: source.id,
            geographyType: 'COUNTY',
            geographyKey: county,
          },
        },
        create: {
          sourceId: source.id,
          geographyType: 'COUNTY',
          geographyKey: county,
          coverageLimitations: SOURCE_LIMITATIONS,
          status: IntelligenceCoverageStatus.CONFIGURED,
          qaReviewedAt: new Date(),
          qaReviewedBy: reviewerId,
          qaReviewNote: `Reviewed pilot activation: ${reviewReference}`,
        },
        update: {
          coverageLimitations: SOURCE_LIMITATIONS,
        },
      });
    }

    const policy = {
      stage: 'PILOT',
      safetyApproved: true,
      privacyApproved: true,
      hazardLanguageApproved: true,
      thresholds: DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS,
      reviewNote:
        'NYC ZAP Manhattan pilot is limited to public planning facts and county-level matching.',
      reviewedBy: reviewerId,
      reviewedAt:
        existingPolicy.reviewReference === reviewReference
        && typeof existingPolicy.reviewedAt === 'string'
          ? existingPolicy.reviewedAt
          : new Date().toISOString(),
      reviewReference,
    };
    await tx.systemSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: json(policy),
        description:
          'Property Intelligence source-family launch stage, reviews, and measurable thresholds.',
      },
      update: { value: json(policy) },
    });

    const configurationChanged =
      !existingSource
      || existingSource.reviewedStatus !== IntelligenceSourceReviewStatus.APPROVED
      || !existingSource.enabledEnvironments.includes(config.environment)
      || existingPolicy.stage !== 'PILOT'
      || existingPolicy.reviewReference !== reviewReference;
    if (configurationChanged) {
      await recordAdminAction({
        actorId: reviewerId,
        action: 'PROPERTY_INTELLIGENCE_PILOT_ACTIVATE',
        entityType: 'IntelligenceSource',
        entityId: NYC_ZAP_SOURCE_KEY,
        capability: 'INTEGRATION_MANAGE',
        reason: `Reviewed NYC ZAP pilot activation: ${reviewReference}`,
        disposition: 'PILOT',
        oldValues: existingSource
          ? json({
              reviewedStatus: existingSource.reviewedStatus,
              enabledEnvironments: existingSource.enabledEnvironments,
              familyPolicy: existingPolicy,
            })
          : undefined,
        newValues: json({
          environment: config.environment,
          counties: config.counties,
          familyPolicy: policy,
          reviewReference,
        }),
      }, tx);
    }

    return {
      activated: true,
      sourceKey: source.key,
      environment: config.environment,
      counties: config.counties,
      reviewReference,
    };
  });
}
