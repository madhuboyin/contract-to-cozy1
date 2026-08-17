const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../..');
const closingService = fs.readFileSync(path.join(backendRoot, 'src/services/buyerClosingDay.service.ts'), 'utf8');
const center = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerClosingDayCenter.tsx'), 'utf8');
const celebration = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/components/ui/MilestoneCelebration.tsx'), 'utf8');
const celebrationHook = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/hooks/useCelebration.ts'), 'utf8');

test('authorized close atomically writes one durable buyer-completion Home Record milestone', () => {
  assert.match(closingService, /BuyerAcquisitionService\.applyConfirmedClose/);
  assert.match(closingService, /homeEvent\.upsert/);
  assert.match(closingService, /buyer-journey-completed:\$\{checklist\.id\}/);
  assert.match(closingService, /subtype: 'BUYER_JOURNEY_COMPLETED'/);
  assert.match(closingService, /importance: 'HIGHLIGHT'/);
  assert.match(closingService, /sourceEntityType: 'BUYER_CLOSING_DAY_WORKSPACE'/);
});

test('the Home Record milestone labels provenance honestly and retains signed evidence', () => {
  assert.match(closingService, /sourceBadge: 'USER_REPORTED'/);
  assert.match(closingService, /observationKind: 'USER_REPORTED'/);
  assert.match(closingService, /verificationStatus: 'HOMEOWNER_CONFIRMED'/);
  assert.match(closingService, /ContractToCozy did not determine legal effect/);
  assert.match(closingService, /homeEventEvidence\.upsert/);
  assert.match(closingService, /evidenceType: 'DOMAIN_RECORD'/);
  assert.match(closingService, /evidenceType: 'DOCUMENT'/);
  assert.match(closingService, /homeEventDocument\.upsert/);
});

test('successful close presents a deduplicated welcome-home celebration and ownership paths', () => {
  assert.match(celebrationHook, /'closing'/);
  assert.match(celebration, /Welcome home!/);
  assert.match(celebration, /first 90-day home plan is ready/i);
  assert.match(center, /celebrate\('closing'\)/);
  assert.match(center, /First 90-day plan/);
  assert.match(center, /properties\/\$\{propertyId\}\/timeline/);
  assert.match(center, /tools\/home-records/);
  assert.match(center, /home-operations/);
  assert.match(center, /MilestoneCelebration/);
});
