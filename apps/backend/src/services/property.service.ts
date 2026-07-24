// apps/backend/src/services/property.service.ts

import { Property, DwellingType, OwnershipForm, PropertyUse, OccupancyStatus, OutdoorSpaceType, HeatingType, CoolingType, WaterHeaterType, RoofType, FoundationType, Prisma, Warranty, DocumentType, PropertyResponsibilityScope, ResponsibleParty, Season } from '@prisma/client';
import { calculateHealthScore, HealthScoreResult } from '../utils/propertyScore.util'; 
import JobQueueService from './JobQueue.service';
import type { PropertyApplianceDTO } from './propertyApplianceInventory.service';
import {
  syncPropertyApplianceInventoryItems,
  listPropertyApplianceInventory,
} from './propertyApplianceInventory.service';
import {
  calculateProtectionGap,
  getUnverifiedActiveInsurancePolicy,
} from './insuranceAuditor.service';
import { hasPendingCriticalAssetVerification } from './inventoryVerification.service';
import { incrementStreak } from './gamification.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from './analytics';
import { generateHabitsForProperty } from './homeHabitCoach/habitGenerationEngine';
import { getPropertyContext } from '../modules/propertyContext';
import { reevaluateActiveWeatherIncidentsForProperty } from './incidents/incident.evaluator';
import { reconcileCoverageGuidanceJourneyApplicability } from './coverageJourneyReconciliation.service';
import { SeasonalChecklistService } from './seasonalChecklist.service';
import { resolveCurrentSeasonWindow } from './seasonal/seasonWindow';

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

async function reconcileCurrentSeasonalChecklist(propertyId: string, userId: string): Promise<void> {
  const window = resolveCurrentSeasonWindow(new Date());
  try {
    await SeasonalChecklistService.generateSeasonalChecklist(
      propertyId,
      window.season as Season,
      window.year,
      userId,
    );
  } catch (error) {
    // Property creation and editing remain successful if an auxiliary
    // recommendation cannot be materialized. The daily worker can retry.
    logger.warn(
      { err: error, propertyId, season: window.season, year: window.year },
      '[PROPERTY] Current seasonal checklist reconciliation deferred',
    );
  }
}

interface PropertyApplianceInput {
  id?: string; // Optional: Used for client-side tracking, ignored by service but kept for consistency
  type: string; // The canonical appliance type (e.g., 'DISHWASHER')
  installYear: number; // The installation year
}

// === FIX: UPDATE INTERFACES TO USE 'FIELD?: TYPE | null' ===
// This resolves the compilation error by explicitly allowing null for optional DB fields.
interface CreatePropertyData {
  name?: string | null; // Allow null for optional string
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary?: boolean;

  // Layer 1 - Basic/Migrated Fields
  dwellingType?: DwellingType;
  ownershipForm?: OwnershipForm;
  propertyUse?: PropertyUse;
  occupancyStatus?: OccupancyStatus;
  propertySize?: number | null; // FIX
  yearBuilt?: number | null;     // FIX
  
  // Layer 2 - Advanced Fields (Migrated and New)
  bedrooms?: number | null;
  bathrooms?: number | null;
  heatingType?: HeatingType | null;
  coolingType?: CoolingType | null;
  waterHeaterType?: WaterHeaterType | null;
  roofType?: RoofType | null;
  hvacInstallYear?: number | null;
  waterHeaterInstallYear?: number | null;
  roofReplacementYear?: number | null;
  foundationType?: FoundationType | null;
  sidingType?: string | null;
  electricalPanelAge?: number | null;
  lotSize?: number | null; // FIX
  hasIrrigation?: boolean;
  hasDrainageIssues?: boolean;
  hasSmokeDetectors?: boolean;
  hasCoDetectors?: boolean;
  hasSecuritySystem?: boolean;
  hasFireExtinguisher?: boolean;
  hasSumpPump?: boolean | null;
  hasSumpPumpBackup?: boolean | null;
  primaryHeatingFuel?: string | null;
  hasSecondaryHeat?: boolean | null;
  isResilienceVerified?: boolean;
  isUtilityVerified?: boolean;
  purchasePriceCents?: number | null;
  purchaseDate?: Date | null;
  lastAppraisedValue?: number | null;
  lastAppraisalDate?: Date | null;
  isEquityVerified?: boolean;
  coverPhotoDocumentId?: string | null;
  exteriorProfile?: {
    hasPrivateOutdoorSpace?: boolean | null;
    outdoorSpaceTypes?: OutdoorSpaceType[];
    lotSizeSqFt?: number | null;
    hasLawn?: boolean | null;
    hasTreesOrShrubs?: boolean | null;
    hasDriveway?: boolean | null;
    hasFence?: boolean | null;
    hasPoolOrSpa?: boolean | null;
    hasIrrigation?: boolean | null;
    hasOutdoorFaucets?: boolean | null;
    hasDrainageIssues?: boolean | null;
  };
  responsibilities?: Array<{
    scope: PropertyResponsibilityScope;
    party: ResponsibleParty;
    notes?: string | null;
  }>;
  
  majorAppliances?: PropertyApplianceInput[];
}

interface UpdatePropertyData extends Partial<CreatePropertyData> {

}

