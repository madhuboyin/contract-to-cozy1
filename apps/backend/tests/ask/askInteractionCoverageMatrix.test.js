const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Ask Cozy Cross-Domain Interaction Rollout FRD, Phase 0 (§21). The
// Record<AskOperationId, ...> type on ASK_INTERACTION_COVERAGE_MATRIX is the
// primary drift check -- a newly registered AskOperationId with no entry
// fails `tsc` before this file ever runs. This test adds the runtime checks
// a type can't express: that the matrix's own semantic claims (rollClass,
// confirmationCapable, canonicalOwner, roleFloor) still match what the live
// registries say, and a few structural invariants from ROLL-001/ROLL-002.
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const {
  ASK_INTERACTION_COVERAGE_MATRIX,
  validateAskInteractionCoverageMatrix,
  ASK_DIRECT_MUTATION_OPERATION_IDS,
} = require('../../src/services/ask/askInteractionCoverageMatrix.ts');

test('every one of the 86 Ask operations has a coverage-matrix entry with no registry drift', () => {
  const operationIds = Object.keys(ASK_OPERATION_DEFINITIONS);
  // + HOME_EVENT_RADAR_STATE/MARK_DONE/FEEDBACK (Home Event Radar writes, FRD v1.40, 2026-09-22).
  // + HOME_EVENT_RADAR_TASK/PREFERENCES (FRD v1.41).
  assert.equal(operationIds.length, 108);
  for (const operationId of operationIds) {
    assert.ok(ASK_INTERACTION_COVERAGE_MATRIX[operationId], `${operationId}: missing coverage-matrix entry`);
  }
  assert.deepEqual(validateAskInteractionCoverageMatrix(), []);
});

test('every domain-command operation is classified CONFIRMED_MUTATION and vice versa', () => {
  const commandOperationIds = new Set(Object.values(ASK_DOMAIN_COMMAND_REGISTRY).map((c) => c.operationId));
  for (const [operationId, entry] of Object.entries(ASK_INTERACTION_COVERAGE_MATRIX)) {
    if (commandOperationIds.has(operationId)) {
      assert.equal(entry.rollClass, 'CONFIRMED_MUTATION', `${operationId}: has a domain command but is classified ${entry.rollClass}`);
      assert.equal(entry.confirmationCapable, true, `${operationId}: has a domain command but confirmationCapable is false`);
    } else {
      assert.equal(entry.confirmationCapable, false, `${operationId}: confirmationCapable=true but no domain command is registered`);
    }
  }
});

test('every boundary-safety operation is classified BOUNDARY_RESPONSE', () => {
  for (const [operationId, def] of Object.entries(ASK_OPERATION_DEFINITIONS)) {
    if (def.safetyClass.endsWith('_BOUNDARY')) {
      assert.equal(ASK_INTERACTION_COVERAGE_MATRIX[operationId].rollClass, 'BOUNDARY_RESPONSE');
    }
  }
});

test('a non-message-routable (internal) operation is classified INTERNAL_CAPTURE unless it is also confirmation-gated', () => {
  // The four CAPTURE_*_CONFIRM operations are both non-routable at
  // propose-time AND confirmation-gated (a split propose/confirm path
  // sharing one operationId) -- CONFIRMED_MUTATION wins for those, since it
  // describes their real product outcome. SELL_HOLD_RENT_GOAL_CAPTURE is
  // non-routable with no domain command at all, so INTERNAL_CAPTURE is its
  // one true classification.
  for (const [operationId, def] of Object.entries(ASK_OPERATION_DEFINITIONS)) {
    if (!def.messageRoutable) {
      const entry = ASK_INTERACTION_COVERAGE_MATRIX[operationId];
      // A recorded IW-CONF-001 direct write (ASK_DIRECT_MUTATION_OPERATION_IDS) is DIRECT_MUTATION instead.
      const expected = entry.confirmationCapable ? 'CONFIRMED_MUTATION' : ASK_DIRECT_MUTATION_OPERATION_IDS.has(operationId) ? 'DIRECT_MUTATION' : 'INTERNAL_CAPTURE';
      assert.equal(entry.rollClass, expected, `${operationId}: expected ${expected}`);
    }
  }
});

