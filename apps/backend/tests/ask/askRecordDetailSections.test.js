const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { HomeEventsService } = require('../../src/services/homeEvents.service.ts');
const { HomeBuyerTaskService } = require('../../src/services/HomeBuyerTask.service.ts');
const { HouseholdService } = require('../../src/services/household.service.ts');
const { resolveAskOperation, ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_RECORD_SECTION_REGISTRY } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');
const { ASK_RECORD_DETAIL_READERS, AskRecordNotFoundError } = require('../../src/services/ask/askRecordDetail.service.ts');
const maintenanceProvider = require('../../src/services/skills/context/maintenanceTaskContext.provider.ts');

const NOW = new Date('2026-10-19T12:00:00Z');
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000);
const ctx = (role, overrides = {}) => ({ propertyId: 'p1', userId: 'u1', role, now: NOW, ...overrides });
const read = (section, role, id, overrides) => ASK_RECORD_DETAIL_READERS[section](ctx(role, overrides), id);
const stub = (target, name, value) => { const saved = target[name]; target[name] = value; return () => { target[name] = saved; }; };
const states = (detail) => Object.fromEntries(['source', 'observed', 'verification', 'visibility'].map((key) => [key, detail.provenance[key].state]));

// ---- every section but property facts opens detail; every AVAILABLE launch question reaches a read in that section ----

test('each correction route’s command is registered at the floor it reports, and every route carries a reason or a question', async () => {
  const restore = [
    stub(prisma, 'inspectionReport', { findFirst: async () => ({ reportType: 'GENERAL_HOME', inspectionDate: day(-30), inspectorName: 'Pat', inspectorCompany: null, inspectorLicense: null, status: 'REVIEW_PENDING', totalFindings: 4, openFindings: 4, safetyFindings: 1, majorFindings: 0, extractionModel: 'm', sourceEntityType: null, createdAt: day(-29), processedAt: day(-28), confirmedAt: null, updatedAt: day(-1) }) }),
  ];
  try {
    for (const role of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) {
      const detail = await read('inspections', role, 'r1');
      for (const entry of detail.corrections) {
        if (entry.operationId) assert.equal(entry.requiredRole ?? ASK_OPERATION_DEFINITIONS[entry.operationId].propertyRoleFloor, ASK_OPERATION_DEFINITIONS[entry.operationId].propertyRoleFloor);
        assert.equal(Boolean(entry.launch), entry.state === 'AVAILABLE');
        assert.equal(Boolean(entry.reason), entry.state !== 'AVAILABLE');
      }
    }
  } finally { restore.forEach((fn) => fn()); }
});

