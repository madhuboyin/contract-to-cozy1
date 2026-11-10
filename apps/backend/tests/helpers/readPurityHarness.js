// Composition FRD FR-ELG-6: runs the REAL capability handler and the REAL domain-service path for an operation, replacing only infrastructure boundaries with
// recording adapters. It fails on any database write, raw write, outbound network request, or workflow/confirmation/capture result, and it permits and
// records reads. An empty-home data set (every read returns nothing) is what the real code sees, so this certifies the code path the handler takes, not
// every data shape: an operation whose real path needs data to run is not admitted until it has a data-backed fixture.
require('ts-node/register');
const http = require('node:http');
const https = require('node:https');
const { Prisma } = require('@prisma/client');

const READ_METHODS = {
  findUnique: () => null, findUniqueOrThrow: () => { const e = new Error('not found'); e.code = 'P2025'; throw e; }, findFirst: () => null,
  findFirstOrThrow: () => { const e = new Error('not found'); e.code = 'P2025'; throw e; }, findMany: () => [], count: () => 0,
  aggregate: () => ({ _count: 0, _sum: {}, _avg: {}, _min: {}, _max: {} }), groupBy: () => [],
};
const WRITE_METHODS = ['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'];

function installRecorders(seed) {
  const { prisma } = require('../../src/lib/prisma.ts');
  const propertyAccess = require('../../src/services/propertyAccess.service.ts');
  const calls = { reads: [], violations: [] };
  const restore = [];
  const patch = (obj, key, value) => { const original = obj[key]; obj[key] = value; restore.push(() => { obj[key] = original; }); };

  for (const model of Object.values(Prisma.ModelName)) {
    const delegate = prisma[model.charAt(0).toLowerCase() + model.slice(1)];
    if (!delegate) continue;
    const name = model;
    for (const [method, empty] of Object.entries(READ_METHODS)) {
      if (typeof delegate[method] !== 'function') continue;
      patch(delegate, method, async (...args) => {
        calls.reads.push(`${name}.${method}`);
        const seeded = seed ? seed(name, method, args) : undefined;
        return seeded !== undefined ? seeded : empty(args);
      });
    }
    for (const method of WRITE_METHODS) {
      if (typeof delegate[method] !== 'function') continue;
      patch(delegate, method, async () => { calls.violations.push(`prisma.${name}.${method}`); throw new Error(`purity violation: prisma.${name}.${method}`); });
    }
  }
  for (const raw of ['$queryRaw', '$queryRawUnsafe']) if (typeof prisma[raw] === 'function') patch(prisma, raw, async () => { calls.reads.push(raw); return []; });
  for (const raw of ['$executeRaw', '$executeRawUnsafe']) if (typeof prisma[raw] === 'function') patch(prisma, raw, async () => { calls.violations.push(`prisma.${raw}`); throw new Error(`purity violation: ${raw}`); });
  // A transaction runs its callback against the same recorded client, so a write inside it is still a violation.
  if (typeof prisma.$transaction === 'function') patch(prisma, '$transaction', async (arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));

  // Outbound network: any request is a violation.
  for (const [mod, name] of [[http, 'http'], [https, 'https']]) {
    patch(mod, 'request', () => { calls.violations.push(`${name}.request`); throw new Error(`purity violation: ${name}.request`); });
  }
  patch(globalThis, 'fetch', async (url) => { calls.violations.push(`fetch ${String(url).slice(0, 80)}`); throw new Error('purity violation: fetch'); });
  patch(propertyAccess, 'resolvePropertyAccess', async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true }));
  return { calls, restore: () => restore.reverse().forEach((fn) => fn()) };
}

const BLOCKED_BLOCK_TYPES = new Set(['WORKFLOW_PROGRESS', 'CONFIRMATION', 'CAPTURE']);

async function runReadPurity(operationId, message, options = {}) {
  require('../../src/services/ask/askRuntimeBootstrap.ts').loadAskHandlerManifest();
  const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
  const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
  const recorders = installRecorders(options.seed);
  let result = null;
  let error = null;
  try {
    result = await capabilityInvoke(operationId, { userId: 'u1', propertyId: 'p1', sessionId: 's1', executionId: 'e1', message },
      { propertyAccess: { propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true } });
  } catch (caught) { error = caught; } finally { recorders.restore(); }
  const problems = [...recorders.calls.violations];
  // A button that merely STARTS a separate, user-confirmed turn for a write operation is an offer, not a side effect of this read. It is recorded here and
  // withheld from a composite's delivered projection (composition FRD §6.5), so a composite never offers a write.
  const writeOffers = [];
  if (result) {
    if (result.confirmation) problems.push('result carries a confirmation');
    if ((result.captureRequests ?? []).length) problems.push('result carries capture requests');
    for (const block of result.blocks ?? []) {
      if (BLOCKED_BLOCK_TYPES.has(block.type)) problems.push(`result carries a ${block.type} block`);
      for (const action of block.actions ?? []) {
        const target = action.operationId && getAskOperationDefinition(action.operationId);
        if (target && target.family === 'COMMAND') writeOffers.push(`${action.id} -> ${action.operationId}`);
      }
    }
  }
  return { result, error, problems, writeOffers, reads: [...new Set(recorders.calls.reads)] };
}

const SEED_PROPERTY = {
  id: 'p1', homeownerProfileId: 'h1', homeownerProfile: { id: 'h1', userId: 'u1' }, name: 'Home', address: '1 Main St', city: 'Springfield', state: 'CA', zipCode: '90000',
  yearBuilt: 2000, propertyType: 'SINGLE_FAMILY', roofReplacementYear: null, roofType: null, isCoastal: false,
  // The shape of a home with nothing recorded: every to-many relation is empty, so assemblers that iterate them run their real code.
  inventoryItems: [], rooms: [], documents: [], warranties: [], maintenanceTasks: [], expenses: [], homeEvents: [], insurancePolicies: [],
};
const seedOwnedProperty = (model, method) => (model === 'Property' && ['findUnique', 'findFirst'].includes(method) ? SEED_PROPERTY : undefined);

module.exports = { runReadPurity, seedOwnedProperty };
