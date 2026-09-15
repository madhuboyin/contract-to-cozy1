const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env.local') });

const databaseUrl = process.env.ASK_CAPTURE_CERTIFICATION_DATABASE_URL
  || (process.env.POSTGRES_PASSWORD
    // Port 5433, not 5432: this host also runs an unrelated native Postgres
    // on 5432 (confirmed via lsof -- a loopback-specific bind that silently
    // wins over Docker's wildcard bind on the same port for localhost
    // connections), and docker-compose.yml publishes the project's Postgres
    // on 5433 as well as 5432 for exactly this kind of local conflict.
    ? `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@localhost:5433/contracttocozy`
    : null);

// Ask Cozy Interaction Model UI FRD §12.1 / Stage 3 Phase 2-3 certification.
// The FRD's own acceptance table (A19) called this a "shared-contract
// walkthrough" pending its subsequent implementation. Investigation
// (2026-09-15) found the implementation is real (real Gemini extraction,
// editable proposal, confirm-time HomeEvent persistence), but no existing
// test drives a raw message through to a real Postgres row -- every
// existing test mocks Prisma or asserts against function source text. This
// is that missing end-to-end proof, split into two tests:
//
// - "downstream pipeline": the edit/confirm/persist half, using a synthetic
//   candidate (buildChildExecutionData is exported specifically "for direct
//   unit testing (pure, no I/O)") -- deterministic, no LLM call, always
//   runs given a reachable database.
// - "live extraction smoke": the natural-language interpretation half,
//   through the real ask() entry point with a real Gemini call -- skips
//   (does not fail) if a preflight ping shows the configured key can't
//   reach the model, since that is a credentials/infrastructure fact this
//   test cannot fix.
//
// Opt-in like decisionThreadContinuationCertification.db.test.js: skips
// without a reachable database. Self-cleaning on success or failure.