test('every launch a Record route can send reaches its own command with a record target the command accepts, and sends no free text a command could mis-parse', async () => {
  const { ASK_OPERATION_DEFINITIONS: definitions } = require('../../src/services/ask/askOperationRegistry.ts');
  const launches = [];
  const collect = (detail) => detail.corrections.forEach((entry) => { if (entry.launch) launches.push({ route: entry.id, command: entry.operationId, ...entry.launch }); });
  const restores = [
    stub(prisma, 'inspectionReport', { findFirst: async () => REPORT }),
    stub(prisma, 'homeEvent', { findFirst: async () => EVENT }),
    stub(prisma, 'propertyPermitRecord', { findFirst: async () => ({ permitNumber: null, category: 'ROOFING', description: null, status: 'ISSUED', reportedStatus: 'NONE', reportedAt: null, officialSourceType: null, officialObservedAt: null, applicationDate: null, issueDate: null, expirationDate: null, finaledDate: null, contractorName: null, workLocation: null, source: 'MANUAL_ENTRY', isVerified: false, createdAt: day(-9), updatedAt: day(-1) }) }),
    stub(prisma, 'projectRecord', { findFirst: async () => ({ name: 'Roof', projectType: 'ROOFING', status: 'IN_PROGRESS', sourceType: 'MANUAL', fulfillmentMode: 'DIY', contractorName: null, description: null, startDate: day(-9), expectedEndDate: null, actualEndDate: null, currentContractAmountCents: null, paidToDateCents: 0, warrantyExpiresAt: null, verifiedAt: null, createdAt: day(-9), updatedAt: day(-1), inventoryItem: null, warranty: null, _count: { milestones: 0, issues: 0, payments: 0, changeOrders: 0 } }) }),
    stub(prisma, 'claim', { findFirst: async () => ({ title: 'Roof claim', description: null, type: 'INSURANCE', status: 'SUBMITTED', sourceType: 'INSURANCE', providerName: null, incidentAt: null, openedAt: day(-9), submittedAt: null, closedAt: null, lastActivityAt: day(-1), nextFollowUpAt: null, createdAt: day(-9), updatedAt: day(-1), claimNumber: null, deductibleAmount: null, estimatedLossAmount: null, settlementAmount: null, insurancePolicy: null, warranty: null }) }),
    stub(HomeBuyerTaskService, 'getTask', async () => ({ title: 'Order inspection', description: null, phase: 'UNDER_CONTRACT', status: 'NOT_STARTED', priority: 'NOW', whyMatters: null, completionCriteria: null, dueAt: null, completedAt: null, required: true, blocking: true, sourceType: 'TEMPLATE', templateKey: null, completionVerifiedAt: null, createdAt: day(-5), updatedAt: day(-1) })),
    stub(prisma, 'propertySaleCase', { findUnique: async () => ({ id: 'sc1' }) }),
    stub(prisma, 'saleReadinessItem', { findFirst: async () => ({ title: 'Fix railing', detail: null, category: 'SAFETY', requirementClass: 'REQUIRED', status: 'OPEN', sourceEntityType: 'INSPECTION_FINDING', dueAt: null, resolvedAt: null, waivedAt: null, waivedReason: null, pursuedAt: null, estimatedCostMinCents: null, estimatedCostMaxCents: null, createdAt: day(-9), updatedAt: day(-2) }) }),
  ];
  try {
    for (const [section, id] of [['inspections', 'r1'], ['timeline', 'e1'], ['permits', 'pm1'], ['projects-renovations', 'project:pj1'], ['incidents-claims', 'claim:c1'], ['buyer-records', 'b1'], ['seller-records', 'si1']]) {
      collect(await read(section, 'OWNER', id));
    }
    restores.push(stub(prisma, 'inspectionReport', { findFirst: async () => ({ ...REPORT, status: 'CONFIRMED', confirmedAt: day(-2) }) }));
    collect(await read('inspections', 'OWNER', 'r1'));
  } finally { restores.forEach((fn) => fn()); }
  assert.ok(launches.length >= 14, `expected the launches of seven sections, saw ${launches.length}`);
  for (const launch of launches) {
    assert.ok(launch.entityType && launch.entityId, launch.route);
    assert.ok(launch.operationId in definitions, `${launch.route}: ${launch.operationId} is a registered operation`);
    assert.ok(launch.message.length > 5 && !launch.message.includes('"'), launch.route);
  }
  // The routes that change a record launch their own command; the findings route launches the read that lists them.
  const byRoute = Object.fromEntries(launches.map((launch) => [launch.route, launch]));
  assert.equal(byRoute['inspection-findings'].operationId, 'INSPECTION_REPORT_FINDINGS');
  assert.equal(byRoute['inspection-confirm'].operationId, 'INSPECTION_REPORT_COMMAND');
  assert.equal(byRoute['project-update'].actionId, 'project-tracker-edit-project');
  assert.equal(byRoute['buyer-complete'].entityType, 'BUYER_TASK');
  assert.deepEqual(['sale-item-pursue', 'sale-item-unpursue', 'sale-item-waive', 'sale-item-reopen'].every((id) => byRoute[id]?.entityType === 'SALE_READINESS_ITEM'), true);
});

test('every section primary action resolves to one of that section’s reads', () => {
  const mismatched = ASK_RECORD_SECTION_REGISTRY.filter((entry) => !entry.readOperationIds.includes(resolveAskOperation(entry.primaryAction.question).operationId)).map((entry) => entry.id);
  assert.deepEqual(mismatched, []);
});

// ---- timeline ----

