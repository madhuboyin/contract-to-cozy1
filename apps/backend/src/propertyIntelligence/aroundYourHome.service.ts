import {
  IntelligenceObservationLifecycleStatus,
  IntelligenceSourceFamily,
  PropertyLocalObservationDisposition,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  getIntelligenceSourceHealth,
  getPropertyIntelligenceCoverage,
  getPropertyIntelligenceObservations,
} from './propertyIntelligence.service';
import { derivePropertyIntelligenceSafetyTier } from '../productFramework/propertyIntelligenceOwnership.contract';

export const AROUND_YOUR_HOME_SOURCE_FAMILIES = [
  IntelligenceSourceFamily.PLANNING,
  IntelligenceSourceFamily.INFRASTRUCTURE,
  IntelligenceSourceFamily.LAND_USE,
  IntelligenceSourceFamily.FLOOD_MAP,
  IntelligenceSourceFamily.SCHOOL,
] as const;

const allowedFamilies = new Set<IntelligenceSourceFamily>(
  AROUND_YOUR_HOME_SOURCE_FAMILIES,
);

const safeTextFields = [
  'title',
  'summary',
  'description',
  'officialStatus',
  'projectType',
] as const;

function sourceFacts(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return Object.fromEntries(
    safeTextFields.flatMap((key) => {
      const value = (payload as Record<string, unknown>)[key];
      return typeof value === 'string' && value.trim()
        ? [[key, value.trim().slice(0, key === 'description' ? 2000 : 500)]]
        : [];
    }),
  );
}

function coverageState(states: string[]): 'CURRENT' | 'DEGRADED' | 'STALE' | 'UNAVAILABLE' | 'NOT_CONFIGURED' {
  if (states.length === 0) return 'NOT_CONFIGURED';
  if (states.every((state) => state === 'CURRENT')) return 'CURRENT';
  if (states.includes('UNAVAILABLE')) return 'UNAVAILABLE';
  if (states.includes('STALE')) return 'STALE';
  return 'DEGRADED';
}

function hierarchyRank(input: {
  disposition: PropertyLocalObservationDisposition;
  hasMaterialUpdate: boolean;
  seenAt: Date | null;
  lifecycleStatus: IntelligenceObservationLifecycleStatus;
}): number {
  if (input.disposition === PropertyLocalObservationDisposition.FOLLOWING) {
    return input.hasMaterialUpdate ? 0 : 1;
  }
  if (
    input.disposition === PropertyLocalObservationDisposition.DISMISSED
    || input.disposition === PropertyLocalObservationDisposition.NOT_RELEVANT
  ) return 5;
  if (!input.seenAt) return 2;
  if (
    input.lifecycleStatus === IntelligenceObservationLifecycleStatus.PROPOSED
    || input.lifecycleStatus === IntelligenceObservationLifecycleStatus.APPROVED
    || input.lifecycleStatus === IntelligenceObservationLifecycleStatus.ACTIVE
  ) return 3;
  return input.lifecycleStatus === IntelligenceObservationLifecycleStatus.COMPLETED ? 4 : 5;
}

