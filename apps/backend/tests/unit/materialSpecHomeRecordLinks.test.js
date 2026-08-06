const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// getSpec() reconciles with Home Records' typed PropertyRecordLink graph
// (read-only) without touching the legacy Document-based evidence fields
// (submittalDocumentIds etc.) or any lifecycle-gate logic — see the
// comment in materialSpec.service.ts's getSpec().
let specForGet = null;
let linksForSpec = [];
const linkFindManyCalls = [];

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      materialSpec: {
        findFirst: async () => specForGet,
      },
      propertyRecordLink: {
        findMany: async (args) => { linkFindManyCalls.push(args); return linksForSpec; },
      },
    },
  },
};

const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');
const service = new MaterialSpecService();

test('getSpec 404s when the spec does not resolve for this property, without querying links', async () => {
  specForGet = null;
  linkFindManyCalls.length = 0;

  await assert.rejects(
    service.getSpec('property-1', 'spec-9'),
    (error) => error.code === 'SPEC_NOT_FOUND',
  );
  assert.equal(linkFindManyCalls.length, 0);
});

test('getSpec returns [] for homeRecordLinks when nothing links to this spec yet', async () => {
  specForGet = { id: 'spec-1', propertyId: 'property-1', label: 'Kitchen tile' };
  linksForSpec = [];

  const result = await service.getSpec('property-1', 'spec-1');

  assert.deepEqual(result.homeRecordLinks, []);
});

test('getSpec surfaces incoming PropertyRecordLinks scoped to MATERIAL_SPEC and this property, newest first', async () => {
  specForGet = { id: 'spec-1', propertyId: 'property-1', label: 'Kitchen tile' };
  linksForSpec = [
    {
      id: 'link-1',
      purpose: 'EVIDENCE',
      record: { id: 'record-1', title: 'Tile receipt', recordType: 'RECEIPT', lifecycleStatus: 'ACTIVE' },
    },
  ];
  linkFindManyCalls.length = 0;

  const result = await service.getSpec('property-1', 'spec-1');

  assert.equal(linkFindManyCalls.length, 1);
  assert.equal(linkFindManyCalls[0].where.entityType, 'MATERIAL_SPEC');
  assert.equal(linkFindManyCalls[0].where.entityId, 'spec-1');
  assert.equal(linkFindManyCalls[0].where.record.propertyId, 'property-1');

  assert.equal(result.homeRecordLinks.length, 1);
  assert.equal(result.homeRecordLinks[0].linkId, 'link-1');
  assert.equal(result.homeRecordLinks[0].recordId, 'record-1');
  assert.equal(result.homeRecordLinks[0].title, 'Tile receipt');
  assert.equal(result.homeRecordLinks[0].recordType, 'RECEIPT');
  assert.equal(result.homeRecordLinks[0].purpose, 'EVIDENCE');

  // Untouched by this change — same legacy Document-id fields as before.
  assert.equal(result.id, 'spec-1');
  assert.equal(result.label, 'Kitchen tile');
});
