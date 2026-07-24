import {
  DwellingType,
  FoundationType,
  OccupancyStatus,
  OutdoorSpaceType,
  OwnershipForm,
  Prisma,
  PropertyFactSourceType,
  PropertyResponsibilityScope,
  PropertyUse,
  ResponsibleParty,
  RoofType,
  HeatingType,
  CoolingType,
  WaterHeaterType,
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { propertyContextCapturesTotal } from '../../../lib/metrics';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import { getFactDefinition } from '../catalog/factCatalog';
import { getPropertyContext, PropertyContextAccessDeniedError } from './getPropertyContext';

const nullableBoolean = z.boolean().nullable();
const nullableNonNegativeNumber = z.number().nonnegative().nullable();
const nullableNonNegativeInteger = z.number().int().nonnegative().nullable();
const nullableString = z.string().trim().max(200).nullable();

const propertyFacts = {
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
  'structure.roofType': { field: 'roofType', schema: z.nativeEnum(RoofType).nullable() },
  'structure.roofReplacementYear': { field: 'roofReplacementYear', schema: nullableNonNegativeInteger },
  'structure.foundationType': { field: 'foundationType', schema: z.nativeEnum(FoundationType).nullable() },
  'structure.sidingType': { field: 'sidingType', schema: nullableString },
  'structure.electricalPanelAgeYears': { field: 'electricalPanelAge', schema: nullableNonNegativeInteger },
  'systems.heatingType': { field: 'heatingType', schema: z.nativeEnum(HeatingType).nullable() },
  'systems.coolingType': { field: 'coolingType', schema: z.nativeEnum(CoolingType).nullable() },
  'systems.waterHeaterType': { field: 'waterHeaterType', schema: z.nativeEnum(WaterHeaterType).nullable() },
  'safety.hasSmokeDetectors': { field: 'hasSmokeDetectors', schema: nullableBoolean },
  'safety.hasCoDetectors': { field: 'hasCoDetectors', schema: nullableBoolean },
  'safety.hasSecuritySystem': { field: 'hasSecuritySystem', schema: nullableBoolean },
  'safety.hasFireExtinguisher': { field: 'hasFireExtinguisher', schema: nullableBoolean },
  'safety.hasSumpPump': { field: 'hasSumpPump', schema: nullableBoolean },
  'safety.hasSumpPumpBackup': { field: 'hasSumpPumpBackup', schema: nullableBoolean },
} as const;

const exteriorFacts = {
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

const responsibilityScopes: Record<string, PropertyResponsibilityScope> = {
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

export const capturePropertyFactInputSchema = z.object({
  value: z.unknown(),
  sourceType: z.nativeEnum(PropertyFactSourceType).default('USER_REPORTED'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
});

export type CapturePropertyFactInput = z.infer<typeof capturePropertyFactInputSchema>;

export function isContextCaptureSupported(factKey: string): boolean {
  return factKey in propertyFacts || factKey in exteriorFacts || factKey in responsibilityScopes;
}

export function normalizeCaptureValue(factKey: string, value: unknown): unknown {
  if (factKey in propertyFacts) {
    const mapping = propertyFacts[factKey as keyof typeof propertyFacts];
    return mapping.schema.parse(value === null && 'unknown' in mapping ? mapping.unknown : value);
  }
  if (factKey in exteriorFacts) {
    return exteriorFacts[factKey as keyof typeof exteriorFacts].schema.parse(value);
  }
  if (factKey in responsibilityScopes) {
    return z.nativeEnum(ResponsibleParty).parse(value ?? 'UNKNOWN');
  }
  throw new Error(`Property Context fact is not supported for direct capture: ${factKey}`);
}

export async function writeCanonicalFact(
  tx: Prisma.TransactionClient,
  propertyId: string,
  factKey: string,
  value: unknown,
): Promise<void> {
  if (factKey in propertyFacts) {
    if (factKey === 'safety.hasSumpPump') {
      await tx.property.update({
        where: { id: propertyId },
        data: {
          hasSumpPump: value as boolean,
          ...(value === false ? { hasSumpPumpBackup: null } : {}),
          isResilienceVerified: value === false,
        },
      });
      return;
    }
    if (factKey === 'safety.hasSumpPumpBackup') {
      await tx.property.update({
        where: { id: propertyId },
        data: {
          hasSumpPump: true,
          hasSumpPumpBackup: value as boolean,
          isResilienceVerified: true,
        },
      });
      return;
    }
    const mapping = propertyFacts[factKey as keyof typeof propertyFacts];
    await tx.property.update({ where: { id: propertyId }, data: { [mapping.field]: value } });
    return;
  }

  if (factKey in exteriorFacts) {
    const mapping = exteriorFacts[factKey as keyof typeof exteriorFacts];
    const patch: Record<string, unknown> = { [mapping.field]: value };
    if (factKey === 'exterior.hasPrivateOutdoorSpace' && value === false) patch.outdoorSpaceTypes = [];
    if (factKey === 'exterior.outdoorSpaceTypes' && Array.isArray(value) && value.length > 0) {
      patch.hasPrivateOutdoorSpace = true;
    }
    await tx.propertyExteriorProfile.upsert({
      where: { propertyId },
      create: { propertyId, ...patch },
      update: patch,
    });
    return;
  }

  const scope = responsibilityScopes[factKey];
  await tx.propertyResponsibility.upsert({
    where: { propertyId_scope: { propertyId, scope } },
    create: { propertyId, scope, party: value as ResponsibleParty },
    update: { party: value as ResponsibleParty },
  });
}

export async function capturePropertyFact(
  propertyId: string,
  userId: string,
  factKey: string,
  rawInput: CapturePropertyFactInput,
) {
  const definition = getFactDefinition(factKey);
  if (!definition.writable || !isContextCaptureSupported(factKey)) {
    throw new Error(`Property Context fact is not writable through contextual capture: ${factKey}`);
  }
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) throw new PropertyContextAccessDeniedError();

  const input = capturePropertyFactInputSchema.parse(rawInput);
  const value = normalizeCaptureValue(factKey, input.value);
  const unknownAnswer = value === null || value === 'UNKNOWN';
  const observedAt = new Date();

  let evidenceId = '';
  try {
    await prisma.$transaction(async (tx) => {
      if (!unknownAnswer) {
        await writeCanonicalFact(tx, propertyId, factKey, value);
        await tx.propertyFactEvidence.updateMany({
          where: { propertyId, factKey, supersededAt: null },
          data: { supersededAt: observedAt },
        });
      } else if (factKey === 'safety.hasSumpPump' || factKey === 'safety.hasSumpPumpBackup') {
        // "Not sure" is an explicit response. Preserve the unknown physical
        // fact while preventing repeated prompts until the homeowner edits it.
        await tx.property.update({
          where: { id: propertyId },
          data: { isResilienceVerified: true },
        });
      }
      const evidence = await tx.propertyFactEvidence.create({
        data: {
          propertyId,
          factKey,
          sourceType: input.sourceType,
          observationState: unknownAnswer ? 'UNKNOWN' : 'KNOWN',
          sourceEntityType: 'PROPERTY_CONTEXT_CAPTURE',
          sourceEntityId: userId,
          confidence: input.confidence ?? (input.sourceType === 'USER_REPORTED' ? 0.9 : null),
          observedAt,
          validUntil: input.validUntil ?? null,
          verifiedAt: input.sourceType === 'USER_REPORTED' ? observedAt : null,
        },
      });
      evidenceId = evidence.id;
    });
    propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: factKey, outcome: 'success' });
  } catch (error) {
    propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: factKey, outcome: 'error' });
    throw error;
  }

  const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: [definition.scope] });
  return { fact: snapshot.facts[factKey], contextVersion: snapshot.contextVersion, evidenceIds: [evidenceId] };
}

export async function listPropertyFactEvidence(propertyId: string, userId: string, factKey: string) {
  getFactDefinition(factKey);
  if (!await resolvePropertyAccess(userId, propertyId)) throw new PropertyContextAccessDeniedError();
  return prisma.propertyFactEvidence.findMany({
    where: { propertyId, factKey },
    orderBy: [{ observedAt: 'desc' }],
    select: {
      id: true,
      factKey: true,
      sourceType: true,
      sourceEntityType: true,
      confidence: true,
      observedAt: true,
      validUntil: true,
      verifiedAt: true,
      supersededAt: true,
    },
  });
}
