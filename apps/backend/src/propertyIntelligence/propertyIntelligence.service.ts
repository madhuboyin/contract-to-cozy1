import {
  IntelligenceCoverageGeographyType,
  IntelligenceCoverageStatus,
  IntelligenceSourceFamily,
  IntelligenceSourceReviewStatus,
  IntelligenceSourceRunStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  IntelligenceCoverageInput,
  IntelligenceSourceInput,
  NormalizedIntelligenceObservation,
} from './propertyIntelligence.contracts';
import { deriveCoverageHealth } from './coverageHealth';
import { matchObservationToProperty } from './geoMatching';
import { buildGeographicMatchAssessment } from './impactBoundaries';
import { observationContentHash } from './observationIdentity';
import {
  assertObservationTypeSupported,
  evaluateSourceActivation,
} from './sourceGovernance';
import { emitPropertyChangeWithTransaction } from '../propertyChanges/propertyChange.service';
import {
  evaluateFamilyLaunchAuthorization,
  observationWithinReviewedCoverage,
  parseSourceFamilyLaunchPolicy,
} from './launchGovernance';

const normalizeKey = (value: string): string => value.trim().toUpperCase();
const FAMILY_SETTING_PREFIX = 'property-intelligence:family-gate';

function familySettingKey(environment: string, family: string) {
  return `${FAMILY_SETTING_PREFIX}:${environment}:${family}`;
}

async function authorizedSourceFamilies(environment: string) {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { startsWith: `${FAMILY_SETTING_PREFIX}:${environment}:` } },
    select: { key: true, value: true },
  });
  return new Set(settings.flatMap((setting) => {
    const family = setting.key.slice(setting.key.lastIndexOf(':') + 1);
    if (!Object.values(IntelligenceSourceFamily).includes(
      family as IntelligenceSourceFamily,
    )) return [];
    const authorization = evaluateFamilyLaunchAuthorization(
      parseSourceFamilyLaunchPolicy(setting.value),
    );
    return authorization.authorized
      ? [family as IntelligenceSourceFamily]
      : [];
  }));
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function sourceNotFound(sourceKey: string): APIError {
  return new APIError(
    `Intelligence source ${sourceKey} was not found.`,
    404,
    'INTELLIGENCE_SOURCE_NOT_FOUND',
  );
}

export async function createIntelligenceSource(input: IntelligenceSourceInput) {
  return prisma.intelligenceSource.create({
    data: {
      ...input,
      refreshPolicy: json(input.refreshPolicy),
      reviewedStatus: IntelligenceSourceReviewStatus.DRAFT,
    },
  });
}

export async function reviewIntelligenceSource(input: {
  sourceKey: string;
  reviewerId: string;
  decision: 'APPROVE' | 'PAUSE' | 'REJECT';
  reason: string;
  termsVersion?: string;
  enabledEnvironments?: string[];
}) {
  const source = await prisma.intelligenceSource.findUnique({
    where: { key: input.sourceKey },
  });
  if (!source) throw sourceNotFound(input.sourceKey);

  if (input.decision === 'APPROVE') {
    const termsVersion = input.termsVersion ?? source.termsVersion;
    const enabledEnvironments =
      input.enabledEnvironments ?? source.enabledEnvironments;
    if (!termsVersion || source.supportedObservationTypes.length === 0) {
      throw new APIError(
        'Approval requires a terms version and supported observation types.',
        422,
        'SOURCE_REVIEW_INCOMPLETE',
      );
    }
    if (enabledEnvironments.length === 0) {
      throw new APIError(
        'Approval requires at least one explicitly enabled environment.',
        422,
        'SOURCE_ENVIRONMENT_REQUIRED',
      );
    }
    return prisma.intelligenceSource.update({
      where: { id: source.id },
      data: {
        reviewedStatus: IntelligenceSourceReviewStatus.APPROVED,
        termsVersion,
        enabledEnvironments,
        reviewedAt: new Date(),
        reviewedBy: input.reviewerId,
        pausedAt: null,
        pauseReason: null,
      },
    });
  }

  return prisma.intelligenceSource.update({
    where: { id: source.id },
    data: {
      reviewedStatus:
        input.decision === 'PAUSE'
          ? IntelligenceSourceReviewStatus.PAUSED
          : IntelligenceSourceReviewStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedBy: input.reviewerId,
      pausedAt: input.decision === 'PAUSE' ? new Date() : null,
      pauseReason: input.reason,
      enabledEnvironments: [],
    },
  });
}

