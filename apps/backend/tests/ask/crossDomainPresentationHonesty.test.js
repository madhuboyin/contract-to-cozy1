const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node').register({ transpileOnly: true });

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');

// Live prompts #4 (date range), #9 (own vs rent wording) and #16 (73-item seller checklist).
const run = async (rawText, patch = {}) => {
  const snapshot = { ...buildSeededCrossDomainSnapshot(), ...patch };
  const execution = await X.executeCrossDomainSnapshot({ rawText, snapshot, role: 'OWNER', propertyAuthorized: true });
  return { execution, summary: execution.facetResults.map((f) => f.summary).join(' | '), snapshot };
};

test('#4 "next month" is stated as a calendar month so the answer can be audited', async () => {
  const { summary } = await run('show maintenance tasks due next month');
  assert.match(summary, /due in [A-Z][a-z]+ \d{4} \(the whole calendar month, in your home’s time zone\)|No maintenance tasks are due in [A-Z][a-z]+ \d{4}/);
});

test('#4 a category question keeps the month: a plumbing task due in another month is not returned', async () => {
  const base = buildSeededCrossDomainSnapshot();
  const [y, m] = base.asOfDate.slice(0, 7).split('-').map(Number);
  const ymd = (offset) => new Date(Date.UTC(y, m - 1 + offset, 15)).toISOString().slice(0, 10);
  const task = (id, offset) => ({ id, propertyId: base.propertyId, title: id, status: 'PENDING', nextDueDate: ymd(offset) });
  const { execution } = await run('show plumbing tasks due next month', {
    maintenanceTasks: [task('plumb-next-month', 1), task('plumb-in-three-months', 3)],
    maintenanceTaskMeta: [{ taskId: 'plumb-next-month', category: 'PLUMBING' }, { taskId: 'plumb-in-three-months', category: 'PLUMBING' }],
  });
  const ids = execution.facetResults.flatMap((f) => f.recordIds);
  assert.deepEqual(ids, ['plumb-next-month']);
});

test('#9 the saved Sell/Hold/Rent result is said in words, with what it does and does not compare', async () => {
  const base = buildSeededCrossDomainSnapshot();
  const sell = await run('how long until owning beats renting?', { financeSlots: { ...base.financeSlots, netHoldCents: 8000000, netRentCents: 31300000, sellHoldRentWinner: 'SELL' } });
  assert.match(sell.summary, /your saved analysis favors selling now/);
  assert.match(sell.summary, /renting it out beats keeping the home by \$/);
  assert.match(sell.summary, /compares selling now, keeping the home to live in, and renting it out; it does not compare owning with renting a home as a tenant/);
  assert.ok(!/winner: SELL/.test(sell.summary), 'the raw enum token is not shown');
  assert.ok(!/-\$/.test(sell.summary), 'no signed dollar figure');
  // With rent and home-value inputs present a HOLD result is answered by the computed crossover model, whose figures are not the saved analysis': no note there.
  const computed = await run('how long until owning beats renting?', { financeSlots: { ...base.financeSlots, netHoldCents: 9000000, netRentCents: 4000000, sellHoldRentWinner: 'HOLD' } });
  assert.ok(!/saved Sell\/Hold\/Rent analysis/.test(computed.summary));
  const hold = await run('how long until owning beats renting?', { financeSlots: { ...base.financeSlots, monthlyRentCents: null, netHoldCents: 9000000, netRentCents: 4000000, sellHoldRentWinner: 'HOLD' } });
  assert.match(hold.summary, /favors keeping the home to live in/);
  assert.match(hold.summary, /keeping the home beats renting it out by \$/);
});

test('#9 a computed (non-persisted) own-vs-rent answer is unchanged and carries no Sell/Hold/Rent note', async () => {
  const base = buildSeededCrossDomainSnapshot();
  const { summary } = await run('how long until owning beats renting?', { financeSlots: { ...base.financeSlots, netHoldCents: null, netRentCents: null, sellHoldRentWinner: null } });
  assert.ok(!/saved Sell\/Hold\/Rent analysis/.test(summary));
});

test('#16 seller readiness is counted over open items only, grouped most urgent first, with waived items called out', async () => {
  const base = buildSeededCrossDomainSnapshot();
  const item = (id, status, requirementClass) => ({ id, propertyId: base.propertyId, title: `Task ${id}`, status, requirementClass });
  const items = [
    item('a', 'PENDING', 'PRESENTATION'), item('b', 'PENDING', 'MATERIAL_BLOCKER'), item('c', 'PENDING', 'OPTIONAL_IMPROVEMENT'),
    item('d', 'PENDING', 'PROFESSIONAL_DECISION'), item('e', 'WAIVED', 'MATERIAL_BLOCKER'), item('f', 'COMPLETED', 'VERIFICATION_NEEDED'),
  ];
  const { execution, summary } = await run('what do I still need to finish before listing the house?', { sellerReadinessItems: items });
  assert.match(summary, /^4 seller readiness items are still open before listing\./);
  assert.match(summary, /1 could block a sale, 1 needs a professional’s decision, 1 optional improvements, 1 presentation\./);
  assert.match(summary, /Most urgent: Task b, Task d, Task c, Task a\./);
  assert.match(summary, /1 waived item is not counted\./);
  assert.deepEqual(execution.facetResults[0].recordIds, ['b', 'd', 'c', 'a']);
  const op = X.buildOperationResultFromCrossDomainExecution(execution);
  const list = op.blocks.find((b) => b.type === 'GROUPED_LIST');
  assert.deepEqual(list.sections.map((section) => section.title), ['Could block a sale', 'Needs a professional’s decision', 'Optional improvements', 'Presentation']);
});

test('#16 a long checklist is summarized by its most urgent items, not by a 73-title sentence', async () => {
  const base = buildSeededCrossDomainSnapshot();
  const items = Array.from({ length: 73 }, (_, i) => ({ id: `i${i}`, propertyId: base.propertyId, title: `Item ${i}`, status: 'PENDING', requirementClass: i < 3 ? 'MATERIAL_BLOCKER' : 'OPTIONAL_IMPROVEMENT' }));
  const { summary } = await run('what do I still need to finish before listing the house?', { sellerReadinessItems: items });
  assert.match(summary, /^73 seller readiness items are still open before listing\./);
  assert.match(summary, /and 68 more below/);
  assert.ok(summary.length < 400, `summary stays short (${summary.length})`);
});
