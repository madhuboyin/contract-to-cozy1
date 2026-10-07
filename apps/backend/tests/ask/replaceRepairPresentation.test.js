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

test('repair or replace no longer emits legacy raw reserve follow-ups', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/miscHandlers.handler.ts'), 'utf8');
  assert.doesNotMatch(source, /How much should I reserve for/);
  assert.doesNotMatch(source, /How much should I reserve for this item\?/);
});

test('the complete repair or replace answer stays in Ask without a legacy desktop CTA', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/miscHandlers.handler.ts'), 'utf8');
  assert.doesNotMatch(source, /label: 'Open Repair vs Replace'/);
  assert.doesNotMatch(source, /href: `\/dashboard\/replace-repair/);
});
