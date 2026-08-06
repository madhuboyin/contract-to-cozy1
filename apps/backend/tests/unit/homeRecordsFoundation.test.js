const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

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
let savedSearchesForList = [];
let savedSearchForDelete = null;
const savedSearchCreateCalls = [];
const savedSearchDeleteCalls = [];
let versionForDownload = null;
let recordForDownloadHistory = null;
let downloadAuditEvents = [];
let usersForDownloadHistory = [];
const auditLogCreateCalls = [];
let scanIssueCountResult = 0;
let integrityMismatchCountResult = 0;
let purgeFailureCountResult = 0;
let stalePurgeCountResult = 0;

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      propertyRecordVersion: {
        // Backward-compatible with every existing test, which sets
        // duplicateVersion without a `sha256` field and expects it
        // returned unconditionally. Only the batch tests below opt into
        // checksum-discrimination by including `sha256` on the fixture, so
        // a batch with one colliding file and one clean file can be
        // exercised without a shared mutable flag masking the difference.
        findFirst: async (args) => {
          if (args?.select?.originalFileName !== undefined) return versionForDownload;
          if (duplicateVersion?.sha256 && args?.where?.sha256 !== duplicateVersion.sha256) return null;
          return duplicateVersion;
        },
        create: async (args) => { versionCreateCalls.push(args); return {}; },
        update: async (args) => { versionUpdateCalls.push(args); return {}; },
        findUniqueOrThrow: async () => ({}),
        count: async (args) => {
          if (args?.where?.scanStatus) return scanIssueCountResult;
          if (args?.where?.integrityStatus) return integrityMismatchCountResult;
          return 0;
        },
      },
      propertyRecord: {
        findFirst: async (args) => {
          // get()'s include also carries `versions`, so the links-only check
          // must come first or it collides with the addVersion() branch.
          if (args?.include?.links) return recordForGet;
          if (args?.include?.versions) return recordForVersion;
          if (args?.include?._count) return recordForTrash;
          if (args?.select?.title !== undefined) return possibleVersionMatch; // possibleVersionOf / checkPossibleVersion lookup
          if (args?.select?.versions !== undefined) return recordForDownloadHistory;
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
        count: async (args) => {
          if (args?.where?.requestedAt) return stalePurgeCountResult;
          if (args?.where?.state === 'FAILED') return purgeFailureCountResult;
          return 0;
        },
      },
      propertyRecordSavedSearch: {
        findMany: async () => savedSearchesForList,
        create: async (args) => { savedSearchCreateCalls.push(args); return { id: 'saved-search-1', ...args.data }; },
        findFirst: async () => savedSearchForDelete,
        delete: async (args) => { savedSearchDeleteCalls.push(args); return {}; },
      },
      auditLog: {
        create: async (args) => { auditLogCreateCalls.push(args); return { id: 'audit-1', ...args.data }; },
        findMany: async () => downloadAuditEvents,
      },
      user: {
        findMany: async () => usersForDownloadHistory,
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
  assert.match(routes, /import \{ validateDocumentUpload, validateDocumentArrayUpload \} from '\.\.\/utils\/documentValidator\.util'/);
  // Both the create-record and add-version upload endpoints must run the
  // shared magic-byte validator directly after multer parses the file —
  // multer's fileFilter only ever sees the attacker-controlled declared
  // Content-Type, never the actual bytes.
  assert.ok((routes.match(/upload\.single\('file'\),\n\s*validateDocumentUpload,/g) ?? []).length === 2);
  // The batch mobile-scan endpoint (upload.array) must run the same
  // real content validation, not skip it just because it's a bulk path.
  assert.match(routes, /upload\.array\('files', 10\),\n\s*validateDocumentArrayUpload,/);
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

test('createBatch creates one record per file, suffixing titles with "(N of M)" when there is more than one', async () => {
  duplicateVersion = null;
  possibleVersionMatch = null;
  recordCreateCalls.length = 0;

  const fileA = { buffer: Buffer.from('batch-file-a'), originalname: 'a.jpg', mimetype: 'image/jpeg', size: 4 };
  const fileB = { buffer: Buffer.from('batch-file-b'), originalname: 'b.jpg', mimetype: 'image/jpeg', size: 4 };

  const result = await service.createBatch({
    propertyId: 'property-1',
    userId: 'user-1',
    files: [fileA, fileB],
    title: 'Warranty card',
    recordType: 'WARRANTY',
    sensitivity: 'STANDARD',
    visibility: 'HOUSEHOLD',
  });

  assert.equal(result.created.length, 2);
  assert.equal(result.failed.length, 0);
  assert.equal(recordCreateCalls.length, 2);
  assert.equal(recordCreateCalls[0].data.title, 'Warranty card (1 of 2)');
  assert.equal(recordCreateCalls[1].data.title, 'Warranty card (2 of 2)');
  assert.equal(result.created[0].fileName, 'a.jpg');
  assert.equal(result.created[1].fileName, 'b.jpg');
});

test('createBatch does not suffix the title when the batch has exactly one file', async () => {
  duplicateVersion = null;
  possibleVersionMatch = null;
  recordCreateCalls.length = 0;

  const fileA = { buffer: Buffer.from('batch-file-single'), originalname: 'single.jpg', mimetype: 'image/jpeg', size: 4 };

  await service.createBatch({
    propertyId: 'property-1',
    userId: 'user-1',
    files: [fileA],
    title: 'Receipt',
    recordType: 'RECEIPT',
    sensitivity: 'STANDARD',
    visibility: 'HOUSEHOLD',
  });

  assert.equal(recordCreateCalls[0].data.title, 'Receipt');
});

test('createBatch reports one bad file per-item and still creates the rest of the batch', async () => {
  possibleVersionMatch = null;
  recordCreateCalls.length = 0;

  const clean = { buffer: Buffer.from('batch-clean-file'), originalname: 'clean.jpg', mimetype: 'image/jpeg', size: 4 };
  const dup = { buffer: Buffer.from('batch-dup-file'), originalname: 'dup.jpg', mimetype: 'image/jpeg', size: 4 };
  const dupChecksum = createHash('sha256').update(dup.buffer).digest('hex');
  duplicateVersion = { id: 'version-existing', recordId: 'record-existing', versionNumber: 1, sha256: dupChecksum };

  const result = await service.createBatch({
    propertyId: 'property-1',
    userId: 'user-1',
    files: [clean, dup],
    title: 'Scan',
    recordType: 'OTHER',
    sensitivity: 'STANDARD',
    visibility: 'HOUSEHOLD',
  });

  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].fileName, 'clean.jpg');
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].fileName, 'dup.jpg');
  assert.equal(result.failed[0].code, 'PROPERTY_RECORD_DUPLICATE_CONTENT');

  duplicateVersion = null;
});

