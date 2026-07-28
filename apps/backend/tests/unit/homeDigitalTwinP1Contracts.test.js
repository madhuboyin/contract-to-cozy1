const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('scenario runs persist immutable input, source, model, and output snapshots', () => {
  const schema = read('prisma/schema.prisma');
  const service = read('src/services/homeDigitalTwinScenario.service.ts');
  assert.match(schema, /outputSnapshot\s+Json\?/);
  assert.match(schema, /sourceSnapshot\s+Json\?/);
  assert.match(schema, /modelVersion\s+String\s+@default\("hdt-scenario-v2"\)/);
  assert.match(service, /listScenarioRuns/);
  assert.match(service, /inputSnapshot/);
  assert.match(service, /sourceSnapshot/);
  assert.match(service, /outputSnapshot/);
});

test('canonical changes use one delayed property-keyed refresh and qualify scenarios stale', () => {
  const queue = read('src/services/JobQueue.service.ts');
  const worker = read('../workers/src/jobs/propertyIntelligence.job.ts');
  assert.match(queue, /enqueueHomeDigitalTwinRefresh/);
  assert.match(queue, /jobId: `\$\{propertyId\}-HOME-DIGITAL-TWIN`/);
  assert.match(queue, /removeOnComplete: true/);
  assert.match(queue, /homeTwinScenario\.updateMany/);
  assert.match(worker, /processHomeDigitalTwinRefresh/);
});

test('upgrade planner is contextual workflow-only decision support', () => {
  const decide = read('src/productFramework/capabilities/definitions/decideCompare.ts');
  const protect = read('src/productFramework/capabilities/definitions/protectMonitor.ts');
  const catalog = read('../frontend/src/components/mobile/dashboard/mobileToolCatalog.ts');
  assert.match(decide, /'home-digital-twin', 'Home Upgrade Planner'/);
  assert.doesNotMatch(protect, /'home-digital-twin'/);
  assert.match(catalog, /key: 'home-digital-twin'[\s\S]*?workflowOnly: true/);
});
