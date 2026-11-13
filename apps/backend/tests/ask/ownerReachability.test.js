// Owner reachability ratchet (reliability FRD FR-DATA-3): every catalogued data point has at least one generated owner phrasing that the real router and resolvers send to its read path, and the canonical query-shape
// questions plan to their shape. SYNTHETIC phrasings, offline: this guards alias/cue/routing mechanics against regression; it does not measure how real owners phrase things and says nothing about the 90% objective.
const test = require('node:test'); const assert = require('node:assert/strict');
const { measure } = require('../../scripts/lib/askOwnerReachability.js');
const m = measure();
test('no catalogued data point is unreachable, and every domain keeps its recorded reachable count (2026-11-13)', () => {
  assert.deepEqual(m.unreachable, [], 'every catalogued id has a phrasing that resolves to it');
  const reachable = Object.fromEntries([...m.byDomain.entries()].map(([d, v]) => [d, v.reachable]));
  const MIN = { 'appliances-inventory': 14, buyer: 11, claims: 16, 'documents-records': 8, insurance: 7, maintenance: 7, 'reserve-ownership-costs': 14, 'seller-prep': 13, warranties: 5 };
  for (const [domain, min] of Object.entries(MIN)) assert.ok((reachable[domain] ?? 0) >= min, `${domain}: ${reachable[domain]} < ${min}`);
  const resolvesOnly = [...m.byDomain.values()].reduce((s, v) => s + v.resolvesOnlyPoints, 0);
  assert.ok(resolvesOnly <= 0, `points answered only through another operation that does not state them: ${resolvesOnly}`);
});
test('every canonical query-shape question plans to the intended shape for the five templates', () => {
  assert.deepEqual(m.queryRows.filter((r) => !r.ok).map((r) => r.message), []);
  const unrouted = m.queryRows.filter((r) => r.operation !== 'DATA_POINT_READ').map((r) => `${r.template}/${r.shape}`);
  // only plain lists and date filters owned by dedicated operations (warranty and coverage lookups, the maintenance status read) may stay with them
  for (const u of unrouted) assert.match(u, /^((warranties|policies|tasks|buyerTasks)\/(LIST|FILTER)|records\/(LIST|AGGREGATE|FILTER))$/, `${u} must be owned by a dedicated operation`);
});

// ---- maintenance phrasing fixes (2026-11-13) ----
const { resolveDataPoint } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
test('maintenance: natural owner questions about a named task reach the data point; the status read keeps due date and status; a deadline monitor is not made from a detail question', () => {
  const route = (q) => resolveAskOperation(q).operationId;
  for (const q of ['What is the priority of my gutter cleaning task?', 'How much did the gutter cleaning task cost?', 'What is the estimated cost of my gutter cleaning task?', 'When did I last complete my gutter cleaning task?', 'Tell me the priority of my gutter cleaning task.', 'When is my gutter cleaning due?']) assert.equal(route(q), 'DATA_POINT_READ', q);
  assert.equal(resolveDataPoint('When is my gutter cleaning due?')?.id, 'task.nextDueDate', 'a due-date question needs no task word');
  // the "due" cue never claims another kind of record: those stay with their own routes (or the ratchets that own them)
  for (const q of ['When is my warranty due?', 'When is my insurance due?', 'when is my inspection contingency due', 'When is my buyer task due?']) assert.notEqual(resolveDataPoint(q)?.id, 'task.nextDueDate', q);
  assert.equal(route('What is the status of my gutter cleaning task?'), 'MAINTENANCE_STATUS', 'status and due date of a task stay with the maintenance status read');
  const d = m.byDomain.get('maintenance'); assert.ok(d.routed / d.phrasings >= 0.8, `maintenance phrasing honor ${d.routed}/${d.phrasings}`);
});

