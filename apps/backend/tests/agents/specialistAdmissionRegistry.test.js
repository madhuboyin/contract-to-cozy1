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
  resolveAdmittedProfileForLineage,
  validateSpecialistAdmissionRegistry,
  SPECIALIST_EVALUATION_ARTIFACTS,
} = require('../../src/services/agents/specialistAdmissionRegistry.ts');
const { REPAIR_REPLACE_PROFILES } = require('../../src/services/agents/repairReplaceProfileRegistry.ts');
const { DECISION_CONTEXT_CONTRACTS } = require('../../src/services/decisionPlatform/decisionContextContracts.ts');

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

test('GENERIC_APPLIANCE is ADMITTED after the approved IPD-006 evaluation suite', () => {
  const record = getSpecialistAdmissionRecord('GENERIC_APPLIANCE');
  assert.ok(record);
  assert.equal(record.status, 'ADMITTED');
  assert.equal(record.ownerInputId, 'IPD-006');
  assert.equal(record.classification, 'NEW_DECISION_DEFINITION_SAME_LOOP');
  assert.equal(record.gateReviews.EVALUATION_SUITE.status, 'PASS');
  assert.equal(deriveSpecialistAdmissionStatus(record), 'ADMITTED');
  assert.equal(isProfileAdmitted('GENERIC_APPLIANCE'), true);
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
  assert.ok(issues.some((issue) => issue.includes('ghost-specialist@1.0.0') && issue.includes('no ADMITTED version review')));
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

test('validation rejects profile metadata drift under an admitted profileId', () => {
  const drifted = REPAIR_REPLACE_PROFILES.map((profile) => profile.profileId === 'GENERIC_APPLIANCE'
    ? { ...profile, eligibleCategories: ['PLUMBING'], professionalBoundary: 'unreviewed boundary' }
    : profile);
  const issues = validateSpecialistAdmissionRegistry(SPECIALIST_ADMISSION_RECORDS, {
    profiles: drifted,
    agentRegistry: {},
  });
  assert.ok(issues.some((issue) => issue.includes('GENERIC_APPLIANCE') && issue.includes('eligibleCategories changed after admission')));
  assert.ok(issues.some((issue) => issue.includes('GENERIC_APPLIANCE') && issue.includes('professionalBoundary changed after admission')));
});

test('validation rejects an unreviewed version under an admitted agentId', () => {
  const issues = validateSpecialistAdmissionRegistry(SPECIALIST_ADMISSION_RECORDS, {
    profiles: [],
    agentRegistry: {
      'hvac-repair-replace-specialist': {
        activeVersion: '99.0.0',
        versions: { '99.0.0': { releaseState: 'ENABLED' } },
      },
    },
  });
  assert.ok(issues.some((issue) => issue.includes('hvac-repair-replace-specialist@99.0.0') && issue.includes('no ADMITTED version review')));
});

test('validation rejects a new agent misclassified as an existing-shape profile', () => {
  const gates = Object.fromEntries(SPECIALIST_ADMISSION_GATES.map((gate) => [gate, {
    status: REQUIRED_GATES_BY_CLASSIFICATION.NEW_PROFILE_EXISTING_SHAPE.includes(gate) ? 'PASS' : 'NOT_REVIEWED',
    evidence: 'x',
    reviewedOn: REQUIRED_GATES_BY_CLASSIFICATION.NEW_PROFILE_EXISTING_SHAPE.includes(gate) ? '2026-08-29' : null,
  }]));
  const disguised = {
    candidateId: 'DISGUISED_SPECIALIST', title: 'x', notes: 'x',
    classification: 'NEW_PROFILE_EXISTING_SHAPE', decision: 'PURSUE',
    wouldRegister: {
      agentId: 'new-specialist',
      agentDefinitions: [{ version: '1.0.0', digest: 'not-reviewed' }],
    },
    gateReviews: gates, status: 'ADMITTED',
  };
  const issues = validateSpecialistAdmissionRegistry([disguised], {
    profiles: [],
    agentRegistry: { 'new-specialist': { activeVersion: '1.0.0', versions: { '1.0.0': { releaseState: 'ENABLED' } } } },
  });
  assert.ok(issues.some((issue) => issue.includes('NEW_PROFILE_EXISTING_SHAPE requires a profile target')));
});

test('validation binds decision-definition and AgentDefinition content to the reviewed versions', () => {
  const decisionIssues = validateSpecialistAdmissionRegistry(SPECIALIST_ADMISSION_RECORDS, {
    profiles: [], agentRegistry: {},
    decisionDefinitions: {
      HVAC_REPAIR_REPLACE: { decisionDefinitionId: 'HVAC_REPAIR_REPLACE', version: '2.0' },
      APPLIANCE_REPAIR_REPLACE: { decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE', version: '1.0' },
    },
  });
  assert.ok(decisionIssues.some((issue) => issue.includes('HVAC_REPAIR_REPLACE') && issue.includes('version 2.0 was not admitted')));

  const records = SPECIALIST_ADMISSION_RECORDS.map((record) => record.candidateId === 'HVAC'
    ? { ...record, wouldRegister: { ...record.wouldRegister, agentDefinitions: record.wouldRegister.agentDefinitions.map((ref) => ({ ...ref, digest: 'wrong' })) } }
    : record);
  const digestIssues = validateSpecialistAdmissionRegistry(records, { profiles: [] });
  assert.ok(digestIssues.some((issue) => issue.includes('digest changed after admission')));
});

test('validation requires real ISO review dates for completed reviews', () => {
  const record = SPECIALIST_ADMISSION_RECORDS.find((candidate) => candidate.candidateId === 'HVAC');
  const invalid = [{ ...record, gateReviews: {
    ...record.gateReviews,
    SAFETY_TIER_REVIEW: { status: 'PASS', evidence: 'x', reviewedOn: null },
    EVALUATION_SUITE: { status: 'PASS', evidence: 'x', reviewedOn: '2026-99-99' },
  } }];
  const issues = validateSpecialistAdmissionRegistry(invalid, { profiles: [], agentRegistry: {}, decisionDefinitions: {} });
  assert.ok(issues.some((issue) => issue.includes('SAFETY_TIER_REVIEW is PASS but has no reviewedOn date')));
  assert.ok(issues.some((issue) => issue.includes('EVALUATION_SUITE reviewedOn is not a valid ISO calendar date')));
});

test('any failed gate revokes admission even when the classification previously treated it as reusable', () => {
  const record = SPECIALIST_ADMISSION_RECORDS.find((candidate) => candidate.candidateId === 'GENERIC_APPLIANCE');
  const failed = {
    ...record,
    gateReviews: {
      ...record.gateReviews,
      PROMOTION_AND_LINEAGE_PATH: {
        status: 'FAIL', evidence: 'Lineage is not reachable.', reviewedOn: '2026-08-30',
        reviewedBy: 'C2C_ARCHITECTURE_REVIEW_BOARD', approvalRef: 'PHASE4B-NEGATIVE-REVIEW',
      },
    },
  };
  assert.equal(deriveSpecialistAdmissionStatus(failed), 'NOT_ADMITTED');
  assert.equal(isProfileAdmitted('GENERIC_APPLIANCE', [failed]), false);
});

test('validation rejects future-dated reviews and completed reviews without accountable provenance', () => {
  const record = SPECIALIST_ADMISSION_RECORDS.find((candidate) => candidate.candidateId === 'GENERIC_APPLIANCE');
  const invalid = [{ ...record, gateReviews: {
    ...record.gateReviews,
    SAFETY_TIER_REVIEW: {
      status: 'PASS', evidence: 'x', reviewedOn: '2099-01-01', reviewedBy: null, approvalRef: null,
    },
  } }];
  const issues = validateSpecialistAdmissionRegistry(invalid, {
    profiles: [], agentRegistry: {}, decisionDefinitions: {}, now: new Date('2026-08-30T12:00:00.000Z'),
  });
  assert.ok(issues.some((issue) => issue.includes('reviewedOn cannot be in the future')));
  assert.ok(issues.some((issue) => issue.includes('has no reviewer or approval reference')));
});

test('validation detects same-version context, evaluation, source, and lineage drift', () => {
  const contextIssues = validateSpecialistAdmissionRegistry(SPECIALIST_ADMISSION_RECORDS, {
    profiles: [], agentRegistry: {},
    contextContracts: {
      ...DECISION_CONTEXT_CONTRACTS,
      APPLIANCE_REPAIR_REPLACE: { ...DECISION_CONTEXT_CONTRACTS.APPLIANCE_REPAIR_REPLACE, maximumFacts: 99 },
    },
  });
  assert.ok(contextIssues.some((issue) => issue.includes('context contract "APPLIANCE_REPAIR_REPLACE" content changed')));

  const evaluationIssues = validateSpecialistAdmissionRegistry(SPECIALIST_ADMISSION_RECORDS, {
    profiles: [], agentRegistry: {},
    evaluationArtifacts: {
      ...SPECIALIST_EVALUATION_ARTIFACTS,
      'agent-generic-appliance-repair-replace-eval@1.0.0': { cases: [] },
    },
  });
  assert.ok(evaluationIssues.some((issue) => issue.includes('evaluation suite "agent-generic-appliance-repair-replace-eval@1.0.0" content changed')));

  const generic = SPECIALIST_ADMISSION_RECORDS.find((candidate) => candidate.candidateId === 'GENERIC_APPLIANCE');
  const drifted = [{
    ...generic,
    wouldRegister: {
      ...generic.wouldRegister,
      reviewedArtifacts: {
        ...generic.wouldRegister.reviewedArtifacts,
        authoritativeSourceRef: 'unreviewed-engine@9',
        lineagePrefixes: ['unreachable:'],
      },
    },
  }];
  const bindingIssues = validateSpecialistAdmissionRegistry(drifted, { profiles: [], agentRegistry: {} });
  assert.ok(bindingIssues.some((issue) => issue.includes('authoritative source binding')));
  assert.ok(bindingIssues.some((issue) => issue.includes('promotion/lineage prefixes')));

  const activationIssues = validateSpecialistAdmissionRegistry(SPECIALIST_ADMISSION_RECORDS, {
    profiles: [], agentRegistry: {}, runtimeActivationBindings: {},
  });
  assert.ok(activationIssues.some((issue) => issue.includes('executable runtime activation binding')));
});

test('lineage resolution returns only profiles whose current admission still derives ADMITTED', () => {
  assert.equal(resolveAdmittedProfileForLineage('appliance-repair-replace:item-1').profileId, 'GENERIC_APPLIANCE');
  const records = SPECIALIST_ADMISSION_RECORDS.map((record) => record.candidateId === 'GENERIC_APPLIANCE'
    ? {
      ...record,
      gateReviews: {
        ...record.gateReviews,
        PROMOTION_AND_LINEAGE_PATH: {
          status: 'FAIL', evidence: 'revoked', reviewedOn: '2026-08-30',
          reviewedBy: 'C2C_ARCHITECTURE_REVIEW_BOARD', approvalRef: 'REVOCATION-1',
        },
      },
    }
    : record);
  assert.equal(resolveAdmittedProfileForLineage('appliance-repair-replace:item-1', REPAIR_REPLACE_PROFILES, records), 'NO_MATCH');
});
