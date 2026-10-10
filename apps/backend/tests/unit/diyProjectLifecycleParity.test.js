const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

// Ask/page parity for the DIY completion (capability discovery plan, Phase 6 follow-up): the lifecycle event is recorded where the project is
// created -- diyService -- so the page's HTTP route and Ask's confirmed "start this project" share one completion rule.
const { recordDiyProjectCreated, diyProjectCompletionEvent } = require('../../src/services/analytics/diyLifecycle.ts');
const read = (relative) => fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');

const project = { id: 'proj-1', category: 'PLUMBING', decisionVerdict: 'DIY_OK' };

test('a created project records the same DIY completion event the controller used to', async () => {
  const calls = [];
  recordDiyProjectCreated({ userId: 'u1', propertyId: 'p1', project }, async (args) => { calls.push(args); return { count: 1 }; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, 'u1'); assert.equal(calls[0].propertyId, 'p1');
  assert.deepEqual(calls[0].events, [diyProjectCompletionEvent({ projectId: 'proj-1', category: 'PLUMBING', decisionVerdict: 'DIY_OK' })]);
  const event = calls[0].events[0];
  assert.deepEqual([event.toolId, event.stage, event.completionKind, event.sourceKind, event.outputKey], ['diy', 'COMPLETED', 'DECISION_RECORDED', 'PROJECT', 'proj-1']);
});

test('a failing analytics sink neither throws nor leaves an unhandled rejection, so the project write is unaffected', async () => {
  const unhandled = [];
  const listener = (error) => unhandled.push(error);
  process.on('unhandledRejection', listener);
  try {
    assert.doesNotThrow(() => recordDiyProjectCreated({ userId: 'u1', propertyId: 'p1', project }, async () => { throw new Error('sink down'); }));
    assert.doesNotThrow(() => recordDiyProjectCreated({ userId: 'u1', propertyId: 'p1', project }, () => { throw new Error('sync failure'); }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(unhandled, []);
  } finally { process.off('unhandledRejection', listener); }
});

test('the service records it in both creation branches, and in the template branch only for a project it actually created', () => {
  const service = read('src/services/diy.service.ts');
  assert.equal((service.match(/recordDiyProjectCreated\(/g) ?? []).length, 2);
  assert.match(service, /if \(started\.outcome === 'CREATED'\) recordDiyProjectCreated\(\{ userId: ctx\.actorUserId, propertyId, project: started\.project \}\)/);
  assert.match(service, /if \(created\) recordDiyProjectCreated\(\{ userId, propertyId, project: created \}\)/);
});

test('the controller no longer records it (exactly one emission per created project), and Ask\'s confirmed start goes through the same authority', () => {
  assert.doesNotMatch(read('src/controllers/diy.controller.ts'), /diyProjectCompletionEvent/);
  assert.match(read('src/services/ask/handlers/diyProjectStart.handler.ts'), /startProjectFromTemplate\(/);
});
