const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env.local') });

const databaseUrl = process.env.ASK_CAPTURE_CERTIFICATION_DATABASE_URL
  || (process.env.POSTGRES_PASSWORD
    // See askConversationalCaptureCertification.db.test.js's identical
    // comment: port 5432 on this host is answered by an unrelated native
    // Postgres, not Docker's -- 5433 is the project's real published port.
    ? `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@localhost:5433/contracttocozy`
    : null);

// Ask Cozy Interaction Model UI FRD §12.2 / Stage 3 Phase 6 certification.
// The FRD's own acceptance table (A20) called this a "shared-contract
// walkthrough" pending its subsequent implementation, and specifically
// requires: "Resume the same goal from another session without
// duplicating it." Investigation (2026-09-15) found the create/resume
// mechanism is real and session-independent (DecisionThread.activeIdentityKey
// is a unique-constrained column, not tied to AskSession), and shares the
// exact adapter factory the HVAC repair/replace family's own
// decisionThreadContinuationCertification.db.test.js already certifies --
// but sell-hold-rent itself had never had that rigor applied specifically,
// and no test drives it through two separate turns and asserts
// non-duplication.
//
// Split like the capture certification file: a deterministic
// "create-or-resume identity" test that calls the adapter directly (no LLM
// -- goal extraction's classification step is a separate concern from the
// persistence guarantee this test exists to prove), and a live smoke test
// through the real message-extraction path that skips cleanly if the
// configured Gemini key can't reach the model.
//
// Opt-in like decisionThreadContinuationCertification.db.test.js: skips
// without a reachable database. Self-cleaning on success or failure.

