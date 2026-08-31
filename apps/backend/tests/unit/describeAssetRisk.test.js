const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { describeAssetRisk } = require('../../src/utils/riskCalculator.util.ts');

// describeAssetRisk replaces the `actionCta` button label ("Add Home Warranty")
// that risk consumers were using as rationale text — it builds a real homeowner
// sentence from the numbers the risk engine already computed.

test('age-past-life + uncovered exposure reads as a why, not a CTA', () => {
  const sentence = describeAssetRisk(
    { age: 16, expectedLife: 12, outOfPocketCost: 2400, coverageFactor: 0, actionCta: 'Add Home Warranty' },
    'Water Heater',
  );
  assert.match(sentence, /Water Heater is about 16 years old and past its ~12-year expected service life/);
  assert.match(sentence, /no warranty or insurance on file, an unplanned failure could cost about \$2,400 out of pocket/);
  assert.doesNotMatch(sentence, /Add Home Warranty/);
});

test('covered asset states replacement exposure without the coverage-gap clause', () => {
  const sentence = describeAssetRisk(
    { age: 8, expectedLife: 15, replacementCost: 6000, coverageFactor: 0.8 },
    'HVAC Furnace',
  );
  assert.match(sentence, /about 8 years into a ~15-year expected service life/);
  assert.match(sentence, /estimated replacement exposure is about \$6,000/);
  assert.doesNotMatch(sentence, /out of pocket/);
});

test('degrades to a risk-level sentence when age and exposure are missing', () => {
  const sentence = describeAssetRisk({ riskLevel: 'HIGH' }, 'Roof');
  assert.equal(sentence, 'The risk assessment flags your Roof as high risk.');
});

test('infers the coverage gap from an Add Home Warranty CTA when coverageFactor is absent', () => {
  const sentence = describeAssetRisk(
    { age: 20, expectedLife: 15, outOfPocketCost: 3000, actionCta: 'Add Home Warranty' },
    'Water Heater',
  );
  assert.match(sentence, /no warranty or insurance on file/);
});