test('a property-scoped operation never has a null role floor (ROLL-002 authorization completeness, mirrored from validateAskOperationDefinitions)', () => {
  for (const [operationId, def] of Object.entries(ASK_OPERATION_DEFINITIONS)) {
    if (def.requiresProperty) {
      assert.notEqual(ASK_INTERACTION_COVERAGE_MATRIX[operationId].roleFloor, null, `${operationId}: requires property but coverage matrix records a null role floor`);
    }
  }
});

// Phase 0 Stage 2, Records and capture track (first per the FRD's own phase
// order). Updated deliberately, by hand, each time a track is actually
// traced -- this list is the thing that makes the next test meaningful: an
// operation's Stage 2 fields flipping to TRACED without a corresponding
// update here (or vice versa) is exactly the silent-fabrication failure
// mode this governance test exists to catch.
const STAGE_2_TRACED_OPERATIONS = new Set([
  'INVENTORY_ITEM_CORRECT',
  'HOME_EVENT_CORRECT',
  'WARRANTY_CORRECT',
  'ROOM_RENAME',
  'ROOM_CREATE',
  'INVENTORY_ITEM_CREATE',
  'PROPERTY_CONTEXT_AREA_CAPTURE',
  'HOME_EVENT_VISIBILITY',
  'INVENTORY_LOOKUP', 'DOCUMENT_LOOKUP', 'PROPERTY_SUMMARY',
  'DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_PROMOTION_CONFIRM', 'MAJOR_EVENT_ENTRY',
  'CAPTURE_FACT_CONFIRM', 'CAPTURE_EVENT_CONFIRM', 'CAPTURE_WARRANTY_CONFIRM', 'CAPTURE_EVIDENCE_CONFIRM',
  'REFINANCE_ANALYSIS', 'SELL_HOLD_RENT_ANALYSIS', 'SELL_HOLD_RENT_GOAL_CAPTURE',
  'HOME_ACTIONS', 'MAINTENANCE_FORECAST', 'HOME_CHANGE_SUMMARY', 'INSPECTION_FINDINGS', 'INTELLIGENCE_ENVELOPE_QUERY',
  'BUYER_PLAN_STATUS', 'BUYER_DEADLINES', 'BUYER_DOCUMENT_READINESS', 'BUYER_INSPECTION_REVIEW',
  'BUYER_TASK_COMPLETE', 'BUYER_TASK_CREATE', 'BUYER_TASK_UPDATE', 'BUYER_MOVE_STATUS',
  'BUYER_FINANCING_READINESS', 'BUYER_TITLE_ESCROW_READINESS', 'BUYER_WALKTHROUGH_READINESS',
  'BUYER_DISCLOSURE_FUNDS_READINESS', 'BUYER_CLOSING_DAY_READINESS', 'BUYER_CONTRACT_TIMELINE',
  'BUYER_NEGOTIATION_READINESS', 'BUYER_COST_READINESS', 'BUYER_FINDING_DISPOSITION', 'BUYER_LIFECYCLE_UPDATE',
  'REPLACEMENT_GUIDANCE', 'HVAC_DECISION_START', 'HVAC_DECISION_CONTINUE', 'HVAC_SPECIALIST_ENGAGE',
  'HVAC_DECISION_SCENARIO', 'HVAC_DECISION_ABANDON', 'HVAC_PREFERENCE_SAVE', 'HVAC_PREFERENCE_FORGET',
  'HVAC_DECISION_OUTCOME_REPORT', 'HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_OUTCOME_UNLINK',
  'GUIDANCE_JOURNEY_CREATE', 'QUOTE_COMPARISON_CREATE', 'QUOTE_COMPARISON_REVIEW',
  'RENOVATION_PERMIT_READINESS', 'SELLER_PREP_CHECKLIST', 'SELLER_PREP_ITEM_DECISION',
  'COVERAGE_GAPS', 'COVERAGE_COMPARISON_STATUS', 'INCIDENT_CLAIM_STATUS', 'CLAIM_FILE', 'CLAIM_TRANSITION', 'INCIDENT_CONTINUATION',
  'SAVINGS_OPPORTUNITIES', 'OWNERSHIP_COSTS', 'CAPITAL_RESERVE_PLAN', 'PROPERTY_TAX_APPEAL_READINESS', 'REFINANCE_RATE_MONITOR',
  'EMERGENCY_BOUNDARY', 'UNSAFE_RESTRICTED_BOUNDARY', 'OUT_OF_SCOPE_BOUNDARY',
  'HOUSEHOLD_INVITATION', 'CAPABILITY_DISCOVERY', 'GROUNDED_GUIDANCE',
  'MAINTENANCE_STATUS', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_COMPLETE', 'MAINTENANCE_TASK_UPDATE',
  'OPERATIONAL_WORK_UPDATE', 'INSPECTION_FINDING_UPDATE', 'HOME_DEADLINE_MONITOR',
  'HOME_EVENT_RADAR_FEED',
  'HOME_EVENT_RADAR_STATE', 'HOME_EVENT_RADAR_MARK_DONE', 'HOME_EVENT_RADAR_FEEDBACK',
  'HOME_EVENT_RADAR_TASK', 'HOME_EVENT_RADAR_PREFERENCES',
  // FRD v1.48: the first new operation for a capability that had none.
  'BREAK_EVEN_ANALYSIS',
  'NEIGHBORHOOD_CHANGE_FEED',
  'PAST_HAZARD_EXPOSURE',
  'HOME_STATUS_BOARD',
  'HOME_HABITS',
  'HOME_DIGITAL_WILL',
  'PLANT_CARE_OUTLOOK',
  'NEGOTIATION_SHIELD_CASES',
  'HOME_UPGRADE_SCENARIOS',
  'DIY_PROJECTS',
  'PROJECT_TRACKER_PROJECTS',
  'SERVICE_PRICE_CHECKS',
  'HOME_TIMELINE_EVENTS',
  'MATERIAL_SPECS_LIST',
  'PROPERTY_BRIEFS_LIST',
  'GUIDANCE_JOURNEYS_LIST',
  'HOA_COMPLIANCE_STATUS',
]);
// Phase 0 Stage 2 is now complete: every one of the 77 registered operations
// has been traced. This assertion is the actual completion signal -- if a
// 78th operation is ever registered, the earlier "every operation has an
// entry" test still catches it as PENDING, but THIS test is what breaks the
// moment someone believes Stage 2 is finished when it silently isn't.
test('Phase 0 Stage 2 is fully traced: every one of the 77 operations is TRACED, none left PENDING', () => {
  for (const [operationId, entry] of Object.entries(ASK_INTERACTION_COVERAGE_MATRIX)) {
    for (const field of STAGE_2_FIELDS) {
      assert.equal(entry[field].status, 'TRACED', `${operationId}.${field}: Stage 2 claims completion but this field is still PENDING`);
    }
  }
  assert.equal(STAGE_2_TRACED_OPERATIONS.size, 108);
});
const STAGE_2_FIELDS = ['uiSurface', 'freshnessSource', 'idempotency', 'reconciliation', 'handoff'];

