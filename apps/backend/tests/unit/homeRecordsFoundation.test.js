const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

let duplicateVersion = null;
let recordForVersion = null;
let recordForTrash = null;
let recordForLink = null;
let recordForGet = null;
let warrantyLookupResult = null;
let recordsForList = [];
let pendingReviewGroups = [];
let storageUploadCalls = 0;
const transactionWrites = [];
const recordCreateCalls = [];
const versionCreateCalls = [];
const linkCreateCalls = [];

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      propertyRecordVersion: {
        findFirst: async () => duplicateVersion,
        create: async (args) => { versionCreateCalls.push(args); return {}; },
        update: async () => ({}),
        findUniqueOrThrow: async () => ({}),
      },
      propertyRecord: {
        findFirst: async (args) => {
          // get()'s include also carries `versions`, so the links-only check
          // must come first or it collides with the addVersion() branch.
          if (args?.include?.links) return recordForGet;
          if (args?.include?.versions) return recordForVersion;
          if (args?.include?._count) return recordForTrash;
          if (args?.select?.title !== undefined) return null; // possibleVersionOf lookup
          if (args?.select?.currentVersionId !== undefined) return recordForLink;
          return null;
        },
        create: async (args) => { recordCreateCalls.push(args); return {}; },
        update: async () => ({}),
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () => ({}),
        findMany: async () => recordsForList,
      },
      warranty: {
        findFirst: async () => warrantyLookupResult,
      },
      extractedFactCandidate: {
        groupBy: async () => pendingReviewGroups,
      },
      propertyRecordLink: {
        create: async (args) => { linkCreateCalls.push(args); return { id: 'link-1', ...args.data }; },
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

test('record taxonomy includes common continuity records beyond the generic OTHER bucket', () => {
  const schema = fs.readFileSync(
    path.resolve(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  const enumBody = schema.match(/enum PropertyRecordType \{([\s\S]*?)\}/)[1];
  for (const type of ['DEED', 'TAX_DOCUMENT', 'UTILITY', 'DISCLOSURE', 'SURVEY', 'CLOSING_DOCUMENT']) {
    assert.match(enumBody, new RegExp(`\\b${type}\\b`));
  }
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

test('record and version upload routes run real magic-byte content validation', () => {
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/homeRecords.routes.ts'),
    'utf8',
  );
  assert.match(routes, /import \{ validateDocumentUpload \} from '\.\.\/utils\/documentValidator\.util'/);
  // Both the create-record and add-version upload endpoints must run the
  // shared magic-byte validator directly after multer parses the file —
  // multer's fileFilter only ever sees the attacker-controlled declared
  // Content-Type, never the actual bytes.
  assert.ok((routes.match(/upload\.single\('file'\),\n\s*validateDocumentUpload,/g) ?? []).length === 2);
});

test('a new record and a new version are marked scan-clean, not left pending forever', async () => {
  duplicateVersion = null;
  storageUploadCalls = 0;
  recordCreateCalls.length = 0;
  versionCreateCalls.length = 0;

  await service.create({
    propertyId: 'property-1',
    userId: 'user-1',
    file,
    title: 'Warranty',
    recordType: 'WARRANTY',
    sensitivity: 'STANDARD',
    visibility: 'HOUSEHOLD',
  });

  assert.equal(recordCreateCalls.length, 1);
  assert.equal(recordCreateCalls[0].data.versions.create.scanStatus, 'CLEAN');

  recordForVersion = {
    id: 'record-1',
    lifecycleStatus: 'ACTIVE',
    currentVersionId: 'version-1',
    versions: [{ id: 'version-1', versionNumber: 1, sha256: 'different-hash' }],
  };
  await service.addVersion({ propertyId: 'property-1', recordId: 'record-1', userId: 'user-1', file });

  assert.equal(versionCreateCalls.length, 1);
  assert.equal(versionCreateCalls[0].data.scanStatus, 'CLEAN');
});

test('a link to an OTHER entity is accepted since there is no canonical table to check', async () => {
  recordForLink = { id: 'record-1', currentVersionId: null };
  linkCreateCalls.length = 0;

  const link = await service.addLink({
    propertyId: 'property-1',
    recordId: 'record-1',
    userId: 'user-1',
    entityType: 'OTHER',
    entityId: 'external-system-id',
    purpose: 'ATTACHMENT',
  });

  assert.equal(linkCreateCalls.length, 1);
  assert.equal(link.entityType, 'OTHER');
});

test('get() flags a link whose target entity can no longer be found, and leaves OTHER links undetermined', async () => {
  recordForGet = {
    id: 'record-1',
    propertyId: 'property-1',
    lifecycleStatus: 'ACTIVE',
    legalHoldReason: null,
    retainUntil: null,
    currentVersion: null,
    versions: [],
    purgeJobs: [],
    links: [
      { id: 'link-warranty', entityType: 'WARRANTY', entityId: 'w-1', purpose: 'EVIDENCE' },
      { id: 'link-other', entityType: 'OTHER', entityId: 'ext-1', purpose: 'ATTACHMENT' },
    ],
  };
  warrantyLookupResult = null; // the linked warranty no longer exists

  const result = await service.get('property-1', 'record-1', 'OWNER');

  const warrantyLink = result.links.find((link) => link.id === 'link-warranty');
  const otherLink = result.links.find((link) => link.id === 'link-other');
  assert.equal(warrantyLink.broken, true);
  assert.equal(otherLink.broken, null);
  assert.equal(result.deletionImpact.brokenLinkCount, 1);

  warrantyLookupResult = { id: 'w-1' };
  const healthyResult = await service.get('property-1', 'record-1', 'OWNER');
  const healthyWarrantyLink = healthyResult.links.find((link) => link.id === 'link-warranty');
  assert.equal(healthyWarrantyLink.broken, false);
  assert.equal(healthyResult.deletionImpact.brokenLinkCount, 0);
});

test('list() flags needsReview from pending extracted-fact candidates and computes expiry status from effectiveTo', async () => {
  const now = Date.now();
  recordsForList = [
    {
      id: 'record-needs-review',
      lifecycleStatus: 'ACTIVE',
      currentVersionId: 'version-1',
      currentVersion: { scanStatus: 'CLEAN', integrityStatus: 'VERIFIED', storageKey: 'k', originalFileName: 'f' },
      effectiveTo: null,
    },
    {
      id: 'record-expired',
      lifecycleStatus: 'ACTIVE',
      currentVersionId: 'version-2',
      currentVersion: { scanStatus: 'CLEAN', integrityStatus: 'VERIFIED', storageKey: 'k', originalFileName: 'f' },
      effectiveTo: new Date(now - 5 * 86_400_000), // 5 days ago
    },
    {
      id: 'record-expiring-soon',
      lifecycleStatus: 'ACTIVE',
      currentVersionId: 'version-3',
      currentVersion: { scanStatus: 'CLEAN', integrityStatus: 'VERIFIED', storageKey: 'k', originalFileName: 'f' },
      effectiveTo: new Date(now + 10 * 86_400_000), // 10 days from now, within the 30-day window
    },
    {
      id: 'record-current',
      lifecycleStatus: 'ACTIVE',
      currentVersionId: 'version-4',
      currentVersion: { scanStatus: 'CLEAN', integrityStatus: 'VERIFIED', storageKey: 'k', originalFileName: 'f' },
      effectiveTo: new Date(now + 200 * 86_400_000), // far out
    },
  ];
  pendingReviewGroups = [
    { propertyRecordVersionId: 'version-1', _count: { _all: 2 } },
  ];

  const result = await service.list('property-1', 'OWNER', {});
  const byId = Object.fromEntries(result.map((r) => [r.id, r]));

  assert.equal(byId['record-needs-review'].needsReview, true);
  assert.equal(byId['record-expired'].needsReview, false);
  assert.equal(byId['record-expired'].expiryStatus, 'EXPIRED');
  assert.equal(byId['record-expiring-soon'].expiryStatus, 'EXPIRING_SOON');
  assert.equal(byId['record-current'].expiryStatus, 'CURRENT');
  assert.equal(byId['record-needs-review'].expiryStatus, null);
});
