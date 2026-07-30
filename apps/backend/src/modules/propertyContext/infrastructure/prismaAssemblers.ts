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
    const knownDifference = Number(b.observationState === 'KNOWN') - Number(a.observationState === 'KNOWN');
    if (knownDifference !== 0) return knownDifference;
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
      observationState: row.observationState,
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
    [/\bGUTTERS?\b/, 'GUTTER'],
  ];
  for (const [pattern, type] of patterns) {
    if (pattern.test(text)) types.add(type);
  }
  return [...types];
}

export const systemsAssembler: PropertyContextAssembler = {
  scope: 'SYSTEMS',
  async assemble(propertyId, now) {
    const [property, evidence] = await Promise.all([
      prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          heatingType: true,
          coolingType: true,
          waterHeaterType: true,
          inventoryItems: { select: { category: true, name: true, tags: true } },
        },
      }),
      loadEvidence(propertyId, 'SYSTEMS'),
    ]);
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
      withPropertyId(createPropertyFact(key, value, evidence.get(key), now), propertyId),
    );
  },
};

export const safetyAssembler: PropertyContextAssembler = {
  scope: 'SAFETY',
  async assemble(propertyId, now) {
    const [property, evidence] = await Promise.all([
      prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          hasSmokeDetectors: true,
          hasCoDetectors: true,
          hasSecuritySystem: true,
          hasFireExtinguisher: true,
          hasSumpPump: true,
          hasSumpPumpBackup: true,
        },
      }),
      loadEvidence(propertyId, 'SAFETY'),
    ]);
    if (!property) return [];
    const values: Record<string, unknown> = {
      'safety.hasSmokeDetectors': property.hasSmokeDetectors,
      'safety.hasCoDetectors': property.hasCoDetectors,
      'safety.hasSecuritySystem': property.hasSecuritySystem,
      'safety.hasFireExtinguisher': property.hasFireExtinguisher,
      'safety.hasSumpPump': property.hasSumpPump,
      'safety.hasSumpPumpBackup': property.hasSumpPumpBackup,
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, evidence.get(key), now), propertyId),
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
        assetType: true,
        tags: true,
        condition: true,
        manufacturer: true,
        modelNumber: true,
        serialNumber: true,
        installedOn: true,
        purchasedOn: true,
        lastServicedOn: true,
        expectedExpiryDate: true,
        replacementCostCents: true,
        warrantyId: true,
        insurancePolicyId: true,
        coverageEvidenceStatus: true,
        currency: true,
        isVerified: true,
        verificationSource: true,
        sourceHash: true,
        sourceType: true,
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

export const inspectionAssembler: PropertyContextAssembler = {
  scope: 'INSPECTION',
  async assemble(propertyId, now) {
    const [reports, findings] = await Promise.all([
      prisma.inspectionReport.findMany({
        where: { propertyId, status: 'CONFIRMED' },
        select: {
          id: true,
          reportType: true,
          inspectionDate: true,
          totalFindings: true,
          openFindings: true,
          safetyFindings: true,
          majorFindings: true,
          confirmedAt: true,
        },
        orderBy: { inspectionDate: 'desc' },
      }),
      prisma.inspectionFinding.findMany({
        where: { propertyId, status: 'OPEN', report: { status: 'CONFIRMED' } },
        select: {
          id: true,
          reportId: true,
          homeSystem: true,
          conditionRating: true,
          severity: true,
          inspectorRecommendation: true,
          estimatedCostCentsLow: true,
          estimatedCostCentsHigh: true,
          inventoryItemId: true,
          recallMatchId: true,
          updatedAt: true,
        },
        orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);
    const serializeDates = (row: Record<string, unknown>) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
    );
    return [
      withPropertyId(createPropertyFact('inspection.confirmedReports', reports.map((row) => serializeDates(row)), undefined, now), propertyId),
      withPropertyId(createPropertyFact('inspection.openFindings', findings.map((row) => serializeDates(row)), undefined, now), propertyId),
    ];
  },
};

export const coverageAssembler: PropertyContextAssembler = {
  scope: 'COVERAGE',
  async assemble(propertyId, now) {
    const [insurancePolicies, warranties, claims] = await Promise.all([
      prisma.insurancePolicy.findMany({
        where: { propertyId },
        select: {
          id: true,
          coverageType: true,
          startDate: true,
          expiryDate: true,
          deductibleAmount: true,
          personalPropertyLimitCents: true,
          isVerified: true,
          lastVerifiedAt: true,
          updatedAt: true,
        },
        orderBy: { expiryDate: 'desc' },
      }),
      prisma.warranty.findMany({
        where: { propertyId },
        select: {
          id: true,
          category: true,
          inventoryItemId: true,
          startDate: true,
          expiryDate: true,
          updatedAt: true,
        },
        orderBy: { expiryDate: 'desc' },
      }),
      prisma.claim.findMany({
        where: { propertyId, status: { notIn: ['CLOSED', 'DENIED'] } },
        select: {
          id: true,
          type: true,
          status: true,
          sourceType: true,
          insurancePolicyId: true,
          warrantyId: true,
          incidentAt: true,
          lastActivityAt: true,
          nextFollowUpAt: true,
          updatedAt: true,
        },
        orderBy: { lastActivityAt: 'desc' },
      }),
    ]);
    const serialize = (row: Record<string, unknown>) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value && typeof value === 'object' && 'toNumber' in value
          ? (value as { toNumber(): number }).toNumber()
          : value,
      ]),
    );
    return [
      withPropertyId(createPropertyFact('coverage.insurancePolicies', insurancePolicies.map((row) => serialize(row)), undefined, now), propertyId),
      withPropertyId(createPropertyFact('coverage.warranties', warranties.map((row) => serialize(row)), undefined, now), propertyId),
      withPropertyId(createPropertyFact('coverage.activeClaims', claims.map((row) => serialize(row)), undefined, now), propertyId),
    ];
  },
};

