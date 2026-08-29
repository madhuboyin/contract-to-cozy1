const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// C2C Intelligence & Agentic Evolution — Phase 4B (§9.2). The admission
// process made executable: nothing registers as a RepairReplaceProfile or
// a non-DEV AgentDefinition without a recorded, passing admission decision.

const {
  SPECIALIST_ADMISSION_RECORDS,
  SPECIALIST_ADMISSION_GATES,
  REQUIRED_GATES_BY_CLASSIFICATION,
  HIGHER_RISK_INVENTORY_CATEGORIES,
  deriveSpecialistAdmissionStatus,
  requiredGatesFor,
  getSpecialistAdmissionRecord,
  isProfileAdmitted,
  validateSpecialistAdmissionRegistry,
} = require('../../src/services/agents/specialistAdmissionRegistry.ts');
const { REPAIR_REPLACE_PROFILES } = require('../../src/services/agents/repairReplaceProfileRegistry.ts');

test('the real registry passes its own validation', () => {
  assert.deepEqual(validateSpecialistAdmissionRegistry(), []);
});

test('HVAC is the ADMITTED reference implementation with every gate cleared', () => {
  const hvac = getSpecialistAdmissionRecord('HVAC');
  assert.ok(hvac);
  assert.equal(hvac.status, 'ADMITTED');
  assert.equal(hvac.classification, 'NEW_SPECIALIST');
  for (const gate of SPECIALIST_ADMISSION_GATES) {
    assert.equal(hvac.gateReviews[gate].status, 'PASS', `${gate} must be PASS`);
  }
  assert.equal(deriveSpecialistAdmissionStatus(hvac), 'ADMITTED');
});

test('GENERIC_APPLIANCE is PENDING_REVIEW and blocked on the IPD-006 evaluation suite', () => {
  const record = getSpecialistAdmissionRecord('GENERIC_APPLIANCE');
  assert.ok(record);
  assert.equal(record.status, 'PENDING_REVIEW');
  assert.equal(record.ownerInputId, 'IPD-006');
  assert.equal(record.gateReviews.EVALUATION_SUITE.status, 'NOT_REVIEWED');
  assert.equal(deriveSpecialistAdmissionStatus(record), 'PENDING_REVIEW');
  assert.equal(isProfileAdmitted('GENERIC_APPLIANCE'), false);
});

test('the four higher-risk families are explicit NOT_ADMITTED exclusions', () => {
  for (const candidateId of ['ELECTRICAL_REPAIR_REPLACE', 'PLUMBING_REPAIR_REPLACE', 'ROOFING_REPAIR_REPLACE', 'STRUCTURAL_REPAIR_REPLACE']) {
    const record = getSpecialistAdmissionRecord(candidateId);
    assert.ok(record, `${candidateId} must have a record`);
    assert.equal(record.status, 'NOT_ADMITTED');
    assert.equal(record.decision, 'DECLINED');
  }
});

test('a higher-risk category forces the safety and autonomy gates regardless of classification', () => {
  const plumbingAsProfile = {
    candidateId: 'PLUMBING_AS_PROFILE',
    title: 'x', notes: 'x',
    classification: 'NEW_PROFILE_EXISTING_SHAPE',
    decision: 'PURSUE',
    wouldRegister: { profileId: 'PLUMBING_X', eligibleCategories: ['PLUMBING'] },
    gateReviews: Object.fromEntries(SPECIALIST_ADMISSION_GATES.map((gate) => [gate, { status: 'PASS', evidence: 'x', reviewedOn: '2026-08-29' }])),
    status: 'ADMITTED',
  };
  // Even as a "just a profile", PLUMBING pulls in the safety-tier and
  // autonomy gates — they are in the required set here.
  const required = requiredGatesFor(plumbingAsProfile);
  assert.ok(required.includes('SAFETY_TIER_REVIEW'));
  assert.ok(required.includes('AUTONOMY_CEILING_REJUSTIFICATION'));

  // Drop the safety gate and it can no longer be ADMITTED.
  plumbingAsProfile.gateReviews.SAFETY_TIER_REVIEW = { status: 'NOT_REVIEWED', evidence: 'x', reviewedOn: null };
  assert.equal(deriveSpecialistAdmissionStatus(plumbingAsProfile), 'PENDING_REVIEW');
});

test('validation rejects a registered profile with no ADMITTED record', () => {
  const issues = validateSpecialistAdmissionRegistry(SPECIALIST_ADMISSION_RECORDS, {
    profiles: [
      ...REPAIR_REPLACE_PROFILES,
      { profileId: 'UNADMITTED_PROFILE', eligibleCategories: ['APPLIANCE'] },
    ],
  });
  assert.ok(issues.some((issue) => issue.includes('UNADMITTED_PROFILE') && issue.includes('ADMITTED admission record')));
});

test('validation rejects a non-DEV AgentDefinition with no ADMITTED record', () => {
  const issues = validateSpecialistAdmissionRegistry(SPECIALIST_ADMISSION_RECORDS, {
    agentRegistry: {
      'ghost-specialist': { activeVersion: '1.0.0', versions: { '1.0.0': { releaseState: 'ENABLED' } } },
    },
  });
  assert.ok(issues.some((issue) => issue.includes('ghost-specialist') && issue.includes('no ADMITTED admission record')));
});

test('validation catches a declared status that the gate reviews do not justify', () => {
  const lying = [{
    candidateId: 'LIAR',
    title: 'x', notes: 'x',
    classification: 'NEW_SPECIALIST',
    decision: 'PURSUE',
    wouldRegister: {},
    gateReviews: Object.fromEntries(SPECIALIST_ADMISSION_GATES.map((gate) => [gate, { status: 'NOT_REVIEWED', evidence: 'x', reviewedOn: null }])),
    status: 'ADMITTED',
  }];
  const issues = validateSpecialistAdmissionRegistry(lying, { profiles: [], agentRegistry: {} });
  assert.ok(issues.some((issue) => issue.includes('LIAR') && issue.includes('gate reviews justify PENDING_REVIEW')));
});

test('every classification requires the evaluation suite gate (the §12.6 "same bar as an AgentDefinition" rule)', () => {
  for (const gates of Object.values(REQUIRED_GATES_BY_CLASSIFICATION)) {
    assert.ok(gates.includes('EVALUATION_SUITE'));
  }
});

test('HIGHER_RISK_INVENTORY_CATEGORIES names electrical, plumbing, roofing and structural and excludes APPLIANCE/HVAC', () => {
  assert.deepEqual([...HIGHER_RISK_INVENTORY_CATEGORIES].sort(), ['ELECTRICAL', 'PLUMBING', 'ROOF_EXTERIOR', 'STRUCTURAL']);
  assert.ok(!HIGHER_RISK_INVENTORY_CATEGORIES.includes('APPLIANCE'));
  assert.ok(!HIGHER_RISK_INVENTORY_CATEGORIES.includes('HVAC'));
});
