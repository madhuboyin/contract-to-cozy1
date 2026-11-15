const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const {
  PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
  PHASE2A_OWNER_AUTH,
  PHASE2A_VIEWER_AUTH,
  PHASE2A_DISCOVERED_ABSTRACTION_CHANGES,
  verifyPhase2aSliceRegistryCompleteness,
  buildSemanticTextEnvelope,
  verifyPlaceholderSpanMapRoundTrip,
  roundTripRestorePlaceholderSpans,
  checkRelationChainBound,
  executePhase2aVerticalSlice,
  applyPhase2aFollowUpRefinement,
  replayPhase2aExecutionWithAuthorization,
  runPhase2aMetamorphicSuite,
  verifyPhase2aInvariants,
} = require('../../src/services/ask/semantic/phase2a/index.ts');

test('Phase 2A registry subset covers inventory, warranty, maintenance, and rooms with valid traversal bounds', () => {
  const report = verifyPhase2aSliceRegistryCompleteness();
  assert.equal(report.ok, true, `Registry completeness failed: ${report.missing.join(', ')}`);
  assert.ok(report.entityCount >= 4);
  assert.ok(report.fieldCount >= 14);
  assert.equal(report.relationCount, 4);
  assert.equal(report.capabilityCount, 2);
});

test('Phase 2A indexed typed placeholder span map preserves raw <-> protected <-> minimized round-trip', () => {
  const rawText = 'Schedule maintenance for my refrigerator SN-FRG-88412 in kitchen on 2026-12-10 for $150.00';
  const envelope = buildSemanticTextEnvelope(rawText);

  assert.ok(envelope.protectedText.includes('[ITEM_1]'));
  assert.ok(envelope.protectedText.includes('[SERIAL_1]'));
  assert.ok(envelope.protectedText.includes('[ROOM_1]'));
  assert.ok(envelope.protectedText.includes('[DATE_1]'));
  assert.ok(envelope.protectedText.includes('[MONEY_1]'));
  assert.ok(!envelope.minimizedText.includes('SN-FRG-88412'));
  assert.ok(!envelope.minimizedText.includes('$150.00'));

  const roundTrip = verifyPlaceholderSpanMapRoundTrip(envelope);
  assert.equal(roundTrip.ok, true, `Round-trip failed: ${roundTrip.reasons.join(', ')}`);
  assert.equal(roundTripRestorePlaceholderSpans(envelope.protectedText, envelope), rawText);
});

