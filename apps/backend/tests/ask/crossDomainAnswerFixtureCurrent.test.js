const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// The browser acceptance spec (apps/frontend/e2e/ask/compactAnswers.spec.ts) serves the blocks the backend really builds. If the executor or adapter changes, regenerate them:
//   node scripts/ask-dump-cross-domain-answers.js
test('the browser acceptance fixture matches what the backend builds today', () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/ask-dump-cross-domain-answers.js'), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, 'apps/frontend/e2e/ask/compactAnswerBlocks.json is out of date: run `node scripts/ask-dump-cross-domain-answers.js` in apps/backend');
});
