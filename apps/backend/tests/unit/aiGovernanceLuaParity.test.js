const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');

require('ts-node/register/transpile-only');

// Findings Implementation Plan, Phase 5B: the Redis scripts and the TypeScript state machine are two implementations of one set of rules. This test
// EXECUTES the real script text under a Lua interpreter with a faked redis.call (hashes, TIME, INCR, PEXPIRE held in a Lua table) and checks every
// decision against the TypeScript implementation on the same scripted sequence.
//
// What this proves: the scripts' decision logic matches the state machine, and the scripts are syntactically valid Lua. What it does NOT prove: that
// Redis runs a script atomically, that Redis TIME behaves as faked here, or anything about a network. Those need tests/integration/aiGovernanceRedis.test.js
// against a real Redis. The interpreter is Lua 5.x (Redis embeds 5.1); the scripts use only constructs common to both, and the test skips if `lua` is absent.
const hasLua = spawnSync('lua', ['-v'], { encoding: 'utf8' }).status === 0;
const skip = hasLua ? false : 'no lua interpreter on PATH';

const { InMemoryAIGovernanceStore, RATE_WINDOW_LUA, CIRCUIT_ACQUIRE_LUA, CIRCUIT_RECORD_LUA } = require('../../src/lib/aiGovernanceStore.ts');

const config = { failureThreshold: 3, openMs: 1000, probeTtlMs: 500 };
const KEY_TTL = 3_600_000;

const steps = [
  ['ACQ', 'a'], ['REC', 'FAILURE', null], ['REC', 'FAILURE', null], ['REC', 'SUCCESS', null],
  ['REC', 'FAILURE', null], ['REC', 'FAILURE', null], ['REC', 'FAILURE', null],
  ['ACQ', 'b'], ['ADV', 400], ['ACQ', 'c'], ['REC', 'SUCCESS', null],
  ['ADV', 600], ['ACQ', 'p1'], ['ACQ', 'p2'], ['REC', 'SUCCESS', 'not-the-holder'],
  ['ADV', 500], ['ACQ', 'p3'], ['REC', 'SUCCESS', 'p1'], ['REC', 'FAILURE', 'p3'],
  ['ADV', 1000], ['ACQ', 'p4'], ['REC', 'SUCCESS', 'p4'], ['ACQ', 'z'],
];

const luaString = (value) => `[==[${value}]==]`;

function buildLuaProgram() {
  const lines = [`
local clock = 1000000
local hashes = {}
local counters = {}
local expires = {}
local expireCalls = {}
redis = {}
function redis.call(cmd, ...)
  local a = {...}
  if cmd == 'TIME' then return { tostring(math.floor(clock / 1000)), tostring((clock % 1000) * 1000) } end
  if cmd == 'HGET' then local h = hashes[a[1]]; if h and h[a[2]] ~= nil then return h[a[2]] end; return false end
  if cmd == 'HSET' then
    hashes[a[1]] = hashes[a[1]] or {}
    for i = 2, #a, 2 do hashes[a[1]][a[i]] = tostring(a[i + 1]) end
    return 1
  end
  if cmd == 'HDEL' then local h = hashes[a[1]]; if h then for i = 2, #a do h[a[i]] = nil end end; return 1 end
  if cmd == 'DEL' then hashes[a[1]] = nil; return 1 end
  if cmd == 'PEXPIRE' then expires[a[1]] = a[2]; expireCalls[a[1]] = (expireCalls[a[1]] or 0) + 1; return 1 end
  if cmd == 'INCR' then counters[a[1]] = (counters[a[1]] or 0) + 1; return counters[a[1]] end
  error('unfaked redis command ' .. tostring(cmd))
end
local function run(script, keys, argv)
  KEYS = keys; ARGV = argv
  local fn = assert(load(script))
  return fn()
end
local function show(result)
  if type(result) == 'table' then return tostring(result[1]) .. ':' .. tostring(result[2]) end
  return tostring(result)
end
local acquire = ${luaString(CIRCUIT_ACQUIRE_LUA)}
local record = ${luaString(CIRCUIT_RECORD_LUA)}
local rate = ${luaString(RATE_WINDOW_LUA)}
`];
  for (const step of steps) {
    if (step[0] === 'ADV') lines.push(`clock = clock + ${step[1]}`);
    else if (step[0] === 'ACQ') lines.push(`print(show(run(acquire, {'k'}, {'${step[1]}', '${config.probeTtlMs}', '${KEY_TTL}'})))`);
    else lines.push(`print(show(run(record, {'k'}, {'${step[1]}', '${step[2] ?? ''}', '${config.failureThreshold}', '${config.openMs}', '${KEY_TTL}'})))`);
  }
  lines.push(`print('rate:' .. show(run(rate, {'r'}, {'60000'})) .. ',' .. show(run(rate, {'r'}, {'60000'})) .. ',' .. show(run(rate, {'r'}, {'60000'})))`);
  lines.push(`local n = 0; for _ in pairs(expires) do n = n + 1 end; print('expiring-keys:' .. n .. ' rate-ttl:' .. tostring(expires['r']) .. ' rate-expire-calls:' .. tostring(expireCalls['r']))`);
  return lines.join('\n');
}

async function expectedFromTypeScript() {
  let now = 1_000_000;
  const memory = new InMemoryAIGovernanceStore(() => now);
  const out = [];
  for (const step of steps) {
    if (step[0] === 'ADV') { now += step[1]; continue; }
    if (step[0] === 'ACQ') {
      const result = await memory.circuitAcquire('k', config, step[1]);
      out.push(result.decision === 'DENY' ? `DENY:${result.retryAfterMs}` : `${result.decision}:0`);
    } else {
      const result = await memory.circuitRecord('k', step[1], config, step[2]);
      out.push(`${result.applied ? 1 : 0}:${result.state}`);
    }
  }
  return out;
}

test('the Lua circuit scripts make the same decisions as the TypeScript state machine on a full scripted sequence', { skip }, async () => {
  const output = execFileSync('lua', ['-'], { input: buildLuaProgram(), encoding: 'utf8' }).trim().split('\n');
  const expected = await expectedFromTypeScript();
  assert.deepEqual(output.slice(0, expected.length), expected);
});

test('the Lua rate script counts 1, 2, 3 and sets the window expiry once, on the first request', { skip }, () => {
  const output = execFileSync('lua', ['-'], { input: buildLuaProgram(), encoding: 'utf8' }).trim().split('\n');
  assert.equal(output[output.length - 2], 'rate:1,2,3');
  assert.equal(output[output.length - 1].startsWith('expiring-keys:'), true);
  assert.match(output[output.length - 1], /rate-ttl:60000 rate-expire-calls:1$/, 'PEXPIRE ran exactly once across three increments');
});

test('every script is valid Lua (they load without a syntax error)', { skip }, () => {
  const program = [CIRCUIT_ACQUIRE_LUA, CIRCUIT_RECORD_LUA, RATE_WINDOW_LUA].map((script, i) => `assert(load(${luaString(script)}), 'script ${i} failed to load')`).join('\n') + "\nprint('ok')";
  assert.equal(execFileSync('lua', ['-'], { input: program, encoding: 'utf8' }).trim(), 'ok');
});