const EVENT = {
  title: 'Roof replaced', summary: 'New shingles', type: 'REPAIR', importance: 'HIGH', visibility: 'HOUSEHOLD', createdById: 'u2', occurredAt: new Date('2025-06-01T00:00:00Z'), datePrecision: 'MONTH',
  dateRangeStart: null, dateRangeEnd: null, providerName: 'Top Roofing', captureChannel: 'ASK_CHAT', sourceBadge: 'USER_REPORTED', observationKind: 'USER_REPORTED', verificationStatus: 'HOMEOWNER_CONFIRMED',
  sourceType: 'USER', sourceAsOf: null, revision: 2, correctionReason: 'Fixed the month', confirmedAt: day(-10), createdAt: day(-40), updatedAt: day(-9),
  room: null, inventoryItem: { name: 'Roof' }, warranty: null, claim: null, project: null,
  verificationRecords: [{ status: 'HOMEOWNER_CONFIRMED', reason: null, createdAt: day(-10) }], _count: { documents: 1, evidence: 0 },
};

test('a timeline event shows recorded precision, verification, revision history, and corrections at the registered floors', async () => {
  const restore = stub(prisma, 'homeEvent', { findFirst: async (args) => { assert.equal(args.where.isCurrent, true); assert.equal(args.where.deletedAt, null); return EVENT; } });
  try {
    const detail = await read('timeline', 'CONTRIBUTOR', 'e1');
    assert.equal(detail.facts.find((f) => f.label === 'When').value, '2025-06');
    assert.equal(detail.provenance.verification.value, 'Homeowner Confirmed');
    assert.deepEqual(detail.provenance.history.entries.map((e) => e.label), ['Marked homeowner confirmed', 'Revision 2: Fixed the month']);
    assert.deepEqual(detail.provenance.related.records.map((r) => r.kindLabel), ['Inventory item', 'Evidence and documents']);
    assert.deepEqual(detail.corrections.map((c) => [c.operationId, c.state]), [['HOME_EVENT_UPDATE', 'AVAILABLE']]);
    assert.deepEqual(detail.corrections.map((c) => c.launch.message), ['Edit this timeline event.']);
    assert.ok(detail.corrections.every((c) => c.launch.entityType === 'HOME_EVENT' && c.launch.entityId === 'e1'));
    assert.equal((await read('timeline', 'VIEWER', 'e1')).corrections[0].state, 'ROLE_REQUIRED');
  } finally { restore(); }
});

test('a private timeline event is a not-found to everyone but its recorder', async () => {
  const restore = stub(prisma, 'homeEvent', { findFirst: async () => ({ ...EVENT, visibility: 'PRIVATE', createdById: 'u2' }) });
  const restoreList = stub(HomeEventsService.prototype, 'listAllCurrentEvents', async () => []);
  try {
    await assert.rejects(() => read('timeline', 'OWNER', 'e1'), AskRecordNotFoundError);
    const own = await read('timeline', 'OWNER', 'e1', { userId: 'u2' });
    assert.equal(own.provenance.visibility.value, 'Only you can see this event.');
  } finally { restore(); restoreList(); }
});

test('an event the Timeline projects from the inventory opens as a projected entry with no stored history and a pointer to the item', async () => {
  const restore = stub(prisma, 'homeEvent', { findFirst: async () => null });
  const restoreList = stub(HomeEventsService.prototype, 'listAllCurrentEvents', async () => [{ id: 'synthetic-1', title: 'Furnace installed', type: 'PURCHASE', occurredAt: '2019-03-01T00:00:00.000Z', datePrecision: 'YEAR', visibility: 'HOUSEHOLD', createdById: null }]);
  try {
    const detail = await read('timeline', 'OWNER', 'synthetic-1');
    assert.equal(detail.facts.find((f) => f.label === 'When').value, '2019');
    assert.equal(detail.provenance.history.state, 'UNAVAILABLE');
    assert.deepEqual([detail.corrections[0].operationId, detail.corrections[0].state], [null, 'UNAVAILABLE']);
    await assert.rejects(() => read('timeline', 'OWNER', 'nope'), AskRecordNotFoundError);
  } finally { restore(); restoreList(); }
});

// ---- maintenance history ----

