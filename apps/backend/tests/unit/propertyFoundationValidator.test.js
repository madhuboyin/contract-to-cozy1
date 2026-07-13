const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { updatePropertySchema } = require('../../src/utils/validators.ts');

test('normalizes legacy foundation labels before property updates', () => {
  const cases = [
    ['Slab', 'SLAB'],
    ['Crawl space', 'CRAWL_SPACE'],
    ['Pier and beam', 'PIER_AND_BEAM'],
    ['Raised Foundation', 'RAISED'],
    ['Not sure', 'UNKNOWN'],
  ];

  for (const [input, expected] of cases) {
    const result = updatePropertySchema.parse({ foundationType: input });
    assert.equal(result.foundationType, expected);
  }
});

test('accepts canonical foundation enum values unchanged', () => {
  const result = updatePropertySchema.parse({ foundationType: 'BASEMENT' });
  assert.equal(result.foundationType, 'BASEMENT');
});

test('rejects unsupported foundation values before they reach Prisma', () => {
  const result = updatePropertySchema.safeParse({ foundationType: 'Treehouse' });
  assert.equal(result.success, false);
});
