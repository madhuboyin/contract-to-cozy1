import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { resolvePropertyAccess } from './propertyAccess.service';

export const INSURANCE_MARKET_CONTEXT_CONTRACT_VERSION = 'insurance-market-context-v1';

export type MarketCoverageBasis = {
  label: string;
  policyForms: string[];
  dwellingTypes: string[];
  limitations: string[];
};

type MarketCandidate = {
  releaseId: string;
  releaseVersion: string;
  releaseStatus: string;
  observationStart: Date;
  observationEnd: Date;
  retrievedAt: Date;
  expiresAt: Date;
  coverageBasis: MarketCoverageBasis;
  methodologySummary: string;
  source: {
    sourceKey: string;
    name: string;
    ownerName: string;
    sourceUrl: string;
    rightsStatus: string;
    domainReviewStatus: string;
    isActive: boolean;
  };
  observation: {
    geographyType: string;
    geographyCode: string;
    metricKey: string;
    value: number;
    currency: string;
    sampleSize: number | null;
    observationNotes: string | null;
  };
};

function normalizeCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? '';
}

function basisMatches(
  basis: MarketCoverageBasis,
  policyForm: string | null,
  dwellingType: string | null
) {
  const policyForms = basis.policyForms.map(normalizeCode);
  const dwellingTypes = basis.dwellingTypes.map(normalizeCode);
  return (
    (policyForms.length === 0 || (!!policyForm && policyForms.includes(normalizeCode(policyForm)))) &&
    (dwellingTypes.length === 0 ||
      (!!dwellingType && dwellingTypes.includes(normalizeCode(dwellingType))))
  );
}

function publicObservation(candidate: MarketCandidate) {
  return {
    value: candidate.observation.value,
    currency: candidate.observation.currency,
    geography: {
      type: candidate.observation.geographyType,
      code: candidate.observation.geographyCode,
    },
    period: {
      start: candidate.observationStart.toISOString(),
      end: candidate.observationEnd.toISOString(),
    },
    coverageBasis: candidate.coverageBasis,
    sampleSize: candidate.observation.sampleSize,
    notes: candidate.observation.observationNotes,
    retrievedAt: candidate.retrievedAt.toISOString(),
    releaseVersion: candidate.releaseVersion,
    source: {
      key: candidate.source.sourceKey,
      name: candidate.source.name,
      ownerName: candidate.source.ownerName,
      url: candidate.source.sourceUrl,
    },
    methodologySummary: candidate.methodologySummary,
  };
}

