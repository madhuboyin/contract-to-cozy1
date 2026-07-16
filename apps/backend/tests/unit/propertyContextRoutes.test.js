const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Property Context transparency routes require authentication', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/routes/property.routes.ts'), 'utf8');
  assert.match(source, /router\.get\('\/:id\/context', authenticate, getPropertyContextSnapshot\)/);
  assert.match(source, /router\.get\('\/:id\/context\/completeness', authenticate, getPropertyContextCompleteness\)/);
});
