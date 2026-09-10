import { PropertyExternalMatchStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const RENTCAST_SUPPORTED_FACT_KEYS = [
  'core.dwellingType',
  'core.yearBuilt',
  'core.propertySizeSqFt',
  'core.bedrooms',
  'core.bathrooms',
  'exterior.lotSizeSqFt',
  'location.county',
  'location.countyFips',
  'location.geocoded',
] as const;

export interface PropertyEnrichmentStatusDto {
  provider: 'RENTCAST';
  status: PropertyExternalMatchStatus | null;
  lastAttemptedAt: string | null;
  lastSuccessfulAt: string | null;
  nextRefreshAt: string | null;
  acceptedFactKeys: string[];
  reason: PropertyEnrichmentStatusReason;
}

export type PropertyEnrichmentStatusReason =
  | 'NO_PROVIDER_RESULTS'
  | 'ADDRESS_COMPONENT_MISMATCH'
  | 'MULTIPLE_EXACT_MATCHES'
  | null;

const SAFE_STATUS_REASONS = new Set<Exclude<PropertyEnrichmentStatusReason, null>>([
  'NO_PROVIDER_RESULTS',
  'ADDRESS_COMPONENT_MISMATCH',
  'MULTIPLE_EXACT_MATCHES',
]);

function safeStatusReason(value: string | null): PropertyEnrichmentStatusReason {
  return value && SAFE_STATUS_REASONS.has(value as Exclude<PropertyEnrichmentStatusReason, null>)
    ? value as Exclude<PropertyEnrichmentStatusReason, null>
    : null;
}

interface PropertyEnrichmentStatusDependencies {
  findIdentity: typeof prisma.propertyExternalIdentity.findUnique;
  findEvidence: typeof prisma.propertyFactEvidence.findMany;
}

const defaultDependencies: PropertyEnrichmentStatusDependencies = {
  findIdentity: prisma.propertyExternalIdentity.findUnique.bind(prisma.propertyExternalIdentity),
  findEvidence: prisma.propertyFactEvidence.findMany.bind(prisma.propertyFactEvidence),
};

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export async function getPropertyEnrichmentStatus(
  propertyId: string,
  dependencies: PropertyEnrichmentStatusDependencies = defaultDependencies,
): Promise<PropertyEnrichmentStatusDto> {
  const identity = await dependencies.findIdentity({
    where: { propertyId_provider: { propertyId, provider: 'RENTCAST' } },
    select: {
      externalId: true,
      matchStatus: true,
      acceptedFactKeys: true,
      lastAttemptedAt: true,
      lastSucceededAt: true,
      nextRefreshAt: true,
      failureCode: true,
    },
  });

  if (!identity) {
    return {
      provider: 'RENTCAST',
      status: null,
      lastAttemptedAt: null,
      lastSuccessfulAt: null,
      nextRefreshAt: null,
      acceptedFactKeys: [],
      reason: null,
    };
  }

  const eligibleFactKeys = RENTCAST_SUPPORTED_FACT_KEYS.filter((factKey) =>
    identity.acceptedFactKeys.includes(factKey));
  const activeEvidence = identity.externalId && eligibleFactKeys.length > 0
    ? await dependencies.findEvidence({
        where: {
          propertyId,
          factKey: { in: [...eligibleFactKeys] },
          sourceType: 'PUBLIC_RECORD',
          sourceEntityType: 'RENTCAST_PROPERTY_RECORD',
          sourceEntityId: identity.externalId,
          supersededAt: null,
        },
        select: { factKey: true },
      })
    : [];
  const activeFactKeys = new Set(activeEvidence.map((evidence) => evidence.factKey));

  return {
    provider: 'RENTCAST',
    status: identity.matchStatus,
    lastAttemptedAt: iso(identity.lastAttemptedAt),
    lastSuccessfulAt: iso(identity.lastSucceededAt),
    nextRefreshAt: iso(identity.nextRefreshAt),
    acceptedFactKeys: eligibleFactKeys.filter((factKey) => activeFactKeys.has(factKey)),
    reason: safeStatusReason(identity.failureCode),
  };
}