const responsibilityFactKeyByScope: Record<PropertyResponsibilityScope, string> = {
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

function capturedFactKeys(data: CreatePropertyData | UpdatePropertyData): string[] {
  const direct: Array<[keyof CreatePropertyData, string]> = [
    ['dwellingType', 'core.dwellingType'], ['ownershipForm', 'core.ownershipForm'],
    ['propertyUse', 'core.propertyUse'], ['occupancyStatus', 'core.occupancyStatus'],
    ['isPrimary', 'core.isPrimary'], ['yearBuilt', 'core.yearBuilt'],
    ['propertySize', 'core.propertySizeSqFt'], ['bedrooms', 'core.bedrooms'],
    ['bathrooms', 'core.bathrooms'], ['city', 'location.city'], ['state', 'location.state'],
    ['zipCode', 'location.zipCode'], ['roofType', 'structure.roofType'],
    ['roofReplacementYear', 'structure.roofReplacementYear'], ['foundationType', 'structure.foundationType'],
    ['sidingType', 'structure.sidingType'], ['electricalPanelAge', 'structure.electricalPanelAgeYears'],
    ['heatingType', 'systems.heatingType'], ['coolingType', 'systems.coolingType'],
    ['waterHeaterType', 'systems.waterHeaterType'], ['hasSmokeDetectors', 'safety.hasSmokeDetectors'],
    ['hasCoDetectors', 'safety.hasCoDetectors'], ['hasSecuritySystem', 'safety.hasSecuritySystem'],
    ['hasFireExtinguisher', 'safety.hasFireExtinguisher'], ['hasSumpPump', 'safety.hasSumpPump'],
    ['hasSumpPumpBackup', 'safety.hasSumpPumpBackup'],
  ];
  const result = direct.filter(([field]) => data[field] !== undefined).map(([, factKey]) => factKey);
  const exteriorKeyByField: Record<string, string> = {
    hasPrivateOutdoorSpace: 'exterior.hasPrivateOutdoorSpace', outdoorSpaceTypes: 'exterior.outdoorSpaceTypes',
    lotSizeSqFt: 'exterior.lotSizeSqFt', hasLawn: 'exterior.hasLawn', hasTreesOrShrubs: 'exterior.hasTreesOrShrubs',
    hasDriveway: 'exterior.hasDriveway', hasFence: 'exterior.hasFence', hasPoolOrSpa: 'exterior.hasPoolOrSpa',
    hasIrrigation: 'exterior.hasIrrigation', hasOutdoorFaucets: 'exterior.hasOutdoorFaucets',
    hasDrainageIssues: 'exterior.hasDrainageIssues',
  };
  for (const field of Object.keys(data.exteriorProfile ?? {})) {
    if (exteriorKeyByField[field]) result.push(exteriorKeyByField[field]);
  }
  for (const responsibility of data.responsibilities ?? []) result.push(responsibilityFactKeyByScope[responsibility.scope]);
  return [...new Set(result)];
}

function evidenceCreateData(propertyId: string, userId: string, factKeys: string[], observedAt: Date) {
  return factKeys.map((factKey) => ({
    propertyId,
    factKey,
    sourceType: 'USER_REPORTED' as const,
    sourceEntityType: 'PROPERTY_PROFILE',
    sourceEntityId: userId,
    confidence: 0.9,
    observedAt,
    verifiedAt: observedAt,
  }));
}

// === INJECT MISSING INTERFACE DEFINITIONS ===
// FIX 1: Add 'warranties: Warranty[]' to include the relation for scoring
export interface PropertyWithAssets extends Property {
  majorAppliances: PropertyApplianceDTO[];
  warranties: Warranty[];
}

export interface ScoredProperty extends PropertyWithAssets {
    healthScore: HealthScoreResult;
    householdRole?: string | null; // Present when the caller is a household member (not the owner)
}

export type PropertyNudge =
  | {
      type: 'RESILIENCE_CHECK';
      source: 'PROPERTY';
      title: string;
      description: string;
      question: string;
      field: 'hasSumpPump' | 'hasSumpPumpBackup';
      options: Array<{ label: string; value: boolean | null }>;
    }
  | {
      type: 'UTILITY_SETUP';
      source: 'PROPERTY';
      title: string;
      description: string;
      question: string;
      field: 'primaryHeatingFuel';
      options: Array<{ label: string; value: string }>;
    }
  | {
      type: 'INSURANCE_GAP_REVIEW';
      source: 'INSURANCE';
      title: string;
      description: string;
      question: string;
      policyId: string;
      totalInventoryValueCents: number;
      personalPropertyLimitCents: number;
      underInsuredCents: number;
    }
  | {
      type: 'EQUITY_CHECK';
      source: 'PROPERTY';
      title: string;
      description: string;
      question: string;
      purchasePriceCents: number | null;
      purchaseDate: Date | null;
      lastAppraisedValueCents: number;
    };

async function hydrateMajorAppliancesFromInventory<T extends { id: string }>(
  property: T
): Promise<T & { majorAppliances: PropertyApplianceDTO[] }> {
  const majorAppliances = await listPropertyApplianceInventory(property.id);
  const financingProfile = (property as any).financingProfile ?? null;
  return {
    ...(property as any),
    purchasePriceCents: financingProfile?.purchasePriceCents ?? null,
    purchaseDate: financingProfile?.purchaseDate ?? null,
    majorAppliances,
  };
}


// --- SCORE ATTACHMENT ---

/**
 * Helper function to calculate and attach the score to a property object.
 * UPDATED: Now fetches full booking objects to support insightFactor-based suppression
 */
async function attachHealthScore(property: PropertyWithAssets): Promise<ScoredProperty> {
    const documentCount = await prisma.document.count({
        where: { propertyId: property.id }
    });

    // UPDATED: Fetch full booking objects instead of just categories
    // We need insightFactor field for precise suppression logic
    const activeBookings = await prisma.booking.findMany({
        where: {
            propertyId: property.id,
            // We check for PENDING (scheduled but not done), CONFIRMED, or IN_PROGRESS.
            // COMPLETED/CANCELLED do not count as "active resolution in progress".
            status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } 
        },
        // Select all fields needed for insightFactor-based suppression
        select: {
            id: true,
            category: true,
            status: true,
            insightFactor: true,    // NEW: Needed for precise suppression
            insightContext: true,   // NEW: Optional context
            propertyId: true,       // Needed for matching
        }
    });

    // Cast to Booking type for compatibility with calculateHealthScore
    const bookingsForScore = activeBookings as any[];

    let healthScore: HealthScoreResult;
    try {
        // UPDATED CALL: Pass full booking objects instead of just category strings
        healthScore = calculateHealthScore(property, documentCount, bookingsForScore);
    } catch (error) {
        logger.error({ err: error }, `CRITICAL: Health score calculation failed for Property ID ${property.id}. Returning default score`);
        // Fallback to a zero score and default insights to prevent server crash
        healthScore = { 
            totalScore: 0, 
            baseScore: 0, 
            unlockedScore: 0, 
            maxPotentialScore: 100,
            maxBaseScore: 55,
            maxExtraScore: 45,
            insights: [{ factor: "Calculation Error", status: "CRASHED", score: 0 }],
            ctaNeeded: true
        };
    }

    return {
        ...property,
        healthScore,
    } as ScoredProperty;
}