export async function upsertIntelligenceCoverage(
  sourceKey: string,
  input: IntelligenceCoverageInput,
) {
  const source = await prisma.intelligenceSource.findUnique({
    where: { key: sourceKey },
    select: { id: true },
  });
  if (!source) throw sourceNotFound(sourceKey);

  return prisma.intelligenceSourceCoverage.upsert({
    where: {
      sourceId_geographyType_geographyKey: {
        sourceId: source.id,
        geographyType: input.geographyType,
        geographyKey: normalizeKey(input.geographyKey),
      },
    },
    create: {
      sourceId: source.id,
      geographyType: input.geographyType,
      geographyKey: normalizeKey(input.geographyKey),
      geometryJson: input.geometryJson ? json(input.geometryJson) : undefined,
      validFrom: input.validFrom,
      validThrough: input.validThrough,
      coverageLimitations: input.coverageLimitations,
      status: IntelligenceCoverageStatus.CONFIGURED,
    },
    update: {
      geometryJson: input.geometryJson ? json(input.geometryJson) : Prisma.DbNull,
      validFrom: input.validFrom,
      validThrough: input.validThrough,
      coverageLimitations: input.coverageLimitations,
      status: IntelligenceCoverageStatus.CONFIGURED,
      qaReviewedAt: null,
      qaReviewedBy: null,
      qaReviewNote: null,
    },
  });
}

export async function reviewIntelligenceCoverage(input: {
  sourceKey: string;
  reviewerId: string;
  geographyType: IntelligenceCoverageGeographyType;
  geographyKey: string;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}) {
  const source = await prisma.intelligenceSource.findUnique({
    where: { key: input.sourceKey },
    select: { id: true },
  });
  if (!source) throw sourceNotFound(input.sourceKey);
  const coverage = await prisma.intelligenceSourceCoverage.findUnique({
    where: {
      sourceId_geographyType_geographyKey: {
        sourceId: source.id,
        geographyType: input.geographyType,
        geographyKey: normalizeKey(input.geographyKey),
      },
    },
  });
  if (!coverage) {
    throw new APIError(
      'Source coverage was not found.',
      404,
      'INTELLIGENCE_COVERAGE_NOT_FOUND',
    );
  }
  return prisma.intelligenceSourceCoverage.update({
    where: { id: coverage.id },
    data: {
      qaReviewedAt: input.decision === 'APPROVE' ? new Date() : null,
      qaReviewedBy: input.reviewerId,
      qaReviewNote: input.reason,
      status:
        input.decision === 'APPROVE'
          ? IntelligenceCoverageStatus.CONFIGURED
          : IntelligenceCoverageStatus.UNAVAILABLE,
    },
  });
}

function observationIdentityPayload(observation: NormalizedIntelligenceObservation) {
  const { lastVerifiedAt: _lastVerifiedAt, ...identity } = observation;
  return identity;
}

async function candidateProperties(
  tx: Prisma.TransactionClient,
  observation: NormalizedIntelligenceObservation,
) {
  if (observation.geographyType === 'ZIP') {
    return tx.property.findMany({
      where: { zipCode: { equals: observation.geographyKey, mode: 'insensitive' } },
      select: {
        id: true, latitude: true, longitude: true, zipCode: true, county: true, state: true,
      },
    });
  }
  if (observation.geographyType === 'COUNTY') {
    return tx.property.findMany({
      where: { county: { equals: observation.geographyKey, mode: 'insensitive' } },
      select: {
        id: true, latitude: true, longitude: true, zipCode: true, county: true, state: true,
      },
    });
  }
  if (observation.geographyType === 'STATE') {
    return tx.property.findMany({
      where: { state: { equals: observation.geographyKey, mode: 'insensitive' } },
      select: {
        id: true, latitude: true, longitude: true, zipCode: true, county: true, state: true,
      },
    });
  }
  if (
    observation.geographyType === 'POINT_RADIUS'
    && observation.latitude != null
    && observation.longitude != null
    && observation.matchRadiusMiles != null
  ) {
    const latitudeDelta = observation.matchRadiusMiles / 69;
    const longitudeScale = Math.max(
      Math.cos(observation.latitude * Math.PI / 180),
      0.01,
    );
    const longitudeDelta = observation.matchRadiusMiles / (69 * longitudeScale);
    return tx.property.findMany({
      where: {
        latitude: {
          gte: observation.latitude - latitudeDelta,
          lte: observation.latitude + latitudeDelta,
        },
        longitude: {
          gte: observation.longitude - longitudeDelta,
          lte: observation.longitude + longitudeDelta,
        },
      },
      select: {
        id: true, latitude: true, longitude: true, zipCode: true, county: true, state: true,
      },
    });
  }
  return [];
}

