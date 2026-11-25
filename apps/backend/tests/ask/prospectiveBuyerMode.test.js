require('ts-node/register');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CreateAskExecutionRequestSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const base = { clientRequestId: 'r1', sessionId: 's1', message: 'hello' };

test('BICC-D42: lifecycleMode accepts only PROSPECTIVE_BUYER, null or omitted', () => {
  assert.equal(CreateAskExecutionRequestSchema.safeParse(base).success, true);
  assert.equal(CreateAskExecutionRequestSchema.safeParse({ ...base, lifecycleMode: null }).success, true);
  assert.equal(CreateAskExecutionRequestSchema.safeParse({ ...base, lifecycleMode: 'PROSPECTIVE_BUYER' }).success, true);
  for (const bad of ['HOMEOWNER', 'UNDER_CONTRACT_BUYER', 'BUYER', '', 'prospective_buyer', 1, true]) {
    assert.equal(CreateAskExecutionRequestSchema.safeParse({ ...base, lifecycleMode: bad }).success, false, String(bad));
  }
});

test('BICC-D42 (STATIC): the mode is stored on the session and never derived from message text or granting a property', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  assert.match(src, /lifecycleMode: input\.lifecycleMode \?\? null/);
  assert.match(src, /input\.lifecycleMode !== undefined/);
  // the only place lifecycleMode is read for behavior is the session value, not the message
  assert.doesNotMatch(src, /PROSPECTIVE_BUYER'[^\n]*(message|routingMessage)\)/);
  // propertyId resolution does not mention the mode
  assert.doesNotMatch(src.split('executionPropertyId = ')[1].split('\n')[0], /lifecycleMode/);
});

test('BICC-D42 (STATIC): the session read returns the stored mode, only ever as PROSPECTIVE_BUYER or null', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../src', p), 'utf8');
  assert.match(read('controllers/ask.controller.ts'), /data: \{ executions, lifecycleMode \}/);
  const svc = read('services/ask/execution/askSessions.ts');
  assert.match(svc, /where: \{ id: sessionId, userId \}, select: \{ lifecycleMode: true \}/);
  assert.match(svc, /=== 'PROSPECTIVE_BUYER' \? 'PROSPECTIVE_BUYER' : null/);
});
