const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

// C2C Intelligence & Agentic Evolution Phase 2 / PR 9 — schema-level guarantees
// for the agent runtime tables (implementation plan §7.2; IPD-003 retention,
// IPD-007 run lifecycle).

const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');

function model(name) {
  const start = schema.indexOf(`model ${name} {`);
  assert.ok(start >= 0, `model ${name} is defined`);
  return schema.slice(start, schema.indexOf('\n}', start) + 2);
}

test('AgentRun is an immutable single terminal insert (IPD-007): no RUNNING state, no updatedAt', () => {
  const agentRun = model('AgentRun');
  assert.match(agentRun, /idempotencyKey\s+String\s+@unique/);
  assert.match(agentRun, /outcome\s+AgentRunOutcome/);
  assert.doesNotMatch(agentRun, /updatedAt/);
  assert.doesNotMatch(agentRun, /\bstatus\b/);

  const outcome = schema.slice(schema.indexOf('enum AgentRunOutcome {'));
  assert.match(outcome, /COMPLETED[\s\S]*ABSTAINED[\s\S]*PAUSED[\s\S]*FAILED/);
  assert.doesNotMatch(outcome.slice(0, outcome.indexOf('}')), /RUNNING/);
});

test('the reservation carries the idempotency key and a nullable unique result link', () => {
  const reservation = model('AgentRunReservation');
  assert.match(reservation, /idempotencyKey\s+String\s+@unique/);
  assert.match(reservation, /resultRunId\s+String\?\s+@unique/);
  assert.match(reservation, /leaseExpiresAt\s+DateTime/);
  assert.match(reservation, /expiresAt\s+DateTime/);
  assert.match(reservation, /onDelete: Cascade/);
});

test('every runtime table carries a fixed retention expiresAt and indexes it', () => {
  for (const name of ['AgentRun', 'AgentRunReservation', 'AgentState', 'ToolInvocation', 'LlmInvocation']) {
    const body = model(name);
    assert.match(body, /expiresAt\s+DateTime/, `${name}.expiresAt`);
    assert.match(body, /@@index\(\[expiresAt\]\)/, `${name} indexes expiresAt`);
  }
});

test('AgentState is one-per-run, CAS-versioned, with a functional pause clock plus retention clock', () => {
  const state = model('AgentState');
  assert.match(state, /runId\s+String\s+@unique/);
  assert.match(state, /casVersion\s+Int/);
  assert.match(state, /pauseExpiresAt\s+DateTime/);
  assert.match(state, /resolvedAt\s+DateTime\?/);
  assert.match(state, /run\s+AgentRun\s+@relation\([^)]*onDelete: Cascade/);
});

test('invocation tables are bounded: hashes and references only, never raw prompts or context', () => {
  const tool = model('ToolInvocation');
  const llm = model('LlmInvocation');
  assert.match(tool, /inputHash\s+String/);
  assert.match(tool, /redactionVersion\s+String/);
  assert.match(llm, /promptHash\s+String/);
  assert.match(llm, /redactionVersion\s+String/);
  for (const body of [tool, llm]) {
    assert.doesNotMatch(body, /prompt\s+String|promptText|rawPrompt|transcript|contextJson|serializedContext|secret/i);
    assert.match(body, /run\s+AgentRun\s+@relation\([^)]*onDelete: Cascade/);
  }
});

test('AgentRun cascades to every child as a structural retention backstop', () => {
  const agentRun = model('AgentRun');
  assert.match(agentRun, /state\s+AgentState\?/);
  assert.match(agentRun, /toolInvocations\s+ToolInvocation\[\]/);
  assert.match(agentRun, /llmInvocations\s+LlmInvocation\[\]/);
  assert.match(agentRun, /reservation\s+AgentRunReservation\?/);
});
