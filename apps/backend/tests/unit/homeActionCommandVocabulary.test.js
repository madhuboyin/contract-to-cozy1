const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

process.env.GEMINI_API_KEY ||= 'phase2-test-key';

// Home Operations Slice 0: ACKNOWLEDGE/REMOVE_FROM_HOME were added so sources
// with no authoritative domain completion adapter can be dismissed from Home
// without claiming completed work. See HOME_ACTION_SOURCE_KINDS truth
// containment in homeActionSourcePromotion.service.ts and the completion
// endpoint matrix under docs/product/.

const { EventEmitter } = require('node:events');
class RedisTestDouble extends EventEmitter {
  constructor() {
    super();
    this.options = { maxRetriesPerRequest: null };
  }
  status = 'ready';
  duplicate() { return new RedisTestDouble(); }
  async connect() { return undefined; }
  async info() { return 'redis_version:7.0.0'; }
  defineCommand(name) { this[name] = async () => null; }
  async eval() { return [1, 60_000]; }
  async decr() { return 0; }
  async del() { return 0; }
  async quit() { return 'OK'; }
  disconnect() {}
}
const ioredisPath = require.resolve('ioredis');
require.cache[ioredisPath] = {
  id: ioredisPath,
  filename: ioredisPath,
  loaded: true,
  exports: { __esModule: true, default: RedisTestDouble, Redis: RedisTestDouble },
};
const redisPath = require.resolve('../../src/lib/redis.ts');
require.cache[redisPath] = {
  id: redisPath,
  filename: redisPath,
  loaded: true,
  exports: {
    redis: {
      status: 'ready',
      eval: async () => [1, 60_000],
      decr: async () => 0,
      del: async () => 0,
    },
  },
};

const { HOME_ACTION_COMMANDS, HomeActionCommandSchema } = require('../../src/services/homeActions.service.ts');
const { HOME_ACTION_FEEDBACK_CONTROLS } = require('../../src/productFramework/homeAction.contract.ts');

test('ACKNOWLEDGE and REMOVE_FROM_HOME are valid commands and feedback controls', () => {
  assert.ok(HOME_ACTION_COMMANDS.includes('ACKNOWLEDGE'));
  assert.ok(HOME_ACTION_COMMANDS.includes('REMOVE_FROM_HOME'));
  assert.ok(HOME_ACTION_FEEDBACK_CONTROLS.includes('ACKNOWLEDGE'));
  assert.ok(HOME_ACTION_FEEDBACK_CONTROLS.includes('REMOVE_FROM_HOME'));
});

test('ACKNOWLEDGE does not require consequenceAcknowledged or a next trigger date', () => {
  const parsed = HomeActionCommandSchema.parse({ command: 'ACKNOWLEDGE' });
  assert.equal(parsed.command, 'ACKNOWLEDGE');
});

test('REMOVE_FROM_HOME requires consequenceAcknowledged, like DISMISS', () => {
  assert.throws(() => HomeActionCommandSchema.parse({ command: 'REMOVE_FROM_HOME' }));
  const parsed = HomeActionCommandSchema.parse({
    command: 'REMOVE_FROM_HOME',
    consequenceAcknowledged: true,
  });
  assert.equal(parsed.command, 'REMOVE_FROM_HOME');
});
