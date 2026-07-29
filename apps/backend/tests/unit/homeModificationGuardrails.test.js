const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  HomeModificationAdvisorService,
} = require('../../src/services/homeModificationAdvisor.service.ts');

test('applyRegionalGuardrails replaces unsupported point claims with a broad bounded range', () => {
  const svc = new HomeModificationAdvisorService();
  const input = [
    {
      title: 'Kitchen Remodel',
      category: 'RESALE',
      estimatedCostMin: 250000,
      estimatedCostMax: 300000,
      timeline: '8 weeks',
      description: 'Large kitchen remodel project',
      benefits: ['Resale appeal'],
      whyThisFits: 'Matches the selected resale goal.',
      contractorType: 'General Contractor',
      source: 'AI_ESTIMATE',
    },
  ];

  const result = svc.applyRegionalGuardrails(input, 'CA');
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].costRange, { min: 23500, max: 46900, currency: 'USD' });
  assert.equal(result[0].confidence, 'LOW');
  assert.equal(result[0].validation.costRangeWasAdjusted, true);
  assert.equal(result[0].permitGuidance, 'VERIFY_WITH_LOCAL_AUTHORITY');
  assert.equal('priority' in result[0], false);
  assert.equal('roi' in result[0], false);
  assert.equal('permitRequired' in result[0], false);
});

test('applyRegionalGuardrails preserves an in-bounds range and exposes assumptions', () => {
  const svc = new HomeModificationAdvisorService();
  const input = [
    {
      title: 'Smart Thermostat System',
      category: 'ENERGY',
      estimatedCostMin: 900,
      estimatedCostMax: 1600,
      timeline: '1 day',
      description: 'Thermostat upgrade',
      benefits: ['Lower utility costs'],
      whyThisFits: 'Matches the selected efficiency goal.',
      contractorType: 'HVAC Technician',
      source: 'AI_ESTIMATE',
    },
  ];

  const result = svc.applyRegionalGuardrails(input, 'TX');
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].costRange, { min: 900, max: 1600, currency: 'USD' });
  assert.equal(result[0].confidence, 'MEDIUM');
  assert.equal(result[0].validation.costRangeWasAdjusted, false);
  assert.ok(result[0].assumptions.length > 0);
  assert.match(result[0].validation.notes.join(' '), /actual cost depends/i);
});

test('Home Upgrades contract excludes unsafe aggregate and authority claims', () => {
  const service = fs.readFileSync(
    path.join(__dirname, '../../src/services/homeModificationAdvisor.service.ts'),
    'utf8',
  );
  const ui = fs.readFileSync(
    path.join(__dirname, '../../../frontend/src/components/HomeModificationAdvisor.tsx'),
    'utf8',
  );

  for (const unsupportedField of [
    'totalEstimatedCost',
    'averageROI',
    'quickWins',
    'longTermProjects',
    'permitRequired',
    'roiModel',
    'RecommendationPriority',
  ]) {
    assert.doesNotMatch(service, new RegExp(`\\b${unsupportedField}\\b`));
  }

  for (const unsupportedCopy of [
    'Avg. ROI',
    'Estimated total cost',
    'Quick Wins',
    'Building permit required',
  ]) {
    assert.doesNotMatch(ui, new RegExp(unsupportedCopy, 'i'));
  }
  assert.match(ui, /Permit applicability is unknown/i);
  assert.match(ui, /Broad cost range/i);
});