export function evaluateInsuranceMarketContext(input: {
  enabled: boolean;
  jurisdictionCode: string;
  policyForm: string | null;
  dwellingType: string | null;
  candidates: MarketCandidate[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const base = {
    contractVersion: INSURANCE_MARKET_CONTEXT_CONTRACT_VERSION,
    classification: 'OBSERVED_MARKET_CONTEXT_NOT_A_QUOTE' as const,
    jurisdictionCode: normalizeCode(input.jurisdictionCode),
  };
  if (!input.enabled) {
    return {
      ...base,
      state: 'DISABLED' as const,
      message: 'Qualified insurance market context is not enabled.',
    };
  }
  const reviewed = input.candidates.filter(
    (candidate) =>
      candidate.source.isActive &&
      candidate.source.rightsStatus === 'APPROVED' &&
      candidate.source.domainReviewStatus === 'APPROVED' &&
      candidate.releaseStatus === 'APPROVED'
  );
  if (reviewed.length === 0) {
    return {
      ...base,
      state: 'SOURCE_UNAVAILABLE' as const,
      message: 'No rights-approved, domain-reviewed insurance market source is available.',
    };
  }
  const geographic = reviewed.filter(
    (candidate) =>
      candidate.observation.geographyType === 'STATE' &&
      normalizeCode(candidate.observation.geographyCode) === normalizeCode(input.jurisdictionCode)
  );
  if (geographic.length === 0) {
    return {
      ...base,
      state: 'UNSUPPORTED_GEOGRAPHY' as const,
      message: 'The approved source does not cover this property’s geography.',
    };
  }
  const comparable = geographic.filter((candidate) =>
    basisMatches(candidate.coverageBasis, input.policyForm, input.dwellingType)
  );
  if (comparable.length === 0) {
    return {
      ...base,
      state: 'UNSUPPORTED_COVERAGE_BASIS' as const,
      message: 'Available market observations are not comparable to the confirmed policy basis.',
    };
  }
  comparable.sort(
    (left, right) => right.observationEnd.getTime() - left.observationEnd.getTime()
  );
  const current = comparable[0];
  if (current.expiresAt <= now) {
    return {
      ...base,
      state: 'STALE' as const,
      message: 'The latest matching market observation is stale and is not shown as current.',
      lastRetrievedAt: current.retrievedAt.toISOString(),
      expiredAt: current.expiresAt.toISOString(),
      source: publicObservation(current).source,
    };
  }
  const previous = comparable.find(
    (candidate) =>
      candidate.source.sourceKey === current.source.sourceKey &&
      candidate.releaseId !== current.releaseId &&
      candidate.observationEnd < current.observationStart &&
      candidate.coverageBasis.label === current.coverageBasis.label
  );
  const change = previous
    ? {
        absolute: current.observation.value - previous.observation.value,
        percent:
          previous.observation.value === 0
            ? null
            : ((current.observation.value - previous.observation.value) /
                previous.observation.value) *
              100,
      }
    : null;
  return {
    ...base,
    state: 'READY' as const,
    message:
      'This is observed market context for a period and coverage basis, not a personal quote or determination of overpayment.',
    current: publicObservation(current),
    previous: previous ? publicObservation(previous) : null,
    change,
  };
}

function asNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

function parseCoverageBasis(value: unknown): MarketCoverageBasis | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const basis = value as Record<string, unknown>;
  if (
    typeof basis.label !== 'string' ||
    !Array.isArray(basis.policyForms) ||
    !Array.isArray(basis.dwellingTypes) ||
    !Array.isArray(basis.limitations)
  ) {
    return null;
  }
  return {
    label: basis.label,
    policyForms: basis.policyForms.filter((item): item is string => typeof item === 'string'),
    dwellingTypes: basis.dwellingTypes.filter(
      (item): item is string => typeof item === 'string'
    ),
    limitations: basis.limitations.filter(
      (item): item is string => typeof item === 'string'
    ),
  };
}

export async function getInsuranceMarketContext(
  propertyId: string,
  userId: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, state: true, dwellingType: true },
  });
  if (!property) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');

  const policyTerm = await prisma.insurancePolicyTerm.findFirst({
    where: { propertyId, verificationStatus: 'VERIFIED' },
    orderBy: [{ termStart: 'desc' }, { createdAt: 'desc' }],
    include: {
      facts: {
        where: { factKey: 'POLICY_FORM', confirmationStatus: 'CONFIRMED' },
        take: 1,
      },
    },
  });
  const enabled =
    env.COVERAGE_MARKET_CONTEXT_ENABLED?.trim().toLowerCase() === 'true';
  if (!enabled) {
    return evaluateInsuranceMarketContext({
      enabled: false,
      jurisdictionCode: property.state,
      policyForm: null,
      dwellingType: property.dwellingType,
      candidates: [],
    });
  }

  let releases;
  try {
    releases = await prisma.insuranceMarketBenchmarkRelease.findMany({
      where: {
        status: 'APPROVED',
        source: {
          isActive: true,
          rightsStatus: 'APPROVED',
          domainReviewStatus: 'APPROVED',
        },
        observations: {
          some: {
            geographyType: 'STATE',
            geographyCode: normalizeCode(property.state),
            metricKey: 'ANNUAL_PREMIUM',
          },
        },
      },
      orderBy: { observationEnd: 'desc' },
      take: 12,
      include: {
        source: true,
        observations: {
          where: {
            geographyType: 'STATE',
            geographyCode: normalizeCode(property.state),
            metricKey: 'ANNUAL_PREMIUM',
          },
        },
      },
    });
  } catch {
    return {
      contractVersion: INSURANCE_MARKET_CONTEXT_CONTRACT_VERSION,
      classification: 'OBSERVED_MARKET_CONTEXT_NOT_A_QUOTE' as const,
      jurisdictionCode: normalizeCode(property.state),
      state: 'SOURCE_UNAVAILABLE' as const,
      message: 'The market source is temporarily unavailable. Saved policy facts are unaffected.',
    };
  }
  const candidates: MarketCandidate[] = releases.flatMap((release) => {
    const coverageBasis = parseCoverageBasis(release.coverageBasisJson);
    if (!coverageBasis) return [];
    return release.observations.map((observation) => ({
      releaseId: release.id,
      releaseVersion: release.version,
      releaseStatus: release.status,
      observationStart: release.observationStart,
      observationEnd: release.observationEnd,
      retrievedAt: release.retrievedAt,
      expiresAt: release.expiresAt,
      coverageBasis,
      methodologySummary: release.methodologySummary,
      source: release.source,
      observation: {
        geographyType: observation.geographyType,
        geographyCode: observation.geographyCode,
        metricKey: observation.metricKey,
        value: asNumber(observation.value),
        currency: observation.currency,
        sampleSize: observation.sampleSize,
        observationNotes: observation.observationNotes,
      },
    }));
  });
  return evaluateInsuranceMarketContext({
    enabled: true,
    jurisdictionCode: property.state,
    policyForm: policyTerm?.facts[0]?.textValue ?? null,
    dwellingType: property.dwellingType,
    candidates,
  });
}

