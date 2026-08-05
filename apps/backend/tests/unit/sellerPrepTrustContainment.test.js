const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

// Slice 8 (Sale Readiness case) trust-containment work: the P0 violations
// flagged in HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
// §1.1 for Seller Prep were never actually fixed by the earlier Slice 0
// pass (that commit only touched analytics/lifecycle event calls). These
// tests lock down the actual fixes.

test('Sale Readiness only opens a plan after confirmed sale intent (Property.propertyUse === FOR_SALE)', () => {
  const service = readBackend('src/sellerPrep/sellerPrep.service.ts');
  assert.match(service, /saleIntentConfirmed/);
  assert.match(service, /property\?\.propertyUse !== 'FOR_SALE'/);
  // The gate must run before plan creation, not after.
  const gateIndex = service.indexOf("propertyUse !== 'FOR_SALE'");
  const createIndex = service.indexOf('plan = await prisma.sellerPrepPlan.create');
  assert.ok(gateIndex > 0 && createIndex > gateIndex, 'sale-intent gate must run before plan creation');

  const builder = readBackend('src/sellerPrep/reports/sellerReadiness.builder.ts');
  assert.match(builder, /saleIntentConfirmed: Boolean\(plan\)/);
  assert.doesNotMatch(builder, /throw new Error\('Seller prep plan not found'\)/);
});

test('the lead endpoint requires property authorization, a household role floor, explicit consent, and persists submitted contact fields', () => {
  const routes = readBackend('src/sellerPrep/sellerPrep.routes.ts');
  assert.match(routes, /'\/lead\/:propertyId'/);
  const leadRouteIndex = routes.indexOf("'/lead/:propertyId'");
  const leadRouteBlock = routes.slice(leadRouteIndex, routes.indexOf(');', leadRouteIndex));
  assert.match(leadRouteBlock, /propertyAuthMiddleware/);
  assert.match(leadRouteBlock, /requireHouseholdRole\('CONTRIBUTOR'\)/);

  const controller = readBackend('src/sellerPrep/monetization/lead.controller.ts');
  assert.match(controller, /consentGiven !== true/);
  assert.match(controller, /fullName|email|phone|contactMethod/);
  // Must call the service that actually persists contact fields, not
  // silently drop them.
  assert.match(controller, /SellerPrepLeadService\.createLead/);
  assert.match(controller, /from '\.\.\/sellerPrep\.service'/);

  const service = readBackend('src/sellerPrep/sellerPrep.service.ts');
  const leadServiceIndex = service.indexOf('export class SellerPrepLeadService');
  const leadServiceBlock = service.slice(leadServiceIndex);
  assert.match(leadServiceBlock, /fullName: input\.fullName/);
  assert.match(leadServiceBlock, /email: input\.email/);
  assert.match(leadServiceBlock, /phone: input\.phone/);
  assert.match(leadServiceBlock, /consentGiven: input\.consentGiven/);

  // The old broken duplicate (discarded contact fields, no property auth)
  // must be gone, not just unwired.
  assert.equal(fs.existsSync(path.join(backendRoot, 'src/sellerPrep/monetization/lead.service.ts')), false);

  const schema = readBackend('prisma/schema.prisma');
  assert.match(schema, /model SellerPrepLead \{[\s\S]*consentGiven\s+Boolean\s+@default\(false\)/);
});

test('fabricated ROI/uplift claims are removed from the readiness report and its live default-visible UI', () => {
  const builder = readBackend('src/sellerPrep/reports/sellerReadiness.builder.ts');
  assert.doesNotMatch(builder, /\$15k|\$5k|estimatedUpliftRange/);

  const controller = readBackend('src/sellerPrep/sellerPrep.controller.ts');
  assert.doesNotMatch(controller, /estimatedUpliftRange/);
  assert.doesNotMatch(controller, /roiRange\}\s*ROI/);

  // ValueEstimatorCard/BudgetTrackerCard (the fabricated $-figure engine) are
  // gated behind feature flags that default to false and are not set
  // anywhere in the repo's env config — confirmed dormant, not touched here.
  const featureFlags = readRepository('apps/frontend/src/lib/featureFlags.ts');
  assert.match(featureFlags, /VALUE_ESTIMATOR: process\.env\.NEXT_PUBLIC_FEATURE_VALUE_ESTIMATOR === 'true'/);

  // The per-item ROI%/cost-bucket line in the default-visible checklist tab
  // (not behind any flag) must not claim a property-specific ROI figure.
  const overviewCard = readRepository(
    'apps/frontend/src/components/seller-prep/SellerPrepOverview.tsx',
  );
  assert.doesNotMatch(overviewCard, /ROI: \{item\.roiRange\}/);
  assert.doesNotMatch(overviewCard, /maximize your sale price/i);
});

