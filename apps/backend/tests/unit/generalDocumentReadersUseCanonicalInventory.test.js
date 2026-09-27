const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// S5a: readers that only ask "how many documents does this home have" or "is there an inspection report" read the canonical property document
// inventory (Home Records plus the transitional legacy vault), not the legacy table. General uploads now go to Home Records, so a reader that
// still counted only the legacy table would report every new document as missing.
const read = (relative) => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');

const COUNT_READERS = [
  ['src/services/dailyHomePulse.service.ts', /countPropertyDocuments\(\{ propertyId, includeLegacy: true \}\)/],
  ['src/services/homeDigitalTwinQuality.service.ts', /countPropertyDocuments\(\{ propertyId, includeLegacy: true \}\)/],
  ['src/services/homeScoreReport.service.ts', /countPropertyDocuments\(\{ propertyId, includeLegacy: true, linkedToOtherRecords: true \}\)/],
  ['src/services/homeActions.service.ts', /countPropertyDocuments\(\{ propertyId, includeLegacy: true \}\)/],
];

test('the total-document counts read the canonical inventory and no longer count the legacy table directly', () => {
  for (const [file, pattern] of COUNT_READERS) {
    const source = read(file);
    assert.match(source, pattern, `${file} should count through the canonical inventory`);
    assert.doesNotMatch(source, /prisma\.document\.count\(\{ where: \{ propertyId \} \}\)/, `${file} still counts the legacy table for its total`);
  }
  assert.doesNotMatch(read('src/services/homeScoreReport.service.ts'), /prisma\.document\.count/);
});

test('the "verified documents" count stays legacy-only, and says why', () => {
  const source = read('src/services/homeActions.service.ts');
  assert.match(source, /prisma\.document\.count\(\{ where: \{ propertyId, verificationStatus: 'VERIFIED' \} \}\)/);
  assert.match(source, /Verified" is a legacy verification status/);
});

test('the inspection-report capability signal reads the latest inspection report from either store', () => {
  const source = read('src/services/capabilityRecommendation.service.ts');
  assert.match(source, /latestPropertyDocumentOfKind\(\{ propertyId, kind: 'INSPECTION_REPORT', includeLegacy: true \}\)/);
  assert.doesNotMatch(source, /prisma\.document\.findFirst/);
});
