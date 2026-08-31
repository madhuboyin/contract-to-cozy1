const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  REPAIR_REPLACE_PROFILES,
  resolveRepairReplaceProfile,
  validateRepairReplaceProfiles,
} = require('../../src/services/agents/repairReplaceProfileRegistry.ts');
const { resolveSpecialistProfileForLineage } = require('../../src/services/agents/agentRuntime.service.ts');

test('Phase 4A registers HVAC and the admitted generic-appliance profile', () => {
  assert.equal(REPAIR_REPLACE_PROFILES.length, 2);
  assert.equal(REPAIR_REPLACE_PROFILES[0].profileId, 'HVAC');
  assert.equal(REPAIR_REPLACE_PROFILES[0].decisionDefinitionId, 'HVAC_REPAIR_REPLACE');
  assert.equal(REPAIR_REPLACE_PROFILES[0].scoringSkillId, 'repair-replace');
  assert.deepEqual(REPAIR_REPLACE_PROFILES[0].lineagePrefixes, ['repair-replace:']);
  assert.equal(REPAIR_REPLACE_PROFILES[1].displayLabel, 'Appliance Repair-or-Replace Specialist');
  assert.ok(REPAIR_REPLACE_PROFILES[1].disputableInputs.some((input) => input.key === 'appliance.analysis'));
  assert.deepEqual(validateRepairReplaceProfiles(), []);
  assert.equal(resolveRepairReplaceProfile('HVAC').profileId, 'HVAC');
  assert.equal(resolveRepairReplaceProfile('APPLIANCE').profileId, 'GENERIC_APPLIANCE');
  assert.equal(resolveRepairReplaceProfile('APPLIANCE').decisionDefinitionId, 'APPLIANCE_REPAIR_REPLACE');
  for (const unsupported of ['PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'STRUCTURAL']) {
    assert.equal(resolveRepairReplaceProfile(unsupported), 'NO_MATCH');
  }
});

test('the shared runtime resolves each admitted lineage to exactly one profile and rejects fallback prefixes', () => {
  assert.equal(resolveSpecialistProfileForLineage('repair-replace:item-1').profileId, 'HVAC');
  assert.equal(resolveSpecialistProfileForLineage('appliance-repair-replace:item-1').profileId, 'GENERIC_APPLIANCE');
  assert.throws(() => resolveSpecialistProfileForLineage('plumbing-repair-replace:item-1'), /does not identify an admitted/);
});

test('profile resolution and validation fail closed on category overlap', () => {
  const duplicate = { ...REPAIR_REPLACE_PROFILES[0], profileId: 'DUPLICATE_HVAC' };
  const profiles = [...REPAIR_REPLACE_PROFILES, duplicate];
  assert.equal(resolveRepairReplaceProfile('HVAC', profiles), 'AMBIGUOUS');
  assert.ok(validateRepairReplaceProfiles(profiles).some((issue) => issue.includes('category "HVAC" claimed by both')));
  assert.ok(validateRepairReplaceProfiles(profiles).some((issue) => issue.includes('lineage prefix "repair-replace:" claimed by both')));
});

test('profiles require a registered evaluation suite', () => {
  assert.ok(validateRepairReplaceProfiles(REPAIR_REPLACE_PROFILES, new Set()).some((issue) => issue.includes('missing evaluation suite')));
});

test('profiles reject unregistered decision definitions and scoring Skills', () => {
  const invalid = [{
    ...REPAIR_REPLACE_PROFILES[0],
    decisionDefinitionId: 'NOT_REGISTERED',
    scoringSkillId: 'not-registered',
  }];
  const issues = validateRepairReplaceProfiles(invalid);
  assert.ok(issues.some((issue) => issue.includes('unregistered decision definition "NOT_REGISTERED"')));
  assert.ok(issues.some((issue) => issue.includes('unregistered scoring Skill "not-registered"')));
});
