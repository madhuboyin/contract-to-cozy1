import { PrismaClient, PropertyType, OwnershipType, HeatingType, CoolingType, WaterHeaterType, RoofType } from '@prisma/client';

const prisma = new PrismaClient();

// REPLACED INTERFACES with complete definitions matching the extended Prisma Property model (Phase 2)
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
  applianceAges?: any; // Prisma Json type maps to 'any'
}

interface UpdatePropertyData extends Partial<CreatePropertyData> {
  // All fields are optional for update
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

/**
 * Get all properties for a user
 */
export async function getUserProperties(userId: string) {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  const properties = await prisma.property.findMany({
    where: { homeownerProfileId },
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  return properties;
}

/**
 * Create a new property
 */
export async function createProperty(userId: string, data: CreatePropertyData) {
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
      applianceAges: data.applianceAges,
      // END PHASE 2 ADDITIONS
    },
  });

  return property;
}

/**
 * Get a property by ID (verify ownership)
 */
export async function getPropertyById(propertyId: string, userId: string) {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfileId,
    },
  });

  return property;
}

/**
 * Update a property
 */
export async function updateProperty(
  propertyId: string,
  userId: string,
  data: UpdatePropertyData
) {
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

  // Use a proper type for updatePayload for better type checking
  const updatePayload: Partial<Omit<CreatePropertyData, 'address' | 'city' | 'state' | 'zipCode'>> & {
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
  if (data.applianceAges !== undefined) updatePayload.applianceAges = data.applianceAges;
  // END PHASE 2 ADDITIONS

  const property = await prisma.property.update({
    where: { id: propertyId },
    data: updatePayload,
  });

  return property;
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