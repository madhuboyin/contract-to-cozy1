const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  getTemplateByIssueType,
} = require('../../src/services/guidanceEngine/guidanceTemplateRegistry.ts');
const {
  guidanceSignalResolverService,
} = require('../../src/services/guidanceEngine/guidanceSignalResolver.service.ts');

test('service get_quotes follows the selected service template', () => {
  const cleaning = getTemplateByIssueType('get_quotes', 'SERVICE', 'cleaning_service');
  const inspection = getTemplateByIssueType('get_quotes', 'SERVICE', 'general_inspection');
  const warranty = getTemplateByIssueType('get_quotes', 'SERVICE', 'warranty_purchase');

  assert.equal(cleaning.journeyTypeKey, 'cleaning_service_journey');
  assert.equal(inspection.journeyTypeKey, 'inspection_quote_journey');
  assert.equal(warranty.journeyTypeKey, 'warranty_quote_comparison_journey');
});

test('high_utility_cost routes to the energy efficiency journey', () => {
  const template = getTemplateByIssueType('high_utility_cost', 'ITEM', null);

  assert.equal(template.journeyTypeKey, 'energy_efficiency_resolution');
});

test('high_utility_cost starts at the live Home Savings step', () => {
  const signal = guidanceSignalResolverService.normalizeSignal({
    propertyId: 'property-1',
    signalIntentFamily: 'high_utility_cost',
  });

  assert.equal(signal.canonicalFirstStepKey, 'find_energy_savings');
  assert.equal(signal.recommendedToolKey, 'home-savings');
});

test('energy inefficiency remains on Radar until an approved source exists', () => {
  const signal = guidanceSignalResolverService.normalizeSignal({
    propertyId: 'property-1',
    signalIntentFamily: 'energy_inefficiency_detected',
  });

  assert.equal(signal.canonicalFirstStepKey, 'review_energy_signal');
  assert.equal(signal.recommendedToolKey, 'home-event-radar');
});

test('service-specific issue variants map to their intended service journeys', () => {
  assert.equal(
    getTemplateByIssueType('compare_warranty_plans', 'SERVICE', 'warranty_purchase').journeyTypeKey,
    'warranty_quote_comparison_journey'
  );
  assert.equal(
    getTemplateByIssueType('policy_renewal', 'SERVICE', 'insurance_purchase').journeyTypeKey,
    'insurance_renewal_journey'
  );
  assert.equal(
    getTemplateByIssueType('post_repair_inspection', 'SERVICE', 'general_inspection').journeyTypeKey,
    'post_repair_inspection_journey'
  );
  assert.equal(
    getTemplateByIssueType('deep_clean', 'SERVICE', 'cleaning_service').journeyTypeKey,
    'cleaning_service_journey'
  );
});

test('item symptom issue variants resolve to supported non-default templates', () => {
  assert.equal(
    getTemplateByIssueType('poor_airflow', 'ITEM', null).journeyTypeKey,
    'asset_lifecycle_resolution'
  );
  assert.equal(
    getTemplateByIssueType('tripping_breaker', 'ITEM', null).journeyTypeKey,
    'asset_lifecycle_resolution'
  );
  assert.equal(
    getTemplateByIssueType('connectivity_issue', 'ITEM', null).journeyTypeKey,
    'asset_lifecycle_resolution'
  );
});
