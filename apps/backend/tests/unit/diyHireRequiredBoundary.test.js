// apps/backend/tests/unit/diyHireRequiredBoundary.test.js
//
// W3 (AI/DIY — "safety boundary"): the AI prompt asks Gemini to set
// decisionVerdict to HIRE_REQUIRED for panel/gas-line/structural work, but
// nothing enforced that verdict server-side — a well-behaved LLM response
// was just as startable as a DIY_RECOMMENDED one via a direct call to
// createProject. createProject now rejects starting a project from an
// aiGuideId whose guide is HIRE_REQUIRED.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ guide }) {
  const prismaMock = {
    diySkillProfile: { findUnique: async () => null },
    diyAiGuide: { findFirst: async () => guide },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const propertyContextPath = require.resolve('../../src/modules/propertyContext/index.ts');
  require.cache[propertyContextPath] = {
    id: propertyContextPath,
    filename: propertyContextPath,
    loaded: true,
    exports: { getPropertyContext: async () => ({}) },
  };

  const applicabilityPath = require.resolve('../../src/services/diy/applicabilityPolicy.ts');
  require.cache[applicabilityPath] = {
    id: applicabilityPath,
    filename: applicabilityPath,
    loaded: true,
    exports: {
      evaluateDiyApplicability: () => ({ status: 'APPLICABLE', reasonCodes: [] }),
    },
  };

  const servicePath = require.resolve('../../src/services/diy.service.ts');
  delete require.cache[servicePath];
  return require(servicePath);
}

function guide(overrides = {}) {
  return {
    id: 'guide-1',
    propertyId: 'property-1',
    status: 'COMPLETED',
    generatedTitle: 'Rewire the panel',
    generatedSummary: 'Upgrade the main panel',
    category: 'ELECTRICAL',
    decisionVerdict: 'HIRE_REQUIRED',
    stepsJson: [],
    materialsJson: [],
    toolsJson: [],
    ...overrides,
  };
}

test('rejects starting a project from a HIRE_REQUIRED AI guide', async () => {
  const { diyService } = loadService({ guide: guide({ decisionVerdict: 'HIRE_REQUIRED' }) });

  await assert.rejects(
    () => diyService.createProject('property-1', 'user-1', { aiGuideId: 'guide-1' }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'DIY_HIRE_REQUIRED');
      return true;
    },
  );
});

test('does not block a DIY_RECOMMENDED AI guide from starting', async () => {
  const { diyService } = loadService({
    guide: guide({ decisionVerdict: 'DIY_RECOMMENDED', stepsJson: [{ stepNumber: 1, title: 'Step', description: 'Do it' }] }),
  });

  // Reaching the $transaction call (which needs a real prisma tx) is out of
  // scope for this narrow test — asserting it does NOT throw the
  // HIRE_REQUIRED APIError (a TypeError from the unmocked $transaction is
  // the expected/acceptable failure mode here, confirming the boundary
  // check itself did not fire).
  await assert.rejects(
    () => diyService.createProject('property-1', 'user-1', { aiGuideId: 'guide-1' }),
    (err) => {
      assert.notEqual(err.code, 'DIY_HIRE_REQUIRED');
      return true;
    },
  );
});

test('does not block a HIRE_RECOMMENDED (not HIRE_REQUIRED) verdict', async () => {
  const { diyService } = loadService({
    guide: guide({ decisionVerdict: 'HIRE_RECOMMENDED', stepsJson: [{ stepNumber: 1, title: 'Step', description: 'Do it' }] }),
  });

  await assert.rejects(
    () => diyService.createProject('property-1', 'user-1', { aiGuideId: 'guide-1' }),
    (err) => {
      assert.notEqual(err.code, 'DIY_HIRE_REQUIRED');
      return true;
    },
  );
});
