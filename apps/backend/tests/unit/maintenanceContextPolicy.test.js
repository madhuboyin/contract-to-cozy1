const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const {
  evaluateMaintenanceTemplateApplicability,
  maintenanceTemplateActionKey,
} = require('../../src/services/maintenance/applicabilityPolicy.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'test',
    generatedAt: NOW.toISOString(),
    scopes: [],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

function template(overrides = {}) {
  return {
    id: 'template-1',
    title: 'General Home Inspection',
    serviceCategory: 'INSPECTION',
    defaultFrequency: 'ANNUALLY',
    ...overrides,
  };
}

test('owner-managed known HVAC makes an HVAC template applicable', () => {
  const decision = evaluateMaintenanceTemplateApplicability(snapshot({
    'maintenance.tasks': [],
    'systems.heatingType': 'FURNACE',
    'systems.coolingType': null,
    'systems.installedItemTypes': ['FURNACE'],
    'responsibility.hvac': 'OWNER',
  }), template({ title: 'HVAC System Maintenance', serviceCategory: 'HVAC' }), NOW);
  assert.equal(decision.status, 'APPLICABLE');
  assert.ok(decision.usedFactKeys.includes('responsibility.hvac'));
});

test('association responsibility suppresses a matching maintenance template', () => {
  const decision = evaluateMaintenanceTemplateApplicability(snapshot({
    'maintenance.tasks': [],
    'systems.heatingType': 'FURNACE',
    'systems.coolingType': null,
    'systems.installedItemTypes': ['FURNACE'],
    'responsibility.hvac': 'ASSOCIATION',
  }), template({ title: 'HVAC System Maintenance', serviceCategory: 'HVAC' }), NOW);
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['ASSOCIATION_RESPONSIBLE']);
});

test('unknown lawn presence is not treated as a lawn', () => {
  const decision = evaluateMaintenanceTemplateApplicability(snapshot({
    'maintenance.tasks': [],
    'exterior.hasLawn': null,
  }), template({ title: 'Lawn Fertilization', serviceCategory: 'LANDSCAPING' }), NOW);
  assert.equal(decision.status, 'UNKNOWN');
  assert.deepEqual(decision.missingFactKeys, ['exterior.hasLawn']);
});

test('active template task prevents duplicate creation', () => {
  const decision = evaluateMaintenanceTemplateApplicability(snapshot({
    'maintenance.tasks': [{
      actionKey: maintenanceTemplateActionKey('template-1'),
      status: 'PENDING',
      lastCompletedDate: null,
      updatedAt: NOW.toISOString(),
    }],
  }), template(), NOW);
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['ACTIVE_TASK_EXISTS']);
});

test('Maintenance Setup and task creation share the same server policy', () => {
  const listing = fs.readFileSync(path.resolve(__dirname, '../../src/services/maintenance.service.ts'), 'utf8');
  const creation = fs.readFileSync(path.resolve(__dirname, '../../src/services/PropertyMaintenanceTask.service.ts'), 'utf8');
  assert.match(listing, /evaluateMaintenanceTemplateApplicability/);
  assert.match(creation, /evaluateMaintenanceTemplateApplicability/);
  assert.match(creation, /maintenanceTemplateActionKey/);
});
