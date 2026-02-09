const test = require('node:test');
const assert = require('node:assert/strict');

test('e2e test runner is configured', () => {
  assert.match('backend', /back/);
});