/**
 * Get homeowner profile ID for a user
 */
async function getHomeownerProfileId(userId: string): Promise<string> {
  const profile = await prisma.homeownerProfile.findFirst({
    where: { userId },
  });

  if (!profile) {
    throw new Error('Homeowner profile not found');
  }

  return profile.id;
}

async function resolveCoverPhotoDocumentIdForProperty(args: {
  homeownerProfileId: string;
  propertyId: string;
  coverPhotoDocumentId?: string | null;
}): Promise<string | null | undefined> {
  const { homeownerProfileId, propertyId, coverPhotoDocumentId } = args;

  if (coverPhotoDocumentId === undefined) return undefined;
  if (coverPhotoDocumentId === null) return null;

  const photoDoc = await prisma.document.findFirst({
    where: {
      id: coverPhotoDocumentId,
      uploadedBy: homeownerProfileId,
      type: DocumentType.PHOTO,
    },
    select: {
      id: true,
      propertyId: true,
    },
  });

  if (!photoDoc) {
    throw new Error('Cover photo not found or not accessible');
  }

  if (photoDoc.propertyId && photoDoc.propertyId !== propertyId) {
    throw new Error('Cover photo is already linked to another property');
  }

  if (photoDoc.propertyId !== propertyId) {
    await prisma.document.update({
      where: { id: photoDoc.id },
      data: { propertyId },
    });
  }

  return photoDoc.id;
}

// --- CRUD OPERATIONS ---

/**
 * Get all properties for a user
 */
export async function getUserProperties(userId: string): Promise<ScoredProperty[]> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  // Owned properties
  const ownedProperties = await prisma.property.findMany({
    where: { homeownerProfileId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    include: { homeownerProfile: true, warranties: true, coverPhoto: true, financingProfile: true, exteriorProfile: true, responsibilities: true },
  });

  const hydrated = await Promise.all(ownedProperties.map(hydrateMajorAppliancesFromInventory));
  const scored = await Promise.all(hydrated.map(attachHealthScore));

  // Household member properties (other owners' properties the user has been invited to)
  const memberships = await prisma.householdMember.findMany({
    where: {
      userId,
      property: { homeownerProfileId: { not: homeownerProfileId } },
    },
    select: {
      role: true,
      property: { include: { warranties: true, coverPhoto: true, financingProfile: true, exteriorProfile: true, responsibilities: true } },
    },
  });

  const memberProperties = await Promise.all(
    memberships.map(async (m) => {
      const hydratedMember = await hydrateMajorAppliancesFromInventory(m.property as any);
      const scoredMember = await attachHealthScore(hydratedMember as PropertyWithAssets);
      return { ...scoredMember, householdRole: m.role };
    })
  );

  return [...scored, ...memberProperties];
}

/**
 * Create a new property
 */