async function matchProperties(
  tx: Prisma.TransactionClient,
  observationId: string,
  observation: NormalizedIntelligenceObservation,
  source: {
    key: string;
    revision: number;
    changeType:
      | 'SOURCE_RECORD_CREATED'
      | 'SOURCE_RECORD_REVISED'
      | 'SOURCE_LIFECYCLE_CHANGED';
    lifecycleAdvanced: boolean;
    previousObservationId: string | null;
  },
): Promise<number> {
  const properties = await candidateProperties(tx, observation);
  let matchCount = 0;

  for (const property of properties) {
    const match = matchObservationToProperty(observation, property);
    if (!match) continue;
    const propertyMatch = await tx.propertyObservationMatch.create({
      data: {
        propertyId: property.id,
        observationId,
        matchMethod: match.matchMethod,
        distanceMiles: match.distanceMiles,
        geographicPrecision: match.geographicPrecision,
        matchConfidence: match.matchConfidence,
        matchedGeography: match.matchedGeography,
      },
    });
    if (source.previousObservationId) {
      const previousStates = await tx.propertyLocalObservationState.findMany({
        where: {
          propertyId: property.id,
          propertyMatch: { observationId: source.previousObservationId },
        },
      });
      if (previousStates.length > 0) {
        await tx.propertyLocalObservationState.createMany({
          data: previousStates.map((state) => ({
            propertyId: property.id,
            propertyMatchId: propertyMatch.id,
            userId: state.userId,
            disposition: state.disposition,
            lastSeenRevision: state.lastSeenRevision,
            seenAt: state.seenAt,
            followedAt: state.followedAt,
            dismissedAt: state.dismissedAt,
            notRelevantAt: state.notRelevantAt,
            reason: state.reason,
          })),
          skipDuplicates: true,
        });
      }
    }
    const assessment = buildGeographicMatchAssessment(
      observation.observationType,
      match,
    );
    await tx.propertyImpactAssessment.create({
      data: {
        propertyMatchId: propertyMatch.id,
        ...assessment,
        knownFactsUsed: json(assessment.knownFactsUsed),
      },
    });
    const homeownerRelevant = match.matchConfidence >= 0.65
      && !['CANCELLED', 'STALE'].includes(observation.lifecycleStatus);
    // FRD §15 Phase 2 work item 5: emitPropertyChangeWithTransaction itself
    // requests an intelligence recompute inside this same tx (see
    // propertyChange.service.ts's requestRecomputeForChange) — atomic with
    // this write, so no separate post-commit surfacing is needed here.
    await emitPropertyChangeWithTransaction(tx, {
      propertyId: property.id,
      sourceType: 'INTELLIGENCE_OBSERVATION',
      sourceEntityId: `${source.key}:${observation.externalId}`,
      sourceRevision: String(source.revision),
      sourceRevisionOrdinal: source.revision,
      changeType: source.changeType,
      occurredAt: observation.observedAt
        ?? observation.effectiveFrom
        ?? observation.lastVerifiedAt,
      detectedAt: observation.lastVerifiedAt,
      confidence: match.matchConfidence,
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant,
        lifecycleAdvanced: source.lifecycleAdvanced,
        propertyEffectConfirmed: false,
        urgentSafetyCondition: false,
        canonicalActionPriority: null,
      },
      canonicalActionId: null,
      canonicalEventId: null,
    });
    matchCount += 1;
  }
  return matchCount;
}

