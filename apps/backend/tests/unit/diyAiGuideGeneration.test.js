// apps/backend/tests/unit/diyAiGuideGeneration.test.js
//
// W3 (AI/DIY — the final domain in the worker-module audit):
//   1. Structured output validation — the Gemini response used to be
//      trusted wholesale (JSON.parse only); a malformed/incomplete
//      response was persisted as COMPLETED and only surfaced later as a
//      raw Prisma error when converting the guide into a project. Now
//      validated against AiGuideGenerationResponseSchema first.
//   2. Idempotency — initiateGeneration() had no dedup (a double-submit
//      created two guides and burned two paid Gemini calls); generate()
//      used a non-atomic findUnique+status-check+update, and its
//      allowed-status set even included GENERATING, so a second call
//      while one was in flight wasn't blocked either.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// initiateGeneration now fails closed when GEMINI_API_KEY is unset (see the
// dedicated AI-disabled test below, which unsets it deliberately) — set a
// fake key by default so every other test exercises the real generation
// path instead of the disabled-state short-circuit.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';

// W4 fix: initiateGeneration now also gates on evaluateWorkerExecution.
// generate-diy-ai-guide has externalProvider: 'Gemini', so under default
// beta flags (WORKER_EXTERNAL_INGEST_ENABLED=false) it would be blocked —
// see the dedicated "blocked by worker execution policy" test below, which
// clears this override deliberately. Set it here so every other test
// exercises the real generation path instead of the blocked short-circuit.
process.env.WORKER_JOB_GENERATE_DIY_AI_GUIDE_ENABLED =
  process.env.WORKER_JOB_GENERATE_DIY_AI_GUIDE_ENABLED || 'true';

function loadService({
  existingGuide = null,
  claimCount = 1,
  geminiResponseText,
  contextApplicable = true,
}) {
  const calls = { updates: [], creates: [] };

  const prismaMock = {
    diyAiGuide: {
      findFirst: async () => existingGuide,
      create: async (args) => {
        calls.creates.push(args);
        return { id: 'guide-new', ...args.data };
      },
      findUnique: async () => ({
        id: 'guide-1',
        userId: 'user-1',
        propertyId: 'property-1',
        userPrompt: 'fix my fence',
        status: 'PENDING',
      }),
      updateMany: async (args) => {
        calls.updates.push({ kind: 'updateMany', args });
        return { count: claimCount };
      },
      update: async (args) => {
        calls.updates.push({ kind: 'update', args });
        return { id: 'guide-1', ...args.data };
      },
    },
    diySkillProfile: {
      findUnique: async () => null,
    },
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
      evaluateDiyApplicability: () => ({
        status: contextApplicable ? 'APPLICABLE' : 'NOT_APPLICABLE',
        reasonCodes: contextApplicable ? [] : ['TEST_BLOCKED'],
      }),
    },
  };

  const contextDecisionPath = require.resolve('../../src/services/propertyContextDecision.ts');
  require.cache[contextDecisionPath] = {
    id: contextDecisionPath,
    filename: contextDecisionPath,
    loaded: true,
    exports: { knownContextValue: () => undefined },
  };

  const servicePath = require.resolve('../../src/services/diyAiGuide.service.ts');
  delete require.cache[servicePath];
  const mod = require(servicePath);

  // W4 fix: getDiyAiGuideQueue() lazily constructs the real BullMQ Queue on
  // first call instead of at module scope, and exposes __setForTesting so
  // tests can inject an in-memory fake before that first call — no more
  // require.cache['bullmq'] stubbing, no real Redis connection ever opens.
  calls.enqueued = [];
  mod.getDiyAiGuideQueue.__setForTesting({
    add: async (name, data, opts) => {
      calls.enqueued.push({ name, data, opts });
      return { id: opts?.jobId ?? 'job-1' };
    },
    getJob: async () => undefined,
  });

  // Patch the AI call after require (the class instance holds no exported
  // seam for the Gemini client, so stub the method directly on the
  // singleton instance instead of via require.cache).
  mod.diyAiGuideService.getAi = () => ({
    models: {
      generateContent: async () => ({
        text: geminiResponseText,
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      }),
    },
  });

  return { ...mod, calls };
}

function validGuideResponse(overrides = {}) {
  return JSON.stringify({
    title: 'Fix the fence',
    summary: 'Replace a broken picket.',
    category: 'EXTERIOR',
    safetyLevel: 'LOW',
    permitRequirement: 'NOT_REQUIRED',
    verdict: 'DIY_RECOMMENDED',
    safetyWarnings: [],
    steps: [{ stepNumber: 1, title: 'Remove broken picket', description: 'Pry it off carefully.' }],
    materials: [{ name: 'Picket board', unit: 'each', quantity: 1 }],
    tools: [{ name: 'Hammer', isRequired: true }],
    ...overrides,
  });
}

test('initiateGeneration creates a new guide when none is in flight', async () => {
  const { diyAiGuideService, calls } = loadService({ existingGuide: null, geminiResponseText: validGuideResponse() });

  const id = await diyAiGuideService.initiateGeneration('user-1', 'property-1', 'fix my fence');

  assert.equal(id, 'guide-new');
  assert.equal(calls.creates.length, 1);
});

test('initiateGeneration reuses an in-flight guide for the same prompt instead of creating a duplicate', async () => {
  const { diyAiGuideService, calls } = loadService({
    existingGuide: { id: 'guide-existing', status: 'GENERATING' },
    geminiResponseText: validGuideResponse(),
  });

  const id = await diyAiGuideService.initiateGeneration('user-1', 'property-1', 'fix my fence');

  assert.equal(id, 'guide-existing');
  assert.equal(calls.creates.length, 0, 'must not create (and enqueue/burn a Gemini call for) a duplicate guide');
});