test('conversational capture certification: downstream pipeline (synthetic candidate, no LLM)', {
  skip: !databaseUrl ? 'no reachable database (set ASK_CAPTURE_CERTIFICATION_DATABASE_URL or POSTGRES_PASSWORD)' : false,
  timeout: 30_000,
}, async () => {
  process.env.DATABASE_URL = databaseUrl;

  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { confirmAskExecution } = require('../../src/services/ask/askOrchestrator.service.ts');
  const { buildChildExecutionData } = require('../../src/services/ask/conversationalUnderstanding/conversationalCapture.ts');

  const id = `acc-pipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const homeowner = await prisma.user.create({
    data: {
      email: `${id}-homeowner@example.invalid`,
      firstName: 'Capture', lastName: 'Pipeline', role: 'HOMEOWNER',
      passwordHash: 'acceptance-only-not-a-login',
      homeownerProfile: { create: {} },
    },
  });

  try {
    const homeownerProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { userId: homeowner.id } });
    const property = await prisma.property.create({
      data: { homeownerProfileId: homeownerProfile.id, address: `${id} Roof St`, city: 'Testville', state: 'TX', zipCode: '00000', timezone: 'America/Chicago' },
    });
    const session = await prisma.askSession.create({ data: { userId: homeowner.id, title: 'Pipeline fixture' } });
    const parent = await prisma.askExecution.create({
      data: {
        sessionId: session.id, userId: homeowner.id, propertyId: property.id,
        clientRequestId: `${id}-turn`, message: 'I replaced my roof last summer for $14,500.', status: 'COMPLETED',
      },
    });

    // The FRD's own literal example, as a hand-constructed candidate --
    // exactly the shape extractionEvaluationCorpus.ts's own "pos-1" fixture
    // asserts a real extraction call SHOULD produce for this exact message
    // (EVENT: roof replacement, RANGE precision, amount 14500). This test
    // proves what happens downstream of that classification, not the
    // classification itself.
    const candidate = {
      category: 'EVENT',
      extractionConfidence: 0.9,
      attribution: 'FIRSTHAND',
      sourceSentence: 'I replaced my roof last summer for $14,500.',
      eventType: 'IMPROVEMENT',
      title: 'Roof replacement',
      summary: null,
      datePrecision: 'RANGE',
      occurredAt: null,
      dateRangeStart: '2026-06-01T00:00:00.000Z',
      dateRangeEnd: '2026-08-31T00:00:00.000Z',
      amount: 14500,
      currency: 'USD',
      providerName: null,
      correctingEventId: null,
    };

    const input = {
      userId: homeowner.id, sessionId: session.id, propertyId: property.id,
      parentExecutionId: parent.id, message: candidate.sourceSentence,
      contextVersion: null, skipDueToRoutedCapture: false,
    };
    const createData = buildChildExecutionData(candidate, 0, input, new Date());
    const child = await prisma.askExecution.create({ data: createData });

    // === Editable structured proposal, not raw text ===
    assert.equal(child.status, 'NEEDS_CONFIRMATION', 'a capture proposal must require confirmation before any write');
    assert.equal(child.parametersJson.datePrecision, 'RANGE', 'uncertainty must be preserved, not collapsed to a fabricated exact date');
    assert.equal(child.resultJson.confirmation.version, 1, 'a freshly built capture proposal must be confirmation version 1');

    // === Confirmation persists through the existing capture execution ===
    const confirmed = await confirmAskExecution(homeowner.id, child.id, {
      confirmationVersion: 1,
      idempotencyKey: `${id}-confirm`,
      consentConfirmed: true,
    });
    assert.equal(confirmed.status, 'COMPLETED', `expected the capture confirmation to complete, got status ${confirmed.status}`);

    // === Real HomeEvent row, uncertainty retained through persistence ===
    const events = await prisma.homeEvent.findMany({ where: { propertyId: property.id } });
    assert.equal(events.length, 1, `expected exactly one HomeEvent to be persisted, found ${events.length}`);
    const event = events[0];
    assert.match(event.title.toLowerCase(), /roof/, `expected the persisted HomeEvent's title to mention "roof", got "${event.title}"`);
    assert.equal(event.datePrecision, 'RANGE', 'the persisted HomeEvent must retain RANGE precision');
    assert.equal(Number(event.amount), 14500, `expected amount 14500, got ${event.amount}`);
    assert.equal(event.captureChannel, 'ASK_CONVERSATIONAL_CAPTURE', 'expected the capture channel to record this as an Ask-conversational capture');

    // === Do not also fabricate a Warranty from a bare replacement
    // statement with no warranty-shaped detail (FRD §12.1's own negative
    // requirement) ===
    const warranties = await prisma.warranty.count({ where: { propertyId: property.id } });
    assert.equal(warranties, 0, 'a bare replacement statement with no warranty/coverage detail must not create a Warranty record');
  } finally {
    await prisma.user.delete({ where: { id: homeowner.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});

test('conversational capture certification: live extraction smoke ("I replaced my roof..." through a real Gemini call)', {
  skip: !databaseUrl ? 'no reachable database (set ASK_CAPTURE_CERTIFICATION_DATABASE_URL or POSTGRES_PASSWORD)' : false,
  timeout: 90_000,
}, async (t) => {
  if (!process.env.GEMINI_API_KEY) {
    t.skip('no GEMINI_API_KEY configured');
    return;
  }
  // Preflight: this test's whole point is proving live extraction quality,
  // not diagnosing infrastructure -- skip cleanly (not a false failure) if
  // the configured key genuinely cannot reach the model right now.
  try {
    const preflight = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    if (!preflight.ok) {
      t.skip(`GEMINI_API_KEY cannot reach the model (HTTP ${preflight.status}) -- see the downstream-pipeline test for LLM-independent coverage of the rest of this flow`);
      return;
    }
  } catch (error) {
    t.skip(`could not reach generativelanguage.googleapis.com to preflight the key: ${error instanceof Error ? error.message : error}`);
    return;
  }

  process.env.DATABASE_URL = databaseUrl;
  // Both default to false (apps/backend/src/config/askOperationalControls.ts)
  // -- neither this repo's docker-compose.yml nor .env.local sets them, so
  // conversational capture is OFF in the running local stack today unless a
  // caller opts in explicitly, exactly as this test does.
  process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED = 'true';

  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { createAskExecution } = require('../../src/services/ask/askOrchestrator.service.ts');

  const id = `acc-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const homeowner = await prisma.user.create({
    data: {
      email: `${id}-homeowner@example.invalid`,
      firstName: 'Capture', lastName: 'LiveSmoke', role: 'HOMEOWNER',
      passwordHash: 'acceptance-only-not-a-login',
      homeownerProfile: { create: {} },
    },
  });

  try {
    const homeownerProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { userId: homeowner.id } });
    const property = await prisma.property.create({
      data: { homeownerProfileId: homeownerProfile.id, address: `${id} Roof St`, city: 'Testville', state: 'TX', zipCode: '00000', timezone: 'America/Chicago' },
    });

    const parent = await createAskExecution(homeowner.id, {
      clientRequestId: `${id}-turn`,
      sessionId: `${id}-session`,
      message: 'I replaced my roof last summer for $14,500.',
      propertyId: property.id,
    });
    assert.ok(parent.executionId, 'expected a real parent AskExecution to be created for an ordinary turn');

    // runConversationalCaptureForTurn's own inline attempt races a 1.5s
    // response budget it can lose to a real LLM call, but the attempt
    // itself keeps running in this same Node process regardless (no
    // cancellation, no separate worker needed here) -- poll instead of
    // trusting the immediate response.
    const POLL_INTERVAL_MS = 1_000;
    const POLL_TIMEOUT_MS = 60_000;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let child = null;
    while (Date.now() < deadline) {
      child = await prisma.askExecution.findFirst({
        where: { parentExecutionId: parent.executionId, operationId: 'CAPTURE_EVENT_CONFIRM' },
      });
      if (child) break;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    assert.ok(child, 'expected a real Gemini extraction of "I replaced my roof last summer for $14,500." to produce a CAPTURE_EVENT_CONFIRM child execution within 60s');
    assert.equal(child.parametersJson.datePrecision, 'RANGE', `expected RANGE date precision for "last summer" from the live model, got ${child.parametersJson.datePrecision}`);
    assert.match(String(child.parametersJson.title).toLowerCase(), /roof/, 'expected the live model to title the event around "roof"');
    assert.equal(Math.round(Number(child.parametersJson.amount)), 14500, `expected the live model to extract amount 14500, got ${child.parametersJson.amount}`);
  } finally {
    await prisma.user.delete({ where: { id: homeowner.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
