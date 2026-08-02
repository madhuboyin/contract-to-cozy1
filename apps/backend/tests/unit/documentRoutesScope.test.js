const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

let inventoryWhere = null;
let documentWhere = null;
let propertyAccess = { propertyId: 'owned-property-id', role: 'OWNER' };
let autoCreateWarrantyCalls = 0;

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
        create: async (args) => ({
          id: 'doc-created',
          ...args.data,
          createdAt: new Date('2026-08-02T00:00:00.000Z'),
        }),
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
  assert.deepEqual(documentWhere, { propertyId: 'household-property-id' });
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
