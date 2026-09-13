import {
  BasementConfiguration,
  CoolingType,
  DwellingType,
  FoundationType,
  HeatingType,
  OccupancyStatus,
  OutdoorSpaceType,
  OwnershipForm,
  PropertyCosmeticCondition,
  PropertyResponsibilityScope,
  PropertyRoomUpdateStatus,
  PropertyStagingReadiness,
  PropertyUse,
  RoofType,
  SewerSystemType,
  WaterHeaterType,
  WaterSourceType,
} from '@prisma/client';
import { z } from 'zod';

// Extracted out of capturePropertyFact.ts to break a real circular-import
// deadlock: captureRegistry.ts imports isContextCaptureSupported, and
// capturePropertyFact.ts's own import chain (via radarPropertyReconciliation
// -> ... -> PropertyMaintenanceTask.service -> evaluateFeatureContext) leads
// back to captureRegistry.ts -- a genuine cycle, not a test-order artifact
// (reproduced with either module required first). This file has zero
// dependencies beyond @prisma/client enums and zod, so both sides of the
// cycle can depend on it without depending on each other.
//
// Verified this cycle does NOT crash normal application startup (index.ts's
// own route-import order happens to resolve it today), but that safety is an
// accident of import order, not a guarantee -- see the reproduction and
// startup verification recorded in the Ask Cozy Stage 3 implementation plan.

const nullableBoolean = z.boolean().nullable();
const nullableNonNegativeNumber = z.number().nonnegative().nullable();
const nullableNonNegativeInteger = z.number().int().nonnegative().nullable();
const nullableString = z.string().trim().max(200).nullable();

export const propertyFacts = {
  'core.dwellingType': { field: 'dwellingType', schema: z.nativeEnum(DwellingType), unknown: 'UNKNOWN' },
  'core.ownershipForm': { field: 'ownershipForm', schema: z.nativeEnum(OwnershipForm), unknown: 'UNKNOWN' },
  'core.propertyUse': { field: 'propertyUse', schema: z.nativeEnum(PropertyUse), unknown: 'UNKNOWN' },
  'core.occupancyStatus': { field: 'occupancyStatus', schema: z.nativeEnum(OccupancyStatus), unknown: 'UNKNOWN' },
  'core.isPrimary': { field: 'isPrimary', schema: z.boolean() },
  'core.yearBuilt': { field: 'yearBuilt', schema: nullableNonNegativeInteger },
  'core.propertySizeSqFt': { field: 'propertySize', schema: nullableNonNegativeInteger },
  'core.bedrooms': { field: 'bedrooms', schema: nullableNonNegativeInteger },
  'core.bathrooms': { field: 'bathrooms', schema: nullableNonNegativeNumber },
  'location.city': { field: 'city', schema: z.string().trim().min(1).max(100) },
  'location.state': { field: 'state', schema: z.string().trim().length(2).transform((value) => value.toUpperCase()) },
  'location.zipCode': { field: 'zipCode', schema: z.string().trim().regex(/^\d{5}$/) },
  'location.timezone': { field: 'timezone', schema: nullableString },
  'location.inHistoricDistrict': { field: 'inHistoricDistrict', schema: nullableBoolean },
  'location.inHurricaneZone': { field: 'inHurricaneZone', schema: nullableBoolean },
  'location.inFloodZone': { field: 'inFloodZone', schema: nullableBoolean },
  'location.inWildfireZone': { field: 'inWildfireZone', schema: nullableBoolean },
  'location.isCoastal': { field: 'isCoastal', schema: nullableBoolean },
  'structure.roofType': { field: 'roofType', schema: z.nativeEnum(RoofType).nullable() },
  'structure.roofReplacementYear': { field: 'roofReplacementYear', schema: nullableNonNegativeInteger },
  'structure.foundationType': { field: 'foundationType', schema: z.nativeEnum(FoundationType).nullable() },
  'structure.basementConfiguration': { field: 'basementConfiguration', schema: z.nativeEnum(BasementConfiguration), unknown: 'UNKNOWN' },
  'structure.sidingType': { field: 'sidingType', schema: nullableString },
  'structure.electricalPanelAgeYears': { field: 'electricalPanelAge', schema: nullableNonNegativeInteger },
  'systems.heatingType': { field: 'heatingType', schema: z.nativeEnum(HeatingType).nullable() },
  'systems.coolingType': { field: 'coolingType', schema: z.nativeEnum(CoolingType).nullable() },
  'systems.waterHeaterType': { field: 'waterHeaterType', schema: z.nativeEnum(WaterHeaterType).nullable() },
  'systems.hvacInstallYear': { field: 'hvacInstallYear', schema: nullableNonNegativeInteger },
  'systems.waterHeaterInstallYear': { field: 'waterHeaterInstallYear', schema: nullableNonNegativeInteger },
  'systems.waterSource': { field: 'waterSource', schema: z.nativeEnum(WaterSourceType), unknown: 'UNKNOWN' },
  'systems.sewerSystem': { field: 'sewerSystem', schema: z.nativeEnum(SewerSystemType), unknown: 'UNKNOWN' },
  'systems.hasSolar': { field: 'hasSolar', schema: nullableBoolean },
  'systems.hasFireplace': { field: 'hasFireplace', schema: nullableBoolean },
  'safety.hasSmokeDetectors': { field: 'hasSmokeDetectors', schema: nullableBoolean },
  'safety.hasCoDetectors': { field: 'hasCoDetectors', schema: nullableBoolean },
  'safety.hasSecuritySystem': { field: 'hasSecuritySystem', schema: nullableBoolean },
  'safety.hasFireExtinguisher': { field: 'hasFireExtinguisher', schema: nullableBoolean },
  'safety.hasSumpPump': { field: 'hasSumpPump', schema: nullableBoolean },
  'safety.hasSumpPumpBackup': { field: 'hasSumpPumpBackup', schema: nullableBoolean },
} as const;

