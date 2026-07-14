// apps/backend/prisma/seedDryerVentCleaningRule.ts
//
// Adds the first real RecommendationRule for `dryer_vent_cleaning_reminder`
// — the definition itself already exists (seeded DRAFT by
// seedPersonalizationCatalog.ts, from CATALOG_PLAN). Second of the 8
// SAFETY_SENSITIVE catalog-plan entries to get real rule logic, same
// authoring pattern as seedSmokeDetectorBatteryCheckRule.ts.
//
// Status stays DRAFT — going ACTIVE is the actual "go live" decision and
// still needs the docs' two-person review for SAFETY_SENSITIVE content
// (03-feasibility-study.md:66); this script only makes the rule real and
// evaluatable in tests/dev, it does not activate it.
//
// Idempotent: safe to re-run. Run: npx ts-node prisma/seedDryerVentCleaningRule.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFINITION_CODE = 'dryer_vent_cleaning_reminder';
const RULE_VERSION = 1;
const RULE_AST = {
  op: 'trait',
  key: 'dryerVentCleaningOverdue',
  cmp: 'eq',
  value: true,
};

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(`Seeding rule for: ${DEFINITION_CODE}`);
  console.log('═══════════════════════════════════════════════');

  const definition = await prisma.recommendationDefinition.findUnique({
    where: { code: DEFINITION_CODE },
  });

  if (!definition) {
    console.error(
      `Definition "${DEFINITION_CODE}" not found — run seedPersonalizationCatalog.ts first.`,
    );
    process.exit(1);
  }

  await prisma.recommendationRule.upsert({
    where: { definitionId_version: { definitionId: definition.id, version: RULE_VERSION } },
    create: {
      definitionId: definition.id,
      version: RULE_VERSION,
      ruleAst: RULE_AST,
      status: 'DRAFT',
    },
    update: {
      ruleAst: RULE_AST,
    },
  });

  console.log(`✅ Rule seeded (definitionId=${definition.id}, status DRAFT/inactive).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error seeding dryer vent cleaning rule:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
