// apps/backend/prisma/seed-risk-config-standalone.ts
// Standalone seed for SystemComponentConfig (no external dependencies)
// Run: npx ts-node prisma/seed-risk-config-standalone.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Inline risk config data - avoids import issues during Prisma generation
const RISK_CONFIGS = [
  // SYSTEMS CATEGORY
  {
    systemType: "HVAC_FURNACE",
    category: "SYSTEMS",
    expectedLife: 15,
    replacementCost: 8500,
  },
  {
    systemType: "HVAC_HEAT_PUMP",
    category: "SYSTEMS",
    expectedLife: 12,
    replacementCost: 10000,
  },
  {
    systemType: "WATER_HEATER_TANK",
    category: "SYSTEMS",
    expectedLife: 10,
    replacementCost: 1500,
  },
  {
    systemType: "WATER_HEATER_TANKLESS",
    category: "SYSTEMS",
    expectedLife: 20,
    replacementCost: 4000,
  },
  {
    systemType: "ELECTRICAL_PANEL_MODERN",
    category: "SYSTEMS",
    expectedLife: 40,
    replacementCost: 3500,
  },
  {
    systemType: "ELECTRICAL_PANEL_OLD",
    category: "SYSTEMS",
    expectedLife: 30,
    replacementCost: 3000,
    warningFlags: {
      electricalPanelAgeOver40: 0.2,
    }
  },

  // STRUCTURE CATEGORY
  {
    systemType: "ROOF_SHINGLE",
    category: "STRUCTURE",
    expectedLife: 20,
    replacementCost: 18000,
    warningFlags: {
      hasDrainageIssues: 0.1,
    }
  },
  {
    systemType: "ROOF_TILE_METAL",
    category: "STRUCTURE",
    expectedLife: 50,
    replacementCost: 30000,
  },
  {
    systemType: "FOUNDATION_CONCRETE_SLAB",
    category: "STRUCTURE",
    expectedLife: 100,
    replacementCost: 50000,
    warningFlags: {
      hasDrainageIssues: 0.3,
    }
  },

  // SAFETY & APPLIANCES
  {
    systemType: "MAJOR_APPLIANCE_FRIDGE",
    category: "SYSTEMS",
    expectedLife: 12,
    replacementCost: 2000,
  },
  {
    systemType: "MAJOR_APPLIANCE_DISHWASHER",
    category: "SYSTEMS",
    expectedLife: 10,
    replacementCost: 800,
  },
  {
    systemType: "SAFETY_SMOKE_CO_DETECTORS",
    category: "SAFETY",
    expectedLife: 10,
    replacementCost: 300,
    warningFlags: {
      isDetectorExpired: 0.8,
    }
  }
];

async function main() {
  console.log('⚠️  Seeding SystemComponentConfig for Risk Assessment...');
  console.log('');

  let created = 0;
  let updated = 0;

  for (const config of RISK_CONFIGS) {
    const existing = await prisma.systemComponentConfig.findUnique({
      where: { systemType: config.systemType }
    });

    await prisma.systemComponentConfig.upsert({
      where: { systemType: config.systemType },
      update: {
        category: config.category as any,
        expectedLife: config.expectedLife,
        replacementCost: config.replacementCost,
        warningFlags: config.warningFlags || {},
      },
      create: {
        systemType: config.systemType,
        category: config.category as any,
        expectedLife: config.expectedLife,
        replacementCost: config.replacementCost,
        warningFlags: config.warningFlags || {},
      },
    });

    if (existing) {
      updated++;
      console.log(`   ✓ Updated: ${config.systemType}`);
    } else {
      created++;
      console.log(`   + Created: ${config.systemType}`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ Seeding Complete`);
  console.log(`   Created: ${created} records`);
  console.log(`   Updated: ${updated} records`);
  console.log(`   Total:   ${RISK_CONFIGS.length} SystemComponentConfig records`);
  console.log('═══════════════════════════════════════════════');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error seeding risk config:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
