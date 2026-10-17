const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// The write path enforces the same contract the estimator reads: only declared UPPER_SNAKE keys, in range; one invalid row saves nothing; null clears.

const prismaModule = require('../../src/lib/prisma.ts');
const { upsertOverrides } = require('../../src/controllers/toolOverride.controller.ts');

const realPrisma = prismaModule.prisma;
let writes;

test.beforeEach(() => {
  writes = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'toolOverride') return {
        upsert: async (args) => { writes.push(['upsert', args.where.propertyId_toolKey_key.key, args.create.value]); return {}; },
        deleteMany: async (args) => { writes.push(['delete', args.where.key]); return { count: 1 }; },
      };
      return new Proxy({}, { get: () => async () => { throw new Error(`Unexpected prisma.${String(model)} access`); } });
    },
  });
});
test.after(() => { prismaModule.prisma = realPrisma; });

const res = () => { const r = { statusCode: 200, body: null, status(code) { r.statusCode = code; return r; }, json(body) { r.body = body; return r; } }; return r; };
const put = async (body, query = {}) => { const r = res(); await upsertOverrides({ params: { propertyId: 'p1' }, body, query }, r); return r; };

test('valid overrides are saved, and a null clears one', async () => {
  const r = await put({ toolKey: 'SELL_HOLD_RENT', overrides: [{ key: 'HOME_VALUE_NOW', value: 450000 }, { key: 'VACANCY_RATE', value: 0.1 }, { key: 'MONTHLY_RENT_NOW', value: null }] });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(writes, [['upsert', 'HOME_VALUE_NOW', 450000], ['upsert', 'VACANCY_RATE', 0.1], ['delete', 'MONTHLY_RENT_NOW']]);
});

test('one invalid row rejects the whole write with structured reasons, and nothing is saved', async () => {
  const r = await put({ toolKey: 'SELL_HOLD_RENT', overrides: [{ key: 'HOME_VALUE_NOW', value: 450000 }, { key: 'homeValueNow', value: 450000 }, { key: 'VACANCY_RATE', value: 4 }] });
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.error.code, 'TOOL_OVERRIDE_INVALID');
  assert.deepEqual(r.body.error.details.issues.map((issue) => [issue.key, issue.reason]), [['homeValueNow', 'UNSUPPORTED_KEY'], ['VACANCY_RATE', 'OUT_OF_RANGE']]);
  assert.deepEqual(writes, []);
});

test('a tool with no override contract is refused', async () => {
  const r = await put({ toolKey: 'BREAK_EVEN', overrides: [{ key: 'HOME_VALUE_NOW', value: 450000 }] });
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.error.code, 'TOOL_OVERRIDE_UNSUPPORTED_TOOL');
  assert.deepEqual(writes, []);
});

test('the tool key is read from the body, where the page sends it, and from the query for direct callers', async () => {
  assert.equal((await put({ toolKey: 'SELL_HOLD_RENT', overrides: [{ key: 'HOME_VALUE_NOW', value: 450000 }] })).statusCode, 200);
  assert.equal((await put({ overrides: [{ key: 'HOME_VALUE_NOW', value: 450000 }] }, { toolKey: 'BREAK_EVEN' })).statusCode, 400);
});
