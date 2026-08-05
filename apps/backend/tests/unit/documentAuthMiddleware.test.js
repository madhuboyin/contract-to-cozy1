const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Legacy Document Vault gap fix: mutation used to be gated on
// `uploadedBy === homeownerProfile.id` only, so a household co-owner with
// full CONTRIBUTOR/OWNER access could not delete or act on a file they did
// not personally upload once it was linked to a property. requireDocumentOwnership
// now falls back to property-based household access (CONTRIBUTOR+) for any
// property-linked document that the caller didn't upload themselves.

let documentRow = null;
let propertyAccess = null;

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      homeownerProfile: {
        findUnique: async () => ({ id: 'profile-viewer' }),
      },
      document: {
        findFirst: async (args) => {
          if (documentRow && documentRow.id === args.where.id && args.where.deletedAt === null) {
            return documentRow;
          }
          return null;
        },
      },
    },
  },
};

const propertyAccessPath = require.resolve('../../src/services/propertyAccess.service.ts');
require.cache[propertyAccessPath] = {
  id: propertyAccessPath,
  filename: propertyAccessPath,
  loaded: true,
  exports: {
    ROLE_RANK: { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 },
    resolvePropertyAccess: async () => propertyAccess,
  },
};

const { requireDocumentOwnership } = require('../../src/middleware/documentAuth.middleware.ts');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test('a household CONTRIBUTOR who did not upload the file can still act on it once it is property-linked', async () => {
  documentRow = { id: 'doc-1', uploadedBy: 'profile-uploader', propertyId: 'property-1', deletedAt: null };
  propertyAccess = { propertyId: 'property-1', role: 'CONTRIBUTOR' };

  const req = { user: { userId: 'viewer-user' }, params: { id: 'doc-1' } };
  const res = createRes();
  let nextCalled = false;

  await requireDocumentOwnership(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.ownedDocument.id, 'doc-1');
});

test('a household VIEWER (below the CONTRIBUTOR floor) cannot act on a file they did not upload', async () => {
  documentRow = { id: 'doc-1', uploadedBy: 'profile-uploader', propertyId: 'property-1', deletedAt: null };
  propertyAccess = { propertyId: 'property-1', role: 'VIEWER' };

  const req = { user: { userId: 'viewer-user' }, params: { id: 'doc-1' } };
  const res = createRes();
  let nextCalled = false;

  await requireDocumentOwnership(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 404);
});

test('a document with no propertyId still falls back to uploader-only ownership', async () => {
  documentRow = { id: 'doc-2', uploadedBy: 'profile-uploader', propertyId: null, deletedAt: null };
  propertyAccess = { propertyId: 'irrelevant', role: 'OWNER' };

  const req = { user: { userId: 'viewer-user' }, params: { id: 'doc-2' } };
  const res = createRes();
  let nextCalled = false;

  await requireDocumentOwnership(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 404);
});

test('the original uploader always passes regardless of property access', async () => {
  documentRow = { id: 'doc-3', uploadedBy: 'profile-viewer', propertyId: 'property-1', deletedAt: null };
  propertyAccess = null;

  const req = { user: { userId: 'viewer-user' }, params: { id: 'doc-3' } };
  const res = createRes();
  let nextCalled = false;

  await requireDocumentOwnership(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});

test('a trashed document (deletedAt set) is not found', async () => {
  documentRow = null; // findFirst mock only returns a row when deletedAt: null matches and id matches
  propertyAccess = null;

  const req = { user: { userId: 'viewer-user' }, params: { id: 'doc-trashed' } };
  const res = createRes();
  let nextCalled = false;

  await requireDocumentOwnership(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 404);
});