export async function createProperty(userId: string, data: CreatePropertyData): Promise<ScoredProperty> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  const duplicate = await prisma.property.findFirst({
    where: {
      homeownerProfileId,
      address: { equals: data.address.trim(), mode: 'insensitive' },
      city: { equals: data.city.trim(), mode: 'insensitive' },
      state: { equals: data.state.trim(), mode: 'insensitive' },
      zipCode: data.zipCode.trim(),
    },
  });

  if (duplicate) {
    throw new Error('A property with this address already exists');
  }

  // If this is set as primary, unset other primary properties
  if (data.isPrimary) {
    await prisma.property.updateMany({
      where: { 
        homeownerProfileId,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
  }

  const capturedAt = new Date();
  const property = await prisma.property.create({
    data: {
      homeownerProfileId,
      name: data.name || null,
      address: data.address,
      city: data.city,
      state: data.state.toUpperCase(),
      zipCode: data.zipCode,
      isPrimary: data.isPrimary || false,
      
      // PHASE 2 ADDITIONS - FIX: Ensure all optional fields are explicitly null if undefined/missing
      dwellingType: data.dwellingType ?? 'UNKNOWN',
      ownershipForm: data.ownershipForm ?? 'UNKNOWN',
      propertyUse: data.propertyUse ?? 'UNKNOWN',
      occupancyStatus: data.occupancyStatus ?? 'UNKNOWN',
      propertySize: data.propertySize || null,
      yearBuilt: data.yearBuilt || null,
      bedrooms: data.bedrooms || null,
      bathrooms: data.bathrooms || null,
      heatingType: data.heatingType || null,
      coolingType: data.coolingType || null,
      waterHeaterType: data.waterHeaterType || null,
      roofType: data.roofType || null,
      hvacInstallYear: data.hvacInstallYear || null,
      waterHeaterInstallYear: data.waterHeaterInstallYear || null,
      roofReplacementYear: data.roofReplacementYear || null,
      foundationType: data.foundationType || null,
      sidingType: data.sidingType || null,
      electricalPanelAge: data.electricalPanelAge || null,
      lotSize: data.lotSize || null,
      hasIrrigation: data.hasIrrigation,
      hasDrainageIssues: data.hasDrainageIssues,
      hasSmokeDetectors: data.hasSmokeDetectors,
      hasCoDetectors: data.hasCoDetectors,
      hasSecuritySystem: data.hasSecuritySystem,
      hasFireExtinguisher: data.hasFireExtinguisher,
      hasSumpPump:
        data.hasSumpPump ??
        (data.hasSumpPumpBackup === true ? true : null),
      hasSumpPumpBackup: data.hasSumpPumpBackup ?? null,
      primaryHeatingFuel: data.primaryHeatingFuel?.trim() || null,
      hasSecondaryHeat: data.hasSecondaryHeat ?? null,
      isResilienceVerified: data.isResilienceVerified ?? false,
      isUtilityVerified: data.isUtilityVerified ?? false,
      lastAppraisedValue: data.lastAppraisedValue ?? null,
      lastAppraisalDate: data.lastAppraisalDate ?? null,
      isEquityVerified:
        data.isEquityVerified ??
        (data.purchasePriceCents !== null &&
          data.purchasePriceCents !== undefined &&
          data.purchaseDate !== null &&
          data.purchaseDate !== undefined),
      exteriorProfile: data.exteriorProfile ? { create: data.exteriorProfile } : undefined,
      responsibilities: data.responsibilities?.length ? {
        create: data.responsibilities.map((entry) => ({ scope: entry.scope, party: entry.party, notes: entry.notes ?? null })),
      } : undefined,
      propertyFactEvidence: {
        create: capturedFactKeys(data).map((factKey) => ({
          factKey,
          sourceType: 'USER_REPORTED',
          sourceEntityType: 'PROPERTY_PROFILE',
          sourceEntityId: userId,
          confidence: 0.9,
          observedAt: capturedAt,
          verifiedAt: capturedAt,
        })),
      },
      // Create the owner ACL in the same transaction as the property. A
      // membership failure must never leave a partially-created property.
      householdMembers: {
        create: {
          userId,
          role: 'OWNER',
          isPrimaryOwner: true,
          joinedAt: capturedAt,
        },
      },
      // END PHASE 2 ADDITIONS
    },
  });

  if (data.purchasePriceCents !== undefined || data.purchaseDate !== undefined) {
    await prisma.propertyFinancingProfile.upsert({
      where: { propertyId: property.id },
      create: {
        propertyId: property.id,
        purchasePriceCents: data.purchasePriceCents ?? null,
        purchaseDate: data.purchaseDate ?? null,
      },
      update: {
        ...(data.purchasePriceCents !== undefined ? { purchasePriceCents: data.purchasePriceCents } : {}),
        ...(data.purchaseDate !== undefined ? { purchaseDate: data.purchaseDate } : {}),
      },
    });
  }

  const resolvedCoverPhotoDocumentId = await resolveCoverPhotoDocumentIdForProperty({
    homeownerProfileId,
    propertyId: property.id,
    coverPhotoDocumentId: data.coverPhotoDocumentId,
  });

  if (resolvedCoverPhotoDocumentId !== undefined && resolvedCoverPhotoDocumentId !== null) {
    await prisma.property.update({
      where: { id: property.id },
      data: { coverPhotoDocumentId: resolvedCoverPhotoDocumentId },
    });
  }

  // Analytics: property created
  analyticsEmitter.track({
    eventType: AnalyticsEvent.PROPERTY_CREATED,
    userId,
    propertyId: property.id,
    moduleKey: AnalyticsModule.PROPERTY,
    featureKey: AnalyticsFeature.PROPERTY_PROFILE,
    metadataJson: {
      dwellingType: data.dwellingType ?? 'UNKNOWN',
      state: data.state.toUpperCase(),
      yearBuilt: data.yearBuilt ?? null,
    },
  });

  // Fire-and-forget: seed initial habits for the new property
  getPropertyContext(property.id, { userId }, {
    scopes: ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY'],
  })
    .then((context) => generateHabitsForProperty(property.id, context))
    .catch((err) => logger.error({ err }, '[HABIT-GEN] Initial generation failed for new property'));

  // NEW STEP: Handle assets AFTER property creation
  if (data.majorAppliances !== undefined) {
    await syncPropertyApplianceInventoryItems(property.id, data.majorAppliances || []);
  }

  // Cold-start convergence: evaluate the current season before the newly
  // created Home is returned, rather than waiting for the overnight worker.
  await reconcileCurrentSeasonalChecklist(property.id, userId);

  // PHASE 2 ADDITION: FIX: Use the comprehensive job enqueuer
  // This triggers both Risk and FES calculations
  await JobQueueService.enqueuePropertyIntelligenceJobs(property.id);

  // Fetch the full property and then attach its canonical appliance projection.
  const fullProperty = await prisma.property.findUnique({
      where: { id: property.id },
      include: { 
          // FIX 4: Include warranties
          warranties: true,
          coverPhoto: true,
          financingProfile: true,
          exteriorProfile: true,
          responsibilities: true,
      }
  });

  // ATTACH SCORE: Calculate and attach score before returning
  // Ensure fullProperty is not null (shouldn't be right after creation)
  const hydrated = await hydrateMajorAppliancesFromInventory(fullProperty as any);
  return attachHealthScore(hydrated as PropertyWithAssets);
}

/**
 * Get a property by ID — accepts owner or active household member
 */
export async function getPropertyById(propertyId: string, userId: string): Promise<ScoredProperty | null> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  // Primary path: user owns the property
  let property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfileId },
    include: { warranties: true, coverPhoto: true, financingProfile: true, exteriorProfile: true, responsibilities: true },
  });

  let householdRole: string | null = null;

  if (!property) {
    // Fallback: user is a household member of this property
    const membership = await prisma.householdMember.findUnique({
      where: { propertyId_userId: { propertyId, userId } },
      select: {
        role: true,
        property: { include: { warranties: true, coverPhoto: true, financingProfile: true, exteriorProfile: true, responsibilities: true } },
      },
    });
    if (!membership) return null;
    property = membership.property as any;
    householdRole = membership.role;
  }

  const hydrated = await hydrateMajorAppliancesFromInventory(property as any);
  const scored = await attachHealthScore(hydrated as PropertyWithAssets);
  return { ...scored, householdRole };
}

