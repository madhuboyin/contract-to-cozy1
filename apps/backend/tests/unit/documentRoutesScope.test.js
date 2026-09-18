const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

let inventoryWhere = null;
let documentWhere = null;
let propertyAccess = { propertyId: 'owned-property-id', role: 'OWNER' };
let autoCreateWarrantyCalls = 0;
let updateCalls = [];
let deleteCalls = 0;
let propertyDocumentRecord = null;
let propertyDocumentInventoryPropertyId = null;

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      homeownerProfile: {
        findUnique: async () => ({ id: 'profile-1' }),
      },
      document: {
        findMany: async (args) => {
          documentWhere = args.where;
          return [];
        },
        findFirst: async (args) => {
          documentWhere = args.where;
          const requestedPropertyId = args.where.propertyId
            ?? args.where.OR?.find((clause) => clause.propertyId)?.propertyId
            ?? args.where.OR?.find((clause) => clause.inventoryItem?.propertyId)?.inventoryItem?.propertyId;
          return propertyDocumentRecord
            && propertyDocumentRecord.id === args.where.id
            && (propertyDocumentRecord.propertyId === requestedPropertyId || propertyDocumentInventoryPropertyId === requestedPropertyId)
            ? propertyDocumentRecord
            : null;
        },
        create: async (args) => ({
          id: 'doc-created',
          ...args.data,
          createdAt: new Date('2026-08-02T00:00:00.000Z'),
        }),
        update: async (args) => {
          updateCalls.push(args);
          return { id: args.where.id, ...args.data };
        },
        delete: async () => {
          deleteCalls += 1;
          throw new Error('prisma.document.delete should never be called by these routes anymore');
        },
      },
      inventoryItem: {
        findMany: async (args) => {
          inventoryWhere = args.where;
          return [];
        },
      },
    },
  },
};

const loggerPath = require.resolve('../../src/lib/logger.ts');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: {
    auditLog: () => {},
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  },
};

const subscriptionPath = require.resolve('../../src/services/subscription.service.ts');
require.cache[subscriptionPath] = {
  id: subscriptionPath,
  filename: subscriptionPath,
  loaded: true,
  exports: {
    subscriptionService: {
      hasRemainingLimit: async () => true,
    },
  },
};

