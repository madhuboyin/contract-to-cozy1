const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerClosingHomeResponseSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function buyerOverview() {
  return {
    property: { id: 'property-1', address: '10 Main St', city: 'Boston', state: 'MA', zipCode: '02108' },
    journey: {
      status: 'ACTIVE',
      stage: 'DUE_DILIGENCE',
      targetCloseDate: '2026-09-15T12:00:00.000Z',
      moveInDate: null,
      progress: { completed: 2, total: 8, percent: 25 },
    },
    nextAction: {
      id: 'task-1', actionKey: 'buyer:inspection:import', title: 'Import inspection', description: null,
      status: 'PENDING', phase: 'DUE_DILIGENCE', priority: 'NOW', dueAt: null, assignedToUserId: null,
    },
    blockers: [],
    milestones: [],
    readinessLanes: [
      { key: 'DUE_DILIGENCE', label: 'Due diligence', completed: 2, total: 4, blocked: 0 },
    ],
    evidence: {
      inspectionState: 'NOT_STARTED', inspectionReportCount: 0, openMaterialFindingCount: 0,
      documentCount: 1, verifiedDocumentCount: 0, documentsNeedingReviewCount: 1,
    },
    people: { contactCount: 0, assignedTaskCount: 0 },
    routes: {
      plan: '/dashboard/properties/property-1/buyer-plan',
      documents: '/dashboard/properties/property-1/documents',
      inspection: '/dashboard/properties/property-1/inspection-hub',
      ask: '/dashboard/ask?propertyId=property-1',
    },
  };
}

test('Slice 2 closing-home contract isolates buyer data from homeowner modes', () => {
  assert.equal(BuyerClosingHomeResponseSchema.safeParse({
    presentationMode: 'BUYER_CLOSING', overview: buyerOverview(),
  }).success, true);
  assert.equal(BuyerClosingHomeResponseSchema.safeParse({
    presentationMode: 'HOMEOWNER', overview: null,
  }).success, true);
  assert.equal(BuyerClosingHomeResponseSchema.safeParse({
    presentationMode: 'CANDIDATE', overview: null,
  }).success, true);
  assert.equal(BuyerClosingHomeResponseSchema.safeParse({
    presentationMode: 'HOMEOWNER', overview: buyerOverview(),
  }).success, false);
  assert.equal(BuyerClosingHomeResponseSchema.safeParse({
    presentationMode: 'BUYER_CLOSING', overview: null,
  }).success, false);
});

test('Slice 2 endpoint is read-only and derives presentation mode on the server', () => {
  const routes = read('../../src/routes/homeBuyerTask.routes.ts');
  const service = read('../../src/services/HomeBuyerTask.service.ts');
  const method = (service.split('static async getClosingHomePresentation')[1] ?? '')
    .split('  static async getOrCreateChecklist')[0];

  assert.match(routes, /properties\/:propertyId\/closing-home/);
  assert.match(method, /presentationMode: 'BUYER_CLOSING'/);
  assert.match(method, /presentationMode: 'HOMEOWNER'/);
  assert.match(method, /presentationMode: 'NEW_HOME'/);
  assert.match(method, /presentationMode: 'CANDIDATE'/);
  assert.match(method, /homeBuyerChecklist/);
  assert.doesNotMatch(method, /\.create\(|\.update\(|getOrCreateChecklist/);
});

test('dashboard dispatches to a separate Buyer Closing Home and gates homeowner payloads', () => {
  const dashboard = read('../../../frontend/src/app/(dashboard)/dashboard/page.tsx');
  const buyerHome = read('../../../frontend/src/components/home/BuyerClosingHome.tsx');

  assert.match(dashboard, /api\.getBuyerClosingHome\(propId\)/);
  assert.match(dashboard, /presentationMode === 'BUYER_CLOSING'/);
  assert.match(dashboard, /return <BuyerClosingHome overview=\{data\.buyerClosingHome\} \/>/);
  assert.match(dashboard, /presentationMode === 'HOMEOWNER'/);
  assert.match(dashboard, /presentationMode === 'CANDIDATE'/);
  assert.match(dashboard, /return \(\s*<UnifiedHomeSurface/);
  assert.doesNotMatch(buyerHome, /UnifiedHomeSurface|PropertyRiskScoreCard|HomeSavingsCheck/);
  assert.match(buyerHome, /Open Closing Plan/);
  assert.match(buyerHome, /Continue Closing Plan/);
});
