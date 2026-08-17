const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { BuyerClosingHomeResponseSchema } = require('../../src/productFramework/buyerAcquisition.contract.ts');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function recentOwner() {
  return {
    property: { id: 'property-1', address: '10 Main St', city: 'Boston', state: 'MA', zipCode: '02108' },
    journey: {
      stage: 'FIRST_30_DAYS',
      ownershipStartedAt: '2026-08-01T12:00:00.000Z',
      daysSinceOwnershipStart: 16,
      progress: { resolved: 3, total: 9, percent: 33, active: 6 },
    },
    evidence: {
      documentCount: 4,
      verifiedDocumentCount: 3,
      inspectionReportCount: 1,
      openMaterialFindingCount: 2,
    },
    advocacy: {
      eligible: false,
      successMoment: 'FIRST_90_DAY_PROGRESS',
      inviteAvailable: true,
    },
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

test('Slice 7 recent-owner contract requires bounded transition data only in its matching mode', () => {
  const valid = BuyerClosingHomeResponseSchema.safeParse({
    presentationMode: 'RECENT_OWNER', overview: null, recentOwner: recentOwner(),
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.recentOwner.journey.daysSinceOwnershipStart, 16);

  assert.equal(BuyerClosingHomeResponseSchema.safeParse({
    presentationMode: 'RECENT_OWNER', overview: null,
  }).success, false);
  assert.equal(BuyerClosingHomeResponseSchema.safeParse({
    presentationMode: 'HOMEOWNER', overview: null, recentOwner: recentOwner(),
  }).success, false);
  assert.equal(BuyerClosingHomeResponseSchema.safeParse({
    presentationMode: 'RECENT_OWNER', overview: null, recentOwner: {
      ...recentOwner(),
      journey: { ...recentOwner().journey, daysSinceOwnershipStart: 91 },
    },
  }).success, false);
});

test('recent-owner dispatcher is read-only, persisted-state gated, and projects ownership continuity', () => {
  const service = read('../../src/services/HomeBuyerTask.service.ts');
  const method = (service.split('static async getClosingHomePresentation')[1] ?? '')
    .split('  static async getPlanOverview')[0];

  assert.match(method, /ownershipState: true/);
  assert.match(method, /ownershipState === 'RECENT_OWNER'/);
  assert.match(method, /presentationMode: 'RECENT_OWNER'/);
  assert.match(method, /plan\.ownershipStartedAt/);
  assert.match(method, /'MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'RECURRING_HOME'/);
  assert.match(method, /homeRecords: `\/dashboard\/properties\/\$\{property\.id\}\/tools\/home-records`/);
  assert.match(method, /homeOperations: `\/dashboard\/properties\/\$\{property\.id\}\/home-operations`/);
  assert.doesNotMatch(method, /prisma\.(?:\$transaction|[a-zA-Z]+\.(?:create|update|delete))/);
});

test('dashboard layers the transition above normal homeowner capabilities without re-onboarding', () => {
  const dashboard = read('../../../frontend/src/app/(dashboard)/dashboard/page.tsx');
  const transition = read('../../../frontend/src/components/home/RecentOwnerTransition.tsx');

  assert.match(dashboard, /ownerCapabilityMode = presentationMode === 'HOMEOWNER' \|\| presentationMode === 'RECENT_OWNER'/);
  assert.match(dashboard, /resolvedPresentationMode === 'BUYER_CLOSING' \|\| resolvedPresentationMode === 'CANDIDATE'/);
  assert.doesNotMatch(dashboard, /resolvedPresentationMode === 'BUYER_CLOSING' \|\| resolvedPresentationMode === 'RECENT_OWNER'/);
  assert.match(dashboard, /<RecentOwnerTransition transition=\{data\.recentOwnerTransition\} \/>/);
  assert.match(dashboard, /presentationMode === 'RECENT_OWNER'[\s\S]*<UnifiedHomeSurface/);
  assert.match(transition, /Continue 90-day plan/);
  assert.match(transition, /Home Record milestone/);
  assert.match(transition, /Home Records/);
  assert.match(transition, /Home Operations/);
  assert.match(transition, /Ask Cozy/);
  assert.match(transition, /buyer_recent_owner_transition_viewed/);
  assert.match(transition, /no setup restart required/);
});

test('recent-owner Ask leaves pre-close presentation and uses homeowner lifecycle routing', () => {
  const presentation = read('../../src/services/ask/askBuyerPlanPresentation.ts');
  const lifecycle = read('../../src/services/ask/askLifecyclePromptPolicy.ts');

  assert.match(presentation, /context\.presentationMode === 'RECENT_OWNER'/);
  assert.match(lifecycle, /ownershipState === 'RECENT_OWNER'\) return RECENT_OWNER_PROMPTS/);
});
