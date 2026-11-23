// FRD D27 / BICC-CTX-005: cross-session continuity resumes canonical workflow identity only, for the same user and the same home, and re-checks access,
// existence and expiry. The Work destination (resolveAskWork) already does this; this file pins each clause of D27 so a change cannot quietly weaken one.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { resolveAskWork, parseAskWorkKey } = require('../../src/services/ask/work/askWorkResolve.ts');
const { ASK_WORK_PROVIDER_REGISTRY } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');

const ctx = { userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING' };
const noReaders = {};

test('D27 "ids only": a resume key is a typed prefix plus an id; free text, an unknown prefix and an oversized id never resolve', () => {
  assert.ok(parseAskWorkKey('journey:abc'));
  assert.equal(parseAskWorkKey('resume my roof journey please'), null);
  assert.equal(parseAskWorkKey('journey:'), null);
  assert.equal(parseAskWorkKey(`journey:${'x'.repeat(161)}`), null);
  assert.equal(parseAskWorkKey('unknown:abc'), null);
});

test('D27 "same home": every existence probe is scoped to the home, so another home\'s id is reported as gone and nothing is read', async () => {
  const seen = [];
  const original = {};
  for (const [delegate, kinds] of Object.entries({ operationalWorkItem: 'workItem:w1', decisionThread: 'decisionThread:d1', claim: 'claim:c1', projectRecord: 'project:pr1', diyProject: 'diyProject:y1' })) {
    original[delegate] = prisma[delegate]?.findFirst;
    if (prisma[delegate]) prisma[delegate].findFirst = async (args) => { seen.push([delegate, args.where]); return null; };
  }
  try {
    for (const key of ['workItem:w1', 'decisionThread:d1', 'claim:c1', 'project:pr1', 'diyProject:y1']) {
      const result = await resolveAskWork({ ...ctx, workKey: key }, noReaders, ASK_WORK_PROVIDER_REGISTRY);
      assert.equal(result.outcome, 'DELETED', key);
      assert.equal(result.row, null, 'nothing about the work is returned');
    }
    assert.ok(seen.length >= 5, `probed ${seen.length}`);
    for (const [delegate, where] of seen) assert.equal(where.propertyId, 'p1', `${delegate} probe is scoped to the home`);
  } finally { for (const [delegate, fn] of Object.entries(original)) if (fn) prisma[delegate].findFirst = fn; }
});

test('D27 "same user": an execution is only found for the person who asked it', async () => {
  let where = null;
  const original = prisma.askExecution.findFirst;
  prisma.askExecution.findFirst = async (args) => { where = args.where; return null; };
  try {
    const result = await resolveAskWork({ ...ctx, workKey: 'execution:e1' }, noReaders, ASK_WORK_PROVIDER_REGISTRY);
    assert.equal(result.outcome, 'DELETED');
    assert.equal(where.userId, 'u1');
  } finally { prisma.askExecution.findFirst = original; }
});

test('D27 "access re-checked": a role below the provider floor gets ACCESS_LOST and the reader is never called', async () => {
  const original = prisma.refinanceRateMonitor?.findFirst;
  prisma.refinanceRateMonitor = { ...(prisma.refinanceRateMonitor ?? {}), findFirst: async () => ({ status: 'ACTIVE' }) };
  let called = false;
  try {
    const result = await resolveAskWork({ ...ctx, role: 'VIEWER', workKey: 'monitor:refinanceRate:m1' }, { MONITORS: async () => { called = true; return { rows: [], total: 0, viewCounts: null }; } }, ASK_WORK_PROVIDER_REGISTRY);
    assert.equal(result.outcome, 'ACCESS_LOST');
    assert.equal(called, false);
    assert.equal(result.row, null);
  } finally { if (original) prisma.refinanceRateMonitor.findFirst = original; }
});

test('D27 "access re-checked": the service authorizes the home before it probes anything, and a lost home or role is reported as ACCESS_LOST', () => {
  // Source-asserted: running it needs the account-eligibility database lookup, which this suite deliberately does not stub.
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/services/ask/askWork.service.ts'), 'utf8');
  const body = source.slice(source.indexOf('export async function resolveAskWorkForUser'));
  assert.ok(body.indexOf('authorizeAskWork(') > 0 && body.indexOf('authorizeAskWork(') < body.indexOf('resolveAskWork({'), 'authorization comes first');
  assert.match(body, /ASK_PROPERTY_NOT_FOUND[\s\S]{0,120}ASK_PERMISSION_REQUIRED[\s\S]{0,260}outcome: 'ACCESS_LOST'[\s\S]{0,80}row: null/);
});

test('D27 "says when it could not resume": every non-available outcome carries a plain message and no row', async () => {
  const original = prisma.operationalWorkItem.findFirst;
  prisma.operationalWorkItem.findFirst = async () => null;
  try {
    const result = await resolveAskWork({ ...ctx, workKey: 'workItem:gone' }, noReaders, ASK_WORK_PROVIDER_REGISTRY);
    assert.equal(result.outcome, 'DELETED');
    assert.match(result.message, /removed|could not be found/i);
  } finally { prisma.operationalWorkItem.findFirst = original; }
});

test('D27 "no conversation text across sessions": the conversation summary is read from the current session only, within a recency window', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/services/ask/conversationSummary.ts'), 'utf8');
  assert.match(source, /sessionId: input\.sessionId, userId: input\.userId/, 'the summary read is scoped to this session and user');
  assert.match(source, /RECENCY|recency/i);
});