test('a completed task opens with its canonical set; an open task is not history; the update route says why it is blocked', async () => {
  const task = { id: 't1', title: 'Flush water heater', status: 'COMPLETED', source: 'SEASONAL', priority: 'MEDIUM', isRecurring: true, frequency: 'ANNUALLY', lastCompletedDate: day(-20), actualCost: 120, category: null, assetType: null, inventoryItem: { name: 'Water heater' }, room: null };
  const restore = stub(maintenanceProvider, 'loadCanonicalMaintenanceTaskSet', async () => ({ historical: [task, { ...task, id: 't2', status: 'PENDING' }] }));
  try {
    const detail = await read('maintenance-history', 'CONTRIBUTOR', 't1');
    assert.equal(detail.facts.find((f) => f.label === 'Completed').value, day(-20).toISOString().slice(0, 10));
    assert.equal(detail.provenance.history.state, 'UNAVAILABLE');
    assert.deepEqual([detail.corrections[0].operationId, detail.corrections[0].state, detail.corrections[0].reason], ['MAINTENANCE_TASK_UPDATE', 'UNAVAILABLE', 'Ask changes open maintenance tasks only; a completed task is history.']);
    await assert.rejects(() => read('maintenance-history', 'OWNER', 't2'), AskRecordNotFoundError);
  } finally { restore(); }
});

// ---- inspections ----

const REPORT = { reportType: 'GENERAL_HOME', inspectionDate: day(-30), inspectorName: 'Pat', inspectorCompany: 'Acme', inspectorLicense: null, status: 'REVIEW_PENDING', totalFindings: 4, openFindings: 4, safetyFindings: 1, majorFindings: 0, extractionModel: 'm', sourceEntityType: null, createdAt: day(-29), processedAt: day(-28), confirmedAt: null, updatedAt: day(-1) };

test('an inspection report gates confirm/archive/findings on its status and launches each for this report', async () => {
  let row = REPORT;
  const restore = stub(prisma, 'inspectionReport', { findFirst: async (args) => { assert.deepEqual(args.where.status, { not: 'ARCHIVED' }); return row; } });
  try {
    let detail = await read('inspections', 'CONTRIBUTOR', 'r1');
    const byId = () => Object.fromEntries(detail.corrections.map((c) => [c.id, c]));
    assert.equal(byId()['inspection-confirm'].state, 'AVAILABLE');
    assert.deepEqual(byId()['inspection-confirm'].launch, { message: 'Review this inspection report before it is trusted.', operationId: 'INSPECTION_REPORT_COMMAND', entityType: 'INSPECTION_REPORT', entityId: 'r1', actionId: null });
    assert.equal(byId()['inspection-findings'].state, 'UNAVAILABLE');
    assert.equal(detail.provenance.verification.state, 'NOT_RECORDED');
    assert.deepEqual(detail.provenance.history.entries.map((e) => e.label), ['Findings extracted for review', 'Report added']);
    row = { ...REPORT, status: 'CONFIRMED', confirmedAt: day(-2) };
    detail = await read('inspections', 'OWNER', 'r1');
    assert.equal(byId()['inspection-confirm'].state, 'UNAVAILABLE');
    assert.equal(byId()['inspection-findings'].state, 'AVAILABLE');
    assert.equal(detail.provenance.verification.state, 'AVAILABLE');
    row = null;
    await assert.rejects(() => read('inspections', 'OWNER', 'gone'), AskRecordNotFoundError);
  } finally { restore(); }
});

// ---- permits and projects ----

test('a permit keeps official and reported status apart and routes edits through PERMIT_TRACKER_COMMAND', async () => {
  const restore = stub(prisma, 'propertyPermitRecord', { findFirst: async (args) => { assert.equal(args.where.isActive, true); return { permitNumber: 'B-1', category: 'ROOFING', description: null, status: 'UNKNOWN', reportedStatus: 'SUBMITTED', reportedAt: null, officialSourceType: null, officialObservedAt: null, applicationDate: null, issueDate: day(-90), expirationDate: null, finaledDate: null, contractorName: 'Top', workLocation: null, source: 'MANUAL_ENTRY', isVerified: false, createdAt: day(-100), updatedAt: day(-5) }; } });
  try {
    const detail = await read('permits', 'CONTRIBUTOR', 'pm1');
    assert.equal(detail.facts.find((f) => f.label === 'Reported by the household').value, 'Submitted');
    assert.equal(detail.provenance.source.value, 'Manual Entry');
    assert.deepEqual(detail.corrections.map((c) => [c.operationId, c.state]), [['PERMIT_TRACKER_COMMAND', 'AVAILABLE'], ['PERMIT_TRACKER_COMMAND', 'AVAILABLE']]);
  } finally { restore(); }
});

