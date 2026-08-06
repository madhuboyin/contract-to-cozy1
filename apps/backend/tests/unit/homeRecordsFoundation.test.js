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
let possibleVersionMatch = null;
let warrantyLookupResult = null;
let recordsForList = [];
let pendingReviewGroups = [];
let storageUploadCalls = 0;
const transactionWrites = [];
const recordCreateCalls = [];
const versionCreateCalls = [];
const versionUpdateCalls = [];
const linkCreateCalls = [];
let extractFullTextResult = null;
let extractFullTextError = null;
const extractFullTextCalls = [];

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
        update: async (args) => { versionUpdateCalls.push(args); return {}; },
        findUniqueOrThrow: async () => ({}),
      },
      propertyRecord: {
        findFirst: async (args) => {
          // get()'s include also carries `versions`, so the links-only check
          // must come first or it collides with the addVersion() branch.
          if (args?.include?.links) return recordForGet;
          if (args?.include?.versions) return recordForVersion;
          if (args?.include?._count) return recordForTrash;
          if (args?.select?.title !== undefined) return possibleVersionMatch; // possibleVersionOf / checkPossibleVersion lookup
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

// extractVersionText's require('./documentIntelligence.service') is lazy
// (inside the async fire-and-forget body, not a top-level import — see the
// comment on that method), but require.cache substitution still intercepts
// it: both resolve to the same absolute path.
const intelligencePath = require.resolve('../../src/services/documentIntelligence.service.ts');
require.cache[intelligencePath] = {
  id: intelligencePath,
  filename: intelligencePath,
  loaded: true,
  exports: {
    documentIntelligenceService: {
      extractFullText: async (buffer, mimeType) => {
        extractFullTextCalls.push({ buffer, mimeType });
        if (extractFullTextError) throw extractFullTextError;
        return extractFullTextResult;
      },
    },
  },
};

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

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

// Slice 3's real duplicate/version resolution flow: checkPossibleVersion is
// a pre-flight the frontend calls *before* uploading, reusing the exact
// same match query create() already runs internally (findPossibleVersionMatch).

test('checkPossibleVersion returns the matching record when one exists for this title/type', async () => {
  possibleVersionMatch = { id: 'record-existing', title: 'HVAC Warranty', currentVersionId: 'version-9' };
  const match = await service.checkPossibleVersion('property-1', 'HVAC Warranty', 'WARRANTY');
  assert.deepEqual(match, { id: 'record-existing', title: 'HVAC Warranty', currentVersionId: 'version-9' });
  possibleVersionMatch = null;
});

test('checkPossibleVersion returns null when no match exists', async () => {
  possibleVersionMatch = null;
  const match = await service.checkPossibleVersion('property-1', 'Brand New Thing', 'OTHER');
  assert.equal(match, null);
});

test("create() and checkPossibleVersion() share one match implementation, not two drifting copies of the same query", () => {
  const backendRoot = path.resolve(__dirname, '../..');
  const source = fs.readFileSync(path.join(backendRoot, 'src/services/homeRecords.service.ts'), 'utf8');
  assert.match(source, /async checkPossibleVersion\(propertyId: string, title: string, recordType: PropertyRecordType\) \{\s*return this\.findPossibleVersionMatch/);
  assert.match(source, /possibleVersionOf = await this\.findPossibleVersionMatch\(input\.propertyId, input\.title, input\.recordType\)/);
});

test('the possible-version route is registered before the :recordId catch-all, so Express does not swallow it as a record id', () => {
  const backendRoot = path.resolve(__dirname, '../..');
  const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeRecords.routes.ts'), 'utf8');
  const possibleVersionIndex = routes.indexOf("'/properties/:propertyId/records/possible-version'");
  const recordIdIndex = routes.indexOf("'/properties/:propertyId/records/:recordId'");
  assert.ok(possibleVersionIndex > 0 && recordIdIndex > 0);
  assert.ok(possibleVersionIndex < recordIdIndex);
});

test('a real resolution dialog exists in the frontend — choose new-version vs separate record before uploading, not an after-the-fact toast', () => {
  const backendRoot = path.resolve(__dirname, '../..');
  const repositoryRoot = path.resolve(backendRoot, '../..');
  const client = fs.readFileSync(
    path.join(repositoryRoot, 'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-records/HomeRecordsClient.tsx'),
    'utf8',
  );
  assert.match(client, /checkPossibleVersion/);
  assert.match(client, /pendingVersionResolution/);
  assert.match(client, /Add as new version/);
  assert.match(client, /Create separate record/);

  const api = fs.readFileSync(
    path.join(repositoryRoot, 'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi.ts'),
    'utf8',
  );
  assert.match(api, /export async function checkPossibleVersion/);
});

// Slice 4 (§8): "add OCR/full-text and structured search" — full-text
// extraction is fire-and-forget from create()/addVersion() (never blocks
// or fails the upload) and only updates the version when it actually
// produced text.

test('create() triggers full-text extraction and stores the result once it resolves, without blocking the response', async () => {
  duplicateVersion = null;
  storageUploadCalls = 0;
  versionUpdateCalls.length = 0;
  extractFullTextCalls.length = 0;
  extractFullTextError = null;
  extractFullTextResult = { text: 'Extracted warranty terms and coverage dates.' };

  await service.create({
    propertyId: 'property-1',
    userId: 'user-1',
    file,
    title: 'Warranty',
    recordType: 'WARRANTY',
    sensitivity: 'STANDARD',
    visibility: 'HOUSEHOLD',
  });
  // create() itself must already have returned by this point — the
  // extraction call below is confirmed via a post-hoc flush, not because
  // create() awaited it.
  await flushMicrotasks();

  assert.equal(extractFullTextCalls.length, 1);
  assert.equal(extractFullTextCalls[0].mimeType, file.mimetype);
  const extractionUpdate = versionUpdateCalls.find((call) => call.data?.extractedText);
  assert.ok(extractionUpdate, 'expected a propertyRecordVersion.update call carrying the extracted text');
  assert.equal(extractionUpdate.data.extractedText, 'Extracted warranty terms and coverage dates.');
  assert.ok(extractionUpdate.data.textExtractedAt instanceof Date);
});

test('a failed or empty extraction never throws out of create()/addVersion() and never writes a stale update', async () => {
  duplicateVersion = null;
  storageUploadCalls = 0;
  versionUpdateCalls.length = 0;
  extractFullTextCalls.length = 0;
  extractFullTextError = new Error('AI service unavailable');
  extractFullTextResult = null;

  // create() itself must resolve normally despite the extraction failure.
  await service.create({
    propertyId: 'property-1',
    userId: 'user-1',
    file,
    title: 'Warranty',
    recordType: 'WARRANTY',
    sensitivity: 'STANDARD',
    visibility: 'HOUSEHOLD',
  });
  await flushMicrotasks();

  assert.equal(extractFullTextCalls.length, 1);
  assert.equal(versionUpdateCalls.find((call) => call.data?.extractedText), undefined);

  // Also true for an extraction that succeeds but returns no text (e.g. a
  // scanned page with nothing readable) — no update either.
  extractFullTextError = null;
  extractFullTextResult = null;
  versionUpdateCalls.length = 0;
  recordForVersion = {
    id: 'record-1',
    lifecycleStatus: 'ACTIVE',
    currentVersionId: 'version-1',
    versions: [{ id: 'version-1', versionNumber: 1, sha256: 'different-hash' }],
  };
  await service.addVersion({ propertyId: 'property-1', recordId: 'record-1', userId: 'user-1', file });
  await flushMicrotasks();
  assert.equal(versionUpdateCalls.find((call) => call.data?.extractedText), undefined);
});

test("list()'s search matches extracted document content, not just title/description, without regressing when extraction hasn't run", async () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeRecords.service.ts'),
    'utf8',
  );
  const searchClause = source.slice(source.indexOf('search?.trim() ?'), source.indexOf('} : {}),', source.indexOf('search?.trim() ?')));
  assert.match(searchClause, /title:\s*\{\s*contains/);
  assert.match(searchClause, /description:\s*\{\s*contains/);
  assert.match(searchClause, /currentVersion:\s*\{\s*extractedText:\s*\{\s*contains/);
});
