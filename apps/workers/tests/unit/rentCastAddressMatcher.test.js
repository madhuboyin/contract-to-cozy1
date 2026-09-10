const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  normalizeStreetAddress,
  normalizeUnit,
  normalizeCity,
  selectExactRentCastMatch,
} = require('../../src/propertyEnrichment/addressMatcher.ts');

const property = {
  address: '5500 North Grand Lake Street',
  unit: 'Apartment #12-A',
  city: 'St. Louis',
  state: 'mo',
  zipCode: '63101',
};

function record(overrides = {}) {
  return {
    id: 'record-1',
    formattedAddress: '5500 N Grand Lake St, Apt 12-A, St Louis, MO 63101',
    addressLine1: '5500 N. Grand Lake St.',
    addressLine2: 'Unit 12-A',
    city: 'ST LOUIS',
    state: 'MO',
    zipCode: '63101',
    ...overrides,
  };
}

test('normalizes punctuation, whitespace, directionals, suffixes, fractions, and unit prefixes', () => {
  assert.equal(normalizeStreetAddress(' 12 1/2 Northwest Main Avenue. '), '12 1/2 NW MAIN AVE');
  assert.equal(normalizeStreetAddress('12 North East Main Street'), '12 NE MAIN ST');
  assert.equal(normalizeStreetAddress('12-B O\'Connor Road'), '12-B OCONNOR RD');
  assert.equal(normalizeUnit(' Apt. #12-A '), '12-A');
  assert.equal(normalizeUnit('suite 400'), '400');
  assert.equal(normalizeUnit('  '), null);
});

test('normalizes only allowlisted municipal designators at city boundaries', () => {
  assert.equal(normalizeCity('Plainsboro Township'), 'PLAINSBORO');
  assert.equal(normalizeCity('Township of Plainsboro'), 'PLAINSBORO');
  assert.equal(normalizeCity('Plainsboro Twp.'), 'PLAINSBORO');
  assert.equal(normalizeCity('Township Village'), 'TOWNSHIP');
});

test('matches postal and civil municipality names for the same exact property', () => {
  const plainsboroProperty = {
    address: '94 Ashford Drive',
    unit: null,
    city: 'Plainsboro Township',
    state: 'NJ',
    zipCode: '08536',
  };
  const outcome = selectExactRentCastMatch(plainsboroProperty, [record({
    id: '94-ashford',
    formattedAddress: '94 Ashford Dr, Plainsboro, NJ 08536',
    addressLine1: '94 Ashford Dr',
    addressLine2: null,
    city: 'Plainsboro',
    state: 'NJ',
    zipCode: '08536',
  })]);
  assert.equal(outcome.kind, 'MATCHED');
  assert.equal(outcome.record.id, '94-ashford');
});

test('matches exactly one record after allowed normalization', () => {
  const outcome = selectExactRentCastMatch(property, [record()]);
  assert.equal(outcome.kind, 'MATCHED');
  assert.equal(outcome.record.id, 'record-1');
});

test('rejects every street, city, state, ZIP, and unit conflict independently', () => {
  const conflicts = [
    { addressLine1: '5502 N Grand Lake St' },
    { city: 'Kansas City' },
    { state: 'IL' },
    { zipCode: '63102' },
    { addressLine2: 'Apt 12-B' },
    { addressLine2: null },
  ];
  for (const conflict of conflicts) {
    assert.deepEqual(
      selectExactRentCastMatch(property, [record(conflict)]),
      { kind: 'NO_MATCH' },
    );
  }
});

test('unitless properties never accept unit-specific records', () => {
  const unitless = { ...property, unit: null };
  assert.deepEqual(selectExactRentCastMatch(unitless, [record()]), { kind: 'NO_MATCH' });
  const outcome = selectExactRentCastMatch(unitless, [record({ addressLine2: null })]);
  assert.equal(outcome.kind, 'MATCHED');
});

test('returns ambiguity instead of selecting the first qualifying record', () => {
  const outcome = selectExactRentCastMatch(property, [
    record({ id: 'record-1' }),
    record({ id: 'record-2' }),
    record({ id: 'wrong-unit', addressLine2: 'Apt 14' }),
  ]);
  assert.deepEqual(outcome, { kind: 'AMBIGUOUS', candidateCount: 2 });
});

test('rejects malformed five-digit identity components', () => {
  assert.deepEqual(
    selectExactRentCastMatch({ ...property, zipCode: '63101-1234' }, [record()]),
    { kind: 'NO_MATCH' },
  );
  assert.deepEqual(
    selectExactRentCastMatch(property, [record({ zipCode: '6310' })]),
    { kind: 'NO_MATCH' },
  );
});
