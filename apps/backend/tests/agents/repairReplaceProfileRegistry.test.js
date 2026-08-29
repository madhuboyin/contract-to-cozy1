const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  REPAIR_REPLACE_PROFILES,
  resolveRepairReplaceProfile,
  validateRepairReplaceProfiles,
} = require('../../src/services/agents/repairReplaceProfileRegistry.ts');

test('Phase 2 registers only the HVAC repair-or-replace profile', () => {
  assert.equal(REPAIR_REPLACE_PROFILES.length, 1);
  assert.equal(REPAIR_REPLACE_PROFILES[0].profileId, 'HVAC');
  assert.equal(REPAIR_REPLACE_PROFILES[0].decisionDefinitionId, 'HVAC_REPAIR_REPLACE');
  assert.equal(REPAIR_REPLACE_PROFILES[0].scoringSkillId, 'repair-replace');
  assert.deepEqual(validateRepairReplaceProfiles(), []);
  assert.equal(resolveRepairReplaceProfile('HVAC').profileId, 'HVAC');
  assert.equal(resolveRepairReplaceProfile('APPLIANCE'), 'NO_MATCH');
});

test('profile resolution and validation fail closed on category overlap', () => {
  const duplicate = { ...REPAIR_REPLACE_PROFILES[0], profileId: 'DUPLICATE_HVAC' };
  const profiles = [...REPAIR_REPLACE_PROFILES, duplicate];
  assert.equal(resolveRepairReplaceProfile('HVAC', profiles), 'AMBIGUOUS');
  assert.ok(validateRepairReplaceProfiles(profiles).some((issue) => issue.includes('category "HVAC" claimed by both')));
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