const intelligencePath = require.resolve('../../src/services/documentIntelligence.service.ts');
require.cache[intelligencePath] = {
  id: intelligencePath,
  filename: intelligencePath,
  loaded: true,
  exports: {
    documentIntelligenceService: {
      analyzeDocument: async () => ({}),
      autoCreateWarranty: async () => {
        autoCreateWarrantyCalls += 1;
        return { id: 'unsafe-auto-created-warranty' };
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

const homeEventsPath = require.resolve('../../src/services/homeEvents/homeEvents.autogen.ts');
require.cache[homeEventsPath] = {
  id: homeEventsPath,
  filename: homeEventsPath,
  loaded: true,
  exports: {
    HomeEventsAutoGen: {
      onDocumentUploaded: async () => {},
    },
  },
};

const storagePath = require.resolve('../../src/services/storage/reportStorage.ts');
require.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: {
    uploadDocumentBuffer: async () => ({ key: 'mock-key' }),
    deleteDocumentObject: async () => {},
  },
};

const presignPath = require.resolve('../../src/services/storage/presign.ts');
require.cache[presignPath] = {
  id: presignPath,
  filename: presignPath,
  loaded: true,
  exports: {
    presignGetObject: async () => null,
  },
};

const rateLimiterPath = require.resolve('../../src/middleware/rateLimiter.middleware.ts');
require.cache[rateLimiterPath] = {
  id: rateLimiterPath,
  filename: rateLimiterPath,
  loaded: true,
  exports: {
    uploadRateLimiter: (_req, _res, next) => next(),
  },
};

const authPath = require.resolve('../../src/middleware/auth.middleware.ts');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    authenticate: (_req, _res, next) => next(),
  },
};

const documentOwnershipPath = require.resolve('../../src/middleware/documentAuth.middleware.ts');
require.cache[documentOwnershipPath] = {
  id: documentOwnershipPath,
  filename: documentOwnershipPath,
  loaded: true,
  exports: {
    requireDocumentOwnership: (_req, _res, next) => next(),
  },
};

const documentValidatorPath = require.resolve('../../src/utils/documentValidator.util.ts');
require.cache[documentValidatorPath] = {
  id: documentValidatorPath,
  filename: documentValidatorPath,
  loaded: true,
  exports: {
    validateDocumentUpload: (_req, _res, next) => next(),
  },
};

const router = require('../../src/routes/document.routes.ts').default;

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

function getAssetSuggestionHandler() {
  const routeLayer = router.stack
    .filter((layer) => layer.route)
    .find(
      (layer) =>
        layer.route.path === '/:id/asset-suggestions' &&
        Boolean(layer.route.methods?.get),
    );

  assert.ok(routeLayer, 'Expected /:id/asset-suggestions route to exist');
  const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
  return handler;
}

function getRouteHandler(path, method) {
  const routeLayer = router.stack
    .filter((layer) => layer.route)
    .find((layer) => layer.route.path === path && Boolean(layer.route.methods?.[method]));

  assert.ok(routeLayer, `Expected ${method.toUpperCase()} ${path} route to exist`);
  return routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
}

test('asset suggestions ignore query property override and use owned document property', async () => {
  inventoryWhere = null;

  const handler = getAssetSuggestionHandler();
  const req = {
    params: { id: 'doc-1' },
    query: { propertyId: 'forged-property-id' },
    ownedDocument: {
      id: 'doc-1',
      propertyId: 'owned-property-id',
      metadata: { extractedData: { productName: 'water heater' } },
      name: 'warranty.pdf',
      type: 'OTHER',
      createdAt: new Date('2026-04-21T00:00:00.000Z'),
    },
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(inventoryWhere.propertyId, 'owned-property-id');
  assert.equal(res.payload.data.document.propertyId, 'owned-property-id');
});

test('property-scoped document listing authorizes access and filters by property', async () => {
  documentWhere = null;
  propertyAccess = { propertyId: 'household-property-id', role: 'VIEWER' };

  const handler = getRouteHandler('/', 'get');
  const req = {
    user: { userId: 'user-1' },
    query: { propertyId: 'household-property-id' },
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(documentWhere, { propertyId: 'household-property-id', deletedAt: null });
});

test('property-scoped document listing hides properties without access', async () => {
  documentWhere = null;
  propertyAccess = null;

  const handler = getRouteHandler('/', 'get');
  const req = {
    user: { userId: 'user-1' },
    query: { propertyId: 'other-property-id' },
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(documentWhere, null);
});

test('document analysis never auto-creates a warranty from extracted fields', async () => {
  propertyAccess = { propertyId: 'owned-property-id', role: 'OWNER' };
  autoCreateWarrantyCalls = 0;

  const handler = getRouteHandler('/analyze', 'post');
  const req = {
    user: { userId: 'user-1' },
    body: { propertyId: 'owned-property-id', autoCreateWarranty: 'true' },
    file: {
      buffer: Buffer.from('warranty document'),
      mimetype: 'application/pdf',
      originalname: 'warranty.pdf',
      size: 17,
    },
    ip: '127.0.0.1',
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(autoCreateWarrantyCalls, 0);
  assert.equal(res.payload.data.warranty, null);
  assert.equal(res.payload.data.reviewRequired, true);
});

test('deleting a document soft-deletes it (trash) instead of physically removing the row or object', async () => {
  updateCalls = [];
  deleteCalls = 0;

  const handler = getRouteHandler('/:id', 'delete');
  const req = {
    params: { id: 'doc-1' },
    user: { userId: 'user-1' },
    ownedDocument: { id: 'doc-1', fileUrl: 'documents/doc-1.pdf' },
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(deleteCalls, 0, 'prisma.document.delete must never be called by the trash route');
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].where.id, 'doc-1');
  assert.ok(updateCalls[0].data.deletedAt instanceof Date);
  assert.equal(updateCalls[0].data.deletedByUserId, 'user-1');
});

test('restoring a document clears the trash fields', async () => {
  updateCalls = [];

  const handler = getRouteHandler('/:id/restore', 'post');
  const req = {
    params: { id: 'doc-1' },
    user: { userId: 'user-1' },
    ownedDocument: { id: 'doc-1' },
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].data, { deletedAt: null, deletedByUserId: null });
});

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 (Documents inline detail): the
// terminal handler only -- propertyAuthMiddleware itself (the earlier
// stack entry, skipped by getRouteHandler's "last handler" extraction,
// same as every other test in this file) is already covered by
// propertyAuthMiddlewareMetrics.test.js. This route deliberately uses
// propertyAuthMiddleware (VIEWER floor, matching DOCUMENT_LOOKUP's own
// floor), not requireDocumentOwnership (CONTRIBUTOR floor) -- see the
// route's own doc comment and the "household VIEWER... cannot act on a
// file they did not upload" test above, which is exactly the case this
// route exists to avoid for read-only Ask detail.
test('the property-scoped document detail route returns the canonical document when it belongs to the given property', async () => {
  documentWhere = null;
  propertyDocumentInventoryPropertyId = null;
  propertyDocumentRecord = {
    id: 'doc-1', propertyId: 'home', name: 'Homeowners policy declaration', type: 'INSURANCE_CERTIFICATE',
    description: null, fileSize: 1024, mimeType: 'application/pdf', fileUrl: 'documents/doc-1.pdf',
    verificationStatus: 'VERIFIED', verifiedAt: null, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  const handler = getRouteHandler('/property/:propertyId/:documentId', 'get');
  const req = { params: { propertyId: 'home', documentId: 'doc-1' } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.data.document.id, 'doc-1');
  assert.equal(res.payload.data.document.fileUrl, undefined, 'the raw S3 key must not be exposed, same as the list/analyze routes');
  assert.deepEqual(documentWhere, {
    id: 'doc-1', deletedAt: null,
    OR: [{ propertyId: 'home' }, { inventoryItem: { propertyId: 'home' } }],
  });
});

test('the property-scoped document detail route includes a document linked through this property inventory', async () => {
  documentWhere = null;
  propertyDocumentInventoryPropertyId = 'home';
  propertyDocumentRecord = {
    id: 'doc-inventory', propertyId: null, inventoryItemId: 'item-1', name: 'Furnace receipt', type: 'RECEIPT',
    description: null, fileSize: 2048, mimeType: 'application/pdf', fileUrl: 'documents/doc-inventory.pdf',
    verificationStatus: 'VERIFIED', verifiedAt: null, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  const handler = getRouteHandler('/property/:propertyId/:documentId', 'get');
  const req = { params: { propertyId: 'home', documentId: 'doc-inventory' } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.document.id, 'doc-inventory');
  assert.deepEqual(documentWhere.OR, [{ propertyId: 'home' }, { inventoryItem: { propertyId: 'home' } }]);
});

test('the property-scoped document detail route returns a DOCUMENT_NOT_FOUND-coded 404 when the document does not belong to this property', async () => {
  propertyDocumentInventoryPropertyId = null;
  propertyDocumentRecord = { id: 'doc-1', propertyId: 'a-different-property' };

  const handler = getRouteHandler('/property/:propertyId/:documentId', 'get');
  const req = { params: { propertyId: 'home', documentId: 'doc-1' } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.success, false);
  assert.equal(res.payload.error.code, 'DOCUMENT_NOT_FOUND', 'must be a distinguishable code, not the same bare message propertyAuthMiddleware uses for access denial, so the frontend can tell the two apart');
});
