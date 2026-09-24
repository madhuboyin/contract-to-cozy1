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
// Side-effect import: askOrchestrator.service.ts registers its 86 handlers
// against the capability registry at module load, exactly as index.ts's own
// production bootstrap does before running validateCapabilityHandlerRegistry.
require('../../src/services/ask/askOrchestrator.service.ts');

test('every one of the 86 Ask operations resolves to a registered capability handler', () => {
  const operationIds = Object.keys(ASK_OPERATION_DEFINITIONS);
  // 67 from Phase 1's original inventory + CAPTURE_FACT_CONFIRM/
  // CAPTURE_EVENT_CONFIRM (Phase 2, implementation plan §8; FRD §19/§20) +
  // CAPTURE_WARRANTY_CONFIRM (Phase 3 warranty capture writer, §9/§22) +
  // SELL_HOLD_RENT_GOAL_CAPTURE (Phase 6, implementation plan §12; FRD §21) +
  // SELLER_PREP_CHECKLIST + SELLER_PREP_ITEM_DECISION + COVERAGE_COMPARISON_STATUS
  // + DOCUMENT_LOOKUP + MAINTENANCE_FORECAST (Phase 7, implementation plan
  // §13; FRD §31) + CAPTURE_EVIDENCE_CONFIRM (Phase 2 external review,
  // §8/§4.2; FRD §23) + HOME_EVENT_RADAR_FEED (capability-card audit,
  // Appendix D, second reference journey, 2026-09-22).
  // + HOME_EVENT_RADAR_STATE/MARK_DONE/FEEDBACK (Home Event Radar writes, FRD v1.40, 2026-09-22).
  // + HOME_EVENT_RADAR_TASK/PREFERENCES (FRD v1.41).
  assert.equal(operationIds.length, 110);
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
  assert.match(orchestrator, /dispatchOperationAdapter\(input, composedContext, trace, propertyAccess\)/);
});

test('capabilityInvoke enforces operational and property-authorization policy itself, not just the orchestrator caller', () => {
  // Review finding: calling a disabled operation directly through
  // capabilityInvoke() previously still executed and returned ANSWERED,
  // because policy/authorization checks lived only in the orchestrator's
  // executeOperationCore, never inside the reusable invocation layer
  // itself. Both checks must now be enforced by capabilityInvoke() with no
  // orchestrator involved at all.
  const registry = readFileSync(resolve(__dirname, '../../src/services/ask/capabilityHandlerRegistry.ts'), 'utf8');
  const invokeStart = registry.indexOf('async function invokeGuarded(');
  assert.ok(invokeStart >= 0);
  assert.match(registry, /export function capabilityInvoke\(/);
  assert.match(registry.slice(invokeStart), /controls\.operationEnabled\(operationId\)/);
  assert.match(registry.slice(invokeStart), /HOUSEHOLD_ROLE_RANK\[access\.role\] < HOUSEHOLD_ROLE_RANK\[authorizationFloor\]/);
});