test('createSavedSearch stores the filter-bar state as-is, without inventing defaults for absent filters', async () => {
  savedSearchCreateCalls.length = 0;

  const saved = await service.createSavedSearch({
    propertyId: 'property-1',
    userId: 'user-1',
    name: 'Expiring warranties',
    search: undefined,
    recordType: 'WARRANTY',
    view: 'EXPIRING',
  });

  assert.equal(savedSearchCreateCalls.length, 1);
  const data = savedSearchCreateCalls[0].data;
  assert.equal(data.propertyId, 'property-1');
  assert.equal(data.createdByUserId, 'user-1');
  assert.equal(data.name, 'Expiring warranties');
  assert.equal(data.search, null);
  assert.equal(data.recordType, 'WARRANTY');
  assert.equal(data.view, 'EXPIRING');
  assert.equal(saved.id, 'saved-search-1');
});

test('listSavedSearches returns the property-shared list as-is', async () => {
  savedSearchesForList = [
    { id: 's1', name: 'Needs review', view: 'NEEDS_REVIEW', recordType: null, search: null },
  ];

  const result = await service.listSavedSearches('property-1');

  assert.deepEqual(result, savedSearchesForList);
});

test('deleteSavedSearch refuses to delete a saved search that does not belong to this property', async () => {
  savedSearchForDelete = null;

  await assert.rejects(
    service.deleteSavedSearch('property-1', 'saved-search-9'),
    (error) => error.code === 'PROPERTY_RECORD_SAVED_SEARCH_NOT_FOUND',
  );
});

test('deleteSavedSearch deletes a saved search that does belong to this property', async () => {
  savedSearchForDelete = { id: 'saved-search-1' };
  savedSearchDeleteCalls.length = 0;

  await service.deleteSavedSearch('property-1', 'saved-search-1');

  assert.equal(savedSearchDeleteCalls.length, 1);
  assert.equal(savedSearchDeleteCalls[0].where.id, 'saved-search-1');
});

