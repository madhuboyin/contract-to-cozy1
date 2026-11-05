const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');

require('ts-node/register/transpile-only');

// Findings Implementation Plan, Phase 3: the Ask turn performance contract. Every stage is defined, labels stay bounded, and the instrumentation
// in the lifecycle files matches the definitions. No latency target is asserted anywhere: those come from measured evidence.
const metrics = require('../../src/lib/metrics.ts');
const contractModule = require('../../src/services/ask/askTurnStageContract.ts');
const { ASK_TURN_STAGES, ASK_INLINE_EXTRACTION_OUTCOMES } = metrics;
const { ASK_TURN_STAGE_CONTRACT, ASK_TURN_ADDITIVE_STAGES, ASK_TURN_METRIC_LABELS, ASK_TURN_UNMEASURED } = contractModule;

const SRC = resolve(__dirname, '../../src');
const create = readFileSync(join(SRC, 'services/ask/execution/createAskExecution.ts'), 'utf8');
const executeOperation = readFileSync(join(SRC, 'services/ask/execution/executeOperation.ts'), 'utf8');
const capture = readFileSync(join(SRC, 'services/ask/conversationalUnderstanding/conversationalCapture.ts'), 'utf8');

test('every stage has exactly one contract definition, and the contract defines nothing else', () => {
  assert.deepEqual(Object.keys(ASK_TURN_STAGE_CONTRACT).sort(), [...ASK_TURN_STAGES].sort());
  assert.equal(new Set(ASK_TURN_STAGES).size, ASK_TURN_STAGES.length, 'no duplicate stage');
  for (const [stage, definition] of Object.entries(ASK_TURN_STAGE_CONTRACT)) {
    for (const field of ['start', 'end', 'includes']) assert.ok(definition[field].trim().length > 10, `${stage}.${field} is a real definition`);
    if (definition.kind === 'NESTED' || definition.kind === 'CONCURRENT_SPAN') {
      assert.ok(ASK_TURN_STAGES.includes(definition.overlaps), `${stage} names the stage it overlaps`);
      assert.equal(definition.additive, false, `${stage} must not be summed with the stage it overlaps`);
    } else {
      assert.equal(definition.overlaps, undefined, `${stage} overlaps nothing`);
    }
    if (definition.kind.startsWith('ELAPSED_')) assert.equal(definition.additive, false, `${stage} is cumulative, so it is not additive`);
  }
});

test('the cumulative clocks are the three that are not additive, and only REQUEST_TOTAL and FAILED_REQUEST_TOTAL include request setup', () => {
  const cumulative = ASK_TURN_STAGES.filter((stage) => ASK_TURN_STAGE_CONTRACT[stage].kind.startsWith('ELAPSED_')).sort();
  assert.deepEqual(cumulative, ['DURABLE_BASE_RESULT', 'FAILED_REQUEST_TOTAL', 'REQUEST_TOTAL', 'TURN_TOTAL']);
  const fromRequestStart = ASK_TURN_STAGES.filter((stage) => ASK_TURN_STAGE_CONTRACT[stage].kind === 'ELAPSED_FROM_REQUEST_START').sort();
  assert.deepEqual(fromRequestStart, ['FAILED_REQUEST_TOTAL', 'REQUEST_TOTAL']);
  assert.match(ASK_TURN_STAGE_CONTRACT.TURN_TOTAL.includes, /EXCLUDES REQUEST_SETUP/);
});

