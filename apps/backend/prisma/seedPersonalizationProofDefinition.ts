// apps/backend/prisma/seedPersonalizationProofDefinition.ts
// Seeds the ONE inactive HVAC-filter proof definition from
// src/modules/personalization/catalog/proofDefinition.ts — the roadmap's
// "first implementation step" exception to the "no rule logic" Phase 0
// catalog-plan entries (see seedPersonalizationCatalog.ts). Creates a
// RecommendationDefinition + its RecommendationRule (real ruleAst), both
// status DRAFT/inactive. Idempotent: safe to re-run.
// Run: npx ts-node prisma/seedPersonalizationProofDefinition.ts
import { PrismaClient } from '@prisma/client';
import {
  HVAC_FILTER_PROOF_DEFINITION_CODE,
  HVAC_FILTER_PROOF_CATEGORY,
  HVAC_FILTER_PROOF_RULE_AST,
  HVAC_FILTER_PROOF_RULE_VERSION,
} from '../src/modules/personalization/catalog/proofDefinition';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(`Seeding proof definition: ${HVAC_FILTER_PROOF_DEFINITION_CODE}`);
  console.log('═══════════════════════════════════════════════');

  const definition = await prisma.recommendationDefinition.upsert({
    where: { code: HVAC_FILTER_PROOF_DEFINITION_CODE },
    create: {
      code: HVAC_FILTER_PROOF_DEFINITION_CODE,
      category: HVAC_FILTER_PROOF_CATEGORY,
      safetyClass: 'ROUTINE',
      status: 'DRAFT',
    },
    update: {
      category: HVAC_FILTER_PROOF_CATEGORY,
      safetyClass: 'ROUTINE',
      // Does not overwrite status, same reasoning as seedPersonalizationCatalog.ts.
    },
  });

  await prisma.recommendationRule.upsert({
    where: { definitionId_version: { definitionId: definition.id, version: HVAC_FILTER_PROOF_RULE_VERSION } },
    create: {
      definitionId: definition.id,
      version: HVAC_FILTER_PROOF_RULE_VERSION,
      ruleAst: HVAC_FILTER_PROOF_RULE_AST,
      status: 'DRAFT',
    },
    update: {
      ruleAst: HVAC_FILTER_PROOF_RULE_AST,
    },
  });

  console.log(`✅ Definition + rule seeded (definitionId=${definition.id}, both DRAFT/inactive).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error seeding personalization proof definition:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
