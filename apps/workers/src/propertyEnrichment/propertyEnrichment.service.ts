import {
  Prisma,
  PrismaClient,
  PropertyExternalMatchStatus,
  PropertyFactSourceType,
} from '@prisma/client';
import { emitPropertyChangeWithTransaction } from '@worker-shared/propertyChanges/propertyChange.service';
import {
  normalizeRentCastRecordAddress,
  selectExactRentCastMatch,
} from './addressMatcher';
import {
  PROPERTY_ENRICHMENT_CONTRACT_VERSION,
  RENTCAST_PROVIDER,
  RENTCAST_SOURCE_ENTITY_TYPE,
  type MappedPublicRecordFact,
  type PropertyEnrichmentJobPayload,
  type RentCastFetchOutcome,
  type RentCastPropertyRecord,
} from './contracts';
import { RentCastClient } from './rentCastClient';
import {
  fingerprintRentCastRecord,
  mapRentCastPropertyRecord,
} from './rentCastMapper';

export const MATCH_REFRESH_MS = 90 * 24 * 60 * 60 * 1_000;
export const NEGATIVE_MATCH_REFRESH_MS = 7 * 24 * 60 * 60 * 1_000;
export const FAILURE_REFRESH_MS = 24 * 60 * 60 * 1_000;
export const RENTCAST_MATCH_METHOD = 'EXACT_NORMALIZED_ADDRESS';
export const RENTCAST_GEOCODING_VERSION = 'rentcast-property-record-v1';

type ExternalStateForCache = {
  addressVersion: number;
  contractVersion: number;
  matchStatus: PropertyExternalMatchStatus;
  nextRefreshAt: Date | null;
};

export function shouldSuppressEnrichment(
  state: ExternalStateForCache | null | undefined,
  payload: Pick<PropertyEnrichmentJobPayload, 'addressVersion' | 'contractVersion'>,
  now: Date,
): boolean {
  return Boolean(
    state
      && state.addressVersion === payload.addressVersion
      && state.contractVersion === payload.contractVersion
      && state.matchStatus !== PropertyExternalMatchStatus.PENDING
      && state.matchStatus !== PropertyExternalMatchStatus.STALE
      && state.nextRefreshAt
      && state.nextRefreshAt.getTime() > now.getTime(),
  );
}

export function refreshAtForStatus(
  status: 'MATCHED' | 'NO_MATCH' | 'AMBIGUOUS' | 'FAILED' | 'NOT_CONFIGURED',
  from: Date,
): Date {
  const duration = status === PropertyExternalMatchStatus.MATCHED
    ? MATCH_REFRESH_MS
    : status === PropertyExternalMatchStatus.NO_MATCH
      || status === PropertyExternalMatchStatus.AMBIGUOUS
      ? NEGATIVE_MATCH_REFRESH_MS
      : FAILURE_REFRESH_MS;
  return new Date(from.getTime() + duration);
}

type CoordinateSource = {
  latitude: number | null;
  longitude: number | null;
  geocodingProvider: string | null;
};

export function canRentCastReplaceCoordinates(current: CoordinateSource): boolean {
  if (current.latitude === null || current.longitude === null) return true;
  const provider = current.geocodingProvider?.trim().toLowerCase() ?? '';
  return provider === 'rentcast'
    || provider === 'open-meteo'
    || provider === 'zip-centroid'
    || provider === 'zipcode';
}

type ActiveEvidence = {
  factKey: string;
  sourceType: PropertyFactSourceType;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
};

type PropertyForMerge = {
  id: string;
  address: string;
  unit: string | null;
  city: string;
  state: string;
  zipCode: string;
  addressIdentityVersion: number;
  dwellingType: string;
  yearBuilt: number | null;
  propertySize: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  heatingType: string | null;
  coolingType: string | null;
  roofType: string | null;
  foundationType: string | null;
  sidingType: string | null;
  hasFireplace: boolean | null;
  county: string | null;
  countyFips: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodingProvider: string | null;
  exteriorProfile: { lotSizeSqFt: number | null; hasPoolOrSpa: boolean | null } | null;
  propertyFactEvidence: ActiveEvidence[];
};

