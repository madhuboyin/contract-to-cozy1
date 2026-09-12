const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const {
  capabilityInvoke,
  validateCapabilityHandlerRegistry,
} = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskCapabilityHandlerMissingError } = require('../../src/services/ask/capabilityInvocation.contract.ts');
// Side-effect import: askOrchestrator.service.ts registers its 67 handlers
// against the capability registry at module load, exactly as index.ts's own
// production bootstrap does before running validateCapabilityHandlerRegistry.
require('../../src/services/ask/askOrchestrator.service.ts');

test('every one of the 67 Ask operations resolves to a registered capability handler', () => {
  const operationIds = Object.keys(ASK_OPERATION_DEFINITIONS);
  assert.equal(operationIds.length, 67);
  assert.deepEqual(validateCapabilityHandlerRegistry(), []);
});

test('capabilityInvoke dispatches the boundary (no-DB) operations end to end through the registry', async () => {
  const emergency = await capabilityInvoke('EMERGENCY_BOUNDARY', {
    userId: 'u1', sessionId: 's1', executionId: 'e1', message: 'help, gas leak',
  });
  assert.equal(emergency.status, 'BLOCKED');
  assert.ok(emergency.blocks.some((block) => block.type === 'BOUNDARY'));

  const unsafe = await capabilityInvoke('UNSAFE_RESTRICTED_BOUNDARY', {
    userId: 'u1', sessionId: 's1', executionId: 'e1', message: 'anything unsafe',
  });
  assert.equal(unsafe.status, 'BLOCKED');

  const outOfScope = await capabilityInvoke('OUT_OF_SCOPE_BOUNDARY', {
    userId: 'u1', sessionId: 's1', executionId: 'e1', message: 'unrelated question',
  });
  assert.equal(outOfScope.status, 'OUT_OF_SCOPE');
});

test('AskCapabilityHandlerMissingError carries the existing ASK_TYPED_RESULT error contract', () => {
  const error = new AskCapabilityHandlerMissingError('PROPERTY_SUMMARY', 'property.summary');
  assert.equal(error.errorContract, 'ASK_TYPED_RESULT');
  assert.equal(error.operationId, 'PROPERTY_SUMMARY');
  assert.equal(error.adapterKey, 'property.summary');
  assert.match(error.message, /ASK_CAPABILITY_HANDLER_MISSING/);
});

test('propose-time dispatch no longer branches on operationId inside askOrchestrator.service.ts', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  assert.equal(orchestrator.includes('switch (input.operation.operationId)'), false);
  const dispatchStart = orchestrator.indexOf('async function dispatchOperationAdapterResult(');
  assert.ok(dispatchStart >= 0);
  const dispatchBody = orchestrator.slice(dispatchStart, dispatchStart + 800);
  assert.match(dispatchBody, /capabilityInvoke\(input\.operation\.operationId, buildCapabilityInvocationEnvelope\(input\), deps\)/);
  // Every operation still goes through the one existing dispatch wrapper
  // (dispatchOperationAdapter) that attaches authoritative source evidence.
  assert.match(orchestrator, /dispatchOperationAdapter\(input, composedContext, trace\)/);
});
