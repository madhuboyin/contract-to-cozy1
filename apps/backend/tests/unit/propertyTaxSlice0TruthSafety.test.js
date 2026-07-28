const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('property tax planning output does not manufacture history or peer comparisons', () => {
  const service = read('../../src/services/propertyTax.service.ts');
  const client = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx');

  assert.doesNotMatch(service, /\bbuildHistory\b|\bbuildComparison\b|\bpercentileApprox\b/);
  assert.doesNotMatch(client, /City median|County median|State median/);
  const estimateRefresh = client.slice(
    client.indexOf('async function refresh('),
    client.indexOf('async function refreshRecord('),
  );
  assert.doesNotMatch(estimateRefresh, /workflow_completed/);
  assert.match(client, /not an observed tax record/i);
});

test('legacy appeal analysis is contained as readiness without unsupported conclusions', () => {
  const service = read('../../src/services/taxAppeal.service.ts');
  const retiredAssistant = path.resolve(
    __dirname,
    '../../../frontend/src/components/TaxAppealAssistant.tsx',
  );

  assert.doesNotMatch(service, /\bSTATE_APPEAL_INFO\b|appealProbability\s*:|confidenceScore\s*:/);
  assert.doesNotMatch(service, /Ready to Submit/);
  assert.match(service, /RULES_NOT_VERIFIED/);
  assert.match(service, /canDetermineDeadline:\s*false/);
  assert.match(service, /canGenerateFilingPacket:\s*false/);
  assert.equal(fs.existsSync(retiredAssistant), false);
});

test('tax appeal entry and Radar handoff resolve to the canonical property-scoped stage', () => {
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/tax-appeal/page.tsx');
  const radar = read('../../src/modules/homeEventRadar/domain/radarActionRegistry.ts');
  const planBudget = read('../../src/productFramework/capabilities/definitions/planBudget.ts');
  const saveOptimize = read('../../src/productFramework/capabilities/definitions/saveOptimize.ts');

  assert.match(page, /tools\/property-tax/);
  assert.match(page, /set\('stage', 'appeal'\)/);
  assert.match(radar, /property-tax\?stage=appeal/);
  assert.doesNotMatch(planBudget, /\['tax-appeal'/);
  assert.match(saveOptimize, /property_tax_decision_or_external_action_recorded/);
});