export type PropertyEnrichmentResult =
  | { kind: 'NOT_FOUND' }
  | { kind: 'STALE' }
  | { kind: 'CACHE_HIT'; status: PropertyExternalMatchStatus }
  | { kind: 'RETRYABLE'; code: Extract<RentCastFetchOutcome, { kind: 'RETRYABLE' }>['code'] }
  | {
      kind: 'COMPLETED';
      status: PropertyExternalMatchStatus;
      acceptedFactKeys: string[];
      changedFactKeys: string[];
      protectedFactKeys: string[];
    };

export interface EnrichmentExecutionContext {
  attemptNumber?: number;
  maxAttempts?: number;
}

type EmitPropertyChange = typeof emitPropertyChangeWithTransaction;

export interface PropertyEnrichmentServiceOptions {
  prisma: PrismaClient;
  client: Pick<RentCastClient, 'fetchPropertyRecords'>;
  now?: () => Date;
  emitPropertyChange?: EmitPropertyChange;
}

const initialPropertySelect = {
  id: true,
  address: true,
  unit: true,
  city: true,
  state: true,
  zipCode: true,
  addressIdentityVersion: true,
  externalIdentities: {
    where: { provider: RENTCAST_PROVIDER },
    take: 1,
  },
} satisfies Prisma.PropertySelect;

function currentCanonicalValue(
  property: PropertyForMerge,
  fact: MappedPublicRecordFact,
): unknown {
  switch (fact.propertyField) {
    case 'dwellingType': return property.dwellingType;
    case 'yearBuilt': return property.yearBuilt;
    case 'propertySize': return property.propertySize;
    case 'bedrooms': return property.bedrooms;
    case 'bathrooms': return property.bathrooms;
    case 'heatingType': return property.heatingType;
    case 'coolingType': return property.coolingType;
    case 'roofType': return property.roofType;
    case 'foundationType': return property.foundationType;
    case 'sidingType': return property.sidingType;
    case 'hasFireplace': return property.hasFireplace;
    case 'lotSizeSqFt': return property.exteriorProfile?.lotSizeSqFt ?? null;
    case 'hasPoolOrSpa': return property.exteriorProfile?.hasPoolOrSpa ?? null;
    case 'county': return property.county;
    case 'countyFips': return property.countyFips;
    case 'coordinates':
      return property.latitude !== null && property.longitude !== null
        ? { latitude: property.latitude, longitude: property.longitude }
        : null;
  }
}