export const exteriorFacts = {
  'exterior.hasPrivateOutdoorSpace': { field: 'hasPrivateOutdoorSpace', schema: nullableBoolean },
  'exterior.outdoorSpaceTypes': { field: 'outdoorSpaceTypes', schema: z.array(z.nativeEnum(OutdoorSpaceType)).max(7) },
  'exterior.lotSizeSqFt': { field: 'lotSizeSqFt', schema: nullableNonNegativeNumber },
  'exterior.hasLawn': { field: 'hasLawn', schema: nullableBoolean },
  'exterior.hasTreesOrShrubs': { field: 'hasTreesOrShrubs', schema: nullableBoolean },
  'exterior.hasDriveway': { field: 'hasDriveway', schema: nullableBoolean },
  'exterior.hasFence': { field: 'hasFence', schema: nullableBoolean },
  'exterior.hasPoolOrSpa': { field: 'hasPoolOrSpa', schema: nullableBoolean },
  'exterior.hasIrrigation': { field: 'hasIrrigation', schema: nullableBoolean },
  'exterior.hasOutdoorFaucets': { field: 'hasOutdoorFaucets', schema: nullableBoolean },
  'exterior.hasDrainageIssues': { field: 'hasDrainageIssues', schema: nullableBoolean },
} as const;

// Sale Readiness Value-Maximization Checklist plan §4.6/§10 Phase 3. Written
// to PropertySalePrepProfile, mirroring exteriorFacts's one-row-per-property
// pattern.
export const salePrepFacts = {
  'salePrep.paintCondition': { field: 'paintCondition', schema: z.nativeEnum(PropertyCosmeticCondition).nullable() },
  'salePrep.curbAppealCondition': { field: 'curbAppealCondition', schema: z.nativeEnum(PropertyCosmeticCondition).nullable() },
  'salePrep.flooringCondition': { field: 'flooringCondition', schema: z.nativeEnum(PropertyCosmeticCondition).nullable() },
  'salePrep.kitchenStatus': { field: 'kitchenStatus', schema: z.nativeEnum(PropertyRoomUpdateStatus).nullable() },
  'salePrep.bathroomStatus': { field: 'bathroomStatus', schema: z.nativeEnum(PropertyRoomUpdateStatus).nullable() },
  'salePrep.stagingReadiness': { field: 'stagingReadiness', schema: z.nativeEnum(PropertyStagingReadiness).nullable() },
} as const;

export const responsibilityScopes: Record<string, PropertyResponsibilityScope> = {
  'responsibility.roof': 'ROOF',
  'responsibility.buildingExterior': 'BUILDING_EXTERIOR',
  'responsibility.landscaping': 'LANDSCAPING',
  'responsibility.treesShrubs': 'TREES_SHRUBS',
  'responsibility.drivewayWalkways': 'DRIVEWAY_WALKWAYS',
  'responsibility.deckPatioBalcony': 'DECK_PATIO_BALCONY',
  'responsibility.plumbing': 'PLUMBING',
  'responsibility.hvac': 'HVAC',
  'responsibility.commonSafety': 'COMMON_SAFETY',
  'responsibility.snowIce': 'SNOW_ICE',
  'responsibility.pestControl': 'PEST_CONTROL',
  'responsibility.sharedSystems': 'SHARED_SYSTEMS',
};

export function isContextCaptureSupported(factKey: string): boolean {
  return factKey in propertyFacts || factKey in exteriorFacts || factKey in salePrepFacts || factKey in responsibilityScopes;
}
