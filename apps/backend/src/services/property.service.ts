import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CreatePropertyData {
  name?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary?: boolean;
}

interface UpdatePropertyData {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  isPrimary?: boolean;
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

  const updatePayload: any = {};
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.address !== undefined) updatePayload.address = data.address;
  if (data.city !== undefined) updatePayload.city = data.city;
  if (data.state !== undefined) updatePayload.state = data.state.toUpperCase();
  if (data.zipCode !== undefined) updatePayload.zipCode = data.zipCode;
  if (data.isPrimary !== undefined) updatePayload.isPrimary = data.isPrimary;

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