test('Phase 2A vertical slice executes inventory count, detail, and bounded room/maintenance relations with receipt entailment and rich presentation equivalence', () => {
  const countResult = executePhase2aVerticalSlice({
    rawText: 'how many appliances do I have',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(countResult.status, 'ANSWERED');
  assert.equal(countResult.receipt.population.confirmedCount, 5);
  assert.equal(countResult.entailment.outcome, 'PASS');
  assert.equal(countResult.presentationEquivalence.ok, true);

  const detailResult = executePhase2aVerticalSlice({
    rawText: 'show replacement cost for my furnace',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(detailResult.status, 'ANSWERED');
  assert.deepEqual(detailResult.activeEntityIds, ['item-furnace']);
  assert.equal(detailResult.entailment.outcome, 'PASS');
  assert.equal(detailResult.presentationEquivalence.ok, true);
  assert.ok(JSON.stringify(detailResult.operationResult.blocks).includes('$6,800.00'));

  const kitchenWarrantyResult = executePhase2aVerticalSlice({
    rawText: 'which appliances in kitchen have warranty',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(kitchenWarrantyResult.status, 'ANSWERED');
  assert.deepEqual(kitchenWarrantyResult.activeEntityIds, ['item-fridge']);
  assert.equal(kitchenWarrantyResult.traversalDepthUsed, 1);
});

test('Phase 2A vertical slice handles positive, negative, unknown, and conflicted warranty states with boundary disclosure', () => {
  const negativeWarranty = executePhase2aVerticalSlice({
    rawText: 'which appliances have no warranty',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(negativeWarranty.status, 'ANSWERED');
  assert.deepEqual(negativeWarranty.activeEntityIds, ['item-dishwasher']);
  assert.equal(negativeWarranty.receipt.population.conflictedCount, 1);
  assert.equal(negativeWarranty.receipt.population.unknownCount, 1);
  assert.equal(negativeWarranty.entailment.outcome, 'PASS');
  assert.equal(negativeWarranty.presentationEquivalence.ok, true);
  assert.ok(negativeWarranty.operationResult.blocks.some((b) => b.type === 'BOUNDARY'));
  assert.ok(negativeWarranty.operationResult.blocks.some((b) => b.type === 'EVIDENCE'));
  assert.ok(negativeWarranty.operationResult.blocks.some((b) => b.type === 'GROUPED_LIST'));
});

test('Phase 2A vertical slice evaluates Boolean AND / EITHER_OR / NEITHER_NOR and clarifies ambiguous negative OR', () => {
  const andResult = executePhase2aVerticalSlice({
    rawText: 'which appliances have warranty and due maintenance',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(andResult.status, 'ANSWERED');
  assert.deepEqual(andResult.activeEntityIds, ['item-water-heater']);

  const eitherOrResult = executePhase2aVerticalSlice({
    rawText: 'which appliances have either warranty or due maintenance',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(eitherOrResult.status, 'ANSWERED');
  assert.deepEqual([...eitherOrResult.activeEntityIds].sort(), ['item-fridge', 'item-furnace', 'item-water-heater']);

  const neitherNorResult = executePhase2aVerticalSlice({
    rawText: 'which appliances have neither warranty nor due maintenance',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(neitherNorResult.status, 'ANSWERED');
  assert.deepEqual([...neitherNorResult.activeEntityIds].sort(), ['item-dishwasher', 'item-sump-pump']);

  const ambiguousNegativeOr = executePhase2aVerticalSlice({
    rawText: 'which appliances do not have warranty or due maintenance',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(ambiguousNegativeOr.status, 'NEEDS_CLARIFICATION');
});

test('Phase 2A vertical slice executes replacement guidance capability, confirmed command preview, follow-up refinement, and authorization replay', () => {
  const guidance = executePhase2aVerticalSlice({
    rawText: 'should I repair or replace my furnace',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(guidance.status, 'ANSWERED');
  assert.equal(guidance.plan.facets[0].requestClass, 'CAPABILITY');
  assert.equal(guidance.entailment.outcome, 'PASS');
  assert.equal(guidance.presentationEquivalence.ok, true);

  const previewOk = executePhase2aVerticalSlice({
    rawText: 'schedule maintenance for my furnace on 2026-12-01',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(previewOk.status, 'NEEDS_CONFIRMATION');

  const previewMissingSlots = executePhase2aVerticalSlice({
    rawText: 'schedule maintenance',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(previewMissingSlots.status, 'NEEDS_CLARIFICATION');

  const warNeg = executePhase2aVerticalSlice({
    rawText: 'which appliances have no warranty',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  const followUpCount = applyPhase2aFollowUpRefinement({
    priorResult: warNeg,
    followUpText: 'how many',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(followUpCount.status, 'ANSWERED');
  assert.equal(followUpCount.receipt.population.confirmedCount, 1);

  const ownerSerial = executePhase2aVerticalSlice({
    rawText: 'show serial number for my refrigerator',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.ok(JSON.stringify(ownerSerial.operationResult.blocks).includes('SN-FRG-88412'));

  const viewerReplay = replayPhase2aExecutionWithAuthorization({
    priorResult: ownerSerial,
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    updatedAuth: PHASE2A_VIEWER_AUTH,
  });
  assert.equal(viewerReplay.status, 'ANSWERED');
  assert.ok(viewerReplay.redactedFields.includes('serialNumber'));
  assert.ok(!JSON.stringify(viewerReplay.operationResult.blocks).includes('SN-FRG-88412'));

  const revokedReplay = replayPhase2aExecutionWithAuthorization({
    priorResult: ownerSerial,
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    updatedAuth: { propertyId: 'prop-phase2a-1', role: 'VIEWER', propertyAuthorized: false },
  });
  assert.equal(revokedReplay.status, 'BLOCKED');
});

test('Phase 2A adjacent negatives, metamorphic suite, discovered abstraction changes, and full invariant suite pass', () => {
  const unsupported = executePhase2aVerticalSlice({
    rawText: 'which appliances have no guarantee',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(unsupported.status, 'OUT_OF_SCOPE');

  const metamorphic = runPhase2aMetamorphicSuite();
  assert.equal(metamorphic.ok, true, `Metamorphic failures: ${metamorphic.failures.join(', ')}`);

  assert.ok(PHASE2A_DISCOVERED_ABSTRACTION_CHANGES.length >= 3);

  const invariants = verifyPhase2aInvariants();
  assert.equal(invariants.ok, true, `Phase 2A invariants failed: ${invariants.reasons.join(', ')}`);
});

test('Phase 2A protects dynamic property entities, hides restricted items as missing, enforces chain bounds, and wires into dataPointRead handler', () => {
  // 1. Dynamic property entity protection + authorized candidate binding
  const dynamicEnvelope = buildSemanticTextEnvelope(
    'Check Upstairs beverage cooler in Sunroom for $450.00',
    {
      dynamicEntities: [
        {
          kind: 'ITEM',
          entityId: 'entity.inventory_item',
          recordId: 'item-custom-1',
          names: ['Upstairs beverage cooler'],
          authorized: true,
          safeDisplayLabel: 'Upstairs beverage cooler',
        },
        {
          kind: 'ROOM',
          entityId: 'entity.room',
          recordId: 'room-custom-1',
          names: ['Sunroom'],
          authorized: true,
          safeDisplayLabel: 'Sunroom',
        },
      ],
    }
  );
  assert.ok(!dynamicEnvelope.minimizedText.includes('Upstairs beverage cooler'));
  assert.ok(!dynamicEnvelope.minimizedText.includes('Sunroom'));
  assert.equal(dynamicEnvelope.spanMap[0].authorizedCandidate.recordId, 'item-custom-1');
  assert.equal(dynamicEnvelope.spanMap[1].authorizedCandidate.recordId, 'room-custom-1');

  // 2. Restricted item mention behaves identically to missing item (FR-ONT-3)
  const restrictedResult = executePhase2aVerticalSlice({
    rawText: 'show replacement cost for my refrigerator',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: { ...PHASE2A_OWNER_AUTH, restrictedItemIds: ['item-fridge'] },
  });
  assert.equal(restrictedResult.status, 'NEEDS_CLARIFICATION');
  assert.equal(restrictedResult.operationResult.reasonCode, 'ASK_ENTITY_MISSING');
  assert.equal(restrictedResult.operationResult.blocks.length, 0);

  // 3. Traversal chain depth and cycle enforcement
  const depthExceeded = checkRelationChainBound(
    ['path.inventory_item.warranty', 'path.inventory_item.room'],
    ['entity.inventory_item', 'entity.warranty', 'entity.room']
  );
  assert.equal(depthExceeded.ok, false);
  assert.equal(depthExceeded.reason, 'TRAVERSAL_DEPTH_EXCEEDED');

  const cycleDetected = checkRelationChainBound(
    ['path.inventory_item.maintenance_task', 'path.maintenance_task.inventory_item'],
    ['entity.inventory_item', 'entity.maintenance_task', 'entity.inventory_item']
  );
  assert.equal(cycleDetected.ok, false);
  assert.equal(cycleDetected.reason, 'TRAVERSAL_CYCLE_DETECTED');

  // 4. Production Ask handler wiring
  const handlerSource = fs.readFileSync(
    path.join(__dirname, '../../src/services/ask/handlers/dataPointRead.handler.ts'),
    'utf8'
  );
  assert.ok(handlerSource.includes('executePhase2aOnProperty'));
});
