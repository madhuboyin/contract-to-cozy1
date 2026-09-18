const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// P03 fix (docs/architecture/ASK_COZY_PHASE8_PROTECTION_ACCEPTANCE_VERIFICATION.md,
// per the audit's own recommended contrast with MAINTENANCE_TASK_CREATE):
// claimFileResult previously lost the entire original message when the
// incident type couldn't be parsed, via durableFreeTextClarification (no
// field for the original text). It now uses a real captureRequests GROUP
// form (CLAIM_FILE_INPUTS) with currentAnswer pre-filling whatever was
// already extracted, same as Maintenance's own richer pattern.
const { claimFileResult, ClaimFileWorkflowInputSchema } = require('../../src/services/ask/askOrchestrator.service.ts');

test('an unrecognized incident type returns a captureRequests form, not a free-text clarification that discards the message', async () => {
  const message = 'Something strange happened overnight and there was an odd smell in the hallway this morning.';
  const result = await claimFileResult('property-1', message);
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.reasonCode, 'CLAIM_TYPE_REQUIRED');
  assert.equal(result.clarification, undefined);
  assert.equal(result.captureRequests.length, 1);
  const request = result.captureRequests[0];
  assert.equal(request.captureKey, 'CLAIM_FILE_INPUTS');
  assert.equal(request.currentAnswer.description, message);
  assert.equal(request.currentAnswer.title, undefined);
  const typeField = request.inputSchema.fields.find((field) => field.key === 'type');
  assert.equal(typeField.required, true);
  assert.equal(typeField.inputSchema.options.length, 10);
});

test('an explicit "titled X" phrase in the unrecognized message is retained as the pre-filled title', async () => {
  const message = 'Something strange happened, titled Odd hallway smell. Not sure what category this is.';
  const result = await claimFileResult('property-1', message);
  const request = result.captureRequests[0];
  assert.equal(request.currentAnswer.title, 'Odd hallway smell');
  assert.equal(request.currentAnswer.description, message);
});

test('a message with a recognized incident type still goes straight to NEEDS_CONFIRMATION, unaffected by the capture-form fix', async () => {
  const result = await claimFileResult('property-1', 'Water damage in the basement from a burst pipe.');
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.reasonCode, 'CLAIM_FILE_CONFIRMATION_REQUIRED');
  assert.equal(result.parameters.claimType, 'WATER_DAMAGE');
  assert.equal(result.captureRequests, undefined);
});

test('resuming with a suppliedInput answer (post-capture-form submission) builds the confirmation from the structured answer, not by re-parsing the original message', async () => {
  const originalMessage = 'Something happened, not sure what category, titled Old title.';
  const result = await claimFileResult('property-1', originalMessage, {
    type: 'PLUMBING', title: 'Kitchen sink leak', description: 'The kitchen sink pipe burst and flooded the cabinet below.',
  });
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.parameters.claimType, 'PLUMBING');
  assert.equal(result.parameters.claimTitle, 'Kitchen sink leak');
  assert.equal(result.parameters.claimDescription, 'The kitchen sink pipe burst and flooded the cabinet below.');
});

test('resuming with a suppliedInput answer that omits an optional title derives one from the incident type label, not the original message', async () => {
  const result = await claimFileResult('property-1', 'unrelated original message', {
    type: 'HVAC', description: 'The furnace stopped producing heat overnight.',
  });
  assert.equal(result.parameters.claimTitle, 'HVAC claim');
});

test('ClaimFileWorkflowInputSchema requires type and description but not title', () => {
  assert.equal(ClaimFileWorkflowInputSchema.safeParse({ type: 'FIRE_SMOKE', description: 'Kitchen fire.' }).success, true);
  assert.equal(ClaimFileWorkflowInputSchema.safeParse({ description: 'Kitchen fire.' }).success, false);
  assert.equal(ClaimFileWorkflowInputSchema.safeParse({ type: 'FIRE_SMOKE' }).success, false);
  assert.equal(ClaimFileWorkflowInputSchema.safeParse({ type: 'NOT_A_REAL_TYPE', description: 'x' }).success, false);
});