test('registerDownload writes a real, queryable AuditLog row for a click that requested a presigned URL', async () => {
  versionForDownload = { id: 'version-1', originalFileName: 'ge-fridge-warranty.pdf' };
  auditLogCreateCalls.length = 0;

  await service.registerDownload({
    propertyId: 'property-1',
    recordId: 'record-1',
    versionId: 'version-1',
    userId: 'user-1',
    role: 'OWNER',
  });

  assert.equal(auditLogCreateCalls.length, 1);
  const data = auditLogCreateCalls[0].data;
  assert.equal(data.userId, 'user-1');
  assert.equal(data.action, 'property_record_version_downloaded');
  assert.equal(data.entityType, 'PropertyRecordVersion');
  assert.equal(data.entityId, 'version-1');
  assert.equal(data.metadata.propertyId, 'property-1');
  assert.equal(data.metadata.recordId, 'record-1');
  assert.equal(data.metadata.fileName, 'ge-fridge-warranty.pdf');
});

test('registerDownload refuses to log a download for a version that does not resolve for this property/role', async () => {
  versionForDownload = null;

  await assert.rejects(
    service.registerDownload({
      propertyId: 'property-1',
      recordId: 'record-1',
      versionId: 'version-9',
      userId: 'user-1',
      role: 'VIEWER',
    }),
    (error) => error.code === 'PROPERTY_RECORD_VERSION_NOT_FOUND',
  );
});

test('listDownloadHistory 404s for a record that does not resolve for this property/role', async () => {
  recordForDownloadHistory = null;

  await assert.rejects(
    service.listDownloadHistory('property-1', 'record-9', 'OWNER'),
    (error) => error.code === 'PROPERTY_RECORD_NOT_FOUND',
  );
});

test('listDownloadHistory returns [] without querying AuditLog when the record has no versions yet', async () => {
  recordForDownloadHistory = { versions: [] };
  downloadAuditEvents = [{ id: 'should-not-appear' }];

  const result = await service.listDownloadHistory('property-1', 'record-1', 'OWNER');

  assert.deepEqual(result, []);
});

test('listDownloadHistory joins each event to its actor by name/email, newest first', async () => {
  recordForDownloadHistory = { versions: [{ id: 'version-1' }, { id: 'version-2' }] };
  const occurredAt = new Date('2026-08-05T12:00:00.000Z');
  downloadAuditEvents = [
    { id: 'audit-1', userId: 'user-1', createdAt: occurredAt, metadata: { fileName: 'file-a.pdf' } },
    { id: 'audit-2', userId: null, createdAt: occurredAt, metadata: { fileName: 'file-b.pdf' } },
  ];
  usersForDownloadHistory = [{ id: 'user-1', firstName: 'Sarah', lastName: 'Homeowner', email: 'sarah@example.com' }];

  const result = await service.listDownloadHistory('property-1', 'record-1', 'OWNER');

  assert.equal(result.length, 2);
  assert.equal(result[0].userName, 'Sarah Homeowner');
  assert.equal(result[0].userEmail, 'sarah@example.com');
  assert.equal(result[0].fileName, 'file-a.pdf');
  assert.equal(result[1].userName, null);
  assert.equal(result[1].userEmail, null);
});

test('getStorageHealth reports the real trash-recovery window, not a fabricated durability percentage', async () => {
  scanIssueCountResult = 0;
  integrityMismatchCountResult = 0;
  purgeFailureCountResult = 0;
  stalePurgeCountResult = 0;

  const result = await service.getStorageHealth('property-1');

  assert.equal(result.recoveryWindowDays, 30);
  assert.equal(result.healthy, true);
  assert.equal(result.scanIssueCount, 0);
  assert.equal(result.integrityMismatchCount, 0);
  assert.equal(result.purgeFailureCount, 0);
  assert.equal(result.stalePurgeCount, 0);
});

test('getStorageHealth flags unhealthy when any real problem count is nonzero', async () => {
  scanIssueCountResult = 2;
  integrityMismatchCountResult = 0;
  purgeFailureCountResult = 0;
  stalePurgeCountResult = 1;

  const result = await service.getStorageHealth('property-1');

  assert.equal(result.healthy, false);
  assert.equal(result.scanIssueCount, 2);
  assert.equal(result.stalePurgeCount, 1);

  scanIssueCountResult = 0;
  stalePurgeCountResult = 0;
});
