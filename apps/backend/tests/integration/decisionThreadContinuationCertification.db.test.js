const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.DECISION_THREAD_CONTINUATION_ACCEPTANCE_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

// Ask Intelligence FRD Phase 8A fixture certification. A prior audit flagged
// that no retained harness demonstrates: >=1,000 continuation attempts;
// >=99% correct continuation; zero material misattribution; 100% replay
// where dependencies remain available; and deletion, retry, concurrent-write,
// access-removal, and AI-disabled behavior. This is that harness.
//
// Opt-in, self-cleaning, real-database acceptance test -- mirrors
// tests/integration/phase3VerifiedClosure.db.test.js's established
// convention exactly: never falls back to the ordinary dev DATABASE_URL,
// removes every acceptance record on success or failure, and intentionally
// skips (not fails) without a dedicated database URL.
//
// Run: DECISION_THREAD_CONTINUATION_ACCEPTANCE_DATABASE_URL=postgresql://... \
//      npm run acceptance:decision-thread-continuation

test('decision thread continuation certification: 1,000+ attempts, replay, deletion, concurrency, retry, AI-disabled, access-removal', {
  skip: !databaseUrl,
  timeout: 120_000,
}, async (t) => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const decisionThreadService = require('../../src/services/decisionPlatform/decisionThreadService.ts');
  const { evaluateHvacRepairReplace, DEFAULT_HVAC_ENGINE_WEIGHTS } = require('../../src/services/decisionPlatform/hvacRepairReplaceEngine.service.ts');
  const { resolvePropertyAccess } = require('../../src/services/propertyAccess.service.ts');
  const { createAskExecution } = require('../../src/services/ask/askOrchestrator.service.ts');

  const id = `dtc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const homeowner = await prisma.user.create({
    data: {
      email: `${id}-homeowner@example.invalid`,
      firstName: 'Continuation', lastName: 'Certification', role: 'HOMEOWNER',
      passwordHash: 'acceptance-only-not-a-login',
      homeownerProfile: { create: {} },
    },
  });
  const secondUser = await prisma.user.create({
    data: {
      email: `${id}-second@example.invalid`,
      firstName: 'Second', lastName: 'Member', role: 'HOMEOWNER',
      passwordHash: 'acceptance-only-not-a-login',
      homeownerProfile: { create: {} },
    },
  });

  try {
    const homeownerProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { userId: homeowner.id } });

    // A single real AskExecution row, reused as the `askExecutionId` for
    // every fixture thread's CREATED link below. DecisionThreadExecutionLink
    // is unique on (decisionThreadId, askExecutionId), not askExecutionId
    // alone, so reusing one id across many distinct threads is legitimate,
    // not a workaround.
    const setupSession = await prisma.askSession.create({ data: { userId: homeowner.id, title: 'Certification fixture setup' } });
    const setupExecution = await prisma.askExecution.create({
      data: { sessionId: setupSession.id, userId: homeowner.id, clientRequestId: `${id}-setup`, message: 'fixture setup', status: 'COMPLETED' },
    });

    // --- Fixture: PROPERTY_COUNT properties x ITEMS_PER_PROPERTY HVAC items,
    // each with its own started decision thread. ---
    const PROPERTY_COUNT = 10;
    const ITEMS_PER_PROPERTY = 5;
    const threads = []; // { threadId, propertyId, inventoryItemId }

    for (let p = 0; p < PROPERTY_COUNT; p++) {
      const property = await prisma.property.create({
        data: { homeownerProfileId: homeownerProfile.id, address: `${id} Test St #${p}`, city: 'Testville', state: 'TX', zipCode: '00000' },
      });
      for (let i = 0; i < ITEMS_PER_PROPERTY; i++) {
        const item = await prisma.inventoryItem.create({
          data: { propertyId: property.id, name: `${id}-hvac-${p}-${i}`, category: 'HVAC', condition: 'FAIR', installedOn: new Date('2018-01-01T00:00:00.000Z') },
        });
        const { thread } = await decisionThreadService.createHvacDecisionThread({
          propertyId: property.id, userId: homeowner.id, inventoryItemId: item.id, askExecutionId: setupExecution.id,
        });
        threads.push({ threadId: thread.id, propertyId: property.id, inventoryItemId: item.id });
      }
    }

    // === 1. Load + zero material misattribution across >=1,000 attempts ===
    await t.test('1,000 continuation attempts resolve the correct thread with zero material misattribution', async () => {
      const ATTEMPTS = 1_000;
      let correct = 0;
      for (let n = 0; n < ATTEMPTS; n++) {
        const fixture = threads[n % threads.length];
        const selection = await decisionThreadService.selectHvacDecisionThread(fixture.propertyId, fixture.inventoryItemId);
        if (selection.kind === 'UNIQUE' && selection.thread.id === fixture.threadId) correct += 1;
      }
      const passRate = correct / ATTEMPTS;
      // Selection is a deterministic property+item-scoped query -- there is
      // no source of randomness in it, so material misattribution across a
      // clean fixture set must be exactly zero, not merely under some
      // tolerance.
      assert.equal(correct, ATTEMPTS, 'expected zero material misattribution');
      assert.ok(passRate >= 0.99, `pass rate ${passRate} below the >=99% acceptance bar`);
    });

    // === 2. 100% replay while dependencies remain available ===
    await t.test('replay from engineInputSnapshot exactly reproduces the original score and verdict for every thread', async () => {
      let replayed = 0;
      for (const fixture of threads) {
        const snapshot = await prisma.recommendationSnapshot.findFirst({
          where: { decisionThreadId: fixture.threadId },
          orderBy: { generatedAt: 'desc' },
        });
        assert.ok(snapshot, `expected a snapshot for thread ${fixture.threadId}`);
        assert.ok(snapshot.engineInputSnapshot, 'engineInputSnapshot must be populated to support replay');
        const recomputed = evaluateHvacRepairReplace(snapshot.engineInputSnapshot, DEFAULT_HVAC_ENGINE_WEIGHTS);
        assert.equal(recomputed.score, snapshot.score, `replayed score diverged for thread ${fixture.threadId}`);
        assert.equal(recomputed.verdict, snapshot.verdictCode, `replayed verdict diverged for thread ${fixture.threadId}`);
        replayed += 1;
      }
      assert.equal(replayed, threads.length, '100% of threads with an available InventoryItem must replay');
    });

    // === 3. Deletion fails closed ===
    await t.test('continuation after the underlying InventoryItem is deleted fails closed instead of resuming or fabricating state', async () => {
      const property = await prisma.property.create({
        data: { homeownerProfileId: homeownerProfile.id, address: `${id} Deletion St`, city: 'Testville', state: 'TX', zipCode: '00000' },
      });
      const item = await prisma.inventoryItem.create({
        data: { propertyId: property.id, name: `${id}-deletion-item`, category: 'HVAC', condition: 'FAIR', installedOn: new Date('2018-01-01T00:00:00.000Z') },
      });
      const { thread } = await decisionThreadService.createHvacDecisionThread({
        propertyId: property.id, userId: homeowner.id, inventoryItemId: item.id, askExecutionId: setupExecution.id,
      });
      await prisma.inventoryItem.delete({ where: { id: item.id } });
      await assert.rejects(() => decisionThreadService.recomputeStaleThread(thread.id), /no longer available/i);
    });

    // === 4. Concurrent-write: no silent data loss ===
    await t.test('two concurrent recompute attempts on the same thread never silently lose or double-apply a write', async () => {
      const fixture = threads[0];
      // Force STALE so recomputeStaleThread actually performs a
      // version-checked write rather than a no-op.
      await prisma.decisionThread.update({ where: { id: fixture.threadId }, data: { contextStatus: 'STALE' } });
      const before = await prisma.decisionThread.findUniqueOrThrow({ where: { id: fixture.threadId } });

      const results = await Promise.allSettled([
        decisionThreadService.recomputeStaleThread(fixture.threadId),
        decisionThreadService.recomputeStaleThread(fixture.threadId),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      for (const r of rejected) {
        assert.match(String(r.reason), /DecisionThreadVersionConflictError|changed concurrently/i, 'a failed concurrent recompute must fail via the version-conflict guard, never silently');
      }
      const after = await prisma.decisionThread.findUniqueOrThrow({ where: { id: fixture.threadId } });
      // The real guarantee under test: version advances by exactly the
      // number of writes that actually succeeded -- proves no lost update
      // and no phantom double-increment, regardless of whether the two
      // calls happened to collide on this particular run.
      assert.equal(after.version, before.version + fulfilled.length, 'version must advance by exactly the number of successful writes');
      if (rejected.length > 0) {
        // The expected outcome given the real DB round-trip (preferences +
        // context composition) between each call's version read and its
        // version-checked write -- proves the guard fires under genuine
        // contention, not just in theory.
        assert.equal(fulfilled.length, 1, 'exactly one concurrent writer should win when a collision actually occurs');
      }
    });

    // === 5. Retry / idempotency ===
    await t.test('continuation is idempotent under retry -- the same executionId recorded twice does not duplicate or corrupt the audit trail', async () => {
      const fixture = threads[1];
      const session = await prisma.askSession.create({ data: { userId: homeowner.id, title: 'Retry test' } });
      const execution = await prisma.askExecution.create({
        data: { sessionId: session.id, userId: homeowner.id, clientRequestId: `${id}-retry`, message: 'continue hvac decision', status: 'RUNNING' },
      });
      await decisionThreadService.continueHvacDecisionThread(fixture.threadId, fixture.propertyId, execution.id);
      await assert.doesNotReject(() => decisionThreadService.continueHvacDecisionThread(fixture.threadId, fixture.propertyId, execution.id));
      const links = await prisma.decisionThreadExecutionLink.findMany({ where: { decisionThreadId: fixture.threadId, askExecutionId: execution.id } });
      assert.equal(links.length, 1, 'exactly one execution link must exist after two identical retries, not two');
    });

    // === 6. AI-disabled behavior ===
    await t.test('continuation succeeds unchanged with ASK_REMOTE_GENERATION_ENABLED=false, since the HVAC engine performs no model calls', async () => {
      const previous = process.env.ASK_REMOTE_GENERATION_ENABLED;
      process.env.ASK_REMOTE_GENERATION_ENABLED = 'false';
      try {
        const fixture = threads[2];
        const selection = await decisionThreadService.selectHvacDecisionThread(fixture.propertyId, fixture.inventoryItemId);
        assert.equal(selection.kind, 'UNIQUE');
        const { thread } = await decisionThreadService.continueHvacDecisionThread(fixture.threadId, fixture.propertyId, undefined);
        assert.equal(thread.id, fixture.threadId);
      } finally {
        if (previous === undefined) delete process.env.ASK_REMOTE_GENERATION_ENABLED;
        else process.env.ASK_REMOTE_GENERATION_ENABLED = previous;
      }
    });

    // === 7. Access-removal ===
    await t.test('a user without property access cannot resolve or reach continuation for a property they do not belong to', async () => {
      const fixture = threads[3];
      await prisma.householdMember.create({ data: { propertyId: fixture.propertyId, userId: secondUser.id, role: 'CONTRIBUTOR' } });
      const accessBefore = await resolvePropertyAccess(secondUser.id, fixture.propertyId);
      assert.ok(accessBefore, 'secondUser should have access before removal');

      await prisma.householdMember.delete({ where: { propertyId_userId: { propertyId: fixture.propertyId, userId: secondUser.id } } });
      const accessAfter = await resolvePropertyAccess(secondUser.id, fixture.propertyId);
      assert.equal(accessAfter, null, 'secondUser must lose property access once their household membership is removed');

      // End-to-end: the actual Ask dispatch entry point secondUser would use
      // to reach continuation (ensurePropertyAccess runs before the
      // execution row is even created) must now fail closed.
      const session = await prisma.askSession.create({ data: { userId: secondUser.id, title: 'Access removal test' } });
      const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: fixture.inventoryItemId } });
      await assert.rejects(
        () => createAskExecution(secondUser.id, {
          clientRequestId: `${id}-access-removed`, sessionId: session.id,
          message: `What's the status of my ${item.name} decision?`,
          propertyId: fixture.propertyId,
        }),
        /not found|access denied/i,
      );
    });
  } finally {
    await prisma.user.delete({ where: { id: homeowner.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: secondUser.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