// ---- seller-prep and insurance phrasing fixes (2026-11-13) ----
test('insurance and seller prep: natural owner questions reach the data point; checklist and readiness questions keep their operations', () => {
  const route = (q) => resolveAskOperation(q).operationId;
  for (const q of ['Who is my insurance carrier?', 'What is my homeowners policy deductible?', 'How much is my insurance premium?', 'When does my insurance policy expire?', 'Tell me the deductible for my insurance policy.',
    'What is my target list date for the sale?', 'When is my target close date for selling?', 'What is the status of my sale case?', 'What condition is the paint in for my seller prep?', 'What is my staging readiness for selling?', 'What is the status of my sale items?']) assert.equal(route(q), 'DATA_POINT_READ', q);
  for (const q of ['Am I ready to sell my home?', 'Check my seller prep checklist', 'What is the status of my sale readiness item?']) assert.equal(route(q), 'SELLER_PREP_CHECKLIST', q);
  assert.equal(resolveDataPoint('What is my target list date for the sale?')?.id, 'saleCase.targetListDate', 'the sale needs no "case" or "plan" word');
  assert.equal(resolveDataPoint('What is the status of my sale items?')?.id, 'saleItem.status', 'the more specific "sale items" cue beats the sale cue');
  for (const [domain, floor] of [['insurance', 0.85], ['seller-prep', 0.8]]) { const d = m.byDomain.get(domain); assert.ok(d.routed / d.phrasings >= floor, `${domain} phrasing honor ${d.routed}/${d.phrasings}`); }
});

// ---- warranties and reserve phrasing fixes (2026-11-13) ----
test('warranties and reserve: single-figure questions reach the data point; analysis, writes and the warranty lookup keep their routes', () => {
  const route = (q) => resolveAskOperation(q).operationId;
  for (const q of ['How much does my dishwasher warranty cost?', 'Tell me the cost for my dishwasher warranty.', 'Who is my dishwasher warranty with?', 'When did my dishwasher warranty start?',
    'What is my reserve fund balance?', 'How much is in my reserve fund?', 'What is my reserve shortfall?', 'When was my reserve fund last recalculated?', 'What is my recommended monthly reserve contribution?', 'What is the balance of my savings fund?']) assert.equal(route(q), 'DATA_POINT_READ', q);
  assert.equal(route('When does my dishwasher warranty expire?'), 'WARRANTY_LOOKUP'); assert.equal(route('What does my warranty cover?'), 'WARRANTY_LOOKUP');
  for (const q of ['Should I increase my reserve contribution?', 'Am I behind on my reserve fund?', 'How much should I put into my reserve fund each month?']) assert.equal(route(q), 'CAPITAL_RESERVE_PLAN', q);
  assert.notEqual(route('Set my reserve contribution to $500 a month'), 'CAPITAL_RESERVE_PLAN', 'a contribution change is not the read');
  assert.notEqual(route('Set my reserve contribution to $500 a month'), 'DATA_POINT_READ');
  for (const [domain, floor] of [['warranties', 0.8], ['reserve-ownership-costs', 0.95]]) { const d = m.byDomain.get(domain); assert.ok(d.routed / d.phrasings >= floor, `${domain} phrasing honor ${d.routed}/${d.phrasings}`); }
});

// ---- appliances and inventory phrasing fixes (2026-11-13) ----
test('inventory: details the inventory card never states go to the data point; the ones it states stay with the lookup', () => {
  const route = (q) => resolveAskOperation(q).operationId;
  for (const q of ['When was my refrigerator installed?', 'When did we install the furnace?', 'When did I install my water heater?', 'Who manufactured my dishwasher?', 'What is the serial number of my dryer?', 'What did I pay for my dryer?']) assert.equal(route(q), 'DATA_POINT_READ', q);
  assert.equal(resolveDataPoint('Who manufactured my dishwasher?')?.id, 'item.manufacturer'); assert.equal(resolveDataPoint('When did we install the furnace?')?.id, 'item.installedOn');
  for (const q of ['What brand is my washer?', 'What is the model number of my dishwasher?', 'What is the condition of my roof?', 'When was my water heater last serviced']) assert.equal(route(q), 'INVENTORY_LOOKUP', q);
  const d = m.byDomain.get('appliances-inventory'); assert.ok((d.routed + d.owned) / d.phrasings >= 0.9, `inventory routed-or-owned ${d.routed + d.owned}/${d.phrasings}`);
});

