// apps/backend/prisma/seed-service-categories.ts
import { PrismaClient, ServiceCategory } from '@prisma/client';

const prisma = new PrismaClient();

const SERVICE_CATEGORY_CONFIGS = [
  // HOME_BUYER specific categories
  {
    category: ServiceCategory.INSPECTION,
    availableForHomeBuyer: true,
    availableForExistingOwner: false,
    displayName: 'Home Inspection',
    description: 'Professional home inspection services before closing',
    icon: 'clipboard-check',
    sortOrder: 1,
  },
  {
    category: ServiceCategory.MOVING,
    availableForHomeBuyer: true,
    availableForExistingOwner: false,
    displayName: 'Moving Services',
    description: 'Professional movers and packing services',
    icon: 'truck',
    sortOrder: 2,
  },
  
  // Both segments
  {
    category: ServiceCategory.CLEANING,
    availableForHomeBuyer: true,
    availableForExistingOwner: true,
    displayName: 'Cleaning Services',
    description: 'Move-in cleaning, deep cleaning, and maintenance',
    icon: 'sparkles',
    sortOrder: 3,
  },
  {
    category: ServiceCategory.LOCKSMITH,
    availableForHomeBuyer: true,
    availableForExistingOwner: true,
    displayName: 'Locksmith',
    description: 'Lock rekeying, installation, and emergency services',
    icon: 'key',
    sortOrder: 4,
  },
  {
    category: ServiceCategory.PEST_CONTROL,
    availableForHomeBuyer: true,
    availableForExistingOwner: true,
    displayName: 'Pest Control',
    description: 'Extermination, prevention, and pest inspections',
    icon: 'bug',
    sortOrder: 5,
  },
  {
    category: ServiceCategory.HVAC,
    availableForHomeBuyer: true,
    availableForExistingOwner: true,
    displayName: 'HVAC',
    description: 'Heating and cooling repair, maintenance, and installation',
    icon: 'wind',
    sortOrder: 6,
  },
  
  // EXISTING_OWNER specific categories
  {
    category: ServiceCategory.HANDYMAN,
    availableForHomeBuyer: false,
    availableForExistingOwner: true,
    displayName: 'Handyman Services',
    description: 'General repairs and home maintenance',
    icon: 'wrench',
    sortOrder: 7,
  },
  {
    category: ServiceCategory.PLUMBING,
    availableForHomeBuyer: false,
    availableForExistingOwner: true,
    displayName: 'Plumbing',
    description: 'Leak repairs, fixture installation, and drain cleaning',
    icon: 'droplet',
    sortOrder: 8,
  },
  {
    category: ServiceCategory.ELECTRICAL,
    availableForHomeBuyer: false,
    availableForExistingOwner: true,
    displayName: 'Electrical',
    description: 'Outlet repairs, lighting, and electrical upgrades',
    icon: 'zap',
    sortOrder: 9,
  },
  {
    category: ServiceCategory.LANDSCAPING,
    availableForHomeBuyer: false,
    availableForExistingOwner: true,
    displayName: 'Landscaping',
    description: 'Lawn care, tree trimming, and garden maintenance',
    icon: 'leaf',
    sortOrder: 10,
  },
  {
    category: ServiceCategory.FINANCE,
    availableForHomeBuyer: false,
    availableForExistingOwner: true,
    displayName: 'Property Tax Services',
    description: 'Property tax reminders, consultations, and renewal tracking',
    icon: 'calculator',
    sortOrder: 11,
  },
  {
    category: ServiceCategory.WARRANTY,
    availableForHomeBuyer: false,
    availableForExistingOwner: true,
    displayName: 'Warranty Management',
    description: 'Home warranty renewals, claims assistance, and coverage tracking',
    icon: 'shield-check',
    sortOrder: 12,
  },
  {
    category: ServiceCategory.ADMIN,
    availableForHomeBuyer: false,
    availableForExistingOwner: true,
    displayName: 'Administrative Services',
    description: 'General home admin tasks, reminders, and documentation',
    icon: 'clipboard-list',
    sortOrder: 13,
  },
];


async function seedServiceCategories() {
  try {
    console.log('🌱 Seeding service category configurations...');
    console.log('📊 Total configs to seed:', SERVICE_CATEGORY_CONFIGS.length);

    let successCount = 0;

    for (const config of SERVICE_CATEGORY_CONFIGS) {
      try {
        const result = await prisma.serviceCategoryConfig.upsert({
          where: { category: config.category },
          update: config,
          create: config,
        });
        console.log(`✅ ${config.displayName} configured (ID: ${result.id.substring(0, 8)}...)`);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to configure ${config.displayName}:`, err);
      }
    }

    console.log('');
    console.log(`✅ Service category configuration complete! (${successCount}/${SERVICE_CATEGORY_CONFIGS.length})`);
    console.log('');
    console.log('Summary:');
    console.log(`  - HOME_BUYER only: INSPECTION, MOVING`);
    console.log(`  - EXISTING_OWNER only: HANDYMAN, PLUMBING, ELECTRICAL, LANDSCAPING, FINANCE, WARRANTY, ADMIN`);
    console.log(`  - Both segments: CLEANING, LOCKSMITH, PEST_CONTROL, HVAC`);
    
    // Verify data was inserted
    const count = await prisma.serviceCategoryConfig.count();
    console.log('');
    console.log(`📊 Total records in database: ${count}`);
    console.log('');
    console.log('🎉 Seed completed successfully!');
    
  } catch (error) {
    console.error('');
    console.error('❌ Seed process failed:', error);
    throw error;
  } finally {
    console.log('🔌 Disconnecting from database...');
    await prisma.$disconnect();
  }
}

// Run the seed function
seedServiceCategories();