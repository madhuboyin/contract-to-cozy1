const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Review finding, post-Phase-1: capabilityInvoke() only resolved a handler
// and called it -- operational controls and property-access authorization
// lived exclusively in askOrchestrator.service.ts's executeOperationCore.
// Reproduced with a mocked database read: calling INSPECTION_FINDINGS
// directly with its operation disabled, or with an unverified user/property,
// still queried the property's inspection findings and returned ANSWERED.
//
// This file mocks prisma BEFORE first requiring anything under test (same
// pattern as askFollowUpContext.test.js) so INSPECTION_FINDINGS's own
// handler body (askOrchestrator.service.ts's inspectionFindingsResult,
// which queries prisma.inspectionFinding directly with no access check of
// its own) can never silently succeed if capabilityInvoke()'s own guard
// chain fails to short-circuit first. Kept in its own file (not
// capabilityHandlerRegistry.test.js) because require.cache must be seeded
// before askOrchestrator.service.ts is ever required in this process, and
// node --test runs each file in its own process (--test-isolation=process).
let inspectionFindingQueried = false;
const prismaMock = {
  householdMember: { findUnique: async () => null },
  property: { findFirst: async () => null },
  inspectionFinding: {
    findMany: async () => {
      inspectionFindingQueried = true;
      return [];
    },
  },
};
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
// Side-effect import: registers the 67 handlers, including INSPECTION_FINDINGS.
require('../../src/services/ask/askOrchestrator.service.ts');

function envelope(overrides) {
  return {
    userId: 'u-unverified',
    propertyId: 'property-unverified',
    sessionId: 's1',
    executionId: 'e1',
    message: 'what inspection findings are open',
    ...overrides,
  };
}

test('capabilityInvoke refuses a disabled operation before ever calling its handler', async () => {
  const envVar = 'ASK_OPERATION_INSPECTION_FINDINGS_ENABLED';
  const previous = process.env[envVar];
  process.env[envVar] = 'false';
  try {
    const result = await capabilityInvoke('INSPECTION_FINDINGS', envelope());
    assert.equal(result.status, 'UNAVAILABLE');
    assert.equal(result.reasonCode, 'OPERATION_DISABLED');
    assert.equal(inspectionFindingQueried, false, 'a disabled operation must never reach its handler');
  } finally {
    if (previous === undefined) delete process.env[envVar];
    else process.env[envVar] = previous;
  }
});

test('capabilityInvoke refuses an unverified user/property before ever calling its handler', async () => {
  inspectionFindingQueried = false;
  let threw = null;
  let result = null;
  try {
    result = await capabilityInvoke('INSPECTION_FINDINGS', envelope());
  } catch (error) {
    threw = error;
  }
  // Mirrors askOrchestrator.service.ts's own ensurePropertyAccess: no
  // household membership and no legacy ownership match throws
  // ASK_PROPERTY_NOT_FOUND rather than returning a result -- the specific
  // outcome shape matters less here than the invariant both outcomes share:
  // the handler's own DB query must never fire for an unverified property.
  if (threw) {
    assert.equal(threw.code, 'ASK_PROPERTY_NOT_FOUND');
  } else {
    assert.notEqual(result.status, 'ANSWERED');
  }
  assert.equal(inspectionFindingQueried, false, 'an unverified user/property must never reach its handler');
});