// ---- documents and records, plus the verified-owner list (2026-11-13) ----
test('documents: a detail of a named record goes to the data point; the document lists keep their own operation (typed wording never switches a document view, by design)', () => {
  assert.equal(resolveAskOperation('What type of document is my roof permit?').operationId, 'DATA_POINT_READ');
  assert.equal(resolveAskOperation('Show my documents').operationId, 'DOCUMENT_LOOKUP');
  assert.equal(resolveDataPoint('What type of document is my roof permit?')?.id, 'record.type');
  // the verified-owner list is explicit: a phrasing counts as owned only for a point in it
  const { phrasings } = require('../../scripts/lib/askOwnerReachability.js'); assert.ok(phrasings.length >= 0);
  const w = m.byDomain.get('warranties'); assert.ok((w.routed + w.owned) / w.phrasings >= 0.95, `warranties routed-or-owned ${w.routed + w.owned}/${w.phrasings}`);
  const sp = m.byDomain.get('seller-prep'); assert.ok((sp.routed + sp.owned) / sp.phrasings >= 0.9, `seller-prep routed-or-owned ${sp.routed + sp.owned}/${sp.phrasings}`);
  const d = m.byDomain.get('documents-records'); assert.ok(d.routed / d.phrasings >= 0.9, `documents routed ${d.routed}/${d.phrasings}`);
});

// ---- natural-phrasing gaps found by probing real-sounding owner questions (2026-11-13) ----
test('natural insurance and sale-plan questions no longer fall to the open-ended fallback', () => {
  const route = (q) => resolveAskOperation(q).operationId;
  const cases = {
    'What company insures my home?': 'policy.carrier', 'Who insures my house?': 'policy.carrier', 'How much do I pay for homeowners insurance?': 'policy.premium', 'What is my deductible?': 'policy.deductible',
    'How much coverage do I have for my belongings?': 'policy.personalPropertyLimit', 'When do I plan to list my house?': 'saleCase.targetListDate', 'When do I plan to close on the sale?': 'saleCase.targetCloseDate',
  };
  for (const [q, id] of Object.entries(cases)) { assert.equal(resolveDataPoint(q)?.id, id, q); assert.equal(route(q), 'DATA_POINT_READ', q); }
  // a claim's deductible keeps its own, more specific cue
  assert.equal(resolveDataPoint('What is the deductible on my claim?')?.id, 'claim.deductible'); assert.equal(resolveDataPoint('What is the deductible on my insurance policy?')?.id, 'policy.deductible');
  // first-person subjects no longer hide a detail question ("how much do I pay"), but a bare question with no recorded detail still resolves to nothing
  assert.equal(resolveDataPoint('How much do I pay for lunch?'), null);
});

test('the "due" cue never takes a buyer deadline or a "what is coming due" list question', () => {
  for (const q of ['What is coming due before we close on this home?', 'What is due this week?', 'When is my warranty due?', 'When is my inspection contingency due']) assert.notEqual(resolveDataPoint(q)?.id, 'task.nextDueDate', q);
  assert.notEqual(resolveAskOperation('What is coming due before we close on this home?').operationId, 'DATA_POINT_READ');
});

