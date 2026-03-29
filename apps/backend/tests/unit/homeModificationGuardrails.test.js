const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  HomeModificationAdvisorService,
} = require('../../src/services/homeModificationAdvisor.service.ts');

test('applyRegionalGuardrails clamps cost and roi when AI estimates exceed bounds', () => {
  const svc = new HomeModificationAdvisorService();
  const input = [
    {
      title: 'Kitchen Remodel',
      category: 'RESALE',
      priority: 'HIGH',
      estimatedCost: 250000,
      roi: 220,
      timeline: '8 weeks',
      description: 'Large kitchen remodel project',
      benefits: ['Resale appeal'],
      contractorType: 'General Contractor',
      permitRequired: true,
      source: 'AI_ESTIMATE',
    },
  ];

  const result = svc.applyRegionalGuardrails(input, 'CA');
  assert.equal(result.length, 1);
  assert.equal(result[0].estimatedCost <= 46900, true);
  assert.equal(result[0].roi, 100);
  assert.equal(result[0].confidence, 'LOW');
  assert.equal(result[0].validation.costWasClamped, true);
  assert.equal(result[0].validation.roiWasClamped, true);
});

test('applyRegionalGuardrails preserves medium confidence when values stay within baseline ranges', () => {
  const svc = new HomeModificationAdvisorService();
  const input = [
    {
      title: 'Smart Thermostat System',
      category: 'ENERGY',
      priority: 'IMMEDIATE',
      estimatedCost: 1200,
      roi: 95,
      timeline: '1 day',
      description: 'Thermostat upgrade',
      benefits: ['Lower utility costs'],
      contractorType: 'HVAC Technician',
      permitRequired: false,
      source: 'AI_ESTIMATE',
    },
  ];

  const result = svc.applyRegionalGuardrails(input, 'TX');
  assert.equal(result.length, 1);
  assert.equal(result[0].estimatedCost, 1200);
  assert.equal(result[0].roi, 95);
  assert.equal(result[0].confidence, 'MEDIUM');
  assert.equal(result[0].validation.costWasClamped, false);
  assert.equal(result[0].validation.roiWasClamped, false);
});
