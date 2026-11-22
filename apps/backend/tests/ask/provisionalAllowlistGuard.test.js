const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const evidence = require('../fixtures/provisionalAllowlistEvidence.json');
const { PROVISIONAL_READ_OPERATIONS } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');

// Owner decision 2026-11-22: the provisional allowlist is not widened to improve a metric. A new operation needs recorded evidence that it
// passes authorization, value-integrity, routing and held-out certification requirements.
test('every provisional-read operation is grandfathered or has all four pieces of recorded evidence', () => {
  const grandfathered = new Set(evidence.grandfathered);
  const unexplained = [...PROVISIONAL_READ_OPERATIONS].filter((id) => !grandfathered.has(id) && !evidence.added[id]);
  assert.deepEqual(unexplained, [], `Added to the provisional allowlist without recorded evidence: ${unexplained.join(', ')}. Record ${evidence.required.join(', ')} in tests/fixtures/provisionalAllowlistEvidence.json.`);
  for (const [operationId, entry] of Object.entries(evidence.added)) {
    for (const key of evidence.required) assert.ok(String(entry[key] ?? '').trim(), `${operationId}: evidence "${key}" is required`);
  }
});

test('the evidence file lists no operation that is no longer provisional (so it cannot hide a removal)', () => {
  const stale = evidence.grandfathered.filter((id) => !PROVISIONAL_READ_OPERATIONS.has(id));
  assert.deepEqual(stale, [], `Grandfathered but no longer provisional: ${stale.join(', ')}. Remove them from the evidence file.`);
});
