const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// B06 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md).
// Pure, extracted for direct unit testing, same convention as
// maintenanceConflictDescription's own shape -- mirrors its "already
// completed/cancelled" special cases and "current status, priority, due
// date" fallback, adapted to Buyer's own enums. Not independently tested
// at the confirmBuyerTaskUpdate/confirmBuyerTaskComplete/
// confirmBuyerFindingDisposition call-site level -- those compose a live
// Prisma lookup, same STATIC-verification boundary applied throughout this
// audit series.
const { buyerTaskConflictDescription, buyerFindingConflictDescription } = require('../../src/services/ask/askOrchestrator.service.ts');

test('a completed task names the completion explicitly, not a generic "changed" message', () => {
  const message = buyerTaskConflictDescription({ title: 'Order inspection', status: 'COMPLETED', priority: 'NOW', dueAt: null });
  assert.match(message, /"Order inspection" was already completed in another session/);
});

test('a cancelled task names the cancellation explicitly', () => {
  const message = buyerTaskConflictDescription({ title: 'Sign disclosure', status: 'CANCELLED', priority: 'PLAN', dueAt: null });
  assert.match(message, /"Sign disclosure" was cancelled in another session/);
});

test('a task marked not needed names that explicitly', () => {
  const message = buyerTaskConflictDescription({ title: 'Order survey', status: 'NOT_NEEDED', priority: 'CONSIDER', dueAt: null });
  assert.match(message, /"Order survey" was marked not needed in another session/);
});

test('an in-progress task with a due date interpolates its real current status, priority, and date', () => {
  const message = buyerTaskConflictDescription({ title: 'Review title report', status: 'IN_PROGRESS', priority: 'SOON', dueAt: new Date('2026-10-01T00:00:00.000Z') });
  assert.match(message, /"Review title report" changed in another session/);
  assert.match(message, /is now in progress/);
  assert.match(message, /soon priority/);
  assert.match(message, /due/);
});

test('a blocked task with no due date is disclosed as unscheduled, not a fabricated date', () => {
  const message = buyerTaskConflictDescription({ title: 'Coordinate movers', status: 'BLOCKED', priority: 'PLAN', dueAt: null });
  assert.match(message, /is now blocked/);
  assert.match(message, /unscheduled/);
});

test('a finding\'s conflict message names its current disposition, not a generic "changed" message', () => {
  const message = buyerFindingConflictDescription({ homeSystem: 'Roof', subsystem: 'Flashing', buyerDisposition: 'PRE_CLOSE_NEGOTIATION' });
  assert.match(message, /"Roof Flashing" changed in another session/);
  assert.match(message, /now classified as seller negotiation/);
});

test('a finding with no subsystem still names the home system alone, and an unrecognized disposition falls back to its raw value rather than throwing', () => {
  const message = buyerFindingConflictDescription({ homeSystem: 'Electrical', subsystem: null, buyerDisposition: 'SOME_FUTURE_DISPOSITION' });
  assert.match(message, /"Electrical" changed in another session/);
  assert.match(message, /now classified as SOME_FUTURE_DISPOSITION/);
});
