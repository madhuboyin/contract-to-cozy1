const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { BuyerRecentOwnerTransitionSchema } = require('../../src/productFramework/buyerAcquisition.contract.ts');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function transition(advocacy) {
  return {
    property: { id: 'property-1', address: '10 Main St', city: 'Boston', state: 'MA', zipCode: '02108' },
    journey: {
      stage: 'FIRST_30_DAYS', ownershipStartedAt: '2026-08-01T12:00:00.000Z',
      daysSinceOwnershipStart: 16, progress: { resolved: 3, total: 9, percent: 33, active: 6 },
    },
    evidence: {
      documentCount: 4, verifiedDocumentCount: 3, inspectionReportCount: 1, openMaterialFindingCount: 0,
    },
    advocacy,
    routes: {
      plan: '/dashboard/properties/property-1/buyer-plan',
      timeline: '/dashboard/properties/property-1/timeline',
      homeRecords: '/dashboard/properties/property-1/tools/home-records',
      homeOperations: '/dashboard/properties/property-1/home-operations',
      household: '/dashboard/properties/property-1/household?invite=1',
      ask: '/dashboard/ask?propertyId=property-1',
    },
  };
}

test('advocacy contract requires a canonical success moment before eligibility', () => {
  assert.equal(BuyerRecentOwnerTransitionSchema.safeParse(transition({
    eligible: true, successMoment: 'FIRST_90_DAY_PROGRESS', inviteAvailable: true,
  })).success, true);
  assert.equal(BuyerRecentOwnerTransitionSchema.safeParse(transition({
    eligible: true, successMoment: null, inviteAvailable: true,
  })).success, false);
  assert.equal(BuyerRecentOwnerTransitionSchema.safeParse(transition({
    eligible: false, successMoment: null, inviteAvailable: false,
  })).success, true);
});

test('server eligibility requires demonstrated value and suppresses buyer urgency', () => {
  const service = read('../../src/services/HomeBuyerTask.service.ts');
  const method = (service.split('static async getClosingHomePresentation')[1] ?? '')
    .split('  static async getPlanOverview')[0];

  assert.match(method, /completedOwnershipTaskCount >= 2/);
  assert.match(method, /verifiedDocumentCount >= 2/);
  assert.match(method, /openMaterialFindingCount > 0/);
  assert.match(method, /task\.status === 'BLOCKED'/);
  assert.match(method, /task\.blocking/);
  assert.match(method, /task\.priority === 'NOW'/);
  assert.match(method, /task\.dueAt\.getTime\(\) <= now\.getTime\(\)/);
  assert.match(method, /eligible: Boolean\(successMoment\) && !hasBuyerUrgency/);
  assert.match(method, /inviteAvailable: property\.householdMembers\.some/);
});

test('homeowner surface suppresses advocacy for urgent and safety work', () => {
  const surface = read('../../../frontend/src/components/home/UnifiedHomeSurface.tsx');
  const prompt = read('../../../frontend/src/components/home/RecentOwnerAdvocacyPrompt.tsx');

  assert.match(surface, /action\.priority === 'NOW'/);
  assert.match(surface, /action\.priority === 'SOON'/);
  assert.match(surface, /action\.governance\.safetyTier === 'SAFETY_EMERGENCY'/);
  assert.match(surface, /home\.activeMajorMoment\?\.blocker/);
  assert.match(surface, /suppressedByUrgentWork=\{hasUrgentHomeWork\}/);
  assert.match(prompt, /!advocacy\.eligible \|\| !advocacy\.successMoment \|\| suppressedByUrgentWork/);
});

test('advocacy is dismissible, frequency limited, governed, and measurable', () => {
  const prompt = read('../../../frontend/src/components/home/RecentOwnerAdvocacyPrompt.tsx');
  const household = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/household/page.tsx');
  const analytics = read('../../../frontend/src/lib/analytics/events.ts');

  assert.match(prompt, /PROMPT_COOLDOWN_MS = 14/);
  assert.match(prompt, /DISMISSAL_MS = 90/);
  assert.match(prompt, /MAX_IMPRESSIONS = 3/);
  assert.match(prompt, /aria-label="Dismiss advocacy prompt"/);
  assert.match(prompt, /Invite co-buyer/);
  assert.match(prompt, /Recommend to a buyer/);
  assert.match(prompt, /navigator\.share/);
  assert.match(prompt, /navigator\.clipboard\.writeText/);
  assert.match(prompt, /utm_campaign=recent_owner/);
  assert.match(household, /searchParams\.get\('invite'\) === '1'/);
  assert.match(analytics, /buyer_advocacy_prompt_viewed/);
  assert.match(analytics, /buyer_advocacy_prompt_dismissed/);
  assert.match(analytics, /buyer_advocacy_prompt_actioned/);
});