test('generate() proceeds when the atomic claim succeeds', async () => {
  const { diyAiGuideService, calls } = loadService({ claimCount: 1, geminiResponseText: validGuideResponse() });

  await diyAiGuideService.generate('guide-1');

  const completedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'COMPLETED');
  assert.ok(completedUpdate, 'must reach COMPLETED when the claim succeeds and the AI response is well-formed');
});

test('generate() does nothing when the atomic claim fails (another caller already claimed it)', async () => {
  const { diyAiGuideService, calls } = loadService({ claimCount: 0, geminiResponseText: validGuideResponse() });

  await diyAiGuideService.generate('guide-1');

  const anyGenerationUpdate = calls.updates.find(
    (u) => u.kind === 'update' && (u.args.data.status === 'COMPLETED' || u.args.data.status === 'FAILED'),
  );
  assert.ok(!anyGenerationUpdate, 'must not attempt generation at all when the claim did not land');
});

test('a malformed AI response (missing required fields) is rejected before persisting, not trusted wholesale', async () => {
  const { diyAiGuideService, calls } = loadService({
    claimCount: 1,
    geminiResponseText: JSON.stringify({ title: 'Fix the fence' }), // missing summary/category/verdict/etc
  });

  await diyAiGuideService.generate('guide-1');

  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate, 'must mark FAILED instead of persisting an incomplete guide as COMPLETED');
  assert.match(failedUpdate.args.data.errorMessage, /expected guide format/i);
});

test('a HIRE_REQUIRED verdict with zero steps is still valid (steps are optional when a pro is required)', async () => {
  const { diyAiGuideService, calls } = loadService({
    claimCount: 1,
    geminiResponseText: validGuideResponse({
      safetyLevel: 'HIGH',
      permitRequirement: 'LIKELY_REQUIRED',
      verdict: 'HIRE_REQUIRED',
      steps: [],
      safetyWarnings: ['Requires a licensed electrician'],
    }),
  });

  await diyAiGuideService.generate('guide-1');

  const completedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'COMPLETED');
  assert.ok(completedUpdate);
  assert.equal(completedUpdate.args.data.decisionVerdict, 'HIRE_REQUIRED');
});

test('a DIY_RECOMMENDED verdict with zero steps is rejected (a real guide must include steps)', async () => {
  const { diyAiGuideService, calls } = loadService({
    claimCount: 1,
    geminiResponseText: validGuideResponse({ verdict: 'DIY_RECOMMENDED', steps: [] }),
  });

  await diyAiGuideService.generate('guide-1');

  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate);
});

test('non-JSON AI output fails cleanly with a clear message instead of an uncaught JSON.parse throw', async () => {
  const { diyAiGuideService, calls } = loadService({
    claimCount: 1,
    geminiResponseText: 'Sorry, I cannot help with that.',
  });

  await diyAiGuideService.generate('guide-1');

  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate);
  assert.match(failedUpdate.args.data.errorMessage, /not valid JSON/i);
});

test('initiateGeneration fails closed with a clear AI_UNAVAILABLE error when GEMINI_API_KEY is unset', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const { diyAiGuideService, calls } = loadService({ existingGuide: null, geminiResponseText: validGuideResponse() });

    await assert.rejects(
      () => diyAiGuideService.initiateGeneration('user-1', 'property-1', 'fix my fence'),
      (err) => {
        assert.equal(err.statusCode, 503);
        assert.equal(err.code, 'AI_UNAVAILABLE');
        return true;
      },
    );
    assert.equal(calls.creates.length, 0, 'must not create a guide row that would only fail later during generation');
  } finally {
    process.env.GEMINI_API_KEY = originalKey;
  }
});

test('initiateGeneration is blocked by worker execution policy when external ingest is disabled (default beta flags)', async () => {
  const originalOverride = process.env.WORKER_JOB_GENERATE_DIY_AI_GUIDE_ENABLED;
  const originalExternalIngest = process.env.WORKER_EXTERNAL_INGEST_ENABLED;
  delete process.env.WORKER_JOB_GENERATE_DIY_AI_GUIDE_ENABLED;
  delete process.env.WORKER_EXTERNAL_INGEST_ENABLED; // falls back to its beta default: false
  try {
    const { diyAiGuideService, calls } = loadService({ existingGuide: null, geminiResponseText: validGuideResponse() });

    await assert.rejects(
      () => diyAiGuideService.initiateGeneration('user-1', 'property-1', 'fix my fence'),
      (err) => {
        assert.equal(err.statusCode, 503);
        assert.equal(err.code, 'WORKER_JOB_DISABLED');
        return true;
      },
    );
    assert.equal(calls.creates.length, 0, 'must not create a guide row when the job is policy-disabled');
    assert.equal(calls.enqueued.length, 0, 'must not enqueue when the job is policy-disabled');
  } finally {
    process.env.WORKER_JOB_GENERATE_DIY_AI_GUIDE_ENABLED = originalOverride;
    process.env.WORKER_EXTERNAL_INGEST_ENABLED = originalExternalIngest;
  }
});

test('skips persisting COMPLETED when property applicability is not met', async () => {
  const { diyAiGuideService, calls } = loadService({
    claimCount: 1,
    geminiResponseText: validGuideResponse(),
    contextApplicable: false,
  });

  await diyAiGuideService.generate('guide-1');

  const completedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'COMPLETED');
  assert.ok(!completedUpdate);
  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate);
});