export async function ingestIntelligenceBatch(input: {
  sourceKey: string;
  environment: string;
  correlationId?: string;
  checkedThrough: Date;
  observations: NormalizedIntelligenceObservation[];
}) {
  const source = await prisma.intelligenceSource.findUnique({
    where: { key: input.sourceKey },
    include: { coverages: true },
  });
  if (!source) throw sourceNotFound(input.sourceKey);

  const activation = evaluateSourceActivation(
    source,
    source.coverages,
    input.environment,
  );
  const familySetting = await prisma.systemSetting.findUnique({
    where: { key: familySettingKey(input.environment, source.family) },
    select: { value: true },
  });
  const familyAuthorization = evaluateFamilyLaunchAuthorization(
    parseSourceFamilyLaunchPolicy(familySetting?.value),
  );
  const activationReasonCodes = [
    ...activation.reasonCodes,
    ...familyAuthorization.reasonCodes,
  ];
  if (!activation.enabled || !familyAuthorization.authorized) {
    await prisma.intelligenceSourceRun.create({
      data: {
        sourceId: source.id,
        environment: input.environment,
        correlationId: input.correlationId,
        completedAt: new Date(),
        status: IntelligenceSourceRunStatus.REJECTED,
        recordsRead: input.observations.length,
        recordsRejected: input.observations.length,
        failureCode: 'SOURCE_ACTIVATION_REJECTED',
        failureDetail: activationReasonCodes.join(','),
      },
    });
    throw new APIError(
      'The source is not activated for ingestion.',
      409,
      'SOURCE_ACTIVATION_REJECTED',
      { reasonCodes: activationReasonCodes },
    );
  }

  const run = await prisma.intelligenceSourceRun.create({
    data: {
      sourceId: source.id,
      environment: input.environment,
      correlationId: input.correlationId,
      recordsRead: input.observations.length,
    },
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      let accepted = 0;
      let rejected = 0;
      let rejectedOutsideReviewedGeography = 0;
      let rejectedUnsupportedObservationType = 0;
      let unchanged = 0;
      let revisions = 0;
      let matches = 0;

      for (const observation of input.observations) {
        if (!observationWithinReviewedCoverage(observation, source.coverages)) {
          rejected += 1;
          rejectedOutsideReviewedGeography += 1;
          continue;
        }
        try {
          assertObservationTypeSupported(
            source.supportedObservationTypes,
            observation.observationType,
          );
        } catch {
          rejected += 1;
          rejectedUnsupportedObservationType += 1;
          continue;
        }

        const contentHash = observationContentHash(
          observationIdentityPayload(observation),
        );
        const latest = await tx.intelligenceObservation.findFirst({
          where: { sourceId: source.id, externalId: observation.externalId },
          orderBy: { revision: 'desc' },
        });

        if (latest?.contentHash === contentHash) {
          await tx.intelligenceObservation.update({
            where: { id: latest.id },
            data: { lastVerifiedAt: observation.lastVerifiedAt },
          });
          unchanged += 1;
          accepted += 1;
          continue;
        }

        const created = await tx.intelligenceObservation.create({
          data: {
            sourceId: source.id,
            sourceRunId: run.id,
            externalId: observation.externalId,
            observationType: observation.observationType,
            lifecycleStatus: observation.lifecycleStatus,
            observedAt: observation.observedAt,
            effectiveFrom: observation.effectiveFrom,
            effectiveTo: observation.effectiveTo,
            latitude: observation.latitude,
            longitude: observation.longitude,
            geographyType: observation.geographyType,
            geographyKey: normalizeKey(observation.geographyKey),
            geometryJson: observation.geometryJson
              ? json(observation.geometryJson)
              : undefined,
            matchRadiusMiles: observation.matchRadiusMiles,
            sourceUrl: observation.sourceUrl,
            sourcePublishedAt: observation.sourcePublishedAt,
            lastVerifiedAt: observation.lastVerifiedAt,
            revision: (latest?.revision ?? 0) + 1,
            supersedesObservationId: latest?.id,
            factualPayload: json(observation.factualPayload),
            contentHash,
          },
        });
        const lifecycleAdvanced = latest != null
          && latest.lifecycleStatus !== observation.lifecycleStatus;
        matches += await matchProperties(tx, created.id, observation, {
          key: source.key,
          revision: created.revision,
          changeType: lifecycleAdvanced
            ? 'SOURCE_LIFECYCLE_CHANGED'
            : latest
              ? 'SOURCE_RECORD_REVISED'
              : 'SOURCE_RECORD_CREATED',
          lifecycleAdvanced,
          previousObservationId: latest?.id ?? null,
        });
        if (latest) {
          await tx.propertyChange.updateMany({
            where: {
              sourceType: 'INTELLIGENCE_OBSERVATION',
              sourceEntityId: `${source.key}:${observation.externalId}`,
              sourceRevisionOrdinal: { lt: created.revision },
              supersededAt: null,
            },
            data: {
              supersededAt: observation.lastVerifiedAt,
              briefingEligibility: 'INELIGIBLE',
              briefingReasonCodes: ['CHANGE_SUPERSEDED'],
              briefingEvaluatedAt: observation.lastVerifiedAt,
            },
          });
        }
        revisions += latest ? 1 : 0;
        accepted += 1;
      }

      await tx.intelligenceSourceCoverage.updateMany({
        where: { sourceId: source.id, qaReviewedAt: { not: null } },
        data: {
          checkedThrough: input.checkedThrough,
          lastSuccessfulRunAt: new Date(),
          status:
            rejected > 0
              ? IntelligenceCoverageStatus.DEGRADED
              : IntelligenceCoverageStatus.ACTIVE,
        },
      });
      await tx.intelligenceSourceRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          status:
            rejected > 0
              ? IntelligenceSourceRunStatus.PARTIAL
              : IntelligenceSourceRunStatus.SUCCEEDED,
          recordsAccepted: accepted,
          recordsRejected: rejected,
          coverageUpdated: true,
          failureCode:
            rejected > 0 ? 'RECORDS_REJECTED_BY_GOVERNANCE' : null,
          failureDetail:
            rejected > 0
              ? JSON.stringify({
                  outsideReviewedGeography: rejectedOutsideReviewedGeography,
                  unsupportedObservationType: rejectedUnsupportedObservationType,
                })
              : null,
        },
      });
      return {
        accepted,
        rejected,
        rejectionReasons: {
          outsideReviewedGeography: rejectedOutsideReviewedGeography,
          unsupportedObservationType: rejectedUnsupportedObservationType,
        },
        unchanged,
        revisions,
        matches,
      };
    });
    return { runId: run.id, ...result, checkedThrough: input.checkedThrough };
  } catch (error) {
    await prisma.$transaction([
      prisma.intelligenceSourceRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          status: IntelligenceSourceRunStatus.FAILED,
          failureCode: 'INGESTION_FAILED',
          failureDetail: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown failure',
        },
      }),
      prisma.intelligenceSourceCoverage.updateMany({
        where: { sourceId: source.id, qaReviewedAt: { not: null } },
        data: {
          status: IntelligenceCoverageStatus.DEGRADED,
          lastFailureAt: new Date(),
        },
      }),
    ]);
    throw error;
  }
}

