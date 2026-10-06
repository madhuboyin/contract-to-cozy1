const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The boot-time warning for the DIY template revision rollout: it warns about live templates without a published head and about templates stuck in
// review from before revisions existed, stays silent otherwise, and never throws or writes.
const { warnAboutDiyTemplateRevisionState } = require('../../src/services/diyTemplateRevisionStartupCheck.ts');

const fakes = (counts, failWith) => {
  const warns = [];
  const calls = [];
  const db = { diyProjectTemplate: { count: async (args) => { calls.push(args); if (failWith) throw failWith; return counts.shift(); } } };
  return { db, log: { warn: (...args) => warns.push(args) }, warns, calls };
};

test('warns, with the remedy, when templates are ACTIVE without a published head', async () => {
  const h = fakes([3, 0]);
  assert.deepEqual(await warnAboutDiyTemplateRevisionState(h.db, h.log), { liveWithoutHead: 3, reviewWithoutCandidate: 0 });
  assert.equal(h.warns.length, 1);
  assert.deepEqual(h.warns[0][0], { liveWithoutHead: 3 });
  assert.match(h.warns[0][1], /ACTIVE with no published revision/);
  assert.match(h.warns[0][1], /diy-template-revisions-backfill\.pgadmin\.sql/);
});

test('warns separately about templates in review or approved that have no open candidate', async () => {
  const h = fakes([0, 2]);
  assert.deepEqual(await warnAboutDiyTemplateRevisionState(h.db, h.log), { liveWithoutHead: 0, reviewWithoutCandidate: 2 });
  assert.equal(h.warns.length, 1);
  assert.match(h.warns[0][1], /return them to draft and submit them again/);
  assert.deepEqual(h.calls[0].where, { status: 'ACTIVE', publishedRevisionId: null });
  assert.deepEqual(h.calls[1].where.status, { in: ['REVIEW', 'APPROVED'] });
  assert.ok(h.calls[1].where.revisions.none, 'asks for templates with NO open candidate revision');
});

test('is silent when nothing needs attention', async () => {
  const h = fakes([0, 0]);
  assert.deepEqual(await warnAboutDiyTemplateRevisionState(h.db, h.log), { liveWithoutHead: 0, reviewWithoutCandidate: 0 });
  assert.deepEqual(h.warns, []);
});

test('a failing check is logged and swallowed: it returns null and never throws', async () => {
  const h = fakes([], new Error('connection refused'));
  assert.equal(await warnAboutDiyTemplateRevisionState(h.db, h.log), null);
  assert.equal(h.warns.length, 1);
  assert.match(h.warns[0][1], /server is unaffected/);
});

test('it only counts: the fake exposes no write method, and the module source contains no write call', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/diyTemplateRevisionStartupCheck.ts'), 'utf8');
  assert.equal(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(source), false);
});
