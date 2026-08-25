const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const orchestratorSource = fs.readFileSync(
  path.join(__dirname, '../../src/services/ask/askOrchestrator.service.ts'),
  'utf8',
);

function functionBody(name) {
  const start = orchestratorSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextFunction = orchestratorSource.indexOf('\nfunction ', start + 1);
  const nextAsyncFunction = orchestratorSource.indexOf('\nasync function ', start + 1);
  const ends = [nextFunction, nextAsyncFunction].filter((index) => index > start);
  return orchestratorSource.slice(start, ends.length ? Math.min(...ends) : undefined);
}

test('Ask Operational Work completion requires and confirms a homeowner-observed result', () => {
  const prepare = functionBody('operationalWorkUpdateResult');
  assert.match(prepare, /OPERATIONAL_WORK_COMPLETION_RESULT_REQUIRED/);
  assert.match(prepare, /durableFreeTextClarification\(\s*'OPERATIONAL_WORK_UPDATE'/);
  assert.match(prepare, /operationalWorkObservedResult: observedResult/);
  assert.match(prepare, /label: 'Observed result'/);
  assert.doesNotMatch(prepare, /observedResult:\s*'CONFIRMED_HEALTHY'/);
});

test('Ask confirmed Operational Work completion resolves snapshot attribution and forwards the confirmed result', () => {
  assert.match(
    orchestratorSource,
    /resolveWorkItemRecommendationSnapshotId\(execution\.propertyId, item\.id\)/,
  );
  assert.match(
    orchestratorSource,
    /observedResult:\s*observedResult as 'CONFIRMED_HEALTHY' \| 'NEEDS_ATTENTION' \| 'FAILED'/,
  );
  assert.match(
    orchestratorSource,
    /action === 'COMPLETE' && !\['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED'\]\.includes\(String\(observedResult\)\)/,
  );
});