export async function getAroundYourHome(
  propertyId: string,
  userId: string,
  environment: string,
) {
  const [property, allCoverage, allMatches] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        zipCode: true,
        latitude: true,
        longitude: true,
      },
    }),
    getPropertyIntelligenceCoverage(propertyId, environment),
    getPropertyIntelligenceObservations(propertyId, environment),
  ]);
  if (!property) throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');

  const coverage = allCoverage.filter((entry) =>
    allowedFamilies.has(entry.source.family));
  const visibleSourceKeys = new Set(
    coverage
      .filter((entry) =>
        entry.geography != null
        && entry.state !== 'UNAVAILABLE'
        && entry.state !== 'NOT_CONFIGURED')
      .map((entry) => entry.source.key),
  );
  const matches = allMatches.filter((match) =>
    allowedFamilies.has(match.observation.source.family)
    && visibleSourceKeys.has(match.observation.source.key));
  const states = matches.length
    ? await prisma.propertyLocalObservationState.findMany({
        where: {
          propertyId,
          userId,
          propertyMatchId: { in: matches.map((match) => match.id) },
        },
      })
    : [];
  const stateByMatch = new Map(states.map((state) => [state.propertyMatchId, state]));

  const items = matches.map((match) => {
    const state = stateByMatch.get(match.id);
    const disposition = state?.disposition ?? PropertyLocalObservationDisposition.DEFAULT;
    const hasMaterialUpdate =
      state?.lastSeenRevision != null
      && match.observation.revision > state.lastSeenRevision;
    const facts = sourceFacts(match.observation.factualPayload);
    const assessment = match.assessments[0] ?? null;
    const hasExactPoint =
      match.observation.latitude != null
      && match.observation.longitude != null;
    return {
      propertyMatchId: match.id,
      observation: {
        externalId: match.observation.externalId,
        observationType: match.observation.observationType,
        lifecycleStatus: match.observation.lifecycleStatus,
        observedAt: match.observation.observedAt,
        effectiveFrom: match.observation.effectiveFrom,
        effectiveTo: match.observation.effectiveTo,
        revision: match.observation.revision,
        facts,
      },
      geography: {
        type: match.observation.geographyType,
        key: match.observation.geographyKey,
        precision: match.geographicPrecision,
        matchedGeography: match.matchedGeography,
        point: hasExactPoint
          ? {
              latitude: match.observation.latitude,
              longitude: match.observation.longitude,
            }
          : null,
        distanceMiles: hasExactPoint ? match.distanceMiles : null,
      },
      source: {
        key: match.observation.source.key,
        family: match.observation.source.family,
        provider: match.observation.source.provider,
        url: match.observation.sourceUrl,
        publishedAt: match.observation.sourcePublishedAt,
        lastCheckedAt: match.observation.lastVerifiedAt,
        termsVersion: match.observation.source.termsVersion,
      },
      possibleRelevance: assessment
        ? {
            safetyTier: derivePropertyIntelligenceSafetyTier({
              insuranceOrValueImplication: match.observation.source.family === IntelligenceSourceFamily.FLOOD_MAP,
            }),
            relevance: assessment.relevance,
            materiality: assessment.materiality,
            confidence: assessment.confidence,
            explanation: assessment.boundedExplanation,
            missingFacts: assessment.missingFacts,
            boundary: 'Possible relevance only. This does not predict property value, demand, insurance cost, or household impact.',
          }
        : {
            safetyTier: derivePropertyIntelligenceSafetyTier({
              insuranceOrValueImplication: match.observation.source.family === IntelligenceSourceFamily.FLOOD_MAP,
            }),
            relevance: 'UNKNOWN',
            materiality: 'INFORMATIONAL',
            confidence: 0,
            explanation: 'This source record matched the property geography. Its property-level effect cannot be determined.',
            missingFacts: ['Property-level effect evidence'],
            boundary: 'Possible relevance only. This does not predict property value, demand, insurance cost, or household impact.',
          },
      interaction: {
        disposition,
        seenAt: state?.seenAt ?? null,
        lastSeenRevision: state?.lastSeenRevision ?? null,
        hasMaterialUpdate,
      },
      hierarchyRank: hierarchyRank({
        disposition,
        hasMaterialUpdate,
        seenAt: state?.seenAt ?? null,
        lifecycleStatus: match.observation.lifecycleStatus,
      }),
    };
  }).sort((left, right) =>
    left.hierarchyRank - right.hierarchyRank
    || new Date(right.source.lastCheckedAt).getTime() - new Date(left.source.lastCheckedAt).getTime());

  return {
    property,
    coverage: {
      state: coverageState(coverage.map((entry) => entry.state)),
      comprehensive: false,
      sources: coverage,
      limitations: coverage.length === 0
        ? ['No reviewed local-change source coverage is configured for this property.']
        : ['Coverage is limited to the listed reviewed sources, record types, and geographies.'],
    },
    items,
    map: {
      points: items.filter((item) => item.geography.point != null),
      unplottedCount: items.filter((item) => item.geography.point == null).length,
      precisionNote: 'Only source-provided coordinates are plotted. Area-level records remain labeled by their actual geography.',
    },
    interpretationBoundary:
      'Around Your Home reports reviewed source facts and bounded geographic relevance. It cannot determine a change’s effect on property value, demand, insurance, or your household.',
  };
}

export async function setAroundYourHomeInteraction(input: {
  propertyId: string;
  propertyMatchId: string;
  userId: string;
  action: 'FOLLOW' | 'DISMISS' | 'NOT_RELEVANT' | 'MARK_SEEN';
  reason?: string;
}) {
  const match = await prisma.propertyObservationMatch.findFirst({
    where: {
      id: input.propertyMatchId,
      propertyId: input.propertyId,
      observation: {
        source: { family: { in: [...AROUND_YOUR_HOME_SOURCE_FAMILIES] } },
      },
    },
    select: { id: true, observation: { select: { revision: true } } },
  });
  if (!match) {
    throw new APIError(
      'Local-change observation was not found for this property.',
      404,
      'LOCAL_OBSERVATION_NOT_FOUND',
    );
  }
  const now = new Date();
  const disposition =
    input.action === 'FOLLOW'
      ? PropertyLocalObservationDisposition.FOLLOWING
      : input.action === 'DISMISS'
        ? PropertyLocalObservationDisposition.DISMISSED
        : input.action === 'NOT_RELEVANT'
          ? PropertyLocalObservationDisposition.NOT_RELEVANT
          : undefined;
  return prisma.propertyLocalObservationState.upsert({
    where: {
      propertyMatchId_userId: {
        propertyMatchId: input.propertyMatchId,
        userId: input.userId,
      },
    },
    create: {
      propertyId: input.propertyId,
      propertyMatchId: input.propertyMatchId,
      userId: input.userId,
      disposition: disposition ?? PropertyLocalObservationDisposition.DEFAULT,
      reason: input.reason,
      lastSeenRevision: match.observation.revision,
      seenAt: now,
      followedAt: input.action === 'FOLLOW' ? now : null,
      dismissedAt: input.action === 'DISMISS' ? now : null,
      notRelevantAt: input.action === 'NOT_RELEVANT' ? now : null,
    },
    update: {
      ...(disposition ? { disposition } : {}),
      reason: input.reason,
      lastSeenRevision: match.observation.revision,
      seenAt: now,
      ...(input.action !== 'MARK_SEEN'
        ? {
            followedAt: input.action === 'FOLLOW' ? now : null,
            dismissedAt: input.action === 'DISMISS' ? now : null,
            notRelevantAt: input.action === 'NOT_RELEVANT' ? now : null,
          }
        : {}),
    },
  });
}

export async function getAroundYourHomeSourceQuality(environment: string) {
  const sources = await getIntelligenceSourceHealth(environment);
  return {
    pilotFamilies: AROUND_YOUR_HOME_SOURCE_FAMILIES,
    sources: sources.filter((source) => allowedFamilies.has(source.family)),
    activationRule:
      'A source is homeowner-visible only after source approval, explicit environment enablement, coverage QA review, and a current successful ingestion check.',
    syntheticCoverageAllowed: false,
  };
}
