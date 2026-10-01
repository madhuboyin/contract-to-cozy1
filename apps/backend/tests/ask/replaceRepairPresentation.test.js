const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node/register');

const { formatUsdFromCents } = require('../../src/services/replaceRepairAnalysis.service.ts');
const fs = require('node:fs');
const path = require('node:path');

test('formats repair and replacement cent values as USD', () => {
  assert.equal(formatUsdFromCents(120000), '$1,200');
  assert.equal(formatUsdFromCents(56160), '$561.60');
  assert.equal(formatUsdFromCents(45063), '$450.63');
  assert.equal(formatUsdFromCents(0), '$0');
});

test('Ask presents repair/replace decision factors as a responsive table with explicit recommendation effects', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/miscHandlers.handler.ts'), 'utf8');
  assert.match(source, /type: 'TABLE', id: 'repair-replace-trace', title: 'Decision factors'/);
  assert.match(source, /label: 'Evidence used'/);
  assert.match(source, /label: 'Effect on recommendation'/);
  assert.match(source, /'Favors replacement'/);
  assert.match(source, /'Favors repair'/);
  assert.doesNotMatch(source, /type: 'GROUPED_LIST'[^\n]+id: 'repair-replace-trace'/);
});
