// apps/backend/prisma/seedSmokeDetectorBatteryCheckRule.ts
//
// Adds the first real RecommendationRule for `smoke_co_detector_battery_check`
// — the definition itself already exists (seeded DRAFT by
// seedPersonalizationCatalog.ts, from CATALOG_PLAN). This is the first of the
// 8 SAFETY_SENSITIVE catalog-plan entries to get real rule logic, following
// the same authoring pattern as the HVAC filter proof
// (seedPersonalizationProofDefinition.ts).
//
// Status stays DRAFT here — going ACTIVE is the actual "go live" decision
// and still needs the docs' two-person review for SAFETY_SENSITIVE content
// (03-feasibility-study.md:66); this script only makes the rule real and
// evaluatable in tests/dev, it does not activate it. loadActiveRule()
// continues to block DRAFT rules from ever being evaluated automatically.
//
// Idempotent: safe to re-run. Run: npx ts-node prisma/seedSmokeDetectorBatteryCheckRule.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFINITION_CODE = 'smoke_co_detector_battery_check';
const RULE_VERSION = 1;
const RULE_AST = {
  op: 'trait',
  key: 'smokeDetectorBatteryOverdue',
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
    console.error('Error seeding smoke detector battery check rule:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
