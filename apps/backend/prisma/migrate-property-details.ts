import { PrismaClient, PropertyType } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to safely map old string types to the new ENUM
function mapOldPropertyType(oldType: string | null): PropertyType | undefined {
  if (!oldType) return undefined;

  // Normalizing string before comparison to handle variations like "Town House"
  const normalized = oldType.toUpperCase().replace(/[^A-Z]/g, '');

  switch (normalized) {
    case 'SINGLEFAMILY':
      return PropertyType.SINGLE_FAMILY;
    case 'TOWNHOUSE':
    case 'TOWNHOME':
      return PropertyType.TOWNHOME;
    case 'CONDO':
      return PropertyType.CONDO;
    case 'APARTMENT':
      return PropertyType.APARTMENT;
    case 'MULTIUNIT':
      return PropertyType.MULTI_UNIT;
    case 'INVESTMENTPROPERTY':
      return PropertyType.INVESTMENT_PROPERTY;
    default:
      // If the old string doesn't match a new enum value, we skip it
      console.warn(`Unknown old property type encountered: ${oldType}. Skipping conversion.`);
      return undefined;
  }
}

async function migratePropertyDetails() {
  console.log('Starting Phase 3: Property Details Data Migration...');
  
  // 1. Fetch all profiles that have old property data and their associated properties
  const profiles = await prisma.homeownerProfile.findMany({
    where: {
      OR: [
        { propertyType: { not: null } },
        { propertySize: { not: null } },
        { yearBuilt: { not: null } },
        { bedrooms: { not: null } },
        { bathrooms: { not: null } },
      ],
    },
    // We only migrate data to the primary (or first found) property for existing users
    include: {
      properties: {
        orderBy: { isPrimary: 'desc' },
        take: 1,
      },
    },
  });

  let migratedCount = 0;
  let skippedCount = 0;

  for (const profile of profiles) {
    const primaryProperty = profile.properties[0];

    if (!primaryProperty) {
      console.warn(`Profile ${profile.id} has old data but no associated property. Skipping.`);
      skippedCount++;
      continue;
    }
    
    // Build the data payload for the Property update
    const updateData: any = {};
    
    // Map and include fields only if they have data
    if (profile.propertyType) {
        const newPropertyType = mapOldPropertyType(profile.propertyType);
        if (newPropertyType) {
            updateData.propertyType = newPropertyType;
        }
    }
    if (profile.propertySize !== null) {
      updateData.propertySize = profile.propertySize;
    }
    if (profile.yearBuilt !== null) {
      updateData.yearBuilt = profile.yearBuilt;
    }
    if (profile.bedrooms !== null) {
      updateData.bedrooms = profile.bedrooms;
    }
    if (profile.bathrooms !== null) {
      updateData.bathrooms = profile.bathrooms;
    }

    // 2. Execute the update on the Property record
    if (Object.keys(updateData).length > 0) {
        await prisma.property.update({
            where: { id: primaryProperty.id },
            data: updateData,
        });
        migratedCount++;
    } else {
        skippedCount++;
    }
  }

  console.log(`Migration Complete. Successfully migrated ${migratedCount} properties. Skipped ${skippedCount} profiles.`);
}

// Execute the function
migratePropertyDetails()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });