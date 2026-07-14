const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('owner transparency UI consumes the property-scoped context map', () => {
  const page = source('../../../frontend/src/app/(dashboard)/dashboard/personalization/page.tsx');
  const api = source('../../../frontend/src/lib/api/personalizationPilotApi.ts');
  assert.match(api, /\/personalization\/context-map/);
  assert.match(page, /pilot\.profileEnabled && pilot\.capabilities\.canViewSensitiveEvidence/);
  assert.match(page, /What personalization knows/);
  assert.match(page, /No inferred household relationships, retained timeline, or future simulation/);
});

test('context-map route requires the sensitive-evidence capability', () => {
  const routes = source('../../src/routes/personalizationPilot.routes.ts');
  assert.match(
    routes,
    /personalization\/context-map'[\s\S]*requirePersonalizationCapability\('canViewSensitiveEvidence'\)/,
  );
});
