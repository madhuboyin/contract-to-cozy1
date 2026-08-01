const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.HOME_OPERATIONS_ACCEPTANCE_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

// Item #21 (§13.1 "Golden lifecycle scenarios"). Real-DB acceptance tests,
// following the established convention in this directory (see
// savingsBenefitsGoldenPath.db.test.js / phase3VerifiedClosure.db.test.js):
// gated on a dedicated *_ACCEPTANCE_DATABASE_URL env var, real service
// functions (not mocks), a unique runId per test for isolation, best-effort
// cleanup via cascading User deletion (every row created here is
// User -> HomeownerProfile -> Property -scoped, or a standalone catalog row
// tracked and deleted explicitly).
//
// Not all 10 scenarios in the doc are equally ready. This file builds real
// tests for what's real today and documents (asserts, not silently skips)
// what isn't -- see docs/product/HOME_OPERATIONS_AND_ACTION_MANAGEMENT_
// CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md §13.1 for the scenario list,
// and the item #21 plan for the full disposition table. Scenarios 2 and 9
// are blocked on work that hasn't shipped and are written as skip stubs
// naming the exact gap, not as passing tests.

function runId(suffix) {
  return `home-ops-golden-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seedHomeownerAndProperty(prisma, id) {
  const homeowner = await prisma.user.create({
    data: {
      email: `${id}-homeowner@example.invalid`,
      firstName: 'Golden',
      lastName: 'Lifecycle',
      role: 'HOMEOWNER',
      passwordHash: 'acceptance-only-not-a-login',
      homeownerProfile: { create: {} },
    },
    include: { homeownerProfile: true },
  });
  const property = await prisma.property.create({
    data: {
      homeownerProfileId: homeowner.homeownerProfile.id,
      name: `Golden Lifecycle ${id}`,
      address: '1 Acceptance Way',
      city: 'Testville',
      state: 'VA',
      zipCode: '22030',
      dwellingType: 'DETACHED_SINGLE_FAMILY',
      ownershipForm: 'FEE_SIMPLE',
      propertyUse: 'PRIMARY_RESIDENCE',
      occupancyStatus: 'OWNER_OCCUPIED',
    },
  });
  return { homeowner, property };
}

async function seedInventoryItem(prisma, propertyId, id) {
  return prisma.inventoryItem.create({
    data: {
      propertyId,
      name: `Acceptance system ${id}`,
      assetType: 'HVAC_SYSTEM',
      category: 'HVAC',
      condition: 'POOR',
      purchaseCostCents: 900_000,
      isVerified: true,
      verificationSource: 'HOME_OPS_GOLDEN_ACCEPTANCE',
    },
  });
}

async function seedConfirmedInspectionReport(prisma, propertyId, id) {
  return prisma.inspectionReport.create({
    data: {
      propertyId,
      reportType: 'GENERAL',
      inspectionDate: new Date(),
      sourceFileKey: `acceptance/${id}/report.pdf`,
      status: 'CONFIRMED',
    },
  });
}

/**
 * Satisfies projectTracker.service.ts's getCompletionChecklist() gate for a
 * VERIFIED_SUCCESS closure without needing a real permit/HOA/materials
 * subsystem: permit/hoa applicability default to UNKNOWN on creation, which
 * evaluateRequirementCompletionCheck() (projectCompliance/completionPolicy.ts)
 * treats as NOT_EVALUATED/failed -- must be explicitly set to NOT_APPLICABLE
 * with a basis string. A PAID payment and a photo-bearing progress log
 * (with no materialType, so the materials check trivially passes via its
 * own zero/zero branch) cover the remaining checks.
 */
async function satisfyProjectCompletionChecklist(prisma, project, homeownerId) {
  await prisma.projectRecord.update({
    where: { id: project.id },
    data: {
      permitApplicability: 'NOT_APPLICABLE',
      permitApplicabilityBasis: 'Acceptance fixture: no permit applies to this scope.',
      hoaApplicability: 'NOT_APPLICABLE',
      hoaApplicabilityBasis: 'Acceptance fixture: no HOA governs this property.',
    },
  });
  await prisma.projectPayment.create({
    data: {
      projectId: project.id,
      description: 'Final payment',
      amountCents: project.contractAmountCents ?? 50_000,
      triggerType: 'MANUAL',
      status: 'PAID',
      paidDate: new Date(),
    },
  });
  await prisma.projectProgressLog.create({
    data: {
      projectId: project.id,
      entryDate: new Date(),
      entryType: 'OTHER',
      notes: 'Acceptance fixture progress photo.',
      photoKeys: [`acceptance/${project.id}/progress.jpg`],
      loggedByUserId: homeownerId,
    },
  });
}

function minimalVerifiedCompletionPayload() {
  return {
    outcomeStatus: 'VERIFIED_SUCCESS',
    actualEndDate: new Date().toISOString(),
    commissioningResult: 'PASSED',
    functionalVerificationResult: 'PASSED',
    safetyCheckResult: 'PASSED',
    inspectionResult: 'NOT_REQUIRED',
    unresolvedExceptions: [],
    proofDocuments: [],
    providerOutcome: 'COMPLETED_AS_AGREED',
    recommendationOverridden: false,
    recommendationComprehensionConfirmed: true,
  };
}

// ── Scenario 1 ───────────────────────────────────────────────────────────

test('Scenario 1: recommendation -> accepted maintenance task -> completion -> VERIFIED', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');
  const { resolveMaintenanceTaskWorkKey } = require('../../src/modules/homeOperations/adapters/maintenanceTask.adapter.ts');
  const { findWorkItemByWorkKey } = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');

  const id = runId('s1');
  const { homeowner, property } = await seedHomeownerAndProperty(prisma, id);
  const userIds = [homeowner.id];
  try {
    const actionKey = `${property.id}:ACTION_CENTER:${id}`;
    const { task, deduped } = await PropertyMaintenanceTaskService.createFromActionCenter(homeowner.id, property.id, {
      title: 'Replace failing sump pump',
      assetType: 'SUMP_PUMP',
      priority: 'HIGH',
      nextDueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      actionKey,
    });
    assert.equal(deduped, false);

    const workKey = resolveMaintenanceTaskWorkKey(task, property.id);
    let workItem = await findWorkItemByWorkKey(property.id, workKey);
    assert.ok(workItem, 'an accepted maintenance task must resolve a real OperationalWorkItem');
    assert.equal(workItem.state, 'ACCEPTED');

    await PropertyMaintenanceTaskService.updateTaskStatus(homeowner.id, task.id, 'COMPLETED');

    workItem = await findWorkItemByWorkKey(property.id, workKey);
    assert.equal(workItem.state, 'VERIFIED', 'a plain (non-recurring) task self-attests completion as its own verification');

    // "Home removal" is inherent to state filtering (a VERIFIED item drops
    // out of any active-work query) -- not a separate removal mechanism to
    // exercise here.

    // KNOWN, DOCUMENTED GAP (see item #21 plan): a plain-Maintenance
    // VERIFIED completion does not write a HomeEvent row today -- only
    // Guidance/Project completions do (guidanceCompletionHooks.service.ts).
    // Asserted explicitly so a future fix is a one-line flip of this
    // assertion, not a rediscovery.
    const homeEvents = await prisma.homeEvent.findMany({ where: { propertyId: property.id } });
    assert.equal(homeEvents.length, 0, 'GAP: plain Maintenance completion does not yet write a HomeEvent -- update if this changes');
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

// ── Scenario 2 — BLOCKED ────────────────────────────────────────────────

test(
  'Scenario 2: seasonal applicability -> occurrence -> snooze -> reschedule -> completion -> next season',
  { skip: 'BLOCKED: SeasonalChecklistService.snoozeTask()/dismissTask() (services/seasonalChecklist.service.ts) '
      + 'never call the Home Operations work-item layer at all today (confirmed by grep: zero references) -- this '
      + 'is item #19 (§5.15) Slice 5\'s job, not yet started. Update this test to a real assertion once Slice 5 ships.' },
  () => {},
);

// ── Scenario 3 ───────────────────────────────────────────────────────────

test('Scenario 3: habit recommendation -> adopt routine -> recurring task -> completion -> adherence update', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { HomeHabitCoachService } = require('../../src/services/homeHabitCoach/homeHabitCoachService.ts');
  const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');

  const id = runId('s3');
  const { homeowner, property } = await seedHomeownerAndProperty(prisma, id);
  const userIds = [homeowner.id];
  let habitTemplateId;
  try {
    const template = await prisma.habitTemplate.create({
      data: {
        key: `${id}-template`,
        title: 'Check HVAC filter',
        description: 'Acceptance habit template',
        category: 'HVAC',
        cadence: 'MONTHLY',
        difficulty: 'EASY',
        impactType: 'PREVENT_DAMAGE',
      },
    });
    habitTemplateId = template.id;

    const habit = await prisma.propertyHabit.create({
      data: {
        propertyId: property.id,
        habitTemplateId: template.id,
        generationSource: 'MANUAL',
        dueAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });

    const service = new HomeHabitCoachService();
    const adopted = await service.adoptHabit(property.id, habit.id, homeowner.id);
    assert.ok(adopted.habit.linkedMaintenanceTaskId, 'adopting a habit must create a real linked recurring task');

    await PropertyMaintenanceTaskService.updateTaskStatus(homeowner.id, adopted.habit.linkedMaintenanceTaskId, 'COMPLETED');

    const refreshed = await service.getHabitDetail(property.id, habit.id);
    assert.ok(
      refreshed.habit.routineAdherence.lastCompletedDate,
      'adherence must reflect the linked task\'s real completion history, not a habit-shaped one-shot record',
    );
  } finally {
    if (habitTemplateId) await prisma.habitTemplate.deleteMany({ where: { id: habitTemplateId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

// ── Scenario 4 ───────────────────────────────────────────────────────────

test('Scenario 4: inspection upload -> homeowner correction -> finding accepted -> maintenance resolution', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { updateFinding, acceptFindingAsWork } = require('../../src/services/inspectionHub.service.ts');
  const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');

  const id = runId('s4');
  const { homeowner, property } = await seedHomeownerAndProperty(prisma, id);
  const userIds = [homeowner.id];
  try {
    // "Upload -> extraction" is not re-driven here (no AI/OCR pipeline in a
    // DB acceptance test) -- upstream state is seeded directly, matching
    // every other .db.test.js file's convention.
    const report = await seedConfirmedInspectionReport(prisma, property.id, id);
    const finding = await prisma.inspectionFinding.create({
      data: {
        reportId: report.id,
        propertyId: property.id,
        homeSystem: 'PLUMBING',
        conditionRating: 'FAIR',
        severity: 'MINOR',
        inspectorDescription: 'Minor leak under the kitchen sink.',
        inspectorRecommendation: 'REPAIR',
        aiInterpretation: 'Likely a worn supply line washer.',
      },
    });

    const corrected = await updateFinding(finding.id, report.id, property.id, { location: 'Kitchen sink cabinet' });
    assert.equal(corrected.location, 'Kitchen sink cabinet');

    const accepted = await acceptFindingAsWork(finding.id, report.id, property.id, homeowner.id);
    assert.equal(accepted.policy, 'MAINTENANCE');
    assert.equal(accepted.execution.executionType, 'MAINTENANCE_TASK');

    await PropertyMaintenanceTaskService.updateTaskStatus(homeowner.id, accepted.execution.executionEntityId, 'COMPLETED');

    const resolvedFinding = await prisma.inspectionFinding.findUniqueOrThrow({ where: { id: finding.id } });
    assert.equal(resolvedFinding.status, 'RESOLVED');
    assert.equal(resolvedFinding.resolutionMethod, 'CONTRACTOR_WORK');
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

// ── Scenario 5 ───────────────────────────────────────────────────────────

test('Scenario 5: safety inspection finding -> governed Guidance escalation', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { acceptFindingAsWork } = require('../../src/services/inspectionHub.service.ts');

  const id = runId('s5');
  const { homeowner, property } = await seedHomeownerAndProperty(prisma, id);
  const userIds = [homeowner.id];
  try {
    const inventoryItem = await seedInventoryItem(prisma, property.id, id);
    const report = await seedConfirmedInspectionReport(prisma, property.id, id);
    const finding = await prisma.inspectionFinding.create({
      data: {
        reportId: report.id,
        propertyId: property.id,
        inventoryItemId: inventoryItem.id,
        homeSystem: 'ELECTRICAL',
        conditionRating: 'SAFETY_CONCERN',
        severity: 'SAFETY',
        inspectorDescription: 'Exposed wiring near the panel.',
        inspectorRecommendation: 'SAFETY_IMMEDIATE',
        aiInterpretation: 'Immediate electrical hazard.',
      },
    });

    const accepted = await acceptFindingAsWork(finding.id, report.id, property.id, homeowner.id);
    assert.equal(accepted.policy, 'GUIDANCE', 'a SAFETY-severity finding must route to governed Guidance, not a bare task');
    assert.equal(accepted.workItem.state, 'IN_GUIDANCE');
    assert.equal(accepted.execution.executionType, 'GUIDANCE');

    const journey = await prisma.guidanceJourney.findUniqueOrThrow({ where: { id: accepted.execution.executionEntityId } });
    assert.equal(journey.propertyId, property.id);

    // Deliberately not extended to "-> verified Project completion" here.
    // syncJourneyWorkItemForProjectEvent (projectTracker.service.ts) looks
    // up the journey's work item via resolveGuidanceJourneyWorkKey, which
    // keys on {PROPERTY|INVENTORY_ITEM, DECISION|COVERAGE_ACTION} --  a
    // DIFFERENT workKey than the FINDING-subject item this test just
    // verified reached IN_GUIDANCE. Whether a finding-originated journey's
    // SAME tracked item continues cleanly through a later Project handoff
    // depends on that journey separately acquiring a reconciled work item
    // via the Home Action feed (homeActionWorkItem.adapter.ts) -- not
    // exercised by this scenario. Scenario 6 below proves the
    // journey-to-verified-Project chain for real using that adapter's own
    // key-resolution helper directly.
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

// ── Scenario 6 ───────────────────────────────────────────────────────────

test('Scenario 6: guidance journey -> Project creation -> Project blocker on Home -> verified completion', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
  const projectTracker = require('../../src/services/projectTracker.service.ts');
  const { resolveAndUpsertWorkItem } = require('../../src/modules/homeOperations/application/resolveWorkItem.usecase.ts');
  const { transitionWorkItem } = require('../../src/modules/homeOperations/application/transitionWorkItem.usecase.ts');
  const { resolveGuidanceJourneyWorkKey } = require('../../src/modules/homeOperations/adapters/homeActionWorkItem.adapter.ts');
  const { findWorkItemByWorkKey } = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');

  const id = runId('s6');
  const { homeowner, property } = await seedHomeownerAndProperty(prisma, id);
  const userIds = [homeowner.id];
  try {
    const inventoryItem = await seedInventoryItem(prisma, property.id, id);

    const { journey } = await guidanceJourneyService.ingestSignal({
      propertyId: property.id,
      inventoryItemId: inventoryItem.id,
      signalIntentFamily: 'lifecycle_end_or_past_life',
      issueDomain: 'ASSET_LIFECYCLE',
      decisionStage: 'DIAGNOSIS',
      executionReadiness: 'NEEDS_CONTEXT',
      severity: 'HIGH',
      severityScore: 82,
      confidenceScore: 0.9,
      sourceType: 'MANUAL',
      sourceFeatureKey: 'home-ops-golden-acceptance',
      sourceToolKey: 'home-ops-golden-acceptance',
      sourceEntityType: 'INVENTORY_ITEM',
      sourceEntityId: inventoryItem.id,
      sourceRunId: id,
      dedupeKey: id,
      payloadJson: { acceptanceRunId: id },
      actorUserId: homeowner.id,
    });

    // Mirrors what a real Home-feed load eventually does via
    // homeActionWorkItem.adapter.ts's proposeWorkItemFromHomeAction, using
    // that same file's exported key-resolution helper directly rather than
    // re-assembling a full in-memory HomeAction DTO -- both real functions,
    // just skipping the HTTP-level feed-read step (matching this
    // directory's established "seed upstream state directly" convention).
    const workKey = resolveGuidanceJourneyWorkKey({
      propertyId: property.id,
      journeyId: journey.id,
      journeyTypeKey: journey.journeyTypeKey,
      inventoryItemId: journey.inventoryItemId,
    });
    const created = await resolveAndUpsertWorkItem({
      propertyId: property.id,
      subject: { type: 'PROPERTY', id: property.id },
      obligationType: 'DECISION',
      occurrence: { obligationSlug: `guidance-${journey.id}` },
      title: 'Resolve guidance decision',
      homeownerReason: 'A guided decision is open for this item.',
      expectedOutcome: 'A clear next step is chosen and recorded.',
      priority: 'SOON',
      safetyTier: 'LOW_CONSEQUENCE',
      confidence: null,
      missingContext: [],
      source: { sourceType: 'GUIDANCE', sourceEntityId: journey.id, sourceVersion: '1', sourceRole: 'TRIGGER' },
    });
    assert.equal(await findWorkItemByWorkKey(property.id, workKey).then((w) => w.id), created.id, 'sanity: the manually-resolved key must match the adapter\'s own key derivation');

    const accepted = await transitionWorkItem({
      workItemId: created.id, to: 'ACCEPTED', actorType: 'USER', actorUserId: homeowner.id, idempotencyKey: `${id}:accept`,
    });
    assert.equal(accepted.state, 'ACCEPTED');

    const project = await projectTracker.createProject(property.id, {
      name: 'Acceptance HVAC replacement',
      description: 'Golden-lifecycle scenario 6 acceptance project',
      projectType: 'HVAC_REPLACEMENT',
      sourceType: 'GUIDANCE',
      guidanceJourneyId: journey.id,
      inventoryItemId: inventoryItem.id,
      fulfillmentMode: 'DIY',
      startDate: new Date().toISOString(),
    });

    // "Project blocker on Home": the shared work item moves into IN_PROJECT
    // the moment a Project takes over the same obligation.
    let workItem = await findWorkItemByWorkKey(property.id, workKey);
    assert.equal(workItem.state, 'IN_PROJECT');

    await satisfyProjectCompletionChecklist(prisma, project, homeowner.id);
    const closure = await projectTracker.confirmCompletion(project.id, property.id, homeowner.id, minimalVerifiedCompletionPayload());
    assert.equal(closure.idempotentReplay, false);

    // "verified completion -> journey and work closure": the shared work
    // item is the durable tracked record for this obligation (§7.2's
    // semantic model) -- its VERIFIED state IS the closure signal this
    // scenario is about. GuidanceJourney itself has no separate
    // status-flip driven by Project completion (confirmed: no
    // guidanceJourney.update call anywhere in the VERIFIED path of
    // projectTracker.service.ts) -- journey-level step completion is a
    // distinct mechanism (recordToolCompletion), not exercised here.
    workItem = await findWorkItemByWorkKey(property.id, workKey);
    assert.equal(workItem.state, 'VERIFIED');
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

// ── Scenario 7 ───────────────────────────────────────────────────────────

test('Scenario 7: one issue from multiple sources resolves to one work item with multiple evidence sources', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { resolveAndUpsertWorkItem } = require('../../src/modules/homeOperations/application/resolveWorkItem.usecase.ts');
  const { acceptFindingAsWork } = require('../../src/services/inspectionHub.service.ts');
  const { resolveMaintenanceTaskWorkKey } = require('../../src/modules/homeOperations/adapters/maintenanceTask.adapter.ts');
  const { findWorkItemByWorkKey } = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');

  const id = runId('s7');
  const { homeowner, property } = await seedHomeownerAndProperty(prisma, id);
  const userIds = [homeowner.id];
  try {
    // Clean case: three sources, deliberately targeting the same workKey,
    // resolve onto one work item -- what resolveAndUpsertWorkItem/
    // upsertWorkSource actually guarantees by construction.
    const base = {
      propertyId: property.id,
      subject: { type: 'PROPERTY', id: property.id },
      obligationType: 'MAINTENANCE_TASK',
      occurrence: { obligationSlug: `${id}-hvac-filter` },
      title: 'Replace HVAC filter',
      homeownerReason: 'Filter is overdue.',
      expectedOutcome: 'Filter replaced.',
      priority: 'SOON',
      safetyTier: 'LOW_CONSEQUENCE',
      confidence: 0.8,
      missingContext: [],
    };
    const first = await resolveAndUpsertWorkItem({ ...base, source: { sourceType: 'MAINTENANCE', sourceEntityId: `${id}-task`, sourceVersion: 'v1', sourceRole: 'TRIGGER' } });
    const second = await resolveAndUpsertWorkItem({ ...base, source: { sourceType: 'INSPECTION_FINDING', sourceEntityId: `${id}-finding`, sourceVersion: 'v1', sourceRole: 'EVIDENCE' } });
    const third = await resolveAndUpsertWorkItem({ ...base, source: { sourceType: 'GUIDANCE', sourceEntityId: `${id}-journey`, sourceVersion: 'v1', sourceRole: 'EVIDENCE' } });
    assert.equal(first.id, second.id);
    assert.equal(second.id, third.id);

    const sources = await prisma.operationalWorkSource.findMany({ where: { workItemId: first.id } });
    assert.equal(sources.length, 3);
    assert.deepEqual(
      new Set(sources.map((s) => s.sourceType)),
      new Set(['MAINTENANCE', 'INSPECTION_FINDING', 'GUIDANCE']),
    );

    // KNOWN, DOCUMENTED GAP (see item #21 plan): the realistic "three
    // domains independently detect the same real-world issue" case does
    // NOT reconcile today for at least one real pairing. Demonstrated
    // directly: a finding accepted as maintenance work mints a SECOND work
    // item (via PropertyMaintenanceTaskService.createUserTask's own
    // syncTaskWorkItem call) execution-linked to the same task, rather
    // than reconciling onto the finding's existing work item -- unlike the
    // Action-Center->Maintenance leg (Item #14 Gap 1), no reconciliation
    // key is threaded through inspectionHub.service.ts's MAINTENANCE
    // branch.
    const report = await seedConfirmedInspectionReport(prisma, property.id, id);
    const finding = await prisma.inspectionFinding.create({
      data: {
        reportId: report.id,
        propertyId: property.id,
        homeSystem: 'ROOF',
        conditionRating: 'FAIR',
        severity: 'MINOR',
        inspectorDescription: 'Acceptance duplication-gap fixture.',
        inspectorRecommendation: 'REPAIR',
        aiInterpretation: 'n/a',
      },
    });
    const accepted = await acceptFindingAsWork(finding.id, report.id, property.id, homeowner.id);
    const task = await prisma.propertyMaintenanceTask.findUniqueOrThrow({ where: { id: accepted.execution.executionEntityId } });
    const taskOwnWorkKey = resolveMaintenanceTaskWorkKey(task, property.id);
    const taskOwnWorkItem = await findWorkItemByWorkKey(property.id, taskOwnWorkKey);

    assert.ok(taskOwnWorkItem, 'the newly-created task must have its own resolved work item');
    assert.notEqual(
      taskOwnWorkItem.id,
      accepted.workItem.id,
      'GAP: finding-accepted maintenance work is not reconciled onto one work item today -- this documents, not celebrates, that fact',
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

// ── Scenario 8 ───────────────────────────────────────────────────────────

test('Scenario 8: reported completion without proof stays pending verification, not verified', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { resolveAndUpsertWorkItem } = require('../../src/modules/homeOperations/application/resolveWorkItem.usecase.ts');
  const { transitionWorkItem } = require('../../src/modules/homeOperations/application/transitionWorkItem.usecase.ts');
  const { recordEvidence } = require('../../src/modules/homeOperations/application/recordEvidence.usecase.ts');

  const id = runId('s8');
  const { homeowner, property } = await seedHomeownerAndProperty(prisma, id);
  const userIds = [homeowner.id];
  try {
    // No domain flow today deliberately leaves an item at REPORTED_COMPLETE
    // (every wired completion path auto-advances to VERIFIED in the same
    // call) -- this proves the state machine's contract directly at the
    // usecase layer, which is what this scenario is actually about.
    const created = await resolveAndUpsertWorkItem({
      propertyId: property.id,
      subject: { type: 'PROPERTY', id: property.id },
      obligationType: 'MAINTENANCE_TASK',
      occurrence: { obligationSlug: `${id}-contract-check` },
      title: 'Contract-layer completion check',
      homeownerReason: 'Acceptance fixture.',
      expectedOutcome: 'n/a',
      priority: 'PLAN',
      safetyTier: 'LOW_CONSEQUENCE',
      confidence: null,
      missingContext: [],
      source: { sourceType: 'MAINTENANCE', sourceEntityId: `${id}-src`, sourceVersion: 'v1', sourceRole: 'TRIGGER' },
    });
    await transitionWorkItem({ workItemId: created.id, to: 'ACCEPTED', actorType: 'USER', actorUserId: homeowner.id, idempotencyKey: `${id}:accept` });

    const reported = await transitionWorkItem({ workItemId: created.id, to: 'REPORTED_COMPLETE', actorType: 'USER', actorUserId: homeowner.id, idempotencyKey: `${id}:report` });
    assert.equal(reported.state, 'REPORTED_COMPLETE', 'reporting completion must not silently auto-verify');

    const stillPending = await prisma.operationalWorkItem.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(stillPending.state, 'REPORTED_COMPLETE', 'state does not advance on its own between requests');

    await recordEvidence({
      workItemId: created.id,
      evidenceType: 'USER_ATTESTATION',
      evidenceEntityId: `${id}-evidence`,
      verificationStatus: 'VERIFIED',
      observedAt: new Date(),
      actorUserId: homeowner.id,
      idempotencyKey: `${id}:evidence`,
    });
    const stillPendingAfterEvidence = await prisma.operationalWorkItem.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(stillPendingAfterEvidence.state, 'REPORTED_COMPLETE', 'recording evidence alone does not verify -- the two are decoupled operations');

    const verified = await transitionWorkItem({ workItemId: created.id, to: 'VERIFIED', actorType: 'USER', actorUserId: homeowner.id, idempotencyKey: `${id}:verify` });
    assert.equal(verified.state, 'VERIFIED');
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

// ── Scenario 9 — BLOCKED ────────────────────────────────────────────────

test(
  'Scenario 9: failed source reconciliation surfaces a visible pending record and replays successfully',
  { skip: 'BLOCKED: no pending/failed reconciliation record exists anywhere in the schema -- every '
      + 'resolveAndUpsertWorkItem caller today (PropertyMaintenanceTask.service.ts, homeActions.service.ts, etc.) '
      + 'just logs a warning and no-ops on a failure, self-healing silently on the next natural trigger rather '
      + 'than persisting a queryable pending/failed state. Needs new schema/design, out of scope for a '
      + 'test-writing item -- see item #21 plan.' },
  () => {},
);

// ── Scenario 10 ──────────────────────────────────────────────────────────

test('Scenario 10: reopened condition after completion preserves prior history', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');
  const { resolveMaintenanceTaskWorkKey } = require('../../src/modules/homeOperations/adapters/maintenanceTask.adapter.ts');
  const { findWorkItemByWorkKey } = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');

  const id = runId('s10');
  const { homeowner, property } = await seedHomeownerAndProperty(prisma, id);
  const userIds = [homeowner.id];
  try {
    const task = await PropertyMaintenanceTaskService.createUserTask(homeowner.id, property.id, {
      title: 'One-time gutter clean',
      nextDueDate: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const workKey = resolveMaintenanceTaskWorkKey(task, property.id);

    await PropertyMaintenanceTaskService.updateTaskStatus(homeowner.id, task.id, 'COMPLETED');
    let workItem = await findWorkItemByWorkKey(property.id, workKey);
    assert.equal(workItem.state, 'VERIFIED');
    const eventCountAfterVerify = await prisma.operationalWorkEvent.count({ where: { workItemId: workItem.id } });
    assert.ok(eventCountAfterVerify >= 2, 'expected at least the accept and verify events on record');

    await PropertyMaintenanceTaskService.updateTaskStatus(homeowner.id, task.id, 'PENDING');
    workItem = await findWorkItemByWorkKey(property.id, workKey);
    assert.equal(workItem.state, 'REOPENED', 'uncompleting a verified task must reopen the same work item, not silently no-op');

    const eventCountAfterReopen = await prisma.operationalWorkEvent.count({ where: { workItemId: workItem.id } });
    assert.ok(eventCountAfterReopen > eventCountAfterVerify, 'reopening must add a new event, not erase prior history');
    const originalVerifyEvent = await prisma.operationalWorkEvent.findFirst({ where: { workItemId: workItem.id, eventType: 'OUTCOME_VERIFIED' } });
    assert.ok(originalVerifyEvent, 'the original VERIFIED event must still be queryable -- history is append-only, never overwritten');
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