test('the additive stages are exactly the consecutive marks of the execution phase plus request setup', () => {
  assert.deepEqual(
    [...ASK_TURN_ADDITIVE_STAGES].sort(),
    ['ACTIONS_FINALIZE', 'INLINE_EXTRACTION', 'PERSIST_BASE', 'POST_PERSIST_EVENTS', 'PROPERTY_SUMMARY', 'REQUEST_SETUP', 'ROUTE_AND_EXECUTE', 'SYNTHESIS', 'TRUST_VALIDATION'],
  );
  // Every additive execution-phase stage except setup is a markStage call, in this order, and nothing else is marked.
  const marked = [...create.matchAll(/markStage\('([A-Z_]+)'/g)].map((match) => match[1]);
  assert.deepEqual(marked, ['ROUTE_AND_EXECUTE', 'SYNTHESIS', 'ACTIONS_FINALIZE', 'TRUST_VALIDATION', 'PERSIST_BASE', 'POST_PERSIST_EVENTS', 'INLINE_EXTRACTION', 'PROPERTY_SUMMARY']);
});

test('every stage the code observes is a contract stage, and every contract stage is observed', () => {
  const observed = new Set();
  for (const source of [create, executeOperation]) {
    for (const match of source.matchAll(/askTurnStageDurationSeconds\.observe\(\{ stage: '([A-Z_]+)'/g)) observed.add(match[1]);
    for (const match of source.matchAll(/markStage\('([A-Z_]+)'/g)) observed.add(match[1]);
  }
  assert.deepEqual([...observed].sort(), [...ASK_TURN_STAGES].sort());
});

test('the clocks start where the contract says they start', () => {
  assert.match(create, /export async function createAskExecution\([^)]*\): Promise<AskExecutionResponse> \{\n  \/\/[^\n]*\n  const requestStartedAt = Date\.now\(\);/, 'requestStartedAt is the first statement');
  assert.match(create, /const startedAt = Date\.now\(\);\n  let stageMark = startedAt;/, 'the execution clock starts at startedAt');
  assert.match(create, /stage: 'REQUEST_SETUP'[^\n]*\(startedAt - requestStartedAt\) \/ 1000/, 'setup is the gap between the two clocks');
  assert.match(create, /stage: 'TURN_TOTAL'[^\n]*\(Date\.now\(\) - startedAt\) \/ 1000/, 'TURN_TOTAL is measured from startedAt');
  assert.match(create, /stage: 'REQUEST_TOTAL'[^\n]*\(Date\.now\(\) - requestStartedAt\) \/ 1000/, 'REQUEST_TOTAL is measured from requestStartedAt');
  assert.match(create, /stage: 'FAILED_REQUEST_TOTAL'[^\n]*\(Date\.now\(\) - requestStartedAt\) \/ 1000/, 'the failure total is measured from requestStartedAt');
  assert.match(create, /stage: 'DURABLE_BASE_RESULT'[^\n]*\(Date\.now\(\) - startedAt\) \/ 1000/);
  const requestTotal = create.indexOf("stage: 'REQUEST_TOTAL'");
  assert.ok(requestTotal > create.indexOf("stage: 'TURN_TOTAL'") && requestTotal < create.indexOf('return mapPersistedExecution(reconciledParent ?? saved'), 'both totals are taken before the response is mapped');
  assert.match(executeOperation, /stage: 'SUGGESTION_FINALIZE'[^\n]*\(Date\.now\(\) - finalizeStartedAt\) \/ 1000/);
});

test('the property summary read is timed separately from the residual wait', () => {
  assert.match(create, /const propertySummaryStartedAt = Date\.now\(\);\n\s+const resolvedPropertyPromise = propertySummary\(executionPropertyId\)\.then/);
  assert.match(create, /stage: 'PROPERTY_SUMMARY_READ'[^\n]*\(Date\.now\(\) - propertySummaryStartedAt\) \/ 1000/);
  assert.match(ASK_TURN_STAGE_CONTRACT.PROPERTY_SUMMARY.includes, /NOT the cost of the property summary read/);
});

test('failure attribution carries only bounded labels', () => {
  assert.match(create, /askTurnFailuresTotal\.inc\(\{ after_stage: lastStageCompleted, timeout: errorCode === 'AskExecutionTimeoutError' \? 'true' : 'false' \}\)/);
  assert.match(create, /let lastStageCompleted: AskTurnStage = 'REQUEST_SETUP';/);
  assert.match(create, /lastStageCompleted = stage; \};/, 'every mark updates the last completed stage');
});

test('metric label names are fixed and never include an id, user, property, message or prompt', () => {
  assert.deepEqual(ASK_TURN_METRIC_LABELS, {
    ask_turn_stage_duration_seconds: ['stage', 'operation'],
    ask_turn_failures_total: ['after_stage', 'timeout'],
    ask_inline_extraction_total: ['outcome'],
  });
  const forbidden = /(?:^|_)(?:user|property|session|execution|entity|message|prompt|question|text|id)(?:$|_)/;
  for (const [metric, labels] of Object.entries(ASK_TURN_METRIC_LABELS)) {
    for (const label of labels) assert.doesNotMatch(label, forbidden, `${metric} label ${label}`);
  }
  assert.deepEqual(metrics.askTurnStageDurationSeconds.labelNames, ['stage', 'operation']);
  assert.deepEqual(metrics.askTurnFailuresTotal.labelNames, ['after_stage', 'timeout']);
  assert.deepEqual(metrics.askInlineExtractionTotal.labelNames, ['outcome']);
});

test('inline extraction outcomes are a closed set, each recorded at one site in the capture file', () => {
  assert.deepEqual([...ASK_INLINE_EXTRACTION_OUTCOMES], ['PREFILTER_MISS', 'INTENT_NOT_PERSISTED', 'COMPLETED', 'BUDGET_TIMEOUT', 'ATTEMPT_FAILED']);
  const used = new Set([...capture.matchAll(/askInlineExtractionTotal\.inc\(\{ outcome: ([^}]+) \}\)/g)].flatMap((match) => [...match[1].matchAll(/'([A-Z_]+)'/g)].map((value) => value[1])));
  assert.deepEqual([...used].sort(), [...ASK_INLINE_EXTRACTION_OUTCOMES].sort());
  assert.match(capture, /timedOut \? 'BUDGET_TIMEOUT' : attemptFailed \? 'ATTEMPT_FAILED' : 'COMPLETED'/);
});

test('the contract sets no latency target and states what it does not measure', () => {
  const source = readFileSync(join(SRC, 'services/ask/askTurnStageContract.ts'), 'utf8');
  assert.doesNotMatch(source, /\bp(?:50|95|99)\b\s*(?:<|<=|=|>|>=)\s*\d/i, 'no numeric percentile target');
  assert.ok(ASK_TURN_UNMEASURED.length >= 4);
  assert.ok(ASK_TURN_UNMEASURED.some((line) => /query-count/i.test(line)), 'the missing per-turn query count is stated');
  assert.ok(ASK_TURN_UNMEASURED.some((line) => /Idempotent replay/.test(line)));
});

test('a recorded stage observation lands in the registry with only its bounded labels', async () => {
  metrics.askTurnStageDurationSeconds.observe({ stage: 'REQUEST_SETUP', operation: 'PROPERTY_SUMMARY' }, 0.01);
  metrics.askTurnFailuresTotal.inc({ after_stage: 'REQUEST_SETUP', timeout: 'true' });
  metrics.askInlineExtractionTotal.inc({ outcome: 'BUDGET_TIMEOUT' });
  const text = await metrics.register.metrics();
  assert.match(text, /ask_turn_stage_duration_seconds_count\{stage="REQUEST_SETUP",operation="PROPERTY_SUMMARY"\} 1/);
  assert.match(text, /ask_turn_failures_total\{after_stage="REQUEST_SETUP",timeout="true"\} 1/);
  assert.match(text, /ask_inline_extraction_total\{outcome="BUDGET_TIMEOUT"\} 1/);
});
