const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

let duplicateVersion = null;
let recordForVersion = null;
let recordForTrash = null;
let storageUploadCalls = 0;
const transactionWrites = [];

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      propertyRecordVersion: {
        findFirst: async () => duplicateVersion,
        create: async () => ({}),
        update: async () => ({}),
        findUniqueOrThrow: async () => ({}),
      },
      propertyRecord: {
        findFirst: async (args) => {
          if (args?.include?.versions) return recordForVersion;
          if (args?.include?._count) return recordForTrash;
          return null;
        },
        create: async () => ({}),
        update: async () => ({}),
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () => ({}),
      },
      propertyRecordLink: {
        create: async () => ({}),
        deleteMany: async (args) => transactionWrites.push(['deleteManyLinks', args]),
      },
      propertyRecordPurgeJob: {
        create: async (args) => transactionWrites.push(['createPurgeJob', args]),
        updateMany: async (args) => transactionWrites.push(['updatePurgeJobs', args]),
      },
      $transaction: async (input) => {
        if (typeof input === 'function') {
          return input({
            propertyRecord: {
              update: async (args) => transactionWrites.push(['updateRecord', args]),
              updateMany: async (args) => {
                transactionWrites.push(['updateManyRecords', args]);
                return { count: 1 };
              },
            },
            propertyRecordLink: {
              deleteMany: async (args) => transactionWrites.push(['deleteManyLinks', args]),
            },
            propertyRecordPurgeJob: {
              create: async (args) => transactionWrites.push(['createPurgeJob', args]),
              updateMany: async (args) => transactionWrites.push(['updatePurgeJobs', args]),
            },
          });
        }
        return Promise.all(input);
      },
    },
  },
};

const storagePath = require.resolve('../../src/services/storage/reportStorage.ts');
require.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: {
    uploadPropertyRecordVersionBuffer: async () => {
      storageUploadCalls += 1;
      return { key: 'key', fileSizeBytes: 4, storageEtag: 'etag' };
    },
  },
};

const presignPath = require.resolve('../../src/services/storage/presign.ts');
require.cache[presignPath] = {
  id: presignPath,
  filename: presignPath,
  loaded: true,
  exports: { presignGetObject: async () => null },
};

const { HomeRecordsService } = require('../../src/services/homeRecords.service.ts');

const service = new HomeRecordsService();
const file = {
  buffer: Buffer.from('same'),
  originalname: 'record.pdf',
  mimetype: 'application/pdf',
  size: 4,
};

test('Slice 2 schema defines property-owned records, immutable versions, links, and purge jobs', () => {
  const schema = fs.readFileSync(
    path.resolve(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  assert.match(schema, /model PropertyRecord \{/);
  assert.match(schema, /model PropertyRecordVersion \{/);
  assert.match(schema, /@@unique\(\[recordId, versionNumber\]\)/);
  assert.match(schema, /sha256\s+String\s+@db\.VarChar\(64\)/);
  assert.match(schema, /model PropertyRecordLink \{/);
  assert.match(schema, /model PropertyRecordPurgeJob \{/);
});

test('exact duplicate content is rejected before storage upload', async () => {
  duplicateVersion = { id: 'version-1', recordId: 'record-1', versionNumber: 1 };
  storageUploadCalls = 0;

  await assert.rejects(
    service.create({
      propertyId: 'property-1',
      userId: 'user-1',
      file,
      title: 'Warranty',
      recordType: 'WARRANTY',
      sensitivity: 'STANDARD',
      visibility: 'HOUSEHOLD',
    }),
    (error) => {
      assert.equal(error.code, 'PROPERTY_RECORD_DUPLICATE_CONTENT');
      assert.equal(error.statusCode, 409);
      return true;
    },
  );
  assert.equal(storageUploadCalls, 0);
});

test('a replacement with the current hash is rejected instead of overwriting history', async () => {
  duplicateVersion = null;
  recordForVersion = {
    id: 'record-1',
    lifecycleStatus: 'ACTIVE',
    currentVersionId: 'version-1',
    versions: [{ id: 'version-1', versionNumber: 1, sha256: '0967115f2813a3541eaef77de9d9d5773f1c0c04314b0bbfe4ff3b3b1c55b5d5' }],
  };
  storageUploadCalls = 0;

  await assert.rejects(
    service.addVersion({ propertyId: 'property-1', recordId: 'record-1', userId: 'user-1', file }),
    (error) => error.code === 'PROPERTY_RECORD_VERSION_DUPLICATE',
  );
  assert.equal(storageUploadCalls, 0);
});

test('active evidence requires an explicit impact decision before trash', async () => {
  recordForTrash = {
    id: 'record-1',
    retainUntil: null,
    legalHoldReason: null,
    _count: { links: 2 },
  };

  await assert.rejects(
    service.trash({ propertyId: 'property-1', recordId: 'record-1', userId: 'user-1' }),
    (error) => {
      assert.equal(error.code, 'PROPERTY_RECORD_EVIDENCE_IMPACT_DECISION_REQUIRED');
      assert.equal(error.details.activeLinkCount, 2);
      return true;
    },
  );
});

test('trash is reversible and queues a delayed purge instead of deleting storage', async () => {
  recordForTrash = {
    id: 'record-1',
    retainUntil: null,
    legalHoldReason: null,
    _count: { links: 1 },
  };
  transactionWrites.length = 0;
  storageUploadCalls = 0;

  await service.trash({
    propertyId: 'property-1',
    recordId: 'record-1',
    userId: 'user-1',
    impactDecision: 'KEEP_LINKS',
  });

  const recordWrite = transactionWrites.find(([kind]) => kind === 'updateRecord');
  const purgeWrite = transactionWrites.find(([kind]) => kind === 'createPurgeJob');
  assert.equal(recordWrite[1].data.lifecycleStatus, 'TRASHED');
  assert.equal(purgeWrite[1].data.state, 'PENDING');
  assert.ok(purgeWrite[1].data.eligibleAt instanceof Date);
  assert.equal(storageUploadCalls, 0);
});

test('record routes enforce property access and contributor mutation floors', () => {
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/homeRecords.routes.ts'),
    'utf8',
  );
  assert.match(routes, /router\.use\('\/properties\/:propertyId\/records', propertyAuthMiddleware\)/);
  assert.ok((routes.match(/requireHouseholdRole\('CONTRIBUTOR'\)/g) ?? []).length >= 7);
  assert.match(routes, /records\/:recordId\/retention'[\s\S]*requireHouseholdRole\('OWNER'\)/);
  assert.doesNotMatch(routes, /deleteDocumentObject/);
});