test('lead-capture and dashboard-card copy no longer promise fulfillment (verified providers, 24-hour response, free quotes) that does not exist', () => {
  const modal = readRepository('apps/frontend/src/components/seller-prep/LeadCaptureModal.tsx');
  assert.doesNotMatch(modal, /Get Free Quotes/);
  assert.doesNotMatch(modal, /within 24 hours/);
  assert.doesNotMatch(modal, /verified,? licensed/i);
  assert.doesNotMatch(modal, /up to 3 verified/i);
  assert.match(modal, /consentGiven/);

  const disclaimer = readRepository('apps/frontend/src/components/seller-prep/SellerPrepDisclaimer.tsx');
  assert.doesNotMatch(disclaimer, /adjust for:/);

  const dashboardCard = readRepository('apps/frontend/src/components/seller-prep/SellerPrepDashboardCard.tsx');
  assert.doesNotMatch(dashboardCard, /maximize your sale price/i);
});

test('top actions are ranked by an explicit priority order, not a lexical string sort', () => {
  const builder = readBackend('src/sellerPrep/reports/sellerReadiness.builder.ts');
  assert.doesNotMatch(builder, /\.sort\(\(a, b\) => a\.priority\.localeCompare/);
  assert.match(builder, /PRIORITY_RANK/);
});

test('Slice 9: contractor help routes to the real Providers/Bookings marketplace instead of the inert lead-capture note', () => {
  const overviewCard = readRepository(
    'apps/frontend/src/components/seller-prep/SellerPrepOverview.tsx',
  );
  // Primary CTA is a real link into the existing provider search/booking
  // flow — Seller Prep has no fulfillment of its own; Providers/Bookings
  // does (browse-and-book, admin-reviewed licensing, real lifecycle).
  assert.match(overviewCard, /\/dashboard\/providers\?propertyId=\$\{propertyId\}&from=seller-prep/);
  assert.match(overviewCard, /Browse verified providers/);
  // The old note-only path must stay clearly secondary and honestly labeled
  // — it doesn't contact anyone, unlike the real link above.
  assert.match(overviewCard, /no provider is contacted/);

  // Per-item deep links use real ServiceCategory values the provider search
  // page actually filters on, not made-up category strings.
  assert.match(overviewCard, /TASK_SERVICE_CATEGORY/);
  assert.match(overviewCard, /INTERIOR_PAINT:\s*'PAINTING'/);
  assert.match(overviewCard, /ROOF_REPLACEMENT:\s*'ROOFING'/);

  const schema = readBackend('prisma/schema.prisma');
  const serviceCategoryEnum = schema.slice(
    schema.indexOf('enum ServiceCategory'),
    schema.indexOf('}', schema.indexOf('enum ServiceCategory')),
  );
  for (const category of ['PAINTING', 'HANDYMAN', 'LANDSCAPING', 'ROOFING']) {
    assert.match(serviceCategoryEnum, new RegExp(`\\b${category}\\b`));
  }
});
