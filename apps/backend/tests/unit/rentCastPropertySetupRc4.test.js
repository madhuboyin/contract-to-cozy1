const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8');
}

test('shared Property create and address update own the post-commit enrichment enqueue', () => {
  const source = read('src/services/property.service.ts');
  const createStart = source.indexOf('export async function createProperty');
  const updateStart = source.indexOf('export async function updateProperty');
  const createBlock = source.slice(createStart, updateStart);
  const updateBlock = source.slice(updateStart);

  assert.equal(
    (createBlock.match(/enqueuePropertyEnrichment\(/g) || []).length,
    1,
    'all create routes must converge on one shared enqueue seam',
  );
  assert.match(createBlock, /runPostCreateStep\(property\.id, 'property-enrichment-enqueue'/);
  assert.match(createBlock, /property\.addressIdentityVersion/);

  assert.equal((updateBlock.match(/enqueuePropertyEnrichment\(/g) || []).length, 1);
  assert.match(updateBlock, /if \(addressIdentityChanged\) \{[\s\S]*?enqueuePropertyEnrichment/);
  assert.match(updateBlock, /catch \(error\) \{[\s\S]*?PROPERTY_UPDATE/);
});

test('registry and worker declare the same dedicated event-driven queue', () => {
  const registry = read('src/config/workerJobRegistry.ts');
  const worker = fs.readFileSync(
    path.resolve(__dirname, '../../../workers/src/worker.ts'),
    'utf8',
  );

  assert.match(registry, /key: 'property-enrichment'[\s\S]*?queueName: 'property-enrichment-queue'/);
  assert.match(worker, /new Worker<PropertyEnrichmentJobPayload>\([\s\S]*?PROPERTY_ENRICHMENT_QUEUE_NAME/);
  assert.match(worker, /registerShutdownHandler\([\s\S]*?'propertyEnrichmentWorker'/);
});
