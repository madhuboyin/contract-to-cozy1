// One idempotent seed entry point for the data-free personalization pilot.
// It creates only the three pilot definitions/rules and five optional profile
// questions. Everything remains DRAFT until explicit review and activation.
// Run after the user applies the Prisma schema: npx ts-node prisma/seedPersonalizationPilot.ts
import { PrismaClient } from '@prisma/client';
import { HVAC_FILTER_PROOF_RULE_AST } from '../src/modules/personalization/catalog/proofDefinition';
import { DEFAULT_HVAC_FILTER_SCORE_CONFIG } from '../src/modules/personalization/domain/scoring';
import { PILOT_DEFINITIONS } from '../src/modules/personalization/catalog/pilotDefinitions';

const prisma = new PrismaClient();

const definitions = PILOT_DEFINITIONS.map((definition) => ({
  ...definition,
  safetyClass: definition.code === 'hvac_filter_replacement_check_proof' ? 'ROUTINE' : 'SAFETY_SENSITIVE',
  ruleAst:
    definition.code === 'hvac_filter_replacement_check_proof'
      ? HVAC_FILTER_PROOF_RULE_AST
      : definition.code === 'smoke_co_detector_battery_check'
        ? { op: 'trait', key: 'smokeDetectorBatteryOverdue', cmp: 'eq', value: true }
        : { op: 'trait', key: 'dryerVentCleaningOverdue', cmp: 'eq', value: true },
  scoreConfig: definition.code === 'hvac_filter_replacement_check_proof' ? DEFAULT_HVAC_FILTER_SCORE_CONFIG : null,
}));

const questions = [
  { code: 'household_composition_safety', targetTable: 'HOUSEHOLD_MEMBER_SUMMARY', targetKey: null, prompt: 'Does your household include children or seniors who need extra home-safety consideration?', whyAsked: 'Helps prioritize home-safety guidance.', privacyNote: 'We store broad household bands, never names, ages, or birthdates.', answerSchema: { type: 'multi_select', options: ['hasChildren', 'hasSeniors'] }, valueScore: 8, effortScore: 2 },
  { code: 'household_pets', targetTable: 'PET_PROFILE', targetKey: null, prompt: 'Do you have a dog or cat at this property?', whyAsked: 'Helps tailor home maintenance and yard-safety guidance.', privacyNote: 'We store pet type only, never names or medical information.', answerSchema: { type: 'select_with_detail', options: ['hasPet', 'petType'] }, valueScore: 6, effortScore: 1 },
  { code: 'goal_aging_in_place', targetTable: 'HOUSEHOLD_GOAL', targetKey: 'AGING_IN_PLACE', prompt: 'Are you planning to stay in this home long-term?', whyAsked: 'Helps prioritize accessibility and long-term home-safety guidance.', privacyNote: 'This is an optional goal you can remove at any time.', answerSchema: { type: 'boolean' }, valueScore: 7, effortScore: 1 },
  { code: 'preference_budget_posture', targetTable: 'HOUSEHOLD_PREFERENCE', targetKey: 'BUDGET_POSTURE', prompt: 'Should we favor lower-cost options when choices are equally useful?', whyAsked: 'Helps rank practical options.', privacyNote: 'This preference does not collect income or credit information.', answerSchema: { type: 'boolean' }, valueScore: 6, effortScore: 1 },
  { code: 'lifestyle_travel_frequency', targetTable: 'LIFESTYLE_ATTRIBUTE', targetKey: 'TRAVEL_FREQUENCY', prompt: 'Are you away from home frequently?', whyAsked: 'Helps prioritize home security and remote-monitoring guidance.', privacyNote: 'We store only this answer, never destinations or travel dates.', answerSchema: { type: 'boolean' }, valueScore: 5, effortScore: 1 },
] as const;

async function main() {
  for (const entry of definitions) {
    const definition = await prisma.recommendationDefinition.upsert({
      where: { code: entry.code },
      create: { code: entry.code, category: entry.category, safetyClass: entry.safetyClass, status: 'DRAFT' },
      update: { category: entry.category, safetyClass: entry.safetyClass },
    });
    await prisma.recommendationRule.upsert({
      where: { definitionId_version: { definitionId: definition.id, version: 1 } },
      create: { definitionId: definition.id, version: 1, ruleAst: entry.ruleAst, scoreConfig: entry.scoreConfig, status: 'DRAFT' },
      update: { ruleAst: entry.ruleAst, scoreConfig: entry.scoreConfig },
    });
    await prisma.recommendationContentVersion.upsert({
      where: { definitionId_locale_version: { definitionId: definition.id, locale: 'en-US', version: 1 } },
      create: {
        definitionId: definition.id,
        locale: 'en-US',
        version: 1,
        title: entry.headline,
        body: entry.body,
        templates: { reasonCode: entry.reasonCode, reasonTemplateKey: entry.reasonTemplateKey },
        status: 'DRAFT',
      },
      update: {
        title: entry.headline,
        body: entry.body,
        templates: { reasonCode: entry.reasonCode, reasonTemplateKey: entry.reasonTemplateKey },
      },
    });
  }

  for (const question of questions) {
    await prisma.profileQuestion.upsert({
      where: { code_version: { code: question.code, version: 1 } },
      create: { ...question, version: 1, status: 'DRAFT', placementContexts: ['PILOT'], maxImpressions: 3 },
      update: {
        prompt: question.prompt,
        whyAsked: question.whyAsked,
        privacyNote: question.privacyNote,
        targetTable: question.targetTable,
        targetKey: question.targetKey,
        answerSchema: question.answerSchema,
        placementContexts: ['PILOT'],
        valueScore: question.valueScore,
        effortScore: question.effortScore,
        maxImpressions: 3,
      },
    });
  }

  console.log(`Seeded ${definitions.length} pilot definitions and ${questions.length} profile questions as DRAFT.`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error('Failed to seed the personalization pilot:', error);
    process.exitCode = 1;
  });