export async function getNextPropertyNudge(propertyId: string): Promise<PropertyNudge | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      hasSumpPump: true,
      hasSumpPumpBackup: true,
      primaryHeatingFuel: true,
      isResilienceVerified: true,
      isUtilityVerified: true,
      financingProfile: { select: { purchasePriceCents: true, purchaseDate: true } },
      lastAppraisedValue: true,
      isEquityVerified: true,
    },
  });

  if (!property) return null;

  const isSumpPresenceMissing = property.hasSumpPump === null && !property.isResilienceVerified;

  if (isSumpPresenceMissing) {
    return {
      type: 'RESILIENCE_CHECK',
      source: 'PROPERTY',
      title: 'Home resilience check',
      description: 'Confirm whether this home has a sump pump to improve heavy-rain guidance.',
      question: 'Does this home have a sump pump?',
      field: 'hasSumpPump',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
        { label: 'Not Sure', value: null },
      ],
    };
  }

  if (property.hasSumpPump === true && property.hasSumpPumpBackup === null && !property.isResilienceVerified) {
    return {
      type: 'RESILIENCE_CHECK',
      source: 'PROPERTY',
      title: 'Sump pump backup',
      description: 'Backup power can keep a confirmed sump pump running during an outage.',
      question: 'Does the sump pump have battery or generator backup?',
      field: 'hasSumpPumpBackup',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
        { label: 'Not Sure', value: null },
      ],
    };
  }

  const normalizedFuel = String(property.primaryHeatingFuel || '').trim();
  const isUtilityMissing = normalizedFuel.length === 0 && !property.isUtilityVerified;

  if (isUtilityMissing) {
    return {
      type: 'UTILITY_SETUP',
      source: 'PROPERTY',
      title: 'Utility setup',
      description: 'Set your primary heating fuel to improve risk and cost guidance.',
      question: 'What is your primary heating fuel?',
      field: 'primaryHeatingFuel',
      options: [
        { label: 'Natural Gas', value: 'NATURAL_GAS' },
        { label: 'Electric', value: 'ELECTRIC' },
        { label: 'Propane', value: 'PROPANE' },
        { label: 'Fuel Oil', value: 'FUEL_OIL' },
        { label: 'Wood / Pellet', value: 'WOOD_PELLET' },
        { label: 'Other', value: 'OTHER' },
      ],
    };
  }

  const [hasPendingCriticalVerification, unverifiedPolicy] = await Promise.all([
    hasPendingCriticalAssetVerification(propertyId),
    getUnverifiedActiveInsurancePolicy(propertyId),
  ]);

  if (!hasPendingCriticalVerification && unverifiedPolicy) {
    const protectionGap = await calculateProtectionGap(propertyId);

    return {
      type: 'INSURANCE_GAP_REVIEW',
      source: 'INSURANCE',
      title: 'Insurance declarations check',
      description:
        'Are you fully covered? Snap a photo of your Insurance Declarations page to see if your coverage matches your verified inventory value.',
      question:
        'Are you fully covered? Snap a photo of your Insurance Declarations page to see if your coverage matches your verified inventory value.',
      policyId: unverifiedPolicy.id,
      totalInventoryValueCents: protectionGap.totalInventoryValueCents,
      personalPropertyLimitCents: protectionGap.personalPropertyLimitCents,
      underInsuredCents: protectionGap.underInsuredCents,
    };
  }

  const isEquityMissing =
    !property.isEquityVerified ||
    property.financingProfile?.purchasePriceCents === null ||
    property.financingProfile?.purchaseDate === null;

  if (!hasPendingCriticalVerification && isEquityMissing) {
    return {
      type: 'EQUITY_CHECK',
      source: 'PROPERTY',
      title: 'Track your home equity',
      description:
        "What is your home worth today? Enter your purchase details to track your equity and see how much value your maintenance has added.",
      question:
        "What is your home worth today? Enter your purchase details to track your equity and see how much value your maintenance has added.",
      purchasePriceCents: property.financingProfile?.purchasePriceCents ?? null,
      purchaseDate: property.financingProfile?.purchaseDate ?? null,
      lastAppraisedValueCents: property.lastAppraisedValue ?? 0,
    };
  }

  return null;
}

