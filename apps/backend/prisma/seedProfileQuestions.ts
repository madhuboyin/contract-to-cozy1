// apps/backend/prisma/seedProfileQuestions.ts
// Seeds a starter set of 5 progressive-profiling questions — one per
// composition table (HouseholdMemberSummary/PetProfile/HouseholdGoal/
// HouseholdPreference/LifestyleAttribute), designed for this slice since no
// concrete question set exists in docs/personalization/ beyond a single
// walkthrough example. All seeded status: DRAFT/inactive — promoted to
// ACTIVE manually, same convention as every other definition in this module
// (see seedPersonalizationProofDefinition.ts). Idempotent: safe to re-run.
// Run: npx ts-node prisma/seedProfileQuestions.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface StarterQuestion {
  code: string;
  targetTable: string;
  targetKey: string | null;
  prompt: string;
  whyAsked: string;
  privacyNote: string;
  answerSchema: object;
  valueScore: number;
  effortScore: number;
}

const STARTER_QUESTIONS: StarterQuestion[] = [
  {
    code: 'household_composition_safety',
    targetTable: 'HOUSEHOLD_MEMBER_SUMMARY',
    targetKey: null,
    prompt: 'Does your household include young children, teens, or seniors who need extra safety consideration?',
    whyAsked: 'Helps us prioritize safety-related home recommendations (e.g. smoke detectors, stair rails).',
    privacyNote: 'We only store household composition bands, never names, ages, or birthdates.',
    answerSchema: { type: 'multi_select', options: ['hasChildren', 'hasSeniors'] },
    valueScore: 8,
    effortScore: 2,
  },
  {
    code: 'household_pets',
    targetTable: 'PET_PROFILE',
    targetKey: null,
    prompt: 'Do you have a dog or cat at this property?',
    whyAsked: 'Helps us tailor recommendations around yard safety, flooring, and pet-related maintenance.',
    privacyNote: 'We store pet type only, never names or medical information.',
    answerSchema: { type: 'select_with_detail', options: ['hasPet', 'petType'] },
    valueScore: 6,
    effortScore: 1,
  },
  {
    code: 'goal_aging_in_place',
    targetTable: 'HOUSEHOLD_GOAL',
    targetKey: 'AGING_IN_PLACE',
    prompt: 'Are you planning to age in place in this home long-term?',
    whyAsked: 'Helps us prioritize accessibility and long-term safety recommendations.',
    privacyNote: 'This is a goal you can update or remove at any time.',
    answerSchema: { type: 'boolean' },
    valueScore: 7,
    effortScore: 1,
  },
  {
    code: 'preference_budget_posture',
    targetTable: 'HOUSEHOLD_PREFERENCE',
    targetKey: 'BUDGET_POSTURE',
    prompt: 'Would you describe your home-maintenance budget as cost-conscious?',
    whyAsked: 'Helps us favor lower-cost options when multiple recommendations are equally valid.',
    privacyNote: 'This preference only affects which recommendations we prioritize, never your credit or income.',
    answerSchema: { type: 'boolean' },
    valueScore: 6,
    effortScore: 1,
  },
  {
    code: 'lifestyle_travel_frequency',
    targetTable: 'LIFESTYLE_ATTRIBUTE',
    targetKey: 'TRAVEL_FREQUENCY',
    prompt: 'Do you travel away from home frequently (monthly or more)?',
    whyAsked: 'Helps us prioritize security and remote-monitoring recommendations.',
    privacyNote: 'We store a frequency band only, never your travel dates or destinations.',
    answerSchema: { type: 'boolean' },
    valueScore: 5,
    effortScore: 1,
  },
];

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('Seeding starter progressive-profiling questions...');
  console.log('═══════════════════════════════════════════════');

  for (const q of STARTER_QUESTIONS) {
    await prisma.profileQuestion.upsert({
      where: { code_version: { code: q.code, version: 1 } },
      create: {
        code: q.code,
        version: 1,
        status: 'DRAFT',
        prompt: q.prompt,
        whyAsked: q.whyAsked,
        privacyNote: q.privacyNote,
        targetTable: q.targetTable,
        targetKey: q.targetKey,
        answerSchema: q.answerSchema,
        placementContexts: ['ONBOARDING'],
        valueScore: q.valueScore,
        effortScore: q.effortScore,
      },
      update: {
        prompt: q.prompt,
        whyAsked: q.whyAsked,
        privacyNote: q.privacyNote,
        answerSchema: q.answerSchema,
        valueScore: q.valueScore,
        effortScore: q.effortScore,
        // Does not overwrite status, same reasoning as seedPersonalizationCatalog.ts.
      },
    });
    console.log(`  seeded: ${q.code} -> ${q.targetTable}`);
  }

  console.log(`✅ Seeded ${STARTER_QUESTIONS.length} starter questions (all DRAFT/inactive).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error seeding profile questions:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
