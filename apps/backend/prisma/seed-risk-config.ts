// apps/backend/prisma/seed-risk-config.ts
// Seed SystemComponentConfig for Risk Assessment Module
// Run: npx ts-node prisma/seed-risk-config.ts

import { PrismaClient } from '@prisma/client';
import { RISK_ASSET_CONFIG } from '../src/config/risk-constants';

const prisma = new PrismaClient();

async function main() {
  console.log('⚠️  Seeding SystemComponentConfig for Risk Assessment...');
  console.log('');

  const riskConfigs = RISK_ASSET_CONFIG.map(config => ({
    systemType: config.systemType,
    category: config.category,
    expectedLife: config.expectedLife,
    replacementCost: config.replacementCost,
    warningFlags: config.warningFlags || {},
  }));

  let created = 0;
  let updated = 0;

  for (const config of riskConfigs) {
    const result = await prisma.systemComponentConfig.upsert({
      where: { systemType: config.systemType },
      update: {
        category: config.category,
        expectedLife: config.expectedLife,
        replacementCost: config.replacementCost,
        warningFlags: config.warningFlags,
      },
      create: config,
    });

    // Check if it was created or updated
    const existing = await prisma.systemComponentConfig.findUnique({
      where: { systemType: config.systemType }
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
  console.log(`   Total:   ${riskConfigs.length} SystemComponentConfig records`);
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
