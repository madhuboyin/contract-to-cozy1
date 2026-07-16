import { PropertyFactEvidence, PropertyFactSourceType, PropertyResponsibilityScope } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { getFactDefinitionsForScope } from '../catalog/factCatalog';
import { PropertyContextActor, PropertyContextScope, PropertyFact } from '../domain/contracts';
import { createPropertyFact, FactEvidenceMetadata } from '../domain/facts';

export interface PropertyContextAssembler {
  readonly scope: PropertyContextScope;
  assemble(propertyId: string, now: Date, actor?: PropertyContextActor): Promise<PropertyFact[]>;
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
        select: {
          city: true,
          state: true,
          zipCode: true,
          timezone: true,
          latitude: true,
          longitude: true,
          climateSetting: { select: { climateRegion: true } },
        },
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
      'location.climateRegion': property.climateSetting?.climateRegion,
      // No canonical coastal-exposure source exists yet. Do not infer it from
      // state or ZIP; consumers must see UNKNOWN until a verified source lands.
      'location.isCoastal': null,
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, evidence.get(key), now), propertyId),
    );
  },
};

export const structureAssembler: PropertyContextAssembler = {
  scope: 'STRUCTURE',
  async assemble(propertyId, now) {
    const [property, evidence] = await Promise.all([
      prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          roofType: true,
          roofReplacementYear: true,
          foundationType: true,
          sidingType: true,
          electricalPanelAge: true,
        },
      }),
      loadEvidence(propertyId, 'STRUCTURE'),
    ]);
    if (!property) return [];
    const roofReplacementYear = property.roofReplacementYear;
    const values: Record<string, unknown> = {
      'structure.roofType': property.roofType === 'UNKNOWN' ? null : property.roofType,
      'structure.roofReplacementYear': roofReplacementYear,
      'structure.roofAgeYears': roofReplacementYear === null ? null : Math.max(0, now.getUTCFullYear() - roofReplacementYear),
      'structure.foundationType': property.foundationType === 'UNKNOWN' ? null : property.foundationType,
      'structure.sidingType': property.sidingType,
      'structure.electricalPanelAgeYears': property.electricalPanelAge,
    };
    return Object.entries(values).map(([key, value]) => {
      const derivedEvidence = key === 'structure.roofAgeYears' && value !== null ? {
        source: 'SYSTEM_DERIVED' as const,
        verified: false,
        confidence: null,
        // Roof age changes at the year boundary. A deterministic observation
        // time keeps contextVersion stable for identical source records.
        observedAt: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
        validUntil: null,
      } : undefined;
      return withPropertyId(createPropertyFact(key, value, evidence.get(key) ?? derivedEvidence, now), propertyId);
    });
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

function normalizeInstalledItemType(item: { category: string; name: string; tags: string[] }): string[] {
  const text = `${item.category} ${item.name} ${item.tags.join(' ')}`.toUpperCase();
  const types = new Set<string>([item.category]);
  const patterns: Array<[RegExp, string]> = [
    [/\b(AIR CONDITION|CENTRAL AC|WINDOW AC|HVAC_AC)\b/, 'AIR_CONDITIONER'],
    [/\bFURNACE\b/, 'FURNACE'],
    [/\b(WATER HEATER|BOILER)\b/, 'WATER_HEATER'],
    [/\b(FIREPLACE|CHIMNEY)\b/, 'CHIMNEY'],
    [/\bIRRIGATION|SPRINKLER\b/, 'IRRIGATION'],
    [/\bDISHWASHER\b/, 'DISHWASHER'],
    [/\b(DRYER|CLOTHES DRYER)\b/, 'DRYER'],
    [/\b(REFRIGERATOR|FRIDGE)\b/, 'REFRIGERATOR'],
  ];
  for (const [pattern, type] of patterns) {
    if (pattern.test(text)) types.add(type);
  }
  return [...types];
}

export const systemsAssembler: PropertyContextAssembler = {
  scope: 'SYSTEMS',
  async assemble(propertyId, now) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        heatingType: true,
        coolingType: true,
        waterHeaterType: true,
        inventoryItems: { select: { category: true, name: true, tags: true } },
      },
    });
    if (!property) return [];
    const installedItemTypes = [...new Set(property.inventoryItems.flatMap(normalizeInstalledItemType))].sort();
    const hasCoolingFromProfile = property.coolingType && property.coolingType !== 'UNKNOWN' ? true : null;
    const hasCooling = hasCoolingFromProfile ?? (installedItemTypes.includes('AIR_CONDITIONER') ? true : null);
    const values: Record<string, unknown> = {
      'systems.hasCooling': hasCooling,
      'systems.heatingType': property.heatingType === 'UNKNOWN' ? null : property.heatingType,
      'systems.coolingType': property.coolingType === 'UNKNOWN' ? null : property.coolingType,
      'systems.waterHeaterType': property.waterHeaterType === 'UNKNOWN' ? null : property.waterHeaterType,
      'systems.installedItemTypes': installedItemTypes,
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, undefined, now), propertyId),
    );
  },
};

