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
  verifyRichPresentationPopulationEquivalence,
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

  // 4. Production Ask handler & capability registry wiring (before planShape789 + across QUERY/CAPABILITY/COMMAND)
  const handlerSource = fs.readFileSync(
    path.join(__dirname, '../../src/services/ask/handlers/dataPointRead.handler.ts'),
    'utf8'
  );
  assert.ok(handlerSource.includes('executePhase2aOnProperty'));
  assert.ok(handlerSource.indexOf('executePhase2aOnProperty') < handlerSource.indexOf('planShape789(message)'));

  const capabilityRegistrySource = fs.readFileSync(
    path.join(__dirname, '../../src/services/ask/capabilityHandlerRegistry.ts'),
    'utf8'
  );
  assert.ok(capabilityRegistrySource.includes('executePhase2aOnProperty'));
  assert.ok(!capabilityRegistrySource.includes("operationId === 'HVAC_DECISION_START'"));
  assert.ok(capabilityRegistrySource.includes('MAINTENANCE_TASK_CREATE'));
  assert.ok(capabilityRegistrySource.includes('REPLACEMENT_GUIDANCE'));

  // 4b. Maintenance preview passes AskConfirmationSchema and carries confirmMaintenanceTaskCreate params
  const { AskConfirmationSchema } = require('../../src/productFramework/ask/ask.contract.ts');
  const maintPreview = executePhase2aVerticalSlice({
    rawText: 'schedule maintenance for my furnace on 2026-12-01',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(maintPreview.status, 'NEEDS_CONFIRMATION');
  const parsedConfirm = AskConfirmationSchema.safeParse(maintPreview.operationResult.confirmation);
  assert.equal(parsedConfirm.success, true);
  assert.equal(maintPreview.operationResult.parameters.maintenanceTitle, 'Service Furnace');
  assert.equal(maintPreview.operationResult.parameters.maintenancePriority, 'MEDIUM');
  assert.equal(maintPreview.operationResult.parameters.maintenanceNextDueDate, '2026-12-01');
  assert.ok(maintPreview.operationResult.parameters.maintenanceWorkflowVersion);

  // 4c. Prisma snapshot loader applies visibleInventoryItemWhere()
  const executorSource = fs.readFileSync(
    path.join(__dirname, '../../src/services/ask/semantic/phase2a/phase2aSliceExecutor.ts'),
    'utf8'
  );
  assert.ok(executorSource.includes('visibleInventoryItemWhere()'));

  // 4d. Rich presentation equivalence rejects duplicate rendered IDs
  const warNeg = executePhase2aVerticalSlice({
    rawText: 'which appliances have either warranty or due maintenance',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  const listBlock = warNeg.operationResult.blocks.find((b) => b.type === 'GROUPED_LIST');
  const dupBlocks = warNeg.operationResult.blocks.map((b) =>
    b.type === 'GROUPED_LIST'
      ? {
          ...b,
          sections: [{
            ...b.sections[0],
            items: b.sections.flatMap((s) => s.items).map((item, _, all) => ({ ...item, id: all[0].id })),
          }],
        }
      : b
  );
  assert.ok(listBlock);
  const dupCheck = verifyRichPresentationPopulationEquivalence(warNeg.receipt, dupBlocks);
  assert.equal(dupCheck.ok, false);
  assert.ok(dupCheck.reasons.some((r) => r.startsWith('duplicate_rendered_item:')));

  // 5. Canonical plan.minimizedText masks dynamic custom property entities
  const customSnapshot = {
    ...PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    items: [
      ...PHASE2A_SEEDED_PROPERTY_SNAPSHOT.items,
      {
        id: 'item-custom-cooler',
        propertyId: 'prop-phase2a-1',
        name: 'Upstairs beverage cooler',
        category: 'APPLIANCE',
        replacementCostCents: 89900,
        condition: 'GOOD_CONDITION',
        roomId: 'room-kitchen',
        propertyPlanWarrantyId: null,
        itemWarrantyIds: [],
        coverageEvidenceStatus: 'NONE',
      },
    ],
    maintenanceTasks: [
      ...PHASE2A_SEEDED_PROPERTY_SNAPSHOT.maintenanceTasks,
      {
        id: 'maint-no-due-date',
        propertyId: 'prop-phase2a-1',
        title: 'Inspect beverage cooler gasket',
        status: 'PENDING',
        priority: 'LOW_PRIORITY',
        nextDueDate: '',
        inventoryItemId: 'item-custom-cooler',
      },
    ],
  };
  const customPlanResult = executePhase2aVerticalSlice({
    rawText: 'show replacement cost for Upstairs beverage cooler',
    snapshot: customSnapshot,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.ok(!customPlanResult.plan.minimizedText.includes('Upstairs beverage cooler'));
  assert.ok(customPlanResult.plan.minimizedText.includes('[ITEM_1]'));

  // 6. Tasks with empty nextDueDate are NOT treated as overdue
  const overdueResult = executePhase2aVerticalSlice({
    rawText: 'which appliances have overdue maintenance',
    snapshot: customSnapshot,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.deepEqual(overdueResult.activeEntityIds, ['item-furnace']);

  // 7. DATA_POINT_READ operation contract allows GROUPED_LIST and BOUNDARY
  const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
  assert.ok(ASK_OPERATION_DEFINITIONS.DATA_POINT_READ.allowedBlockTypes.includes('GROUPED_LIST'));
  assert.ok(ASK_OPERATION_DEFINITIONS.DATA_POINT_READ.allowedBlockTypes.includes('BOUNDARY'));

  // 8. Apostrophe-less negative contraction resolves negatively, and unresolved tokens fail closed
  const arentResult = executePhase2aVerticalSlice({
    rawText: 'items that arent in the basement',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(arentResult.status, 'ANSWERED');
  assert.deepEqual(arentResult.activeEntityIds, ['item-fridge', 'item-dishwasher']);

  const unresolvedNegResult = executePhase2aVerticalSlice({
    rawText: 'items that florb in the basement',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });
  assert.equal(unresolvedNegResult.status, 'OUT_OF_SCOPE');
  assert.deepEqual(unresolvedNegResult.activeEntityIds, []);

  // 9. Capability, command, ordinary maintenance read, and follow-up fail closed on unresolved spans
  for (const unresolvedPrompt of [
    'should I repair or replace my furnace florb',
    'schedule maintenance for my furnace on 2026-12-01 florb',
    'which maintenance tasks are not overdue florb',
  ]) {
    const res = executePhase2aVerticalSlice({
      rawText: unresolvedPrompt,
      snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
      auth: PHASE2A_OWNER_AUTH,
    });
    assert.equal(res.status, 'OUT_OF_SCOPE', `expected OUT_OF_SCOPE for: ${unresolvedPrompt}`);
    assert.equal(res.plan.outcome, 'NONE_FITS');
    assert.ok(res.plan.unresolvedSpans.some((span) => span.text.toLowerCase() === 'florb'));
    assert.equal(res.operationResult.confirmation, null);
  }

  for (const unresolvedFollowUp of ['florb', 'how many florb']) {
    const followUpRes = applyPhase2aFollowUpRefinement({
      priorResult: arentResult,
      followUpText: unresolvedFollowUp,
      snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
      auth: PHASE2A_OWNER_AUTH,
    });
    assert.equal(followUpRes.status, 'OUT_OF_SCOPE', `expected OUT_OF_SCOPE for follow-up: ${unresolvedFollowUp}`);
    assert.equal(followUpRes.plan.outcome, 'NONE_FITS');
    assert.deepEqual(followUpRes.activeEntityIds, []);
    assert.ok(followUpRes.plan.unresolvedSpans.some((span) => span.text.toLowerCase() === 'florb'));
  }
});

test('Phase 2A maintenance preview includes matching confirmationVersion and confirmationExpiresAt in parameters', () => {
  const {
    executePhase2aVerticalSlice,
    PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    PHASE2A_OWNER_AUTH,
  } = require('../../src/services/ask/semantic/phase2a/index.ts');

  const preview = executePhase2aVerticalSlice({
    rawText: 'schedule maintenance for my furnace on 2026-12-01',
    snapshot: PHASE2A_SEEDED_PROPERTY_SNAPSHOT,
    auth: PHASE2A_OWNER_AUTH,
  });

  assert.equal(preview.status, 'NEEDS_CONFIRMATION');
  assert.ok(preview.operationResult.confirmation);
  assert.equal(
    preview.operationResult.parameters.confirmationVersion,
    preview.operationResult.confirmation.version
  );
  assert.equal(
    preview.operationResult.parameters.confirmationExpiresAt,
    preview.operationResult.confirmation.expiresAt
  );
  assert.ok(new Date(preview.operationResult.parameters.confirmationExpiresAt).getTime() > Date.now());
});

test('confirmMaintenanceTaskCreate reauthorizes inventoryItemId and persists it through PropertyMaintenanceTaskService.createUserTask', async () => {
  const { prisma } = require('../../src/lib/prisma.ts');
  const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');
  const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
  const { maintenanceWorkflowVersion } = require('../../src/services/ask/handlers/maintenance.handler.ts');
  require('../../src/services/ask/handlers/maintenanceConfirm.handler.ts');

  const origItemFindFirst = prisma.inventoryItem.findFirst;
  const origTaskFindMany = prisma.propertyMaintenanceTask.findMany;
  const origTaskFindUnique = prisma.propertyMaintenanceTask.findUnique;
  const origTaskCreate = prisma.propertyMaintenanceTask.create;
  const origAskExecFindMany = prisma.askExecution.findMany;
  const origPropertyFindUnique = prisma.property.findUnique;
  const origPropertyAccess = PropertyMaintenanceTaskService.verifyPropertyOwnership;
  const origSyncTaskWorkItem = PropertyMaintenanceTaskService.syncTaskWorkItem;

  try {
    prisma.propertyMaintenanceTask.findMany = async () => [];
    prisma.propertyMaintenanceTask.findUnique = async () => null;
    prisma.askExecution.findMany = async () => [];
    prisma.property.findUnique = async () => null;
    PropertyMaintenanceTaskService.verifyPropertyOwnership = async () => {};
    PropertyMaintenanceTaskService.syncTaskWorkItem = async () => {};
    const workflowVersion = await maintenanceWorkflowVersion('prop-phase2a-1');

    const baseCtx = {
      execution: {
        id: 'exec-maint-1',
        propertyId: 'prop-phase2a-1',
        operationId: 'MAINTENANCE_TASK_CREATE',
        userId: 'user-1',
      },
      userId: 'user-1',
      access: { role: 'OWNER' },
      command: { roleFloor: 'CONTRIBUTOR' },
      parameters: {
        propertyId: 'prop-phase2a-1',
        inventoryItemId: 'item-furnace',
        maintenanceWorkflowVersion: workflowVersion,
        maintenanceTitle: 'Service Basement Furnace',
        maintenanceDescription: 'Scheduled via Ask for Basement Furnace',
        maintenancePriority: 'MEDIUM',
        maintenanceNextDueDate: '2026-12-01',
        maintenanceIsRecurring: false,
      },
    };

    // 1. Hidden or cross-property item is rejected with ASK_CONFIRMATION_NOT_ACTIVE
    prisma.inventoryItem.findFirst = async () => null;
    await assert.rejects(
      () => confirmCapabilityInvoke('MAINTENANCE_TASK_CREATE', baseCtx),
      (err) => err && err.code === 'ASK_CONFIRMATION_NOT_ACTIVE'
    );

    // 2. Visible item on the same property is reauthorized and persisted on the created task
    let capturedCreateData = null;
    prisma.inventoryItem.findFirst = async (args) => {
      assert.equal(args.where.id, 'item-furnace');
      assert.equal(args.where.propertyId, 'prop-phase2a-1');
      return { id: 'item-furnace' };
    };
    prisma.propertyMaintenanceTask.create = async (args) => {
      capturedCreateData = args.data;
      return {
        id: 'task-created-1',
        propertyId: args.data.propertyId,
        inventoryItemId: args.data.inventoryItemId,
        title: args.data.title,
        status: 'PENDING',
        priority: 'MEDIUM',
        nextDueDate: args.data.nextDueDate,
        isRecurring: false,
        frequency: null,
        createdAt: new Date('2026-11-15T12:00:00.000Z'),
      };
    };

    const confirmed = await confirmCapabilityInvoke('MAINTENANCE_TASK_CREATE', baseCtx);
    assert.equal(confirmed.result.status, 'COMPLETED');
    assert.equal(capturedCreateData.inventoryItemId, 'item-furnace');
  } finally {
    prisma.inventoryItem.findFirst = origItemFindFirst;
    prisma.propertyMaintenanceTask.findMany = origTaskFindMany;
    prisma.propertyMaintenanceTask.findUnique = origTaskFindUnique;
    prisma.propertyMaintenanceTask.create = origTaskCreate;
    prisma.askExecution.findMany = origAskExecFindMany;
    prisma.property.findUnique = origPropertyFindUnique;
    PropertyMaintenanceTaskService.verifyPropertyOwnership = origPropertyAccess;
    PropertyMaintenanceTaskService.syncTaskWorkItem = origSyncTaskWorkItem;
  }
});
