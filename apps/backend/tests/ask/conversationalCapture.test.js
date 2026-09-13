const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { runConversationalCaptureForTurn } = require('../../src/services/ask/conversationalUnderstanding/conversationalCapture.ts');

// Ask Cozy Stage 3, Phase 3 (implementation plan §9's extraction-trigger call
// site; FRD §10, §13). Runtime tests cover only the early-exit paths that
// return before ever touching the database (flag off, explicit dedup skip,
// pre-filter non-fire) -- these are genuinely pure/no-I/O up to that point,
// same reasoning as extractionPreFilter.test.js. Anything past the first
// DomainEvent write has no DB-mock harness in this codebase (same
// established gap as capturePropertyFact.ts/getPropertyContext.ts -- see
// captureConfirmWriteSafety.test.js's header) and is instead covered by the
// source-governance tests below.

test('returns no children when the feature flag is off, without touching the database', async () => {
  delete process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED;
  const result = await runConversationalCaptureForTurn({
    userId: 'user-1', sessionId: 'session-1', propertyId: 'property-1', parentExecutionId: 'execution-1',
    message: 'I replaced the roof last summer for $14,500.', contextVersion: null, skipDueToRoutedCapture: false,
  });
  assert.deepEqual(result, []);
});

test('returns no children when the caller signals the routed operation already captured this turn (dedup), even with the flag on', async () => {
  process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED = 'true';
  try {
    const result = await runConversationalCaptureForTurn({
      userId: 'user-1', sessionId: 'session-1', propertyId: 'property-1', parentExecutionId: 'execution-1',
      message: 'I replaced the roof last summer for $14,500.', contextVersion: null, skipDueToRoutedCapture: true,
    });
    assert.deepEqual(result, []);
  } finally {
    delete process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED;
  }
});

test('returns no children when the pre-filter does not fire, even with the flag on', async () => {
  process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED = 'true';
  try {
    const result = await runConversationalCaptureForTurn({
      userId: 'user-1', sessionId: 'session-1', propertyId: 'property-1', parentExecutionId: 'execution-1',
      message: 'Should I refinance?', contextVersion: null, skipDueToRoutedCapture: false,
    });
    assert.deepEqual(result, []);
  } finally {
    delete process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED;
  }
});

const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

test('the extraction-trigger call site is independent of the routed answer (FRD §10) -- wrapped in its own try/catch so a capture-side failure cannot affect the turn\'s response', () => {
  const idx = orchestratorSource.indexOf('runConversationalCaptureForTurn({');
  assert.ok(idx > 0);
  const before = orchestratorSource.slice(Math.max(0, idx - 400), idx);
  assert.match(before, /try \{/);
  const after = orchestratorSource.slice(idx, idx + 900);
  assert.match(after, /catch \(error\) \{/);
});

test('the extraction-trigger call site skips when routing still needs clarification or the routed turn is itself awaiting confirmation', () => {
  const idx = orchestratorSource.indexOf('runConversationalCaptureForTurn({');
  const guardStart = orchestratorSource.lastIndexOf('if (', idx);
  const guard = orchestratorSource.slice(guardStart, idx);
  assert.match(guard, /!routingDecision\.requiresClarification/);
  assert.match(guard, /result\.status !== 'NEEDS_CONFIRMATION'/);
});

test('skipDueToRoutedCapture is derived from the routed operation completing a material write this same turn, not from operationId alone', () => {
  const idx = orchestratorSource.indexOf('skipDueToRoutedCapture:');
  assert.ok(idx > 0);
  const line = orchestratorSource.slice(idx, orchestratorSource.indexOf('\n', idx));
  assert.match(line, /operationDefinition\.safetyClass === 'MATERIAL_DECISION'/);
  assert.match(line, /result\.status === 'COMPLETED'/);
});

test('mapPersistedExecution threads childExecutions through, defaulting to empty for every other call site', () => {
  const idx = orchestratorSource.indexOf('function mapPersistedExecution(');
  assert.ok(idx > 0);
  const signature = orchestratorSource.slice(idx, orchestratorSource.indexOf('): AskExecutionResponse {', idx));
  assert.match(signature, /childExecutions: AskExecutionResponse\[\] = \[\]/);
});