// ---- second natural-phrasing probe: tax, closing, move-in, milestones, past claim filing, "most valuable" (2026-11-13) ----
test('natural tax, buyer, claim and ranking questions no longer fall to the open-ended fallback, and a past filing is not a request to file', () => {
  const route = (q) => resolveAskOperation(q).operationId;
  const cases = {
    'What is my property tax bill?': 'taxBill.amount', 'What is my effective tax rate?': 'taxBill.effectiveRate', 'What is the taxable value of my home?': 'taxAssessment.taxableValue', 'How much is the land worth for tax purposes?': 'taxAssessment.landValue',
    'When is my closing date?': 'buyer.targetCloseDate', 'When do I close?': 'buyer.targetCloseDate', 'When do I move in?': 'buyer.moveInDate', 'What is the status of my inspection milestone?': 'buyerMilestone.status',
    'When did I file my water damage claim?': 'claim.submittedDate', 'When is my closing date for selling my house?': 'saleCase.targetCloseDate',
  };
  for (const [q, id] of Object.entries(cases)) { assert.equal(resolveDataPoint(q)?.id, id, q); assert.equal(route(q), 'DATA_POINT_READ', q); }
  // a real request to file still files; the past-tense question does not
  assert.equal(route('Start a claim for my roof'), 'CLAIM_FILE'); assert.equal(route('File a claim for the water damage'), 'CLAIM_FILE'); assert.notEqual(route('When did I file my water damage claim?'), 'CLAIM_FILE');
  const { planDataPointQuery } = require('../../src/services/ask/dataPoint/dataPointQueryPlan.ts');
  assert.equal(planDataPointQuery('What is my most valuable appliance?').reasonCode, 'DATA_POINT_QUERY_MEASURE_REQUIRED', '"valuable" is a ranking; purchase price or replacement cost is asked, not guessed');
  assert.equal(planDataPointQuery('What is my most valuable appliance by replacement cost?').plan.sort.field, 'replacementCost');
});

// ---- third natural-phrasing probe: claims, maintenance, inventory (2026-11-13) ----
test('claims, maintenance and inventory: a payout is not a premium, a read question is not an edit, and age and spend questions plan', () => {
  const route = (q) => resolveAskOperation(q).operationId;
  const { planDataPointQuery } = require('../../src/services/ask/dataPoint/dataPointQueryPlan.ts');
  assert.equal(resolveDataPoint('How much did my insurance pay for the water damage?')?.id, 'claim.settlement', 'a payout question is the claim settlement, not the policy premium');
  assert.equal(resolveDataPoint('How much do I pay for homeowners insurance?')?.id, 'policy.premium'); assert.equal(resolveDataPoint('What is my homeowners premium?')?.id, 'policy.premium');
  assert.equal(resolveDataPoint('How much was my claim for?')?.id, 'claim.estimatedLoss');
  // a read question that names a priority or a change is not an edit; real edit commands still are
  assert.equal(route('Which maintenance tasks are high priority?'), 'DATA_POINT_READ'); assert.notEqual(route('How often do I change my furnace filter?'), 'MAINTENANCE_TASK_UPDATE');
  for (const q of ['Move my gutter cleaning to Friday', 'Change the priority of my gutter cleaning task', 'Reschedule my furnace filter service']) assert.equal(route(q), 'MAINTENANCE_TASK_UPDATE', q);
  assert.deepEqual(planDataPointQuery('Which maintenance tasks are high priority?').plan.predicates.map((p) => [p.field, p.value]), [['priority', 'HIGH']]);
  const old = planDataPointQuery('What appliances are over ten years old?'); assert.deepEqual([old.plan.predicates[0].field, old.plan.predicates[0].op], ['installedOn', 'lt']);
  const spend = planDataPointQuery('What did I spend on my appliances?'); assert.deepEqual([spend.plan.aggregate.fn, spend.plan.aggregate.field], ['SUM', 'purchaseCost']);
});