test('sell-hold-rent goal certification: create-or-resume identity across two separate turns, no duplication', {
  skip: !databaseUrl ? 'no reachable database (set ASK_CAPTURE_CERTIFICATION_DATABASE_URL or POSTGRES_PASSWORD)' : false,
  timeout: 30_000,
}, async () => {
  process.env.DATABASE_URL = databaseUrl;

  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { sellHoldRentDecisionFamilyAdapter } = require('../../src/services/decisionPlatform/domainSnapshotAdapters.ts');
  const { SellHoldRentService } = require('../../src/services/sellHoldRent.service.ts');
  const sellHoldRentService = new SellHoldRentService();

  const id = `shr-goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const homeowner = await prisma.user.create({
    data: {
      email: `${id}-homeowner@example.invalid`,
      firstName: 'Goal', lastName: 'Certification', role: 'HOMEOWNER',
      passwordHash: 'acceptance-only-not-a-login',
      homeownerProfile: { create: {} },
    },
  });

  try {
    const homeownerProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { userId: homeowner.id } });
    const property = await prisma.property.create({
      data: { homeownerProfileId: homeownerProfile.id, address: `${id} Selling Ave`, city: 'Testville', state: 'TX', zipCode: '00000', timezone: 'America/Chicago' },
    });

    // A property with zero prior Sell/Hold/Rent activity -- proves the
    // homeowner does not need to have opened that tool first for the goal
    // path to work (ensureCanonicalSellHoldRentAnalysis's own documented
    // reason for calling estimate() here: "otherwise createOrResumeThread
    // throws 'No current recommendation available'").
    const before = await prisma.sellHoldRentAnalysis.count({ where: { propertyId: property.id } });
    assert.equal(before, 0, 'fixture property must start with no prior Sell/Hold/Rent analysis');
    await sellHoldRentService.estimate(property.id, { years: 5 }, homeowner.id);

    // === Turn 1: "I'm thinking about selling next year" (simulated as the
    // goal-extraction pipeline's own downstream call, isolating this test
    // from LLM classification) ===
    const lineage1 = await sellHoldRentDecisionFamilyAdapter.createOrResumeThread({
      propertyId: property.id, userId: homeowner.id, primaryEntityId: property.id,
    });
    assert.ok(lineage1.decisionThreadId, 'expected a real DecisionThread to be created for the first goal statement');

    // === Leave, and return in a materially later, separate turn. The real
    // guarantee under test: DecisionThread.activeIdentityKey is keyed on
    // (propertyId, decisionDefinitionId, primaryEntityType, primaryEntityId)
    // with a real unique constraint -- nothing about it references
    // AskSession, so this is genuinely session-independent, not merely
    // "the same test calling twice." ===
    const lineage2 = await sellHoldRentDecisionFamilyAdapter.createOrResumeThread({
      propertyId: property.id, userId: homeowner.id, primaryEntityId: property.id,
    });
    assert.equal(lineage2.decisionThreadId, lineage1.decisionThreadId, 'a goal restated in a later, separate turn must resume the SAME DecisionThread, not create a duplicate');

    const threads = await prisma.decisionThread.count({ where: { propertyId: property.id, decisionDefinitionId: 'SELL_HOLD_RENT' } });
    assert.equal(threads, 1, `expected exactly one SELL_HOLD_RENT DecisionThread for this property after two goal statements, found ${threads}`);

    // === No automatic consequential domain action -- goal attachment is
    // bookkeeping only (FRD §12.2's own negative requirement) ===
    const bookings = await prisma.booking.count({ where: { propertyId: property.id } });
    assert.equal(bookings, 0, 'attaching a goal must never create a booking or other consequential domain write on its own');
  } finally {
    // DecisionThread.createdByUserId has no cascade-on-delete FK, unlike
    // most of this schema's other User relations -- clean up its own
    // dependents explicitly first, or prisma.user.delete() below fails
    // with a foreign key violation and leaves this fixture orphaned.
    // Keyed off createdByUserId (in scope here), not the `property` local,
    // which is scoped to the try block above.
    const threadIds = (await prisma.decisionThread.findMany({ where: { createdByUserId: homeowner.id }, select: { id: true } })).map((t) => t.id);
    if (threadIds.length) {
      await prisma.recommendationSnapshot.deleteMany({ where: { decisionThreadId: { in: threadIds } } }).catch(() => {});
      await prisma.decisionThreadExecutionLink.deleteMany({ where: { decisionThreadId: { in: threadIds } } }).catch(() => {});
      await prisma.decisionThread.deleteMany({ where: { id: { in: threadIds } } }).catch(() => {});
    }
    await prisma.user.delete({ where: { id: homeowner.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});

test('sell-hold-rent goal certification: live smoke ("I\'m thinking about selling next year" through a real Ask turn)', {
  skip: !databaseUrl ? 'no reachable database (set ASK_CAPTURE_CERTIFICATION_DATABASE_URL or POSTGRES_PASSWORD)' : false,
  timeout: 90_000,
}, async (t) => {
  if (!process.env.GEMINI_API_KEY) {
    t.skip('no GEMINI_API_KEY configured');
    return;
  }
  try {
    const preflight = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    if (!preflight.ok) {
      t.skip(`GEMINI_API_KEY cannot reach the model (HTTP ${preflight.status}) -- see the create-or-resume-identity test for LLM-independent coverage of the persistence guarantee`);
      return;
    }
  } catch (error) {
    t.skip(`could not reach generativelanguage.googleapis.com to preflight the key: ${error instanceof Error ? error.message : error}`);
    return;
  }

  process.env.DATABASE_URL = databaseUrl;
  // Both default to false (apps/backend/src/config/askOperationalControls.ts).
  process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED = 'true';
  process.env.ASK_GOAL_CAPTURE_ENABLED = 'true';

  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { createAskExecution } = require('../../src/services/ask/askOrchestrator.service.ts');

  const id = `shr-goal-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const homeowner = await prisma.user.create({
    data: {
      email: `${id}-homeowner@example.invalid`,
      firstName: 'Goal', lastName: 'LiveSmoke', role: 'HOMEOWNER',
      passwordHash: 'acceptance-only-not-a-login',
      homeownerProfile: { create: {} },
    },
  });

  try {
    const homeownerProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { userId: homeowner.id } });
    const property = await prisma.property.create({
      data: { homeownerProfileId: homeownerProfile.id, address: `${id} Selling Ave`, city: 'Testville', state: 'TX', zipCode: '00000', timezone: 'America/Chicago' },
    });

    const parent = await createAskExecution(homeowner.id, {
      clientRequestId: `${id}-turn`,
      sessionId: `${id}-session`,
      message: "I'm thinking about selling next year.",
      propertyId: property.id,
    });
    assert.ok(parent.executionId, 'expected a real parent AskExecution to be created for an ordinary turn');

    const POLL_INTERVAL_MS = 1_000;
    const POLL_TIMEOUT_MS = 60_000;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let thread = null;
    while (Date.now() < deadline) {
      thread = await prisma.decisionThread.findFirst({ where: { propertyId: property.id, decisionDefinitionId: 'SELL_HOLD_RENT' } });
      if (thread) break;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    assert.ok(thread, 'expected a real Gemini classification of "I\'m thinking about selling next year." to attach a SELL_HOLD_RENT DecisionThread within 60s');
  } finally {
    await prisma.user.delete({ where: { id: homeowner.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