test('a completed or cancelled project cannot be updated through Ask, and a project with no contract shows no remaining balance', async () => {
  const project = { name: 'New roof', projectType: 'ROOFING', status: 'COMPLETED', sourceType: 'MANUAL', fulfillmentMode: 'DIY', contractorName: null, description: null, startDate: day(-200), expectedEndDate: null, actualEndDate: day(-100), currentContractAmountCents: null, paidToDateCents: 5000, warrantyExpiresAt: null, verifiedAt: null, createdAt: day(-210), updatedAt: day(-100), inventoryItem: null, warranty: null, _count: { milestones: 1, issues: 0, payments: 2, changeOrders: 0 } };
  const restore = stub(prisma, 'projectRecord', { findFirst: async () => project });
  try {
    const detail = await read('projects-renovations', 'OWNER', 'project:pj1');
    assert.equal(detail.facts.find((f) => f.label === 'Remaining').value, 'Not recorded');
    assert.equal(detail.facts.find((f) => f.label === 'Who does the work').value, 'DIY / household');
    assert.equal(detail.corrections[0].state, 'UNAVAILABLE');
  } finally { restore(); }
});

test('a renovation case opens with its lifecycle history, names no Ask command that changes it, and is not found once archived or under another id', async () => {
  let args;
  const restore = stub(prisma, 'renovationCase', { findFirst: async (a) => { args = a; return a.where.id === 'rc1' ? { name: 'Kitchen remodel', objective: 'Open it up', caseType: 'REMODEL', lifecycle: 'SCOPE_DEFINITION', outcomeStatus: 'NOT_STARTED', governanceTier: 'STANDARD', responsibilityContext: 'HOMEOWNER', targetBudgetCents: 4_000_000, targetStartDate: null, targetEndDate: day(200), entryPoint: 'ASK', sourceType: null, createdAt: day(-40), updatedAt: day(-2), cancelReason: null, executionProject: null, _count: { links: 2, participants: 1 }, events: [{ eventType: 'LIFECYCLE_CHANGED', fromLifecycle: 'IDEA', toLifecycle: 'SCOPE_DEFINITION', occurredAt: day(-2) }] } : null; } });
  try {
    const detail = await read('projects-renovations', 'CONTRIBUTOR', 'renovation:rc1');
    assert.equal(args.where.archivedAt, null);
    assert.equal(detail.facts.find((f) => f.label === 'Target budget').value, '$40,000');
    assert.deepEqual(detail.provenance.history.entries.map((e) => e.label), ['Lifecycle Changed: Idea to Scope Definition']);
    assert.deepEqual(detail.provenance.related.records.map((r) => r.kindLabel), ['Case links', 'People on the case']);
    assert.deepEqual([detail.corrections[0].operationId, detail.corrections[0].state], [null, 'UNAVAILABLE']);
    await assert.rejects(() => read('projects-renovations', 'OWNER', 'renovation:other'), AskRecordNotFoundError);
    await assert.rejects(() => read('projects-renovations', 'OWNER', 'rc1'), AskRecordNotFoundError, 'an unprefixed id is neither kind');
  } finally { restore(); }
});

// ---- incidents and claims ----