test('Stage 2 fields are TRACED with real notes only for operations actually traced this pass; every other operation stays honestly PENDING', () => {
  const operationIds = Object.keys(ASK_INTERACTION_COVERAGE_MATRIX);
  // + HOME_EVENT_RADAR_STATE/MARK_DONE/FEEDBACK (Home Event Radar writes, FRD v1.40, 2026-09-22).
  // + HOME_EVENT_RADAR_TASK/PREFERENCES (FRD v1.41).
  assert.equal(operationIds.length, 108);
  for (const operationId of operationIds) {
    const entry = ASK_INTERACTION_COVERAGE_MATRIX[operationId];
    const shouldBeTraced = STAGE_2_TRACED_OPERATIONS.has(operationId);
    for (const field of STAGE_2_FIELDS) {
      assert.equal(entry[field].status, shouldBeTraced ? 'TRACED' : 'PENDING', `${operationId}.${field}`);
      if (shouldBeTraced) {
        assert.ok(entry[field].notes && entry[field].notes.length > 10, `${operationId}.${field}: TRACED but notes look fabricated/empty`);
      }
    }
  }
  // Catches the inverse mistake: a name added to the allowlist above for an
  // operation the matrix itself was never actually updated for.
  for (const operationId of STAGE_2_TRACED_OPERATIONS) {
    assert.ok(ASK_INTERACTION_COVERAGE_MATRIX[operationId], `${operationId}: in STAGE_2_TRACED_OPERATIONS but not a real operation`);
  }
});

