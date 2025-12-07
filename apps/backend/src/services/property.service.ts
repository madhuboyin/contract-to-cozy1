// apps/backend/src/services/property.service.ts

import { PrismaClient, Property, PropertyType, OwnershipType, HeatingType, CoolingType, WaterHeaterType, RoofType, HomeAsset, Prisma, ChecklistItem, Warranty } from '@prisma/client';
// IMPORT REQUIRED: Import the utility and interface
import { calculateHealthScore, HealthScoreResult } from '../utils/propertyScore.util'; 

// NEW IMPORTS FOR PHASE 2: Risk Assessment Triggering
import JobQueueService from './JobQueue.service';
import { PropertyIntelligenceJobType } from '../config/risk-job-types';

import { prisma } from '../lib/prisma';

// --- NEW STRUCTURED INPUT INTERFACES ---

interface HomeAssetInput {
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
  propertyType?: PropertyType | null;
  propertySize?: number | null; // FIX
  yearBuilt?: number | null;     // FIX
  
  // Layer 2 - Advanced Fields (Migrated and New)
  bedrooms?: number | null;
  bathrooms?: number | null;
  ownershipType?: OwnershipType | null;
  occupantsCount?: number | null;
  heatingType?: HeatingType | null;
  coolingType?: CoolingType | null;
  waterHeaterType?: WaterHeaterType | null;
  roofType?: RoofType | null;
  hvacInstallYear?: number | null;
  waterHeaterInstallYear?: number | null;
  roofReplacementYear?: number | null;
  foundationType?: string | null;
  sidingType?: string | null;
  electricalPanelAge?: number | null;
  lotSize?: number | null; // FIX
  hasIrrigation?: boolean;
  hasDrainageIssues?: boolean;
  hasSmokeDetectors?: boolean;
  hasCoDetectors?: boolean;
  hasSecuritySystem?: boolean;
  hasFireExtinguisher?: boolean;
  
  homeAssets?: HomeAssetInput[];
}

interface UpdatePropertyData extends Partial<CreatePropertyData> {
  // All fields are optional for update
}

// === INJECT MISSING INTERFACE DEFINITIONS ===
// FIX 1: Add 'warranties: Warranty[]' to include the relation for scoring
export interface PropertyWithAssets extends Property {
    homeAssets: HomeAsset[];
    warranties: Warranty[];
}

export interface ScoredProperty extends PropertyWithAssets {
    healthScore: HealthScoreResult;
}

// [NEW INTERFACE] Defines the minimal subset of Risk Report data needed for AI context.
interface RiskAssessmentReportForAI {
  riskScore: number;
  financialExposureTotal: Prisma.Decimal;
  details: Prisma.InputJsonValue;
  lastCalculatedAt: Date;
}

// Type for renewals (combines warranties and insurance policies)
export interface Renewal {
  id: string;
  expiryDate: Date;
  type: string;
}

// [UPDATED INTERFACE] Defines the minimal subset of data needed for AI context.
export interface PropertyAIGuidance {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: PropertyType | null;
  yearBuilt: number | null;
  heatingType: HeatingType | null;
  coolingType: CoolingType | null;
  roofType: RoofType | null;
  hvacInstallYear: number | null;
  // FIX 1: Add Risk Report relation
  riskReport: RiskAssessmentReportForAI | null; 
  // FIX 2: Add missing relations for maintenance and renewals
  maintenanceTasks: ChecklistItem[];
  renewals: Renewal[];
}
// ===============================================

// --- CORE ASSET SYNC LOGIC (FIXED) ---

/**
 * Helper function to create/update/delete HomeAsset records.
 */