function isUnknownCanonical(value: unknown): boolean {
  return value === null || value === undefined || value === 'UNKNOWN' || value === '';
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return Object.is(left, right);
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

const HIGHER_PRIORITY_SOURCES = new Set<PropertyFactSourceType>([
  PropertyFactSourceType.USER_REPORTED,
  PropertyFactSourceType.DOCUMENT,
  PropertyFactSourceType.INSPECTION,
]);

function isSameRentCastEvidence(evidence: ActiveEvidence, externalId: string): boolean {
  return evidence.sourceType === PropertyFactSourceType.PUBLIC_RECORD
    && evidence.sourceEntityType === RENTCAST_SOURCE_ENTITY_TYPE
    && evidence.sourceEntityId === externalId;
}

function decideFactMerge(
  property: PropertyForMerge,
  fact: MappedPublicRecordFact,
  evidence: readonly ActiveEvidence[],
  externalId: string,
): { accepted: boolean; canonicalChanged: boolean } {
  const activeForFact = evidence.filter((item) => item.factKey === fact.factKey);
  if (activeForFact.some((item) => HIGHER_PRIORITY_SOURCES.has(item.sourceType))) {
    return { accepted: false, canonicalChanged: false };
  }

  const currentValue = currentCanonicalValue(property, fact);
  if (isUnknownCanonical(currentValue)) {
    return { accepted: true, canonicalChanged: !valuesEqual(currentValue, fact.value) };
  }
  if (activeForFact.some((item) => isSameRentCastEvidence(item, externalId))) {
    return { accepted: true, canonicalChanged: !valuesEqual(currentValue, fact.value) };
  }
  if (
    fact.propertyField === 'coordinates'
    && canRentCastReplaceCoordinates(property)
  ) {
    // A source upgrade from ZIP-centroid coordinates is material even if the
    // numeric pair happens to be identical.
    return {
      accepted: true,
      canonicalChanged:
        !valuesEqual(currentValue, fact.value)
        || property.geocodingProvider?.trim().toLowerCase() !== 'rentcast',
    };
  }
  return { accepted: false, canonicalChanged: false };
}

function propertyPatchForFacts(
  facts: readonly MappedPublicRecordFact[],
  property: PropertyForMerge,
  observedAt: Date,
): Prisma.PropertyUpdateInput {
  const patch: Prisma.PropertyUpdateInput = {};
  for (const fact of facts) {
    switch (fact.propertyField) {
      case 'dwellingType': patch.dwellingType = fact.value; break;
      case 'yearBuilt': patch.yearBuilt = fact.value; break;
      case 'propertySize': patch.propertySize = fact.value; break;
      case 'bedrooms': patch.bedrooms = fact.value; break;
      case 'bathrooms': patch.bathrooms = fact.value; break;
      case 'heatingType': patch.heatingType = fact.value; break;
      case 'coolingType': patch.coolingType = fact.value; break;
      case 'roofType': patch.roofType = fact.value; break;
      case 'foundationType': patch.foundationType = fact.value; break;
      case 'sidingType': patch.sidingType = fact.value; break;
      case 'hasFireplace': patch.hasFireplace = fact.value; break;
      case 'county': patch.county = fact.value; break;
      case 'countyFips': patch.countyFips = fact.value; break;
      case 'coordinates':
        patch.latitude = fact.value.latitude;
        patch.longitude = fact.value.longitude;
        patch.geocodedZipCode = property.zipCode;
        patch.normalizedZipCode = property.zipCode;
        patch.geocodingStatus = 'VERIFIED';
        patch.geocodingProvider = 'rentcast';
        patch.geocodingVersion = RENTCAST_GEOCODING_VERSION;
        patch.geocodedAt = observedAt;
        patch.geographyVersion = { increment: 1 };
        break;
      case 'lotSizeSqFt':
      case 'hasPoolOrSpa':
        break;
    }
  }
  return patch;
}

function hasKeys(value: object): boolean {
  return Object.keys(value).length > 0;
}

async function lockAddressIdentityVersion(
  tx: Prisma.TransactionClient,
  propertyId: string,
): Promise<number | null> {
  const rows = await tx.$queryRaw<Array<{ addressIdentityVersion: number }>>`
    SELECT "addressIdentityVersion"
    FROM "properties"
    WHERE "id" = ${propertyId}
    FOR UPDATE
  `;
  return rows[0]?.addressIdentityVersion ?? null;
}

async function cachedStateAfterLock(
  tx: Prisma.TransactionClient,
  payload: PropertyEnrichmentJobPayload,
  now: Date,
): Promise<ExternalStateForCache | null> {
  const state = await tx.propertyExternalIdentity.findUnique({
    where: {
      propertyId_provider: {
        propertyId: payload.propertyId,
        provider: RENTCAST_PROVIDER,
      },
    },
    select: {
      addressVersion: true,
      contractVersion: true,
      matchStatus: true,
      nextRefreshAt: true,
    },
  });
  return shouldSuppressEnrichment(state, payload, now) ? state : null;
}

export class PropertyEnrichmentService {
  private readonly db: PrismaClient;
  private readonly client: Pick<RentCastClient, 'fetchPropertyRecords'>;
  private readonly now: () => Date;
  private readonly emitChange: EmitPropertyChange;

  constructor(options: PropertyEnrichmentServiceOptions) {
    this.db = options.prisma;
    this.client = options.client;
    this.now = options.now ?? (() => new Date());
    this.emitChange = options.emitPropertyChange ?? emitPropertyChangeWithTransaction;
  }

  async enrich(
    payload: PropertyEnrichmentJobPayload,
    execution: EnrichmentExecutionContext = {},
  ): Promise<PropertyEnrichmentResult> {
    const loaded = await this.db.property.findUnique({
      where: { id: payload.propertyId },
      select: initialPropertySelect,
    });
    if (!loaded) return { kind: 'NOT_FOUND' };
    if (loaded.addressIdentityVersion !== payload.addressVersion) return { kind: 'STALE' };

    const cached = loaded.externalIdentities[0];
    if (shouldSuppressEnrichment(cached, payload, this.now())) {
      return { kind: 'CACHE_HIT', status: cached.matchStatus };
    }

    const fetched = await this.client.fetchPropertyRecords({
      address: loaded.address,
      unit: loaded.unit,
      city: loaded.city,
      state: loaded.state,
      zipCode: loaded.zipCode,
    });

    if (fetched.kind === 'RETRYABLE') {
      const attemptNumber = execution.attemptNumber ?? 1;
      const maxAttempts = execution.maxAttempts ?? 3;
      if (attemptNumber < maxAttempts) {
        const persisted = await this.persistOperationalOutcome(
          payload,
          PropertyExternalMatchStatus.PENDING,
          this.now(),
          fetched.code,
          null,
        );
        return persisted.kind === 'STALE' ? persisted : { kind: 'RETRYABLE', code: fetched.code };
      }
      return this.persistOperationalOutcome(
        payload,
        PropertyExternalMatchStatus.FAILED,
        this.now(),
        fetched.code,
        refreshAtForStatus(PropertyExternalMatchStatus.FAILED, this.now()),
      );
    }

    if (fetched.kind === 'NOT_CONFIGURED') {
      const now = this.now();
      return this.persistOperationalOutcome(
        payload,
        PropertyExternalMatchStatus.NOT_CONFIGURED,
        now,
        'NOT_CONFIGURED',
        refreshAtForStatus(PropertyExternalMatchStatus.NOT_CONFIGURED, now),
      );
    }

    if (fetched.kind === 'TERMINAL') {
      const now = this.now();
      return this.persistOperationalOutcome(
        payload,
        PropertyExternalMatchStatus.FAILED,
        now,
        fetched.code,
        refreshAtForStatus(PropertyExternalMatchStatus.FAILED, now),
      );
    }

    if (fetched.kind === 'NO_RESULT') {
      return this.persistNegativeMatch(
        payload,
        PropertyExternalMatchStatus.NO_MATCH,
        fetched.requestCompletedAt,
        'NO_PROVIDER_RESULTS',
      );
    }

    const match = selectExactRentCastMatch({
      address: loaded.address,
      unit: loaded.unit,
      city: loaded.city,
      state: loaded.state,
      zipCode: loaded.zipCode,
    }, fetched.records);
    if (match.kind === 'NO_MATCH') {
      return this.persistNegativeMatch(
        payload,
        PropertyExternalMatchStatus.NO_MATCH,
        fetched.requestCompletedAt,
        'ADDRESS_COMPONENT_MISMATCH',
      );
    }
    if (match.kind === 'AMBIGUOUS') {
      return this.persistNegativeMatch(
        payload,
        PropertyExternalMatchStatus.AMBIGUOUS,
        fetched.requestCompletedAt,
        'MULTIPLE_EXACT_MATCHES',
      );
    }
    return this.persistMatched(payload, match.record, fetched.requestCompletedAt);
  }

  private async persistOperationalOutcome(
    payload: PropertyEnrichmentJobPayload,
    status: 'PENDING' | 'FAILED' | 'NOT_CONFIGURED',
    attemptedAt: Date,
    failureCode: string,
    nextRefreshAt: Date | null,
  ): Promise<PropertyEnrichmentResult> {
    return this.db.$transaction(async (tx) => {
      const currentAddressVersion = await lockAddressIdentityVersion(tx, payload.propertyId);
      if (currentAddressVersion === null) return { kind: 'NOT_FOUND' } as const;
      if (currentAddressVersion !== payload.addressVersion) return { kind: 'STALE' } as const;
      const cached = await cachedStateAfterLock(tx, payload, attemptedAt);
      if (cached) return { kind: 'CACHE_HIT', status: cached.matchStatus } as const;
      await tx.propertyExternalIdentity.upsert({
        where: { propertyId_provider: { propertyId: payload.propertyId, provider: RENTCAST_PROVIDER } },
        create: {
          propertyId: payload.propertyId,
          provider: RENTCAST_PROVIDER,
          matchStatus: status,
          addressVersion: payload.addressVersion,
          contractVersion: payload.contractVersion,
          lastAttemptedAt: attemptedAt,
          nextRefreshAt,
          failureCode,
        },
        update: {
          matchStatus: status,
          addressVersion: payload.addressVersion,
          contractVersion: payload.contractVersion,
          lastAttemptedAt: attemptedAt,
          nextRefreshAt,
          failureCode,
        },
      });
      return {
        kind: 'COMPLETED',
        status,
        acceptedFactKeys: [],
        changedFactKeys: [],
        protectedFactKeys: [],
      } as const;
    });
  }

  private async persistNegativeMatch(
    payload: PropertyEnrichmentJobPayload,
    status: 'NO_MATCH' | 'AMBIGUOUS',
    completedAt: Date,
    failureCode: 'NO_PROVIDER_RESULTS' | 'ADDRESS_COMPONENT_MISMATCH' | 'MULTIPLE_EXACT_MATCHES',
  ): Promise<PropertyEnrichmentResult> {
    const nextRefreshAt = refreshAtForStatus(status, completedAt);
    return this.db.$transaction(async (tx) => {
      const currentAddressVersion = await lockAddressIdentityVersion(tx, payload.propertyId);
      if (currentAddressVersion === null) return { kind: 'NOT_FOUND' } as const;
      if (currentAddressVersion !== payload.addressVersion) return { kind: 'STALE' } as const;
      const cached = await cachedStateAfterLock(tx, payload, completedAt);
      if (cached) return { kind: 'CACHE_HIT', status: cached.matchStatus } as const;
      await tx.propertyExternalIdentity.upsert({
        where: { propertyId_provider: { propertyId: payload.propertyId, provider: RENTCAST_PROVIDER } },
        create: {
          propertyId: payload.propertyId,
          provider: RENTCAST_PROVIDER,
          matchStatus: status,
          addressVersion: payload.addressVersion,
          contractVersion: payload.contractVersion,
          acceptedFactKeys: [],
          lastAttemptedAt: completedAt,
          lastSucceededAt: completedAt,
          nextRefreshAt,
          failureCode,
        },
        update: {
          externalId: null,
          assessorId: null,
          matchStatus: status,
          matchMethod: null,
          matchedAddress: null,
          matchedUnit: null,
          matchedCity: null,
          matchedState: null,
          matchedZipCode: null,
          addressVersion: payload.addressVersion,
          contractVersion: payload.contractVersion,
          responseFingerprint: null,
          acceptedFactKeys: [],
          lastAttemptedAt: completedAt,
          lastSucceededAt: completedAt,
          nextRefreshAt,
          failureCode,
        },
      });
      return {
        kind: 'COMPLETED',
        status,
        acceptedFactKeys: [],
        changedFactKeys: [],
        protectedFactKeys: [],
      } as const;
    });
  }

  private async persistMatched(
    payload: PropertyEnrichmentJobPayload,
    record: RentCastPropertyRecord,
    completedAt: Date,
  ): Promise<PropertyEnrichmentResult> {
    const mappedFacts = mapRentCastPropertyRecord(record);
    const factKeys = mappedFacts.map((fact) => fact.factKey);
    const nextRefreshAt = refreshAtForStatus(PropertyExternalMatchStatus.MATCHED, completedAt);
    const fingerprint = fingerprintRentCastRecord(record, mappedFacts);
    const normalizedAddress = normalizeRentCastRecordAddress(record);

    return this.db.$transaction(async (tx) => {
      const currentAddressVersion = await lockAddressIdentityVersion(tx, payload.propertyId);
      if (currentAddressVersion === null) return { kind: 'NOT_FOUND' } as const;
      if (currentAddressVersion !== payload.addressVersion) return { kind: 'STALE' } as const;
      const cached = await cachedStateAfterLock(tx, payload, completedAt);
      if (cached) return { kind: 'CACHE_HIT', status: cached.matchStatus } as const;
      const property = await tx.property.findUnique({
        where: { id: payload.propertyId },
        select: {
          id: true,
          address: true,
          unit: true,
          city: true,
          state: true,
          zipCode: true,
          addressIdentityVersion: true,
          dwellingType: true,
          yearBuilt: true,
          propertySize: true,
          bedrooms: true,
          bathrooms: true,
          heatingType: true,
          coolingType: true,
          roofType: true,
          foundationType: true,
          sidingType: true,
          hasFireplace: true,
          county: true,
          countyFips: true,
          latitude: true,
          longitude: true,
          geocodingProvider: true,
          exteriorProfile: { select: { lotSizeSqFt: true, hasPoolOrSpa: true } },
          propertyFactEvidence: {
            where: { factKey: { in: factKeys }, supersededAt: null },
            select: {
              factKey: true,
              sourceType: true,
              sourceEntityType: true,
              sourceEntityId: true,
            },
          },
        },
      }) as PropertyForMerge | null;
      if (!property) return { kind: 'NOT_FOUND' } as const;

      const accepted: MappedPublicRecordFact[] = [];
      const changed: MappedPublicRecordFact[] = [];
      const protectedFactKeys: string[] = [];
      for (const fact of mappedFacts) {
        const decision = decideFactMerge(
          property,
          fact,
          property.propertyFactEvidence,
          record.id,
        );
        if (!decision.accepted) {
          protectedFactKeys.push(fact.factKey);
          continue;
        }
        accepted.push(fact);
        if (decision.canonicalChanged) changed.push(fact);
      }

      const propertyPatch = propertyPatchForFacts(changed, property, completedAt);
      if (hasKeys(propertyPatch)) {
        await tx.property.update({ where: { id: payload.propertyId }, data: propertyPatch });
      }
      const changedLotSize = changed.find((fact) => fact.propertyField === 'lotSizeSqFt');
      const changedPool = changed.find((fact) => fact.propertyField === 'hasPoolOrSpa');
      if (changedLotSize || changedPool) {
        const exteriorPatch = {
          ...(changedLotSize ? { lotSizeSqFt: changedLotSize.value as number } : {}),
          ...(changedPool ? { hasPoolOrSpa: changedPool.value as boolean } : {}),
        };
        await tx.propertyExteriorProfile.upsert({
          where: { propertyId: payload.propertyId },
          create: { propertyId: payload.propertyId, ...exteriorPatch },
          update: exteriorPatch,
        });
      }
      if (changed.some((fact) => fact.propertyField === 'coordinates')) {
        await tx.propertyRadarCoverage.deleteMany({ where: { propertyId: payload.propertyId } });
        const coordinates = changed.find((fact) => fact.propertyField === 'coordinates');
        if (coordinates?.propertyField === 'coordinates') {
          await tx.$executeRaw`
            UPDATE "properties"
            SET "locationPoint" = ST_SetSRID(ST_MakePoint(${coordinates.value.longitude}, ${coordinates.value.latitude}), 4326)::geography
            WHERE "id" = ${payload.propertyId}
          `;
        }
      }

      for (const fact of accepted) {
        await tx.propertyFactEvidence.updateMany({
          where: {
            propertyId: payload.propertyId,
            factKey: fact.factKey,
            sourceType: PropertyFactSourceType.PUBLIC_RECORD,
            sourceEntityType: RENTCAST_SOURCE_ENTITY_TYPE,
            supersededAt: null,
          },
          data: { supersededAt: completedAt },
        });
        await tx.propertyFactEvidence.create({
          data: {
            propertyId: payload.propertyId,
            factKey: fact.factKey,
            sourceType: PropertyFactSourceType.PUBLIC_RECORD,
            observationState: 'KNOWN',
            sourceEntityType: RENTCAST_SOURCE_ENTITY_TYPE,
            sourceEntityId: record.id,
            confidence: null,
            observedAt: completedAt,
            validUntil: nextRefreshAt,
            verifiedAt: null,
          },
        });
      }

      const acceptedFactKeys = accepted.map((fact) => fact.factKey);
      await tx.propertyExternalIdentity.upsert({
        where: { propertyId_provider: { propertyId: payload.propertyId, provider: RENTCAST_PROVIDER } },
        create: {
          propertyId: payload.propertyId,
          provider: RENTCAST_PROVIDER,
          externalId: record.id,
          assessorId: record.assessorID?.trim() || null,
          matchStatus: PropertyExternalMatchStatus.MATCHED,
          matchMethod: RENTCAST_MATCH_METHOD,
          matchedAddress: normalizedAddress.street,
          matchedUnit: normalizedAddress.unit,
          matchedCity: normalizedAddress.city,
          matchedState: normalizedAddress.state,
          matchedZipCode: normalizedAddress.zipCode,
          addressVersion: payload.addressVersion,
          contractVersion: payload.contractVersion,
          responseFingerprint: fingerprint,
          acceptedFactKeys,
          lastAttemptedAt: completedAt,
          lastSucceededAt: completedAt,
          nextRefreshAt,
        },
        update: {
          externalId: record.id,
          assessorId: record.assessorID?.trim() || null,
          matchStatus: PropertyExternalMatchStatus.MATCHED,
          matchMethod: RENTCAST_MATCH_METHOD,
          matchedAddress: normalizedAddress.street,
          matchedUnit: normalizedAddress.unit,
          matchedCity: normalizedAddress.city,
          matchedState: normalizedAddress.state,
          matchedZipCode: normalizedAddress.zipCode,
          addressVersion: payload.addressVersion,
          contractVersion: payload.contractVersion,
          responseFingerprint: fingerprint,
          acceptedFactKeys,
          lastAttemptedAt: completedAt,
          lastSucceededAt: completedAt,
          nextRefreshAt,
          failureCode: null,
        },
      });

      const changedFactKeys = changed.map((fact) => fact.factKey);
      if (changedFactKeys.length > 0) {
        await this.emitChange(tx, {
          propertyId: payload.propertyId,
          sourceType: 'PROPERTY_ENRICHMENT',
          sourceEntityId: record.id,
          sourceRevision: fingerprint,
          changeType: 'PROPERTY_FACT_CHANGED',
          changedFactKeys,
          canonicalReferences: changedFactKeys.map((factKey) => ({
            entityType: 'PROPERTY',
            entityId: payload.propertyId,
            fieldPath: factKey,
          })),
          occurredAt: completedAt,
          detectedAt: completedAt,
          confidence: null,
          sourceHealth: 'CURRENT',
          signals: {
            homeownerRelevant: true,
            lifecycleAdvanced: false,
            propertyEffectConfirmed: true,
            urgentSafetyCondition: false,
            canonicalActionPriority: null,
          },
        });
      }

      return {
        kind: 'COMPLETED',
        status: PropertyExternalMatchStatus.MATCHED,
        acceptedFactKeys,
        changedFactKeys,
        protectedFactKeys,
      } as const;
    });
  }
}

export function createPropertyEnrichmentService(
  db: PrismaClient,
  client = new RentCastClient(),
): PropertyEnrichmentService {
  return new PropertyEnrichmentService({ prisma: db, client });
}

export const PROPERTY_ENRICHMENT_VERSION = PROPERTY_ENRICHMENT_CONTRACT_VERSION;
