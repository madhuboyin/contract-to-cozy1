const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node/register');

const {
  formatAskMaintenanceDescription,
  formatAskMaintenanceScope,
  formatAskMaintenanceTitle,
} = require('../../src/services/ask/askMaintenancePresentation.ts');

test('converts stored maintenance system identifiers to homeowner labels', () => {
  assert.equal(formatAskMaintenanceTitle('HIGH Risk: HVAC_FURNACE'), 'HVAC Furnace');
  assert.equal(formatAskMaintenanceTitle('HIGH Risk: SAFETY_SMOKE_CO_DETECTORS'), 'Smoke & CO Detector Check');
  assert.equal(formatAskMaintenanceScope({ assetType: 'WATER_HEATER_TANK' }), 'Water Heater');
});

test('keeps free-form instructions while normalizing legacy descriptions', () => {
  assert.equal(formatAskMaintenanceTitle('Flush the upstairs water heater'), 'Flush the upstairs water heater');
  assert.equal(formatAskMaintenanceDescription({ title: 'HIGH Risk: HVAC_FURNACE', description: 'Add Home Warranty' }), 'Review coverage options for HVAC Furnace.');
  assert.equal(formatAskMaintenanceDescription({ title: 'Inspect safety equipment', description: 'Test SAFETY_SMOKE_CO_DETECTORS now' }), 'Test Smoke & CO Detector Check now');
});
