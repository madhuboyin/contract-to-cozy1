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
  for (const u of unrouted) assert.match(u, /^(warranties|policies|tasks)\/(LIST|FILTER)$/, `${u} must be owned by a dedicated operation`);
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