export type IngestInsuranceMarketReleaseInput = {
  source: {
    sourceKey: string;
    name: string;
    ownerName: string;
    sourceUrl: string;
    rightsSummary: string;
    rightsApproved: true;
    domainReviewApproved: true;
  };
  release: {
    version: string;
    observationStart: string;
    observationEnd: string;
    publishedAt?: string | null;
    retrievedAt: string;
    expiresAt: string;
    coverageBasis: MarketCoverageBasis;
    methodologySummary: string;
    observations: Array<{
      geographyType: 'STATE';
      geographyCode: string;
      annualPremium: number;
      currency: string;
      sampleSize?: number | null;
      observationNotes?: string | null;
    }>;
  };
};

export async function ingestInsuranceMarketBenchmarkRelease(
  userId: string,
  input: IngestInsuranceMarketReleaseInput
) {
  const observationStart = new Date(input.release.observationStart);
  const observationEnd = new Date(input.release.observationEnd);
  const retrievedAt = new Date(input.release.retrievedAt);
  const expiresAt = new Date(input.release.expiresAt);
  if (observationEnd < observationStart || expiresAt <= retrievedAt) {
    throw new APIError('Invalid benchmark period or expiry', 400, 'INVALID_BENCHMARK_DATES');
  }
  return prisma.$transaction(async (tx) => {
    const source = await tx.insuranceMarketBenchmarkSource.upsert({
      where: { sourceKey: input.source.sourceKey },
      create: {
        sourceKey: input.source.sourceKey,
        name: input.source.name,
        ownerName: input.source.ownerName,
        sourceUrl: input.source.sourceUrl,
        rightsSummary: input.source.rightsSummary,
        rightsStatus: 'APPROVED',
        domainReviewStatus: 'APPROVED',
        isActive: true,
        approvedAt: new Date(),
      },
      update: {
        name: input.source.name,
        ownerName: input.source.ownerName,
        sourceUrl: input.source.sourceUrl,
        rightsSummary: input.source.rightsSummary,
        rightsStatus: 'APPROVED',
        domainReviewStatus: 'APPROVED',
        isActive: true,
        approvedAt: new Date(),
      },
    });
    const release = await tx.insuranceMarketBenchmarkRelease.create({
      data: {
        sourceId: source.id,
        version: input.release.version,
        status: 'APPROVED',
        observationStart,
        observationEnd,
        publishedAt: input.release.publishedAt
          ? new Date(input.release.publishedAt)
          : null,
        retrievedAt,
        expiresAt,
        coverageBasisJson: input.release.coverageBasis as unknown as Prisma.InputJsonValue,
        methodologySummary: input.release.methodologySummary,
        approvedByUserId: userId,
        approvedAt: new Date(),
        observations: {
          create: input.release.observations.map((observation) => ({
            geographyType: observation.geographyType,
            geographyCode: normalizeCode(observation.geographyCode),
            metricKey: 'ANNUAL_PREMIUM',
            value: observation.annualPremium,
            currency: observation.currency.toUpperCase(),
            sampleSize: observation.sampleSize ?? null,
            observationNotes: observation.observationNotes?.trim() || null,
          })),
        },
      },
      include: { observations: true },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: 'insurance_market_benchmark_release_approved',
        entityType: 'InsuranceMarketBenchmarkRelease',
        entityId: release.id,
        newValues: {
          sourceId: source.id,
          sourceKey: source.sourceKey,
          version: release.version,
          observationCount: release.observations.length,
          rightsStatus: source.rightsStatus,
          domainReviewStatus: source.domainReviewStatus,
        },
      },
    });
    return release;
  });
}