test('incident and claim ids carry their kind; an incident states that no Ask command changes it; a claim hides money and gates on open', async () => {
  const restoreIncident = stub(prisma, 'incident', { findFirst: async (args) => { assert.equal(args.where.id, 'i1'); assert.equal(args.where.isSuppressed, false); return { title: 'Leak', summary: null, typeKey: 'LEAK', category: null, status: 'ACTIVE', severity: 'HIGH', sourceType: 'MANUAL', confidence: 80, openedAt: day(-3), resolvedAt: null, createdAt: day(-3), updatedAt: day(-2), room: { name: 'Kitchen' } }; } });
  const claim = { title: 'Roof claim', description: null, type: 'INSURANCE', status: 'SUBMITTED', sourceType: 'INSURANCE', providerName: 'Acme', incidentAt: null, openedAt: day(-9), submittedAt: day(-8), closedAt: null, lastActivityAt: day(-1), nextFollowUpAt: null, createdAt: day(-9), updatedAt: day(-1), claimNumber: 'CLM-SECRET', deductibleAmount: '1000', estimatedLossAmount: '9000', settlementAmount: null, insurancePolicy: { carrierName: 'Acme' }, warranty: null };
  let claimRow = claim;
  const restoreClaim = stub(prisma, 'claim', { findFirst: async (args) => { assert.equal(args.where.id, 'c1'); return claimRow; } });
  try {
    const incident = await read('incidents-claims', 'OWNER', 'incident:i1');
    assert.deepEqual([incident.corrections[0].operationId, incident.corrections[0].state], [null, 'UNAVAILABLE']);
    assert.equal(incident.provenance.related.records[0].label, 'Kitchen');
    let detail = await read('incidents-claims', 'CONTRIBUTOR', 'claim:c1');
    const text = JSON.stringify(detail);
    assert.ok(!text.includes('CLM-SECRET') && !text.includes('9000') && !text.includes('1000'));
    assert.deepEqual(detail.corrections.map((c) => [c.operationId, c.state]), [['CLAIM_TRANSITION', 'AVAILABLE'], ['CLAIM_ACTIVITY_COMMAND', 'UNAVAILABLE']]);
    claimRow = { ...claim, status: 'CLOSED', closedAt: day(-1) };
    detail = await read('incidents-claims', 'CONTRIBUTOR', 'claim:c1');
    assert.equal(detail.corrections[0].reason, 'This claim is closed.');
    assert.ok(detail.corrections.every((c) => c.state === 'UNAVAILABLE'));
    await assert.rejects(() => read('incidents-claims', 'OWNER', 'bogus'), AskRecordNotFoundError);
  } finally { restoreIncident(); restoreClaim(); }
});

// ---- coverage and financing ----

test('a coverage policy never prints its number, premium or deductible, and no Ask command edits it', async () => {
  const restore = stub(prisma, 'insurancePolicy', { findFirst: async () => ({ id: 'ip1', propertyId: 'p1', carrierName: 'Acme', policyNumber: 'POL-SECRET', coverageType: 'Homeowner', premiumAmount: '1800', deductibleAmount: '2500', deductibleCents: null, isVerified: true, lastVerifiedAt: day(-4), startDate: day(-100), expiryDate: day(200), createdAt: day(-100), updatedAt: day(-4) }) });
  try {
    const detail = await read('coverage', 'VIEWER', 'ip1');
    const text = JSON.stringify(detail);
    assert.ok(!text.includes('POL-SECRET') && !text.includes('1800') && !text.includes('2500'));
    assert.equal(detail.provenance.verification.state, 'AVAILABLE');
    assert.deepEqual([detail.corrections[0].operationId, detail.corrections[0].state], [null, 'UNAVAILABLE']);
  } finally { restore(); }
});

test('a financing scenario never selects the owner-only equity or rate snapshots', async () => {
  let selected;
  const restore = stub(prisma, 'financingScenario', { findFirst: async (args) => { selected = args.select; return { title: 'Roof loan', projectDescription: null, projectCostCents: 1500000, status: 'SAVED', entryPoint: 'MANUAL', selectedOption: null, sourceEntityType: null, notes: 'secret note', createdAt: day(-5), updatedAt: day(-1) }; } });
  try {
    const detail = await read('financing-ownership', 'VIEWER', 's1');
    for (const key of ['equitySnapshotCents', 'helocCapacitySnapshotCents', 'rateSnapshotJson', 'resultsJson']) assert.ok(!(key in selected), key);
    assert.ok(!JSON.stringify(detail).includes('secret note'));
    assert.equal(detail.corrections[0].state, 'UNAVAILABLE');
  } finally { restore(); }
});

