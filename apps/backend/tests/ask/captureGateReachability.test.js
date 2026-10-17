const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register/transpile-only');

// Live review finding 3 (2026-10-16): submitting the Upgrade Planner decision form and the Home Habit Coach settings
// form returned 409 ASK_CAPTURE_NOT_ACTIVE "This execution does not have an active inline capture." even on the latest
// turn. The operation gate in submitAskCaptureCore listed operations by hand and omitted every command added after it,
// so those operations' capture branches were unreachable.

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { submitAskCapture } = require('../../src/services/ask/execution/askCapture.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');

const GATE_MESSAGE = /does not have an active inline capture/;
const source = readFileSync(resolve(__dirname, '../../src/services/ask/execution/askCapture.ts'), 'utf8');

const realPrisma = prismaModule.prisma;
const realResolve = propertyAccess.resolvePropertyAccess;
let operationId;

test.before(() => {
  const models = {
    askExecution: { findFirst: async () => ({ id: 'e1', userId: 'u1', sessionId: 's1', propertyId: 'p1', operationId, message: 'm', resultJson: { captureRequests: [] }, parametersJson: {}, launchContextJson: {}, contextVersion: 'v' }) },
    askSession: { update: async () => ({}) },
    askCaptureReceipt: { findUnique: async () => null },
  };
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; return models[model] ?? new Proxy({}, { get: () => async () => null }); } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', propertyId: 'p1' });
});
test.after(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = realResolve; });

async function gateRejects(id) {
  operationId = id;
  try {
    await submitAskCapture('u1', 'e1', { captureKey: 'k', requirementId: 'r', idempotencyKey: 'i', expectedContextVersion: 'v', answer: {} });
  } catch (error) {
    return GATE_MESSAGE.test(error.message);
  }
  return false;
}

for (const id of ['HOME_UPGRADE_COMMAND', 'HOME_HABIT_PREFERENCES_COMMAND']) {
  test(`${id} is not rejected by the operation gate`, async () => {
    assert.equal(await gateRejects(id), false);
  });
}

test('an operation that is neither allowlisted nor a registered command is still rejected by the gate', async () => {
  assert.equal(await gateRejects('PROPERTY_BRIEF_PREVIEW_NOT_A_REAL_OPERATION'), true);
});

test('every operation with a capture branch in submitAskCaptureCore can pass the gate', () => {
  const gate = source.match(/execution\.operationId !== 'PROJECT_TRACKER_CREATE' && !\[(.*?)\]\.includes/s)[1];
  const allowlisted = new Set(gate.match(/'[A-Z_]+'/g).map((quoted) => quoted.slice(1, -1)));
  const body = source.slice(source.indexOf('async function submitAskCaptureCore'));
  const branches = new Set([...body.matchAll(/\} else if \(execution\.operationId === '([A-Z_]+)'\)/g)].map((match) => match[1]));
  const unreachable = [...branches].filter((id) => !allowlisted.has(id) && !getAskDomainCommandByOperation(id));
  assert.deepEqual(unreachable, [], `capture branches the gate rejects: ${unreachable.join(', ')}`);
});