test('MAJOR_EVENT_ENTRY Stage 2 reclassification (NAVIGATION_HANDOFF, not the WORKFLOW_GUIDANCE-family default) is recorded with its reasoning', () => {
  const entry = ASK_INTERACTION_COVERAGE_MATRIX.MAJOR_EVENT_ENTRY;
  assert.equal(entry.rollClass, 'NAVIGATION_HANDOFF');
  assert.match(entry.note, /capabilityResult/);
});

// FRD Sec22: "whether direct SELL_HOLD_RENT_ANALYSIS attaches to an existing
// family thread" was an open product decision gating Phase 4's exit. DECIDED
// and IMPLEMENTED 2026-09-17: Option B (read-attach only) -- selectThread is
// called and DECISION_PROGRESS/WHY_NOW surfaced when a thread exists, but
// createOrResumeThread is never called from this operation. rollClass
// correctly stays READ_RESULT even post-implementation: Option B never
// creates/resumes a thread, so the operation's fundamental interaction type
// doesn't change. This test is a tripwire: if a future change upgrades
// rollClass to WORKFLOW_CONTINUATION, or the note stops recording that a
// decision was actually made, it fails loudly instead of drifting silently.
test('SELL_HOLD_RENT_ANALYSIS records the DECIDED FRD Sec22 outcome (Option B) and stays READ_RESULT', () => {
  const entry = ASK_INTERACTION_COVERAGE_MATRIX.SELL_HOLD_RENT_ANALYSIS;
  assert.equal(entry.rollClass, 'READ_RESULT');
  assert.match(entry.note, /DECIDED/);
  assert.match(entry.note, /Option B/);
  assert.match(entry.reconciliation.notes, /Sec22/);
});

// Stage 2 finding while tracing Buyer: askDomainCommandRegistry.ts's own
// comment for BUYER_LIFECYCLE_UPDATE claims pause "is not yet backed by a
// real lifecycle transition in the service layer" -- direct code reading
// (buyerLifecycleUpdateResult + confirmBuyerLifecycleUpdate +
// BuyerAcquisitionService.pauseJourney/resumeJourney) shows this is stale;
// pause/resume is fully implemented. This tripwire fails if that comment
// is ever corrected without this matrix's note being revisited too.
test('BUYER_LIFECYCLE_UPDATE records the stale pause/resume registry comment as a known code-vs-comment conflict', () => {
  const entry = ASK_INTERACTION_COVERAGE_MATRIX.BUYER_LIFECYCLE_UPDATE;
  assert.match(entry.note, /STALE/);
  assert.match(entry.note, /pauseJourney/);
});

// Second Stage-1 default-rule correction (after MAJOR_EVENT_ENTRY): the
// WORKFLOW_GUIDANCE-family-implies-WORKFLOW_CONTINUATION default was wrong
// again here. Tripwire so a future "helpful" edit can't silently revert
// this to the family default without deliberately updating this test too.
test('INCIDENT_CONTINUATION Stage 2 reclassification (READ_RESULT, not the WORKFLOW_GUIDANCE-family default) is recorded with its reasoning', () => {
  const entry = ASK_INTERACTION_COVERAGE_MATRIX.INCIDENT_CONTINUATION;
  assert.equal(entry.rollClass, 'READ_RESULT');
  assert.match(entry.note, /RECLASSIFICATION/);
  assert.match(entry.note, /DUPLICATES INCIDENT_CLAIM_STATUS/);
});
