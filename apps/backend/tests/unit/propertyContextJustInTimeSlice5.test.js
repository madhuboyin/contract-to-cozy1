const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const filesUnder = (relative) => {
  const root = path.join(repoRoot, relative);
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else result.push(absolute);
    }
  };
  visit(root);
  return result;
};

test('the compatibility Property Context notice is retired repository-wide', () => {
  const frontendFiles = filesUnder('apps/frontend/src').filter((file) => /\.(ts|tsx)$/.test(file));
  for (const file of frontendFiles) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /PropertyContextNotice/, path.relative(repoRoot, file));
  }
  assert.equal(fs.existsSync(path.join(repoRoot, 'apps/frontend/src/components/property-context/PropertyContextNotice.tsx')), false);
});

test('aggregate status rendering is noninteractive and accessible', () => {
  const status = read('apps/frontend/src/components/property-context/PropertyContextStatusNotice.tsx');
  assert.match(status, /aria-live=\{needsAttention \? 'polite'/);
  assert.match(status, /aria-label=\{title\}/);
  assert.match(status, /<nav[\s\S]*aria-label=/);
  assert.doesNotMatch(status, /<button|<input|capturePropertyContext|getPropertyContextCaptureDefinition/);
  const client = read('apps/frontend/src/lib/api/client.ts');
  assert.doesNotMatch(client, /capturePropertyContextFact|getPropertyContextCaptureDefinition/);
});

test('feature evaluation and capture expose bounded outcome and latency metrics', () => {
  const metrics = read('apps/backend/src/lib/metrics.ts');
  for (const name of [
    'property_context_feature_evaluations_total',
    'property_context_feature_evaluation_duration_seconds',
    'property_context_feature_captures_total',
    'property_context_feature_capture_duration_seconds',
  ]) assert.match(metrics, new RegExp(name));

  const evaluation = read('apps/backend/src/modules/propertyContext/application/evaluateFeatureContext.ts');
  assert.match(evaluation, /getFeatureContextRequirement\(input\.featureKey, input\.operationKey\);[\s\S]*startTimer/);
  assert.match(evaluation, /outcome: evaluation\.readiness/);
  assert.match(evaluation, /outcome: 'ERROR'/);
  assert.match(evaluation, /finally \{\s*stopTimer\(\)/);

  const capture = read('apps/backend/src/modules/propertyContext/application/captureFeatureContext.ts');
  assert.match(capture, /getCaptureDefinition\(input\.captureKey\);[\s\S]*startTimer/);
  for (const outcome of ['SUCCESS', 'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'VALIDATION_ERROR', 'ACCESS_DENIED']) {
    assert.match(capture, new RegExp(`'${outcome}'`));
  }
});

test('workers and notifications remain noninteractive policy consumers', () => {
  const workerFiles = filesUnder('apps/workers/src').filter((file) => file.endsWith('.ts'));
  const workerSource = workerFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.match(workerSource, /checkReserveFundWorkerContext/);
  assert.match(workerSource, /checkPermitWorkerContext/);
  assert.match(workerSource, /checkReportWorkerContext/);
  assert.doesNotMatch(workerSource, /captureFeatureContext|PropertyContextCapturePanel/);

  const notifications = read('apps/backend/src/services/notification.service.ts');
  assert.match(notifications, /getAggregationContextEnvelope\(propertyId, input\.userId, 'NOTIFICATIONS'\)/);
  assert.match(notifications, /propertyContext\.decision\.status !== 'APPLICABLE'/);
  assert.match(notifications, /propertyContextVersion: propertyContext\.contextVersion/);
  assert.doesNotMatch(notifications, /captureFeatureContext/);
});