async function syncHomeAssets(propertyId: string, incomingAssets: HomeAssetInput[]): Promise<void> {
  
  // 1. Fetch existing assets for the property
  const existingAssets = await prisma.homeAsset.findMany({
    where: { propertyId: propertyId },
  });

  const operations: Prisma.PrismaPromise<any>[] = [];
  const existingAssetMap = new Map(existingAssets.map(a => [a.assetType, a]));
  const incomingAssetTypes = new Set(incomingAssets.map(a => a.type));

  // 2. Identify and queue UPDATE or CREATE operations
  for (const incoming of incomingAssets) {
    if (!incoming.type) continue;
    
    // Check if asset already exists (by assetType)
    const existing = existingAssetMap.get(incoming.type);

    if (existing) {
      // Update existing asset
      if (existing.installationYear !== incoming.installYear) {
        operations.push(prisma.homeAsset.update({
          where: { id: existing.id },
          data: { installationYear: incoming.installYear },
        }));
      }
    } else {
      // Create new asset
      operations.push(prisma.homeAsset.create({
        data: {
          propertyId: propertyId,
          assetType: incoming.type as any, // Cast to match Enum/Type
          installationYear: incoming.installYear,
        },
      }));
    }
  }

  // 3. Identify and queue DELETE operations
  for (const existing of existingAssets) {
    if (!incomingAssetTypes.has(existing.assetType)) {
      // Delete asset that was present but is now missing from the incoming list
      operations.push(prisma.homeAsset.delete({
        where: { id: existing.id },
      }));
    }
  }

  // 4. Execute all operations in a single transaction
  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
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
        console.error(`CRITICAL: Health score calculation failed for Property ID ${property.id}. Returning default score.`, error);
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

// --- CRUD OPERATIONS ---

/**
 * Get all properties for a user
 */
export async function getUserProperties(userId: string): Promise<ScoredProperty[]> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  const properties = await prisma.property.findMany({
    where: { homeownerProfileId },
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      homeAssets: true, 
      // FIX 3: Include warranties in the fetch query
      warranties: true, 
    }
  });
  
  // MAP REQUIRED: Calculate and attach score for all properties
  const scoredProperties = await Promise.all(
      properties.map(attachHealthScore)
  );

  return scoredProperties;
}

/**
 * Create a new property
 */
export async function createProperty(userId: string, data: CreatePropertyData): Promise<ScoredProperty> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

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
      propertyType: data.propertyType || null,
      propertySize: data.propertySize || null,
      yearBuilt: data.yearBuilt || null,
      bedrooms: data.bedrooms || null,
      bathrooms: data.bathrooms || null,
      ownershipType: data.ownershipType || null,
      occupantsCount: data.occupantsCount || null,
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
      // END PHASE 2 ADDITIONS
    },
  });

  // NEW STEP: Handle assets AFTER property creation
  if (data.homeAssets && data.homeAssets.length > 0) {
    await syncHomeAssets(property.id, data.homeAssets);
  }

  // PHASE 2 ADDITION: FIX: Use the comprehensive job enqueuer
  // This triggers both Risk and FES calculations
  await JobQueueService.enqueuePropertyIntelligenceJobs(property.id);

  // FETCH FULL PROPERTY: Must include homeAssets and warranties for scoring/return
  const fullProperty = await prisma.property.findUnique({
      where: { id: property.id },
      include: { 
          homeAssets: true, 
          // FIX 4: Include warranties
          warranties: true,
      }
  });

  // ATTACH SCORE: Calculate and attach score before returning
  // Ensure fullProperty is not null (shouldn't be right after creation)
  return attachHealthScore(fullProperty as PropertyWithAssets);
}

/**
 * Get a property by ID (verify ownership)
 */
export async function getPropertyById(propertyId: string, userId: string): Promise<ScoredProperty | null> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfileId,
    },
    include: {
      homeAssets: true, 
      // FIX 5: Include warranties in the fetch query
      warranties: true, 
    }
  });

  if (!property) return null;

  // ATTACH SCORE: Calculate and attach score before returning
  return attachHealthScore(property);
}

