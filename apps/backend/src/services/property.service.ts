// apps/backend/src/services/property.service.ts

import { PrismaClient, Property, PropertyType, OwnershipType, HeatingType, CoolingType, WaterHeaterType, RoofType, HomeAsset, Prisma } from '@prisma/client';
// IMPORT REQUIRED: Import the utility and interface
import { calculateHealthScore, HealthScoreResult } from '../utils/propertyScore.util'; 

// NEW IMPORTS FOR PHASE 2: Risk Assessment Triggering
import JobQueueService from './JobQueue.service';
import { RISK_JOB_TYPES } from '../config/risk-job-types';

const prisma = new PrismaClient();

// --- NEW STRUCTURED INPUT INTERFACES ---

interface HomeAssetInput {
  id?: string; // Optional: Used for client-side tracking, ignored by service but kept for consistency
  type: string; // The canonical appliance type (e.g., 'DISHWASHER')
  installYear: number; // The installation year
}

// REPLACED INTERFACES with complete definitions matching the extended Prisma Property model
interface CreatePropertyData {
  name?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary?: boolean;

  // Layer 1 - Basic/Migrated Fields
  propertyType?: PropertyType;
  propertySize?: number;
  yearBuilt?: number;
  
  // Layer 2 - Advanced Fields (Migrated and New)
  bedrooms?: number;
  bathrooms?: number;
  ownershipType?: OwnershipType;
  occupantsCount?: number;
  heatingType?: HeatingType;
  coolingType?: CoolingType;
  waterHeaterType?: WaterHeaterType;
  roofType?: RoofType;
  hvacInstallYear?: number;
  waterHeaterInstallYear?: number;
  roofReplacementYear?: number;
  foundationType?: string;
  sidingType?: string;
  electricalPanelAge?: number;
  lotSize?: number;
  hasIrrigation?: boolean;
  hasDrainageIssues?: boolean;
  hasSmokeDetectors?: boolean;
  hasCoDetectors?: boolean;
  hasSecuritySystem?: boolean;
  hasFireExtinguisher?: boolean;
  
  homeAssets?: HomeAssetInput[]; // <-- NEW: Array of structured assets
}

interface UpdatePropertyData extends Partial<CreatePropertyData> {
  // All fields are optional for update
}

// --- NEW DB RETRIEVAL AND RESPONSE INTERFACES ---

// DB retrieval interface including the mandatory HomeAssets relation
export interface PropertyWithAssets extends Property {
    homeAssets: HomeAsset[];
}

// NEW INTERFACE for API response
export interface ScoredProperty extends PropertyWithAssets {
    healthScore: HealthScoreResult;
}

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
 */
async function attachHealthScore(property: PropertyWithAssets): Promise<ScoredProperty> {
    const documentCount = await prisma.document.count({
        where: { propertyId: property.id }
    });
    // FIX: Add try/catch block for defensive coding against errors in scoring utility
    let healthScore: HealthScoreResult;
    try {
        // The scoring utility must now be updated to consume property.homeAssets
        healthScore = calculateHealthScore(property, documentCount);
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
      homeAssets: true, // MUST INCLUDE new relation
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
      
      // PHASE 2 ADDITIONS - New Property Details
      propertyType: data.propertyType,
      propertySize: data.propertySize,
      yearBuilt: data.yearBuilt,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      ownershipType: data.ownershipType,
      occupantsCount: data.occupantsCount,
      heatingType: data.heatingType,
      coolingType: data.coolingType,
      waterHeaterType: data.waterHeaterType,
      roofType: data.roofType,
      hvacInstallYear: data.hvacInstallYear,
      waterHeaterInstallYear: data.waterHeaterInstallYear,
      roofReplacementYear: data.roofReplacementYear,
      foundationType: data.foundationType,
      sidingType: data.sidingType,
      electricalPanelAge: data.electricalPanelAge,
      lotSize: data.lotSize,
      hasIrrigation: data.hasIrrigation,
      hasDrainageIssues: data.hasDrainageIssues,
      hasSmokeDetectors: data.hasSmokeDetectors,
      hasCoDetectors: data.hasCoDetectors,
      hasSecuritySystem: data.hasSecuritySystem,
      hasFireExtinguisher: data.hasFireExtinguisher,
      // REMOVED: applianceAges was here
      // END PHASE 2 ADDITIONS
    },
  });

  // NEW STEP: Handle assets AFTER property creation
  if (data.homeAssets && data.homeAssets.length > 0) {
    await syncHomeAssets(property.id, data.homeAssets);
  }

  // PHASE 2 ADDITION: Trigger risk calculation after property creation
  await JobQueueService.addJob(RISK_JOB_TYPES.CALCULATE_RISK, { propertyId: property.id });

  // FETCH FULL PROPERTY: Must include homeAssets for scoring/return
  const fullProperty = await prisma.property.findUnique({
      where: { id: property.id },
      include: { homeAssets: true }
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
      homeAssets: true, // MUST INCLUDE new relation
    }
  });

  if (!property) return null;

  // ATTACH SCORE: Calculate and attach score before returning
  return attachHealthScore(property);
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
  if (data.propertyType !== undefined) updatePayload.propertyType = data.propertyType;
  if (data.propertySize !== undefined) updatePayload.propertySize = data.propertySize;
  if (data.yearBuilt !== undefined) updatePayload.yearBuilt = data.yearBuilt;
  if (data.bedrooms !== undefined) updatePayload.bedrooms = data.bedrooms;
  if (data.bathrooms !== undefined) updatePayload.bathrooms = data.bathrooms;
  if (data.ownershipType !== undefined) updatePayload.ownershipType = data.ownershipType;
  if (data.occupantsCount !== undefined) updatePayload.occupantsCount = data.occupantsCount;
  if (data.heatingType !== undefined) updatePayload.heatingType = data.heatingType;
  if (data.coolingType !== undefined) updatePayload.coolingType = data.coolingType;
  if (data.waterHeaterType !== undefined) updatePayload.waterHeaterType = data.waterHeaterType;
  if (data.roofType !== undefined) updatePayload.roofType = data.roofType;
  if (data.hvacInstallYear !== undefined) updatePayload.hvacInstallYear = data.hvacInstallYear;
  if (data.waterHeaterInstallYear !== undefined) updatePayload.waterHeaterInstallYear = data.waterHeaterInstallYear;
  if (data.roofReplacementYear !== undefined) updatePayload.roofReplacementYear = data.roofReplacementYear;
  if (data.foundationType !== undefined) updatePayload.foundationType = data.foundationType;
  if (data.sidingType !== undefined) updatePayload.sidingType = data.sidingType;
  if (data.electricalPanelAge !== undefined) updatePayload.electricalPanelAge = data.electricalPanelAge;
  if (data.lotSize !== undefined) updatePayload.lotSize = data.lotSize;
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

  // PHASE 2 ADDITION: Trigger risk calculation after property update
  if (Object.keys(updatePayload).length > 0) {
      await JobQueueService.addJob(RISK_JOB_TYPES.CALCULATE_RISK, { propertyId });
  }

  // FETCH FULL PROPERTY: Must include homeAssets for return/scoring
  const updatedProperty = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { homeAssets: true }
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