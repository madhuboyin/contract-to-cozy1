const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.resolve(
  __dirname,
  '../../../frontend/src/app/(dashboard)/dashboard/personalization/page.tsx',
);
const source = fs.readFileSync(pagePath, 'utf8');

test('personalization UI uses explicit button types and touch-sized controls', () => {
  const buttonCount = (source.match(/<button\b/g) || []).length;
  const explicitTypeCount = (source.match(/type="button"/g) || []).length;
  const touchTargetCount = (source.match(/min-h-\[44px\]/g) || []).length;
  assert.ok(buttonCount > 0);
  assert.equal(explicitTypeCount, buttonCount);
  assert.ok(touchTargetCount >= buttonCount);
});

test('personalization UI contains loading, error, empty, disabled, and reset-confirmation states', () => {
  assert.match(source, /personalizationQuery\.isLoading/);
  assert.match(source, /personalizationQuery\.isError/);
  assert.match(source, /Nothing needs attention/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /disabled=/);
});

test('personalization UI renders reviewed structured explanation content', () => {
  assert.match(source, /reasonCodes\[0\]\?\.params\?\.message/);
});

test('personalization UI lets an owner skip or defer an optional profile question', () => {
  assert.match(source, /action: 'SKIPPED'/);
  assert.match(source, />Skip<\/button>/);
  assert.match(source, /action: 'SNOOZED'/);
  assert.match(source, />Ask later<\/button>/);
});