/**
 * Update a property
 */
export async function updateProperty(
  propertyId: string,
  userId: string,
  data: UpdatePropertyData
): Promise<ScoredProperty> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  // Verify ownership
  const existingProperty = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfileId,
    },
    include: { financingProfile: true },
  });

  if (!existingProperty) {
    throw new Error('Property not found');
  }

  // If setting as primary, unset other primary properties
  if (data.isPrimary && !existingProperty.isPrimary) {
    await prisma.property.updateMany({
      where: {
        homeownerProfileId,
        isPrimary: true,
        id: { not: propertyId },
      },
      data: { isPrimary: false },
    });
  }

  // NEW STEP: Sync assets if they are present in the update payload.
  // The 'undefined' check ensures we only sync if the frontend explicitly sends the field (which it does)
  if (data.majorAppliances !== undefined) {
    await syncPropertyApplianceInventoryItems(propertyId, data.majorAppliances || []);
  }

  const existingHeatingFuel = String(existingProperty.primaryHeatingFuel || '').trim();
  const nextHeatingFuel =
    data.primaryHeatingFuel !== undefined
      ? (data.primaryHeatingFuel?.trim() || null)
      : (existingProperty.primaryHeatingFuel?.trim() || null);

  const completedResilienceNudge =
    (existingProperty.hasSumpPump === null && data.hasSumpPump !== undefined && data.hasSumpPump !== null)
    || (existingProperty.hasSumpPump === true
      && existingProperty.hasSumpPumpBackup === null
      && data.hasSumpPumpBackup !== undefined
      && data.hasSumpPumpBackup !== null);

  const completedUtilityNudge = existingHeatingFuel.length === 0 && !!nextHeatingFuel;

  const nextPurchasePriceCents =
    data.purchasePriceCents !== undefined ? data.purchasePriceCents : existingProperty.financingProfile?.purchasePriceCents ?? null;
  const nextPurchaseDate =
    data.purchaseDate !== undefined ? data.purchaseDate : existingProperty.financingProfile?.purchaseDate ?? null;
  const nextIsEquityVerified =
    data.isEquityVerified ??
    (nextPurchasePriceCents !== null && nextPurchaseDate !== null);
  const completedEquityNudge = !existingProperty.isEquityVerified && nextIsEquityVerified;
  

  // Use a proper type for updatePayload for better type checking
  const updatePayload: Partial<Omit<CreatePropertyData, 'address' | 'city' | 'state' | 'zipCode' | 'majorAppliances' | 'exteriorProfile' | 'responsibilities'>> & {
    name?: string | null;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    isPrimary?: boolean;
  } = {};


  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.address !== undefined) updatePayload.address = data.address;
  if (data.city !== undefined) updatePayload.city = data.city;
  if (data.state !== undefined) updatePayload.state = data.state.toUpperCase();
  if (data.zipCode !== undefined) updatePayload.zipCode = data.zipCode;
  if (data.isPrimary !== undefined) updatePayload.isPrimary = data.isPrimary;
  
  // PHASE 2 ADDITIONS - Dynamically set new fields for update
  // FIX: Ensure optional fields are explicitly handled to prevent undefined data corruption
  if (data.dwellingType !== undefined) updatePayload.dwellingType = data.dwellingType;
  if (data.ownershipForm !== undefined) updatePayload.ownershipForm = data.ownershipForm;
  if (data.propertyUse !== undefined) updatePayload.propertyUse = data.propertyUse;
  if (data.occupancyStatus !== undefined) updatePayload.occupancyStatus = data.occupancyStatus;
  if (data.propertySize !== undefined) updatePayload.propertySize = data.propertySize || null;
  if (data.yearBuilt !== undefined) updatePayload.yearBuilt = data.yearBuilt || null;
  if (data.bedrooms !== undefined) updatePayload.bedrooms = data.bedrooms || null;
  if (data.bathrooms !== undefined) updatePayload.bathrooms = data.bathrooms || null;
  if (data.heatingType !== undefined) updatePayload.heatingType = data.heatingType || null;
  if (data.coolingType !== undefined) updatePayload.coolingType = data.coolingType || null;
  if (data.waterHeaterType !== undefined) updatePayload.waterHeaterType = data.waterHeaterType || null;
  if (data.roofType !== undefined) updatePayload.roofType = data.roofType || null;
  if (data.hvacInstallYear !== undefined) updatePayload.hvacInstallYear = data.hvacInstallYear || null;
  if (data.waterHeaterInstallYear !== undefined) updatePayload.waterHeaterInstallYear = data.waterHeaterInstallYear || null;
  if (data.roofReplacementYear !== undefined) updatePayload.roofReplacementYear = data.roofReplacementYear || null;
  if (data.foundationType !== undefined) updatePayload.foundationType = data.foundationType || null;
  if (data.sidingType !== undefined) updatePayload.sidingType = data.sidingType || null;
  if (data.electricalPanelAge !== undefined) updatePayload.electricalPanelAge = data.electricalPanelAge || null;
  if (data.lotSize !== undefined) updatePayload.lotSize = data.lotSize || null;
  
  if (data.hasIrrigation !== undefined) updatePayload.hasIrrigation = data.hasIrrigation;
  if (data.hasDrainageIssues !== undefined) updatePayload.hasDrainageIssues = data.hasDrainageIssues;
  if (data.hasSmokeDetectors !== undefined) updatePayload.hasSmokeDetectors = data.hasSmokeDetectors;
  if (data.hasCoDetectors !== undefined) updatePayload.hasCoDetectors = data.hasCoDetectors;
  if (data.hasSecuritySystem !== undefined) updatePayload.hasSecuritySystem = data.hasSecuritySystem;
  if (data.hasFireExtinguisher !== undefined) updatePayload.hasFireExtinguisher = data.hasFireExtinguisher;
  if (data.hasSumpPump !== undefined) {
    updatePayload.hasSumpPump = data.hasSumpPump;
    if (data.hasSumpPump === false) {
      updatePayload.hasSumpPumpBackup = null;
    }
    if (data.isResilienceVerified === undefined) {
      updatePayload.isResilienceVerified = data.hasSumpPump === false;
    }
  }
  if (data.hasSumpPumpBackup !== undefined) {
    updatePayload.hasSumpPumpBackup = data.hasSumpPumpBackup;
    if (data.hasSumpPumpBackup === true) updatePayload.hasSumpPump = true;
    if (data.isResilienceVerified === undefined) {
      updatePayload.isResilienceVerified = data.hasSumpPumpBackup !== null;
    }
  }
  if (data.primaryHeatingFuel !== undefined) {
    const normalizedFuel = data.primaryHeatingFuel?.trim() || null;
    updatePayload.primaryHeatingFuel = normalizedFuel;
    if (data.isUtilityVerified === undefined) {
      updatePayload.isUtilityVerified = normalizedFuel !== null;
    }
  }
  if (data.hasSecondaryHeat !== undefined) updatePayload.hasSecondaryHeat = data.hasSecondaryHeat;
  if (data.isResilienceVerified !== undefined) updatePayload.isResilienceVerified = data.isResilienceVerified;
  if (data.isUtilityVerified !== undefined) updatePayload.isUtilityVerified = data.isUtilityVerified;
  if (data.lastAppraisedValue !== undefined) updatePayload.lastAppraisedValue = data.lastAppraisedValue ?? null;
  if (data.lastAppraisalDate !== undefined) updatePayload.lastAppraisalDate = data.lastAppraisalDate ?? null;
  if (data.isEquityVerified !== undefined) {
    updatePayload.isEquityVerified = data.isEquityVerified;
  } else if (data.purchasePriceCents !== undefined || data.purchaseDate !== undefined) {
    updatePayload.isEquityVerified = nextPurchasePriceCents !== null && nextPurchaseDate !== null;
  }
  if (data.coverPhotoDocumentId !== undefined) {
    const resolvedCoverPhotoDocumentId = await resolveCoverPhotoDocumentIdForProperty({
      homeownerProfileId,
      propertyId,
      coverPhotoDocumentId: data.coverPhotoDocumentId,
    });
    updatePayload.coverPhotoDocumentId = resolvedCoverPhotoDocumentId ?? null;
  }

  const propertyUpdateData: Prisma.PropertyUpdateInput = {
    ...updatePayload,
    ...(data.exteriorProfile !== undefined ? {
      exteriorProfile: {
        upsert: { create: data.exteriorProfile, update: data.exteriorProfile },
      },
    } : {}),
  };
  const factKeys = capturedFactKeys(data);
  const capturedAt = new Date();
  const property = await prisma.$transaction(async (tx) => {
    const updated = await tx.property.update({
      where: { id: propertyId },
      data: propertyUpdateData,
    });

    for (const entry of data.responsibilities ?? []) {
      await tx.propertyResponsibility.upsert({
        where: { propertyId_scope: { propertyId, scope: entry.scope } },
        create: { propertyId, scope: entry.scope, party: entry.party, notes: entry.notes ?? null },
        update: { party: entry.party, notes: entry.notes ?? null },
      });
    }

    if (factKeys.length > 0) {
      await tx.propertyFactEvidence.updateMany({
        where: { propertyId, factKey: { in: factKeys }, supersededAt: null },
        data: { supersededAt: capturedAt },
      });
      await tx.propertyFactEvidence.createMany({
        data: evidenceCreateData(propertyId, userId, factKeys, capturedAt),
      });
    }

    return updated;
  });

  if ((data.responsibilities?.length ?? 0) > 0) {
    await reconcileCoverageGuidanceJourneyApplicability(propertyId);
  }

  if (data.purchasePriceCents !== undefined || data.purchaseDate !== undefined) {
    await prisma.propertyFinancingProfile.upsert({
      where: { propertyId },
      create: {
        propertyId,
        purchasePriceCents: data.purchasePriceCents ?? null,
        purchaseDate: data.purchaseDate ?? null,
      },
      update: {
        ...(data.purchasePriceCents !== undefined ? { purchasePriceCents: data.purchasePriceCents } : {}),
        ...(data.purchaseDate !== undefined ? { purchaseDate: data.purchaseDate } : {}),
      },
    });
  }

  // Analytics: property updated (only when there are actual changes)
  if (Object.keys(propertyUpdateData).length > 0) {
    analyticsEmitter.track({
      eventType: AnalyticsEvent.PROPERTY_UPDATED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.PROPERTY,
      featureKey: AnalyticsFeature.PROPERTY_PROFILE,
    });
  }

  if (completedResilienceNudge || completedUtilityNudge || completedEquityNudge) {
    await incrementStreak(propertyId);
  }

  // PHASE 2 ADDITION: FIX: Use the comprehensive job enqueuer
  const hasResponsibilityUpdates = (data.responsibilities?.length ?? 0) > 0;
  if (Object.keys(propertyUpdateData).length > 0 || hasResponsibilityUpdates) {
      await JobQueueService.enqueuePropertyIntelligenceJobs(propertyId);
      // A profile correction may turn UNKNOWN seasonal applicability into a
      // supported task. Reconciliation is idempotent for the current season.
      await reconcileCurrentSeasonalChecklist(propertyId, userId);
  }

  const weatherContextFields = new Set([
    'hasDrainageIssues',
    'hasSumpPump',
    'hasSumpPumpBackup',
    'coolingType',
    'hvacInstallYear',
    'roofType',
    'roofReplacementYear',
    'heatingType',
    'hasSecondaryHeat',
  ]);
  const shouldReevaluateWeather = Object.keys(updatePayload).some(field => weatherContextFields.has(field));
  if (shouldReevaluateWeather) {
    try {
      await reevaluateActiveWeatherIncidentsForProperty(propertyId);
    } catch (error) {
      logger.warn({ err: error, propertyId }, '[PROPERTY] Weather incident reevaluation failed after profile update');
    }
  }

  // Fetch the full property and then attach its canonical appliance projection.
  const updatedProperty = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { 
          // FIX 6: Include warranties
          warranties: true,
          coverPhoto: true,
          financingProfile: true,
          exteriorProfile: true,
          responsibilities: true,
      }
  });

  // ATTACH SCORE: Calculate and attach score before returning
  const hydrated = await hydrateMajorAppliancesFromInventory(updatedProperty as any);
  return attachHealthScore(hydrated as PropertyWithAssets);

}

