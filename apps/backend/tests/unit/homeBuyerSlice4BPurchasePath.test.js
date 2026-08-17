const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerPurchaseFinancingInputSchema,
  BUYER_ACTION_KEYS,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerAcquisition.service.ts'), 'utf8');
const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeBuyerTask.routes.ts'), 'utf8');
const page = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx'), 'utf8');

test('Slice 4B keeps the buyer purchase path separate from homeowner financing', () => {
  assert.match(schema, /model BuyerPurchaseFinancingPlan/);
  assert.match(schema, /purchasePath\s+BuyerPurchasePath\s+@default\(UNKNOWN\)/);
  assert.match(schema, /model PropertyFinancingProfile/);
  assert.doesNotMatch(
    schema.slice(schema.indexOf('model PropertyFinancingProfile'), schema.indexOf('model FinancingRateConfig')),
    /BuyerPurchasePath/,
  );
});

test('purchase path input is strict and cannot accept an unknown user decision', () => {
  assert.deepEqual(BuyerPurchaseFinancingInputSchema.parse({ purchasePath: 'CASH' }), { purchasePath: 'CASH' });
  assert.deepEqual(BuyerPurchaseFinancingInputSchema.parse({ purchasePath: 'FINANCED' }), { purchasePath: 'FINANCED' });
  assert.equal(BuyerPurchaseFinancingInputSchema.safeParse({ purchasePath: 'UNKNOWN' }).success, false);
  assert.equal(BuyerPurchaseFinancingInputSchema.safeParse({ purchasePath: 'CASH', approved: true }).success, false);
});

test('cash and financed decisions synchronize the same lender-only task identities', () => {
  const method = service.slice(
    service.indexOf('static async updatePurchaseFinancingPlan'),
    service.indexOf('static async getInspectionPlan'),
  );

  assert.equal(BUYER_ACTION_KEYS.PURCHASE_PATH_CONFIRM, 'buyer:phase:purchase-path-confirm');
  assert.match(method, /buyerPurchaseFinancingPlan\.upsert/);
  assert.match(method, /PURCHASE_FINANCING_TASKS\.entries\(\)/);
  assert.match(method, /financed \? 'APPLICABLE'/);
  assert.match(method, /'NOT_APPLICABLE' as const/);
  assert.match(method, /'NOT_NEEDED' as const/);
  assert.match(method, /CASH_PURCHASE_CONFIRMED/);
  assert.match(method, /PURCHASE_FINANCING_CONFIRMED/);
});

test('Buyer Plan exposes the decision with professional boundaries and hides inapplicable work', () => {
  assert.match(routes, /purchase-financing/);
  assert.match(page, /Is this purchase cash or financed\?/);
  assert.match(page, /does not approve financing or certify clear-to-close status/);
  assert.match(page, /task\.applicability !== 'NOT_APPLICABLE'/);
  assert.match(page, /api\.updateBuyerPurchaseFinancingPlan/);
});