function relevantCoverageWhere(property: {
  state: string;
  county: string | null;
  zipCode: string;
}): Prisma.IntelligenceSourceCoverageWhereInput {
  return {
    OR: [
      { geographyType: IntelligenceCoverageGeographyType.NATIONAL },
      {
        geographyType: IntelligenceCoverageGeographyType.STATE,
        geographyKey: normalizeKey(property.state),
      },
      {
        geographyType: IntelligenceCoverageGeographyType.ZIP,
        geographyKey: normalizeKey(property.zipCode),
      },
      ...(property.county
        ? [{
            geographyType: IntelligenceCoverageGeographyType.COUNTY,
            geographyKey: normalizeKey(property.county),
          }]
        : []),
    ],
  };
}

export async function getPropertyIntelligenceCoverage(
  propertyId: string,
  environment: string,
) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { state: true, county: true, zipCode: true },
  });
  if (!property) {
    throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
  }
  const authorizedFamilies = await authorizedSourceFamilies(environment);
  if (authorizedFamilies.size === 0) return [];
  const sources = await prisma.intelligenceSource.findMany({
    where: {
      reviewedStatus: IntelligenceSourceReviewStatus.APPROVED,
      enabledEnvironments: { has: environment },
      family: { in: [...authorizedFamilies] },
    },
    include: {
      coverages: {
        where: {
          AND: [
            relevantCoverageWhere(property),
            { qaReviewedAt: { not: null } },
          ],
        },
      },
    },
    orderBy: { key: 'asc' },
  });

  return sources.map((source) => {
    const refreshPolicy = source.refreshPolicy as {
      maxStalenessMinutes?: number;
    };
    const coverage = source.coverages
      .sort((left, right) =>
        (right.checkedThrough?.getTime() ?? 0)
        - (left.checkedThrough?.getTime() ?? 0))[0] ?? null;
    return {
      source: {
        key: source.key,
        family: source.family,
        provider: source.provider,
        termsVersion: source.termsVersion,
      },
      geography: coverage
        ? {
            type: coverage.geographyType,
            key: coverage.geographyKey,
          }
        : null,
      ...deriveCoverageHealth({
        coverage,
        maxStalenessMinutes: refreshPolicy.maxStalenessMinutes ?? 1440,
      }),
    };
  });
}