export const riskAssembler: PropertyContextAssembler = {
  scope: 'RISK',
  async assemble(propertyId, now) {
    const [report, incidents] = await Promise.all([
      prisma.riskAssessmentReport.findUnique({
        where: { propertyId },
        select: { id: true, riskScore: true, financialExposureTotal: true, details: true, lastCalculatedAt: true },
      }),
      prisma.incident.findMany({
        where: {
          propertyId,
          isSuppressed: false,
          status: { in: ['DETECTED', 'EVALUATED', 'ACTIVE', 'ACTIONED', 'MITIGATED'] },
        },
        select: {
          id: true,
          sourceType: true,
          typeKey: true,
          category: true,
          status: true,
          severity: true,
          severityScore: true,
          confidence: true,
          openedAt: true,
          nextReevalAt: true,
          updatedAt: true,
        },
        orderBy: [{ severityScore: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);
    const serializedReport = report ? {
      ...report,
      financialExposureTotal: report.financialExposureTotal.toNumber(),
      lastCalculatedAt: report.lastCalculatedAt.toISOString(),
    } : null;
    const reportEvidence = report ? {
      source: 'SYSTEM_DERIVED' as const,
      verified: false,
      confidence: null,
      observedAt: report.lastCalculatedAt,
      validUntil: new Date(report.lastCalculatedAt.getTime() + 30 * 60 * 1000),
    } : undefined;
    return [
      withPropertyId(createPropertyFact('risk.report', serializedReport, reportEvidence, now), propertyId),
      withPropertyId(createPropertyFact('risk.activeIncidents', incidents.map((incident) => ({
        ...incident,
        openedAt: incident.openedAt.toISOString(),
        nextReevalAt: incident.nextReevalAt?.toISOString() ?? null,
        updatedAt: incident.updatedAt.toISOString(),
      })), undefined, now), propertyId),
    ];
  },
};

export const environmentAssembler: PropertyContextAssembler = {
  scope: 'ENVIRONMENT',
  async assemble(propertyId, now) {
    const setting = await prisma.propertyClimateSetting.findUnique({
      where: { propertyId },
      select: {
        climateRegion: true,
        climateRegionSource: true,
        notificationEnabled: true,
        updatedAt: true,
      },
    });
    const value = setting
      ? {
          ...setting,
          updatedAt: setting.updatedAt.toISOString(),
        }
      : null;
    return [withPropertyId(createPropertyFact('environment.climateSetting', value, undefined, now), propertyId)];
  },
};

export const eventsAssembler: PropertyContextAssembler = {
  scope: 'EVENTS',
  async assemble(propertyId, now) {
    const lookback = new Date(now);
    lookback.setFullYear(lookback.getFullYear() - 2);
    const [radarMatches, homeEvents] = await Promise.all([
      prisma.propertyRadarMatch.findMany({
        where: {
          propertyId,
          isVisible: true,
          OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }],
          AND: [{ OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }] }],
          radarEvent: { status: 'active' },
        },
        select: {
          id: true,
          radarEventId: true,
          impactLevel: true,
          visibleUntil: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.homeEvent.findMany({
        where: { propertyId, occurredAt: { gte: lookback, lte: now } },
        select: {
          id: true,
          type: true,
          importance: true,
          occurredAt: true,
          inventoryItemId: true,
          claimId: true,
          sourceBadge: true,
          confidenceScore: true,
          updatedAt: true,
        },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
    ]);
    const serialize = (row: Record<string, unknown>) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
    );
    return [
      withPropertyId(createPropertyFact('events.activeRadarMatches', radarMatches.map((row) => serialize(row)), undefined, now), propertyId),
      withPropertyId(createPropertyFact('events.recentHomeEvents', homeEvents.map((row) => serialize(row)), undefined, now), propertyId),
    ];
  },
};

export const recallsAssembler: PropertyContextAssembler = {
  scope: 'RECALLS',
  async assemble(propertyId, now) {
    const matches = await prisma.recallMatch.findMany({
      where: { propertyId, status: { in: ['OPEN', 'NEEDS_CONFIRMATION'] } },
      select: {
        id: true,
        inventoryItemId: true,
        recallId: true,
        method: true,
        confidencePct: true,
        status: true,
        maintenanceTaskId: true,
        updatedAt: true,
      },
      orderBy: [{ status: 'asc' }, { confidencePct: 'desc' }],
    });
    return [withPropertyId(createPropertyFact('recalls.unresolvedMatches', matches.map((match) => ({
      ...match,
      updatedAt: match.updatedAt.toISOString(),
    })), undefined, now), propertyId)];
  },
};

export const guidanceStateAssembler: PropertyContextAssembler = {
  scope: 'GUIDANCE_STATE',
  async assemble(propertyId, now) {
    const signals = await prisma.guidanceSignal.findMany({
      where: {
        propertyId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        inventoryItemId: true,
        signalIntentFamily: true,
        issueDomain: true,
        decisionStage: true,
        executionReadiness: true,
        severity: true,
        severityScore: true,
        confidenceScore: true,
        sourceFeatureKey: true,
        sourceEntityType: true,
        sourceEntityId: true,
        dedupeKey: true,
        missingContextKeys: true,
        recommendedToolKey: true,
        lastObservedAt: true,
        expiresAt: true,
      },
      orderBy: [{ severityScore: 'desc' }, { lastObservedAt: 'desc' }],
    });
    return [withPropertyId(createPropertyFact('guidance.activeSignals', signals.map((signal) => ({
      ...signal,
      confidenceScore: signal.confidenceScore?.toNumber() ?? null,
      lastObservedAt: signal.lastObservedAt.toISOString(),
      expiresAt: signal.expiresAt?.toISOString() ?? null,
    })), undefined, now), propertyId)];
  },
};

export const productContextAssembler: PropertyContextAssembler = {
  scope: 'PRODUCT_CONTEXT',
  async assemble(propertyId, now, actor) {
    const [property, member] = await Promise.all([
      prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          onboarding: {
            select: {
              status: true,
              currentStep: true,
              setupScore: true,
              entryPath: true,
              ownershipState: true,
              propertyOrigin: true,
            },
          },
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
      'product.entryPath': property.onboarding?.entryPath,
      'product.ownershipState': property.onboarding?.ownershipState,
      'product.propertyOrigin': property.onboarding?.propertyOrigin,
      'product.canViewFacts': true,
      'product.canCorrectFacts': member?.role === 'OWNER' || member?.role === 'CONTRIBUTOR',
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, undefined, now), propertyId),
    );
  },
};

function serializeContextRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value instanceof Date) return [key, value.toISOString()];
    if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
      return [key, value.toNumber()];
    }
    return [key, value];
  }));
}