/**
 * [FIXED FUNCTION] Get a subset of property data required for AI context, 
 * enforcing ownership and now including the Risk Report, Maintenance, and Renewals.
 */
export async function getPropertyContextForAI(propertyId: string, userId: string): Promise<PropertyAIGuidance | null> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfileId, // Ownership verification
    },
    select: { // Select only fields relevant for AI personalization
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      propertyType: true,
      yearBuilt: true,
      heatingType: true,
      coolingType: true,
      roofType: true,
      hvacInstallYear: true,
      // === FIX 1: Add riskReport selection here ===
      riskReport: {
        select: {
          riskScore: true,
          financialExposureTotal: true,
          details: true, // Fetch the asset risk details JSON
          lastCalculatedAt: true,
        }
      },
      // === FIX 2: Add missing relations for maintenance and renewals ===
      checklistItems: true,
      warranties: {
        select: {
          id: true,
          expiryDate: true,
          providerName: true,
        }
      },
      insurancePolicies: {
        select: {
          id: true,
          expiryDate: true,
          carrierName: true,
          coverageType: true,
        }
      },
    }
  });

  if (!property) {
    return null;
  }

  // Transform to match PropertyAIGuidance interface
  const renewals: Renewal[] = [
    ...property.warranties.map(w => ({
      id: w.id,
      expiryDate: w.expiryDate,
      type: `Warranty: ${w.providerName}`,
    })),
    ...property.insurancePolicies.map(p => ({
      id: p.id,
      expiryDate: p.expiryDate,
      type: `Insurance: ${p.carrierName}${p.coverageType ? ` (${p.coverageType})` : ''}`,
    })),
  ];

  return {
    ...property,
    maintenanceTasks: property.checklistItems,
    renewals,
  } as PropertyAIGuidance; 
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
  if (data.homeAssets !== undefined) {
      await syncHomeAssets(propertyId, data.homeAssets);
  }

  // Use a proper type for updatePayload for better type checking
  const updatePayload: Partial<Omit<CreatePropertyData, 'address' | 'city' | 'state' | 'zipCode' | 'homeAssets'>> & {
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
  if (data.propertyType !== undefined) updatePayload.propertyType = data.propertyType || null;
  if (data.propertySize !== undefined) updatePayload.propertySize = data.propertySize || null;
  if (data.yearBuilt !== undefined) updatePayload.yearBuilt = data.yearBuilt || null;
  if (data.bedrooms !== undefined) updatePayload.bedrooms = data.bedrooms || null;
  if (data.bathrooms !== undefined) updatePayload.bathrooms = data.bathrooms || null;
  if (data.ownershipType !== undefined) updatePayload.ownershipType = data.ownershipType || null;
  if (data.occupantsCount !== undefined) updatePayload.occupantsCount = data.occupantsCount || null;
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
  // applianceAges is explicitly excluded here
  // END PHASE 2 ADDITIONS

  const property = await prisma.property.update({
    where: { id: propertyId },
    data: updatePayload,
  });

  // PHASE 2 ADDITION: FIX: Use the comprehensive job enqueuer
  if (Object.keys(updatePayload).length > 0) {
      await JobQueueService.enqueuePropertyIntelligenceJobs(propertyId);
  }

  // FETCH FULL PROPERTY: Must include homeAssets and warranties for return/scoring
  const updatedProperty = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { 
          homeAssets: true,
          // FIX 6: Include warranties
          warranties: true,
      }
  });

  // ATTACH SCORE: Calculate and attach score before returning
  return attachHealthScore(updatedProperty as PropertyWithAssets);
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

  // Check if property has active bookings
  const activeBookings = await prisma.booking.count({
    where: {
      propertyId,
      status: {
        in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'],
      },
    },
  });

  if (activeBookings > 0) {
    throw new Error('Cannot delete property with active bookings');
  }

  await prisma.property.delete({
    where: { id: propertyId },
  });
}