// ---- buyer and seller ----

test('a buyer task is completable through Ask only while open and blocking', async () => {
  let task = { title: 'Order inspection', description: null, phase: 'UNDER_CONTRACT', status: 'NOT_STARTED', priority: 'NOW', whyMatters: null, completionCriteria: null, dueAt: day(5), completedAt: null, required: true, blocking: true, sourceType: 'TEMPLATE', templateKey: 'k', completionVerifiedAt: null, createdAt: day(-5), updatedAt: day(-1) };
  const restore = stub(HomeBuyerTaskService, 'getTask', async () => task);
  try {
    assert.equal((await read('buyer-records', 'CONTRIBUTOR', 'b1')).corrections[0].state, 'AVAILABLE');
    task = { ...task, blocking: false };
    assert.match((await read('buyer-records', 'CONTRIBUTOR', 'b1')).corrections[0].reason, /blocking tasks only/);
    task = { ...task, blocking: true, status: 'COMPLETED', completedAt: day(-1) };
    assert.equal((await read('buyer-records', 'CONTRIBUTOR', 'b1')).corrections[0].reason, 'This task is already complete.');
  } finally { restore(); }
  const restoreMissing = stub(HomeBuyerTaskService, 'getTask', async () => { const error = new Error('Task not found'); error.statusCode = 404; throw error; });
  try { await assert.rejects(() => read('buyer-records', 'OWNER', 'b9'), AskRecordNotFoundError); } finally { restoreMissing(); }
});

test('a sale checklist item reads from the property’s own sale case and records its decisions as history', async () => {
  const restoreCase = stub(prisma, 'propertySaleCase', { findUnique: async () => ({ id: 'sc1' }) });
  const restoreItem = stub(prisma, 'saleReadinessItem', { findFirst: async (args) => { assert.equal(args.where.saleCaseId, 'sc1'); return { title: 'Fix railing', detail: null, category: 'SAFETY', requirementClass: 'REQUIRED', status: 'WAIVED', sourceEntityType: 'INSPECTION_FINDING', dueAt: null, resolvedAt: null, waivedAt: day(-2), waivedReason: 'Disclosed', pursuedAt: day(-6), estimatedCostMinCents: 10000, estimatedCostMaxCents: 20000, createdAt: day(-9), updatedAt: day(-2) }; } });
  try {
    const detail = await read('seller-records', 'CONTRIBUTOR', 'si1');
    assert.deepEqual(detail.provenance.history.entries.map((e) => e.label), ['Waived: Disclosed', 'Marked to pursue before listing']);
    assert.equal(detail.corrections[0].operationId, 'SELLER_PREP_ITEM_DECISION');
  } finally { restoreCase(); restoreItem(); }
  const restoreNone = stub(prisma, 'propertySaleCase', { findUnique: async () => null });
  try { await assert.rejects(() => read('seller-records', 'OWNER', 'si1'), AskRecordNotFoundError); } finally { restoreNone(); }
});

// ---- household ----

test('a household member shows role and join date and never an email, avatar, or last login', async () => {
  const restore = stub(HouseholdService.prototype, 'listMembers', async () => [{ id: 'm1', userId: 'u2', role: 'CONTRIBUTOR', isPrimaryOwner: false, displayName: null, joinedAt: day(-60), updatedAt: day(-3), user: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', avatar: 'a.png', lastLoginAt: day(-1) } }]);
  try {
    const detail = await read('household-access', 'VIEWER', 'm1');
    assert.equal(detail.title, 'Sam Lee');
    const text = JSON.stringify(detail);
    assert.ok(!text.includes('sam@example.com') && !text.includes('a.png'));
    assert.deepEqual(states(detail), { source: 'UNAVAILABLE', observed: 'AVAILABLE', verification: 'UNAVAILABLE', visibility: 'AVAILABLE' });
    assert.equal(detail.corrections[0].state, 'UNAVAILABLE');
    await assert.rejects(() => read('household-access', 'VIEWER', 'other'), AskRecordNotFoundError);
  } finally { restore(); }
});
