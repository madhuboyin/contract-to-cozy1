const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  verifiedSavingsOutcomeWhere,
} = require('../../src/services/signal.service.ts');

test('shared savings realization projection requires verified, non-revoked received value', () => {
  assert.deepEqual(verifiedSavingsOutcomeWhere('property-1'), {
    stage: 'RECEIVED',
    verificationState: 'VERIFIED',
    verifiedAt: { not: null },
    revokedAt: null,
    opportunity: { propertyId: 'property-1' },
  });
});

test('live refresh and backfill share the verified-only projection policy', () => {
  const signalSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/signal.service.ts'),
    'utf8',
  );
  const backfillSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/sharedDataBackfill.service.ts'),
    'utf8',
  );

  assert.match(signalSource, /where:\s*verifiedSavingsOutcomeWhere\(propertyId\)/);
  assert.match(signalSource, /await this\.expireSavingsRealizationSignals\(\{ propertyId \}\)/);
  assert.match(backfillSource, /where:\s*verifiedSavingsOutcomeWhere\(propertyId\)/);
  assert.match(backfillSource, /await signalService\.expireSavingsRealizationSignals\(\{ propertyId \}\)/);
});