export const financialAssembler: PropertyContextAssembler = {
  scope: 'FINANCIAL',
  async assemble(propertyId, now) {
    const expenseThreshold = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const [profile, latestEquity, reserveFund, capitalExposure, expenseSummary, activeScenarios, evidence] = await Promise.all([
      prisma.propertyFinancingProfile.findUnique({
        where: { propertyId },
        select: {
          purchasePriceCents: true,
          purchaseDate: true,
          mortgageType: true,
          originalMortgageBalanceCents: true,
          currentMortgageBalanceCents: true,
          mortgageBalanceAsOfDate: true,
          interestRateBps: true,
          remainingTermMonths: true,
          monthlyPaymentCents: true,
          hasSecondMortgage: true,
          secondMortgageBalanceCents: true,
          hasPMI: true,
          updatedAt: true,
        },
      }),
      prisma.equityPosition.findFirst({
        where: { propertyId },
        select: {
          estimatedValueCents: true,
          estimatedValueSource: true,
          mortgageBalanceCents: true,
          secondMortgageBalanceCents: true,
          equityCents: true,
          equityPercent: true,
          ltvPercent: true,
          helocCapacityCents: true,
          helocEligible: true,
          computedAt: true,
        },
        orderBy: { computedAt: 'desc' },
      }),
      prisma.homeReserveFund.findUnique({
        where: { propertyId },
        select: {
          posture: true,
          horizonYears: true,
          currentBalanceCents: true,
          recommendedMonthlyContributionCents: true,
          currentShortfallCents: true,
          lastRecalculatedAt: true,
          isActive: true,
        },
      }),
      prisma.homeCapitalTimelineItem.findMany({
        where: { propertyId, windowEnd: { gte: now }, analysis: { status: 'READY' } },
        select: {
          id: true,
          category: true,
          eventType: true,
          windowStart: true,
          windowEnd: true,
          estimatedCostMinCents: true,
          estimatedCostMaxCents: true,
          confidence: true,
          priority: true,
          inventoryItemId: true,
          updatedAt: true,
        },
        orderBy: { windowStart: 'asc' },
        take: 100,
      }),
      prisma.expense.groupBy({
        by: ['category'],
        where: { propertyId, transactionDate: { gte: expenseThreshold } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.financingScenario.findMany({
        where: { propertyId, status: { in: ['DRAFT', 'SAVED'] } },
        select: {
          id: true,
          title: true,
          status: true,
          entryPoint: true,
          projectCostCents: true,
          selectedOption: true,
          sourceEntityType: true,
          sourceEntityId: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      loadEvidence(propertyId, 'FINANCIAL'),
    ]);

    const currentMortgage = profile && profile.currentMortgageBalanceCents !== null
      ? {
          mortgageType: profile.mortgageType,
          originalMortgageBalanceCents: profile.originalMortgageBalanceCents,
          currentMortgageBalanceCents: profile.currentMortgageBalanceCents,
          mortgageBalanceAsOfDate: profile.mortgageBalanceAsOfDate,
          interestRateBps: profile.interestRateBps,
          remainingTermMonths: profile.remainingTermMonths,
          monthlyPaymentCents: profile.monthlyPaymentCents,
          hasSecondMortgage: profile.hasSecondMortgage,
          secondMortgageBalanceCents: profile.secondMortgageBalanceCents,
          hasPMI: profile.hasPMI,
        }
      : null;
    const mortgageObservedAt = profile?.mortgageBalanceAsOfDate ?? profile?.updatedAt ?? null;
    const mortgageEvidence = mortgageObservedAt
      ? {
          source: 'USER_REPORTED' as const,
          verified: false,
          confidence: null,
          observedAt: mortgageObservedAt,
          validUntil: new Date(mortgageObservedAt.getTime() + 90 * 24 * 60 * 60 * 1000),
        }
      : undefined;
    const values: Record<string, unknown> = {
      'financial.financingProfile': profile ? serializeContextRow(profile) : null,
      'financial.currentMortgage': currentMortgage ? serializeContextRow(currentMortgage) : null,
      'financial.latestEquity': latestEquity ? serializeContextRow(latestEquity) : null,
      'financial.reserveFund': reserveFund ? serializeContextRow(reserveFund) : null,
      'financial.upcomingCapitalExposure': capitalExposure.map((row) => serializeContextRow(row)),
      'financial.ownershipExpenseSummary': expenseSummary.map((row) => ({
        category: row.category,
        amount: row._sum.amount?.toNumber() ?? 0,
        transactionCount: row._count._all,
        periodStart: expenseThreshold.toISOString(),
        periodEnd: now.toISOString(),
      })),
      // Scenario inputs and selections stay visibly separate from canonical
      // financing facts. Results/assumptions are intentionally not projected.
      'financial.activeScenarios': activeScenarios.map((row) => serializeContextRow(row)),
    };

    return Object.entries(values).map(([key, value]) => {
      const metadata = key === 'financial.currentMortgage'
        ? evidence.get(key) ?? mortgageEvidence
        : evidence.get(key);
      return withPropertyId(createPropertyFact(key, value, metadata, now), propertyId);
    });
  },
};

export const complianceAssembler: PropertyContextAssembler = {
  scope: 'COMPLIANCE',
  async assemble(propertyId, now) {
    const [activePermits, hoaAssociation, openHoaApprovals, openUnpermittedFlags] = await Promise.all([
      prisma.propertyPermitRecord.findMany({
        where: { propertyId, isActive: true, status: { in: ['APPLIED', 'ISSUED', 'INSPECTION_PENDING', 'INSPECTION_FAILED'] } },
        select: { id: true, category: true, workTypes: true, status: true, expirationDate: true, contractorName: true, contractorLicense: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.hoaAssociation.findFirst({
        where: { propertyId, isActive: true },
        select: { id: true, name: true, managementCompany: true, updatedAt: true },
      }),
      prisma.hoaApprovalRecord.findMany({
        where: {
          propertyId,
          isActive: true,
          OR: [
            { decisionStatus: null },
            { decisionStatus: 'EXPIRED' },
          ],
        },
        select: {
          id: true,
          workType: true,
          reportedStatus: true,
          decisionStatus: true,
          decisionTruthLayer: true,
          submittedDate: true,
          expirationDate: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.permitUnpermittedFlag.findMany({
        where: { propertyId, status: { in: ['UNKNOWN', 'FLAGGED', 'INVESTIGATING', 'CONFIRMED_UNPERMITTED', 'WILL_REMEDIATE'] } },
        select: { id: true, workType: true, status: true, disclosureRisk: true, inventoryItemId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    ]);
    const values: Record<string, unknown> = {
      'compliance.activePermits': activePermits.map((row) => serializeContextRow(row)),
      'compliance.hoaAssociation': hoaAssociation ? serializeContextRow(hoaAssociation) : null,
      'compliance.openHoaApprovals': openHoaApprovals.map((row) => serializeContextRow(row)),
      'compliance.openUnpermittedFlags': openUnpermittedFlags.map((row) => serializeContextRow(row)),
    };
    return Object.entries(values).map(([key, value]) =>
      withPropertyId(createPropertyFact(key, value, undefined, now), propertyId),
    );
  },
};

export const projectsAssembler: PropertyContextAssembler = {
  scope: 'PROJECTS',
  async assemble(propertyId, now) {
    const recentThreshold = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const [activeProjects, materialSpecs, quoteWorkspaces, activeBookings, priceChecks, finalizations, negotiations] = await Promise.all([
      prisma.projectRecord.findMany({
        where: { propertyId, status: { in: ['DRAFT', 'PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED'] } },
        select: { id: true, projectType: true, name: true, status: true, serviceCategory: true, homeSystemsAffected: true, contractorId: true, startDate: true, expectedEndDate: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.materialSpec.findMany({
        where: { propertyId, isActive: true },
        select: { id: true, roomId: true, scopeLevel: true, category: true, surface: true, label: true, linkedInventoryItemId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      prisma.quoteComparisonWorkspace.findMany({
        where: { propertyId, status: { in: ['DRAFT', 'SHORTLISTED'] } },
        select: { id: true, status: true, serviceCategory: true, inventoryItemId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.booking.findMany({
        where: { propertyId, status: { in: ['DRAFT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'DISPUTED'] } },
        select: { id: true, status: true, category: true, serviceId: true, providerProfileId: true, inventoryItemId: true, executionScopeType: true, executionScopeKey: true, activeExecutionScopeKey: true, requestedDate: true, scheduledDate: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.serviceRadarCheck.findMany({
        where: { propertyId, createdAt: { gte: recentThreshold } },
        select: { id: true, serviceCategory: true, serviceSubcategory: true, status: true, verdict: true, quoteAmount: true, expectedLow: true, expectedHigh: true, confidenceScore: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.priceFinalization.findMany({
        where: { propertyId, status: 'DRAFT' },
        select: { id: true, sourceType: true, serviceCategory: true, vendorName: true, inventoryItemId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.negotiationShieldCase.findMany({
        where: { propertyId, status: { in: ['DRAFT', 'READY_FOR_REVIEW', 'ANALYZED'] } },
        select: { id: true, scenarioType: true, status: true, sourceType: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    ]);
    const values: Record<string, unknown> = {
      'projects.activeProjects': activeProjects.map((row) => serializeContextRow(row)),
      'projects.materialSpecs': materialSpecs.map((row) => serializeContextRow(row)),
      'projects.openQuoteWorkspaces': quoteWorkspaces.map((row) => serializeContextRow(row)),
      'projects.activeBookings': activeBookings.map((row) => serializeContextRow(row)),
      'projects.recentPriceChecks': priceChecks.map((row) => serializeContextRow(row)),
      'projects.openPriceFinalizations': finalizations.map((row) => serializeContextRow(row)),
      'projects.openNegotiations': negotiations.map((row) => serializeContextRow(row)),
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
  inspectionAssembler,
  coverageAssembler,
  riskAssembler,
  financialAssembler,
  recallsAssembler,
  environmentAssembler,
  eventsAssembler,
  guidanceStateAssembler,
  complianceAssembler,
  projectsAssembler,
  productContextAssembler,
];
