// BICC-TRN-005/006/007: workload limits by identity and scope with an exact retry window, and the latency classes.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { AskWorkloadGate, DEFAULT_WORKLOAD_LIMITS, workloadLimitsFromEnv, workloadRefusalMessage } = require('../../src/services/ask/support/workloadLimits.ts');
const { classifyLatency, LATENCY_CLASSES } = require('../../src/services/ask/support/latencyClass.ts');

const small = () => new AskWorkloadGate({ ...DEFAULT_WORKLOAD_LIMITS, EXECUTION: { perUser: 2, perScope: 3, retryAfterSeconds: 7 } });

test('a person is refused past their own limit, with the exact wait, and nothing is taken by the refusal', () => {
  const gate = small();
  const a = gate.acquire('EXECUTION', 'u1', 'p1'); const b = gate.acquire('EXECUTION', 'u1', 'p1');
  assert.ok(a.granted && b.granted);
  const refused = gate.acquire('EXECUTION', 'u1', 'p1');
  assert.deepEqual([refused.granted, refused.reason, refused.retryAfterSeconds, refused.workloadClass], [false, 'USER_LIMIT', 7, 'EXECUTION']);
  assert.deepEqual(gate.inFlight('EXECUTION', 'u1', 'p1'), { user: 2, scope: 2 }, 'a refusal holds nothing');
});

test('one person cannot starve another, and a household scope has its own limit across members', () => {
  const gate = small();
  assert.ok(gate.acquire('EXECUTION', 'u1', 'p1').granted && gate.acquire('EXECUTION', 'u1', 'p1').granted);
  assert.ok(gate.acquire('EXECUTION', 'u2', 'p1').granted, 'another person is unaffected by u1 being at their limit');
  const refused = gate.acquire('EXECUTION', 'u3', 'p1');
  assert.deepEqual([refused.granted, refused.reason], [false, 'SCOPE_LIMIT']);
  assert.ok(gate.acquire('EXECUTION', 'u3', 'p2').granted, 'a different home is not affected');
  assert.ok(gate.acquire('EXECUTION', 'u4', null).granted, 'a request with no home is limited per person only');
});

test('releasing frees exactly one unit, and a double release cannot free someone else\'s', () => {
  const gate = small();
  const a = gate.acquire('EXECUTION', 'u1', 'p1'); const b = gate.acquire('EXECUTION', 'u1', 'p1');
  a.release(); a.release(); a.release();
  assert.deepEqual(gate.inFlight('EXECUTION', 'u1', 'p1'), { user: 1, scope: 1 });
  assert.ok(gate.acquire('EXECUTION', 'u1', 'p1').granted);
  assert.equal(gate.acquire('EXECUTION', 'u1', 'p1').granted, false, 'b still holds its unit');
  b.release();
});

test('classes are independent: attachment analysis does not use up execution capacity', () => {
  const gate = small();
  gate.acquire('EXECUTION', 'u1', 'p1'); gate.acquire('EXECUTION', 'u1', 'p1');
  assert.ok(gate.acquire('ATTACHMENT_ANALYSIS', 'u1', 'p1').granted);
  assert.ok(gate.acquire('MODEL_CALL', 'u1', 'p1').granted);
});

test('every declared class has limits and a non-zero retry window, and the defaults are sane', () => {
  for (const [name, limit] of Object.entries(DEFAULT_WORKLOAD_LIMITS)) {
    assert.ok(limit.perUser >= 1 && limit.perScope >= limit.perUser && limit.retryAfterSeconds >= 1, name);
  }
  assert.deepEqual(Object.keys(DEFAULT_WORKLOAD_LIMITS).sort(), ['ATTACHMENT_ANALYSIS', 'EXECUTION', 'EXPENSIVE_OPERATION', 'MODEL_CALL']);
});

test('environment overrides apply, and a malformed or non-positive one is ignored rather than read as unlimited', () => {
  const limits = workloadLimitsFromEnv({ ASK_MAX_EXECUTION_PER_USER: '6', ASK_MAX_EXECUTION_PER_SCOPE: '0', ASK_MAX_MODEL_CALL_PER_USER: 'many', ASK_MAX_ATTACHMENT_ANALYSIS_PER_USER: '-3', ASK_MAX_EXPENSIVE_OPERATION_PER_USER: '1.5' });
  assert.equal(limits.EXECUTION.perUser, 6);
  assert.equal(limits.EXECUTION.perScope, DEFAULT_WORKLOAD_LIMITS.EXECUTION.perScope);
  assert.equal(limits.MODEL_CALL.perUser, DEFAULT_WORKLOAD_LIMITS.MODEL_CALL.perUser);
  assert.equal(limits.ATTACHMENT_ANALYSIS.perUser, DEFAULT_WORKLOAD_LIMITS.ATTACHMENT_ANALYSIS.perUser);
  assert.equal(limits.EXPENSIVE_OPERATION.perUser, DEFAULT_WORKLOAD_LIMITS.EXPENSIVE_OPERATION.perUser);
});

test('the refusal sentence says what happened, that the question is kept, and the exact wait', () => {
  const user = workloadRefusalMessage({ granted: false, reason: 'USER_LIMIT', workloadClass: 'EXECUTION', retryAfterSeconds: 5 });
  assert.match(user, /still working on your earlier requests/);
  assert.match(user, /question is kept/i);
  assert.match(user, /about 5 seconds/);
  assert.match(workloadRefusalMessage({ granted: false, reason: 'SCOPE_LIMIT', workloadClass: 'EXECUTION', retryAfterSeconds: 1 }), /requests for this home[\s\S]*about 1 second\./);
});

test('the controller refuses before creating anything, names the wait in Retry-After and the body, and always releases the slot', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/controllers/ask.controller.ts'), 'utf8');
  const body = source.slice(source.indexOf('export async function postAskExecution('), source.indexOf('export async function postAskExecutionRetry'));
  assert.ok(body.indexOf('askWorkloadGate.acquire') > 0 && body.indexOf('askWorkloadGate.acquire') < body.indexOf('createAskExecution('), 'the gate comes before any execution is created');
  assert.match(body, /status\(429\)[\s\S]{0,260}ASK_CAPACITY_EXCEEDED[\s\S]{0,200}retryAfterSeconds[\s\S]{0,80}draftPreserved: true/);
  assert.match(body, /setHeader\('Retry-After'/);
  assert.match(body, /finally \{[\s\S]{0,80}stop\.release\(\);[\s\S]{0,40}slot\.release\(\);/);
});

test('each turn lands in exactly one latency class, in order of precedence', () => {
  assert.equal(classifyLatency({}), 'DETERMINISTIC_READ');
  assert.equal(classifyLatency({ modelPlanned: true }), 'MODEL_PLANNED_READ');
  assert.equal(classifyLatency({ composed: true, modelPlanned: true }), 'COMPOSED_READ');
  assert.equal(classifyLatency({ attachment: true, composed: true }), 'ATTACHMENT_ANALYSIS');
  assert.equal(classifyLatency({ confirmation: true, attachment: true, composed: true, modelPlanned: true }), 'CONSEQUENTIAL_CONFIRMATION');
  assert.deepEqual([...LATENCY_CLASSES].sort(), ['ATTACHMENT_ANALYSIS', 'COMPOSED_READ', 'CONSEQUENTIAL_CONFIRMATION', 'DETERMINISTIC_READ', 'MODEL_PLANNED_READ']);
});