export const safetyAssembler: PropertyContextAssembler = {
  scope: 'SAFETY',
  async assemble(propertyId, now) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        hasSmokeDetectors: true,
        hasCoDetectors: true,
        hasSecuritySystem: true,
        hasFireExtinguisher: true,
        hasSumpPumpBackup: true,
      },
    });
    if (!property) return [];
    const values: Record<string, unknown> = {
      'safety.hasSmokeDetectors': property.hasSmokeDetectors,
      'safety.hasCoDetectors': property.hasCoDetectors,
      'safety.hasSecuritySystem': property.hasSecuritySystem,
      'safety.hasFireExtinguisher': property.hasFireExtinguisher,
      'safety.hasSumpPumpBackup': property.hasSumpPumpBackup,
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, undefined, now), propertyId),
    );
  },
};

export const maintenanceAssembler: PropertyContextAssembler = {
  scope: 'MAINTENANCE',
  async assemble(propertyId, now) {
    const tasks = await prisma.propertyMaintenanceTask.findMany({
      where: { propertyId },
      select: {
        id: true,
        actionKey: true,
        status: true,
        nextDueDate: true,
        lastCompletedDate: true,
        updatedAt: true,
        seasonalChecklistItem: { select: { taskKey: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const serialized = tasks.map((task) => ({
      id: task.id,
      actionKey: task.actionKey,
      seasonalTaskKey: task.seasonalChecklistItem?.taskKey ?? null,
      status: task.status,
      nextDueDate: task.nextDueDate?.toISOString() ?? null,
      lastCompletedDate: task.lastCompletedDate?.toISOString() ?? null,
      updatedAt: task.updatedAt.toISOString(),
    }));
    return [withPropertyId(createPropertyFact('maintenance.tasks', serialized, undefined, now), propertyId)];
  },
};

export const roomsAssembler: PropertyContextAssembler = {
  scope: 'ROOMS',
  async assemble(propertyId, now) {
    const rooms = await prisma.inventoryRoom.findMany({
      where: { propertyId },
      select: { id: true, name: true, type: true, floorLevel: true, sortOrder: true, updatedAt: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return [withPropertyId(createPropertyFact('rooms.list', rooms.map((room) => ({
      ...room,
      updatedAt: room.updatedAt.toISOString(),
    })), undefined, now), propertyId)];
  },
};

export const inventoryAssembler: PropertyContextAssembler = {
  scope: 'INVENTORY',
  async assemble(propertyId, now) {
    const items = await prisma.inventoryItem.findMany({
      where: { propertyId },
      select: {
        id: true,
        roomId: true,
        name: true,
        category: true,
        condition: true,
        manufacturer: true,
        modelNumber: true,
        serialNumber: true,
        installedOn: true,
        purchasedOn: true,
        lastServicedOn: true,
        expectedExpiryDate: true,
        replacementCostCents: true,
        currency: true,
        isVerified: true,
        verificationSource: true,
        updatedAt: true,
      },
      orderBy: [{ roomId: 'asc' }, { name: 'asc' }],
    });
    const serialized = items.map((item) => Object.fromEntries(
      Object.entries(item).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
    ));
    return [withPropertyId(createPropertyFact('inventory.items', serialized, undefined, now), propertyId)];
  },
};

export const productContextAssembler: PropertyContextAssembler = {
  scope: 'PRODUCT_CONTEXT',
  async assemble(propertyId, now, actor) {
    const [property, member] = await Promise.all([
      prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          homeownerProfile: { select: { segment: true } },
          onboarding: { select: { status: true, currentStep: true, setupScore: true } },
        },
      }),
      actor ? prisma.householdMember.findUnique({
        where: { propertyId_userId: { propertyId, userId: actor.userId } },
        select: { role: true },
      }) : Promise.resolve(null),
    ]);
    if (!property) return [];
    const values: Record<string, unknown> = {
      'product.onboardingStatus': property.onboarding?.status,
      'product.onboardingStep': property.onboarding?.currentStep,
      'product.setupScore': property.onboarding?.setupScore,
      'product.homeownerSegment': property.homeownerProfile.segment,
      'product.canViewFacts': true,
      'product.canCorrectFacts': member?.role === 'OWNER' || member?.role === 'CONTRIBUTOR',
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, undefined, now), propertyId),
    );
  },
};

export const INITIAL_PROPERTY_CONTEXT_ASSEMBLERS: PropertyContextAssembler[] = [
  coreAssembler,
  locationAssembler,
  structureAssembler,
  exteriorAssembler,
  responsibilityAssembler,
  systemsAssembler,
  safetyAssembler,
  roomsAssembler,
  inventoryAssembler,
  maintenanceAssembler,
  productContextAssembler,
];
