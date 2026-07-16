import { PropertyFactEvidence, PropertyFactSourceType, PropertyResponsibilityScope } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { getFactDefinitionsForScope } from '../catalog/factCatalog';
import { PropertyContextScope, PropertyFact } from '../domain/contracts';
import { createPropertyFact, FactEvidenceMetadata } from '../domain/facts';

export interface PropertyContextAssembler {
  readonly scope: PropertyContextScope;
  assemble(propertyId: string, now: Date): Promise<PropertyFact[]>;
}

const sourcePriority: Record<PropertyFactSourceType, number> = {
  USER_REPORTED: 5,
  INSPECTION: 4,
  DOCUMENT: 4,
  PUBLIC_RECORD: 3,
  INTEGRATION: 3,
  SYSTEM_DERIVED: 2,
};

function selectEvidence(rows: PropertyFactEvidence[]): Map<string, FactEvidenceMetadata> {
  const active = rows.filter((row) => row.supersededAt === null);
  active.sort((a, b) => {
    const verifiedDifference = Number(Boolean(b.verifiedAt)) - Number(Boolean(a.verifiedAt));
    if (verifiedDifference !== 0) return verifiedDifference;
    const sourceDifference = sourcePriority[b.sourceType] - sourcePriority[a.sourceType];
    if (sourceDifference !== 0) return sourceDifference;
    return b.observedAt.getTime() - a.observedAt.getTime();
  });

  const selected = new Map<string, FactEvidenceMetadata>();
  for (const row of active) {
    if (selected.has(row.factKey)) continue;
    selected.set(row.factKey, {
      source: row.sourceType,
      verified: row.verifiedAt !== null,
      confidence: row.confidence,
      observedAt: row.observedAt,
      validUntil: row.validUntil,
    });
  }
  return selected;
}

async function loadEvidence(propertyId: string, scope: PropertyContextScope): Promise<Map<string, FactEvidenceMetadata>> {
  const factKeys = getFactDefinitionsForScope(scope).map((definition) => definition.key);
  if (factKeys.length === 0) return new Map();
  const rows = await prisma.propertyFactEvidence.findMany({
    where: { propertyId, factKey: { in: factKeys }, supersededAt: null },
  });
  return selectEvidence(rows);
}

function withPropertyId<T>(fact: PropertyFact<T>, propertyId: string): PropertyFact<T> {
  return {
    ...fact,
    correctionPath: fact.correctionPath?.replace(':propertyId', propertyId) ?? null,
  };
}

export const coreAssembler: PropertyContextAssembler = {
  scope: 'CORE',
  async assemble(propertyId, now) {
    const [property, evidence] = await Promise.all([
      prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          dwellingType: true,
          ownershipForm: true,
          propertyUse: true,
          occupancyStatus: true,
          isPrimary: true,
          yearBuilt: true,
          propertySize: true,
          bedrooms: true,
          bathrooms: true,
          activationStatus: true,
        },
      }),
      loadEvidence(propertyId, 'CORE'),
    ]);
    if (!property) return [];
    const values: Record<string, unknown> = {
      'core.dwellingType': property.dwellingType === 'UNKNOWN' ? null : property.dwellingType,
      'core.ownershipForm': property.ownershipForm === 'UNKNOWN' ? null : property.ownershipForm,
      'core.propertyUse': property.propertyUse === 'UNKNOWN' ? null : property.propertyUse,
      'core.occupancyStatus': property.occupancyStatus === 'UNKNOWN' ? null : property.occupancyStatus,
      'core.isPrimary': property.isPrimary,
      'core.yearBuilt': property.yearBuilt,
      'core.propertySizeSqFt': property.propertySize,
      'core.bedrooms': property.bedrooms,
      'core.bathrooms': property.bathrooms,
      'core.activationStatus': property.activationStatus,
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, evidence.get(key), now), propertyId),
    );
  },
};

export const locationAssembler: PropertyContextAssembler = {
  scope: 'LOCATION',
  async assemble(propertyId, now) {
    const [property, evidence] = await Promise.all([
      prisma.property.findUnique({
        where: { id: propertyId },
        select: { city: true, state: true, zipCode: true, timezone: true, latitude: true, longitude: true },
      }),
      loadEvidence(propertyId, 'LOCATION'),
    ]);
    if (!property) return [];
    const values: Record<string, unknown> = {
      'location.city': property.city,
      'location.state': property.state,
      'location.zipCode': property.zipCode,
      'location.timezone': property.timezone,
      'location.geocoded': property.latitude !== null && property.longitude !== null,
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, evidence.get(key), now), propertyId),
    );
  },
};

export const exteriorAssembler: PropertyContextAssembler = {
  scope: 'EXTERIOR',
  async assemble(propertyId, now) {
    const [profile, evidence] = await Promise.all([
      prisma.propertyExteriorProfile.findUnique({ where: { propertyId } }),
      loadEvidence(propertyId, 'EXTERIOR'),
    ]);
    const values: Record<string, unknown> = {
      'exterior.hasPrivateOutdoorSpace': profile?.hasPrivateOutdoorSpace,
      'exterior.outdoorSpaceTypes': profile?.outdoorSpaceTypes,
      'exterior.lotSizeSqFt': profile?.lotSizeSqFt,
      'exterior.hasLawn': profile?.hasLawn,
      'exterior.hasTreesOrShrubs': profile?.hasTreesOrShrubs,
      'exterior.hasDriveway': profile?.hasDriveway,
      'exterior.hasFence': profile?.hasFence,
      'exterior.hasPoolOrSpa': profile?.hasPoolOrSpa,
      'exterior.hasIrrigation': profile?.hasIrrigation,
      'exterior.hasOutdoorFaucets': profile?.hasOutdoorFaucets,
      'exterior.hasDrainageIssues': profile?.hasDrainageIssues,
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, evidence.get(key), now), propertyId),
    );
  },
};

const responsibilityFactKeys: Record<PropertyResponsibilityScope, string> = {
  ROOF: 'responsibility.roof',
  BUILDING_EXTERIOR: 'responsibility.buildingExterior',
  LANDSCAPING: 'responsibility.landscaping',
  TREES_SHRUBS: 'responsibility.treesShrubs',
  DRIVEWAY_WALKWAYS: 'responsibility.drivewayWalkways',
  DECK_PATIO_BALCONY: 'responsibility.deckPatioBalcony',
  PLUMBING: 'responsibility.plumbing',
  HVAC: 'responsibility.hvac',
  COMMON_SAFETY: 'responsibility.commonSafety',
  SNOW_ICE: 'responsibility.snowIce',
  PEST_CONTROL: 'responsibility.pestControl',
  SHARED_SYSTEMS: 'responsibility.sharedSystems',
};

export const responsibilityAssembler: PropertyContextAssembler = {
  scope: 'RESPONSIBILITY',
  async assemble(propertyId, now) {
    const [rows, evidence] = await Promise.all([
      prisma.propertyResponsibility.findMany({ where: { propertyId } }),
      loadEvidence(propertyId, 'RESPONSIBILITY'),
    ]);
    const byScope = new Map(rows.map((row) => [row.scope, row.party]));
    return Object.entries(responsibilityFactKeys).map(([scope, key]) =>
      withPropertyId(
        createPropertyFact(key, byScope.get(scope as PropertyResponsibilityScope), evidence.get(key), now),
        propertyId,
      ),
    );
  },
};

export const INITIAL_PROPERTY_CONTEXT_ASSEMBLERS: PropertyContextAssembler[] = [
  coreAssembler,
  locationAssembler,
  exteriorAssembler,
  responsibilityAssembler,
];