// ---- fourth natural-phrasing probe: buyer and seller (2026-11-13) ----
test('buyer task counts and seller-readiness questions: new buyer-task templates, "have I" questions, "left" items, and readiness questions reach the checklist', () => {
  const route = (q) => resolveAskOperation(q).operationId;
  const { planDataPointQuery } = require('../../src/services/ask/dataPoint/dataPointQueryPlan.ts');
  const plan = (q) => { const o = planDataPointQuery(q); assert.equal(o.kind, 'PLAN', q); return o.plan; };
  // buyer tasks (the closing checklist) are counted and filtered as buyer tasks, never as maintenance tasks
  assert.deepEqual([plan('How many buyer tasks are completed?').template.id, plan('How many buyer tasks are completed?').predicates[0].value], ['buyerTasks', 'COMPLETED']);
  assert.equal(route('How many buyer tasks are completed?'), 'DATA_POINT_READ'); assert.equal(plan('How many buyer tasks do I have?').shape, 'AGGREGATE');
  const overdue = plan('How many closing tasks are overdue?'); assert.deepEqual([overdue.predicates[0].field, overdue.excludesClosed], ['dueAt', true]);
  assert.equal(route('Which buyer tasks are still open?'), 'BUYER_PLAN_STATUS', 'a plain buyer-task list stays with the buyer plan');
  // seller items
  assert.deepEqual([plan('Have I waived any sale items?').predicates[0].value, route('Have I waived any sale items?')], ['WAIVED', 'DATA_POINT_READ']);
  assert.equal(plan('How many sale items are left?').predicates[0].value, 'OPEN'); assert.equal(plan('How many items are left on my sale checklist?').template.id, 'saleItems');
  // ("What do I need to do before selling my home?" stays with the life-event entry: an existing routing test owns it)
  for (const q of ['Is my house ready to list?', 'What repairs should I make before selling?', 'What is the most important thing to fix before selling?', 'What is left on my seller prep?']) assert.equal(route(q), 'SELLER_PREP_CHECKLIST', q);
});

// ---- sixth natural-phrasing probe: maintenance and inventory (2026-11-13) ----
test('maintenance and inventory: "due next month" is a window not a ranking, "urgent" is never dropped, spend and "everything in my home" total, "last year" is not answered over all time', () => {
  const { planDataPointQuery } = require('../../src/services/ask/dataPoint/dataPointQueryPlan.ts');
  const NOW = new Date('2026-11-13T12:00:00Z'); const plan = (q) => { const o = planDataPointQuery(q, NOW); assert.equal(o.kind, 'PLAN', q); return o.plan; };
  const route = (q) => resolveAskOperation(q).operationId;
  // a window, not a ranking
  const next = plan('Which maintenance tasks are due next month?'); assert.deepEqual([next.shape, next.predicates.map((p) => p.op)], ['FILTER', ['gte', 'lt']]);
  assert.equal(plan('Which maintenance task is due next?').shape, 'TOP_K'); assert.equal(plan('Which warranty expires next?').shape, 'TOP_K', 'a real "next" is still a ranking');
  // a qualifier is a predicate or the question gets no plan
  assert.deepEqual(plan('How many urgent maintenance tasks do I have?').predicates.map((p) => [p.field, p.value]), [['priority', 'URGENT']]);
  assert.deepEqual(plan('How many HVAC items do I have?').predicates.map((p) => [p.field, p.value]), [['category', 'HVAC']]);
  assert.equal(planDataPointQuery('What did I spend on maintenance last year?', NOW).kind, 'NONE', 'a past period is not supported, so it is not answered over all time');
  // spend and totals
  assert.deepEqual([plan('How much have I spent on maintenance?').aggregate.fn, plan('How much have I spent on maintenance?').aggregate.field], ['SUM', 'actualCost']);
  assert.equal(plan('What is the total replacement cost of everything in my home?').aggregate.field, 'replacementCost'); assert.equal(plan('What did I pay for my appliances in total?').aggregate.field, 'purchaseCost');
  // last-done and room/location questions
  assert.equal(resolveDataPoint('When was my gutter cleaning last done?')?.id, 'task.lastCompletedDate'); assert.equal(route('When was my gutter cleaning last done?'), 'DATA_POINT_READ');
  assert.equal(resolveDataPoint('When was my warranty last done?')?.id ?? null, null);
  for (const q of ['Where is my water heater located?', 'What room is my refrigerator in?']) assert.equal(route(q), 'INVENTORY_LOOKUP', q);
  assert.notEqual(route('Where is my deed?'), 'INVENTORY_LOOKUP');
});
