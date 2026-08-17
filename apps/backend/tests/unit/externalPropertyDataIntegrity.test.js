const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(process.cwd(), 'src/services/externalPropertyData.service.ts');

test('external property lookup never emits synthetic location or property facts', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.doesNotMatch(source, /city:\s*['"]Austin['"]/);
  assert.doesNotMatch(source, /state:\s*['"]TX['"]/);
  assert.doesNotMatch(source, /Default mock city|MOCK LOGIC|Simple deterministic mock logic/);
  assert.match(source, /Provider unavailable; returning no enrichment/);
  assert.match(source, /return null;/);
});