/**
 * Delete a property
 */
export async function deleteProperty(propertyId: string, userId: string) {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  // Verify ownership
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfileId,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // Bookings reference the property directly (no cascade), so any booking —
  // not just an active one — blocks deletion at the database level. Check
  // upfront so the error message matches what actually happens.
  const bookingCount = await prisma.booking.count({
    where: { propertyId },
  });

  if (bookingCount > 0) {
    throw new Error('Cannot delete property with existing bookings');
  }

  try {
    await prisma.property.delete({
      where: { id: propertyId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new Error('Cannot delete property because other records still reference it');
    }
    throw error;
  }
}

// ============================================================================
// PROPERTY ACTIVATION UTILITY
// ============================================================================

/**
 * Idempotently marks a property as ACTIVATED and emits a PROPERTY_ACTIVATED
 * analytics event exactly once.
 *
 * Safe to call multiple times — if the property is already ACTIVATED the DB
 * write and event emission are both skipped.
 *
 * Activation signals (callers should invoke this after meaningful milestones):
 *   - Digital twin successfully initialized
 *   - Onboarding completion (if that flow is added later)
 *   - Manual admin activation (future)
 *
 * Backfill / replay safety: The status check prevents double-counting even if
 * this function is called during a replay or backfill run.
 */
export async function maybeMarkPropertyActivated(
  propertyId: string,
  userId: string | null,
): Promise<void> {
  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, activationStatus: true },
    });

    if (!property) return;
    if (property.activationStatus === 'ACTIVATED') return; // Already activated — idempotent

    const now = new Date();
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        activationStatus: 'ACTIVATED',
        activatedAt: now,
      },
    });

    logger.info(`[Property] marked ACTIVATED — propertyId=${propertyId}`);

    // Emit analytics event — fire-and-forget, will not throw
    analyticsEmitter.propertyActivated({
      userId: userId ?? undefined,
      propertyId,
      occurredAt: now,
    });
  } catch (err) {
    // Non-fatal: activation marking should never break the caller's workflow
    logger.error({ err }, `[Property] maybeMarkPropertyActivated failed — propertyId=${propertyId}`);
  }
}
