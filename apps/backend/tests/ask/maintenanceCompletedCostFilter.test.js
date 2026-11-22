const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { parseCrossDomainSemanticRequest } = require('../../src/services/ask/semantic/crossDomain/crossDomainPlanBuilder.ts');
const { appliedAmountOverCents, findAmountComparisons, singleGreaterThanAmountCents, withUnappliedAmountComparison } = require('../../src/services/ask/semantic/amountComparison.ts');

// Hand-computed fixture. "Over $1,000" (strictly greater, actual cost else estimate):
//   A actual $1,250.00 (estimate $1,000.00) -> over, actual wins
//   B no actual, estimate $1,500.00         -> over, labelled estimated
//   C actual $900.00 (estimate $1,200.00)   -> NOT over: the actual cost wins over a higher estimate
//   D actual $1,000.00 exactly              -> NOT over: strictly greater
//   E no cost at all                        -> unknown, named, never counted as $0 or as under
//   F PENDING with $5,000.00 actual         -> not completed, never listed
const base = buildSeededCrossDomainSnapshot();
const task = (id, title, status, actualCostCents, estimatedCostCents, completedOn) => ({ id, propertyId: base.propertyId, title, status, priority: 'MEDIUM_PRIORITY', nextDueDate: '', inventoryItemId: null, actualCostCents, estimatedCostCents, completedOn });
const snapshot = {
  ...base,
  maintenanceTasks: [
    ...base.maintenanceTasks,
    task('A', 'Replace roof flashing', 'COMPLETED', 125000, 100000, '2026-03-04'),
    task('B', 'Repaint deck', 'COMPLETED', null, 150000, '2026-05-01'),
    task('C', 'Clean gutters', 'COMPLETED', 90000, 120000, '2026-06-01'),
    task('D', 'Service HVAC', 'COMPLETED', 100000, null, '2026-07-01'),
    task('E', 'Check smoke alarms', 'COMPLETED', null, null, '2026-08-01'),
    task('F', 'Pending big job', 'PENDING', 500000, null, null),
  ],
};

async function ask(message, role = 'OWNER') {
  const execution = await X.executeCrossDomainSnapshot({ rawText: message, snapshot, role, propertyAuthorized: true });
  const plan = parseCrossDomainSemanticRequest(message).plan;
  const result = withUnappliedAmountComparison(X.buildOperationResultFromCrossDomainExecution(execution), message, appliedAmountOverCents(plan));
  return { execution, result, rows: execution.facetResults[0]?.rows ?? [], summary: result.blocks.find((b) => b.type === 'SUMMARY')?.body ?? '' };
}

test('the amount parser reads strictly-greater comparators and exact cents, and nothing else', () => {
  assert.equal(singleGreaterThanAmountCents('which completed tasks cost over $1000?'), 100000);
  assert.equal(singleGreaterThanAmountCents('cost more than $1,200'), 120000);
  assert.equal(singleGreaterThanAmountCents('cost above $2k'), 200000);
  assert.equal(singleGreaterThanAmountCents('cost over 50 dollars'), 5000);
  assert.equal(singleGreaterThanAmountCents('cost under $500'), null, 'under is not applied');
  assert.equal(singleGreaterThanAmountCents('cost at least $500'), null, 'at least is not strictly greater');
  assert.equal(singleGreaterThanAmountCents('cost over $100 and under $900'), null, 'two comparisons are not applied');
  assert.deepEqual(findAmountComparisons('cost under $500').map((c) => c.comparator), ['OTHER']);
});

test('completed tasks over $1,000: actual else estimate (labelled), strictly greater, unknown named, only completed', async () => {
  const { execution, result, rows, summary } = await ask('which completed maintenance tasks cost over $1000?');
  assert.equal(execution.status, 'ANSWERED');
  assert.equal(result.status, 'ANSWERED', 'the threshold was applied, so the answer is not labelled partial');
  assert.deepEqual(rows.map((r) => r.label), ['Replace roof flashing', 'Repaint deck']);
  assert.equal(rows[0].subtitle, '$1,250.00 · Completed Mar 4, 2026');
  assert.equal(rows[1].subtitle, '$1,500.00 (estimated) · Completed May 1, 2026');
  assert.equal(summary, '2 completed maintenance tasks have a recorded cost over $1,000.00. 1 other completed task has no recorded cost and was excluded.');
  const list = result.blocks.find((block) => block.type === 'GROUPED_LIST');
  assert.equal(list.id, 'maintenance-groups');
  assert.equal(list.title, 'Completed tasks over $1,000.00');
  assert.deepEqual(list.sections.flatMap((section) => section.items.map((item) => item.entityType)), ['MAINTENANCE_TASK', 'MAINTENANCE_TASK']);
  assert.deepEqual(list.sections[0].items[0].meta, ['$1,250.00', 'Completed Mar 4, 2026']);
  assert.equal(list.sections[0].items[0].amountLabel, '$1,250.00');
  assert.equal(list.sections[0].items[0].timingLabel, 'Completed Mar 4, 2026');
  assert.doesNotMatch(summary, /Clean gutters|Service HVAC|Pending big job/);
  assert.doesNotMatch(summary, /couldn’t apply/);
});

test('a thousands comma is part of the amount, not a clause boundary', async () => {
  const { rows, summary } = await ask('which completed maintenance tasks cost more than $1,200');
  assert.deepEqual(rows.map((r) => r.label), ['Replace roof flashing', 'Repaint deck']);
  assert.match(summary, /more than \$1,200\.00/);
});

test('nothing over the threshold says so and still names the unknown cost', async () => {
  const { rows, summary } = await ask('which completed maintenance tasks cost over $5000');
  assert.equal(rows.length, 0);
  assert.equal(summary, 'No completed maintenance task has a recorded cost over $5,000.00. 1 other completed task has no recorded cost and was excluded.');
});

test('the completed status alone lists every completed task and no open one', async () => {
  const { rows, summary } = await ask('show completed maintenance tasks');
  assert.deepEqual(rows.map((r) => r.label), ['Replace roof flashing', 'Repaint deck', 'Clean gutters', 'Service HVAC', 'Check smoke alarms']);
  assert.equal(summary, '5 completed maintenance tasks are recorded.');
});

test('a viewer does not get costs', async () => {
  const { rows, summary } = await ask('which completed maintenance tasks cost over $1000', 'VIEWER');
  assert.equal(rows.length, 0);
  assert.match(summary, /redacted/);
});

test('combinations the rule cannot answer are not answered with a condition dropped', async () => {
  for (const message of ['completed maintenance tasks due next month', 'completed plumbing maintenance tasks', 'which maintenance tasks cost over $1000?']) {
    const execution = await X.executeCrossDomainSnapshot({ rawText: message, snapshot, role: 'OWNER', propertyAuthorized: true });
    assert.equal(execution.status, 'NONE_FITS', message);
  }
});

test('an unapplied comparator on a typed answer is still labelled partial', () => {
  const answered = { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 's', title: 'T', body: 'B', tone: 'NEUTRAL' }] };
  const wrapped = withUnappliedAmountComparison(answered, 'completed tasks cost under $500', []);
  assert.equal(wrapped.status, 'READY_WITH_LIMITATIONS');
  const applied = withUnappliedAmountComparison(answered, 'completed tasks cost over $500', [50000]);
  assert.equal(applied, answered);
});