export async function getPropertyIntelligenceObservations(
  propertyId: string,
  environment: string,
) {
  const authorizedFamilies = await authorizedSourceFamilies(environment);
  if (authorizedFamilies.size === 0) return [];
  return prisma.propertyObservationMatch.findMany({
    where: {
      propertyId,
      observation: {
        supersededBy: { none: {} },
        source: {
          reviewedStatus: IntelligenceSourceReviewStatus.APPROVED,
          enabledEnvironments: { has: environment },
          pausedAt: null,
          family: { in: [...authorizedFamilies] },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      matchMethod: true,
      distanceMiles: true,
      overlapRatio: true,
      geographicPrecision: true,
      matchConfidence: true,
      matchedGeography: true,
      observation: {
        select: {
          externalId: true,
          observationType: true,
          lifecycleStatus: true,
          observedAt: true,
          effectiveFrom: true,
          effectiveTo: true,
          latitude: true,
          longitude: true,
          geographyType: true,
          geographyKey: true,
          geometryJson: true,
          sourceUrl: true,
          sourcePublishedAt: true,
          lastVerifiedAt: true,
          revision: true,
          factualPayload: true,
          source: {
            select: {
              key: true,
              family: true,
              provider: true,
              termsVersion: true,
            },
          },
        },
      },
      assessments: {
        where: { supersededAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
}

export async function getIntelligenceSourceHealth(environment: string) {
  const [sources, familySettings] = await Promise.all([
    prisma.intelligenceSource.findMany({
      orderBy: { key: 'asc' },
      include: {
        coverages: { orderBy: { updatedAt: 'desc' } },
        runs: { orderBy: { startedAt: 'desc' }, take: 10 },
        _count: { select: { observations: true } },
      },
    }),
    prisma.systemSetting.findMany({
      where: { key: { startsWith: `${FAMILY_SETTING_PREFIX}:${environment}:` } },
      select: { key: true, value: true },
    }),
  ]);
  const policyByFamily = new Map(
    familySettings.map((setting) => [
      setting.key.slice(setting.key.lastIndexOf(':') + 1),
      parseSourceFamilyLaunchPolicy(setting.value),
    ]),
  );
  return sources.map((source) => {
    const refreshPolicy = source.refreshPolicy as {
      maxStalenessMinutes?: number;
    };
    const familyPolicy = policyByFamily.get(source.family)
      ?? parseSourceFamilyLaunchPolicy(null);
    return {
      ...source,
      activation: evaluateSourceActivation(
        source,
        source.coverages,
        environment,
      ),
      familyLaunch: {
        policy: familyPolicy,
        authorization: evaluateFamilyLaunchAuthorization(familyPolicy),
      },
      coverages: source.coverages.map((coverage) => ({
        ...coverage,
        health: deriveCoverageHealth({
          coverage,
          maxStalenessMinutes: refreshPolicy.maxStalenessMinutes ?? 1440,
        }),
      })),
    };
  });
}

export async function getIntelligenceRecordsForReview(sourceKey: string) {
  return prisma.intelligenceObservation.findMany({
    where: { source: { key: sourceKey } },
    orderBy: [{ lastVerifiedAt: 'desc' }, { revision: 'desc' }],
    take: 200,
    include: {
      sourceRun: {
        select: { id: true, status: true, environment: true, completedAt: true },
      },
      propertyMatches: {
        select: {
          propertyId: true,
          matchMethod: true,
          geographicPrecision: true,
          distanceMiles: true,
          matchConfidence: true,
        },
      },
    },
  });
}
