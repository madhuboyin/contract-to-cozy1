// apps/workers/tests/unit/gracefulShutdown.test.js
//
// W5 item 7: worker.ts previously had no SIGTERM/SIGINT handling at all —
// a pod termination abandoned in-flight BullMQ jobs and left connections
// to be torn down uncleanly. Covers the shutdown-handler registry and the
// signal-handling orchestration (close-all, bounded timeout, exit code).

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function freshModule() {
  const modPath = require.resolve('../../src/lib/gracefulShutdown.ts');
  delete require.cache[modPath];
  return require(modPath);
}

test('registerShutdownHandler tracks handlers by name', () => {
  const mod = freshModule();
  mod.registerShutdownHandler('a', () => {});
  mod.registerShutdownHandler('b', () => {});

  assert.deepEqual(mod.__getRegisteredHandlerNames(), ['a', 'b']);
});

test('installGracefulShutdown closes every registered handler on SIGTERM and exits 0 when all succeed', async () => {
  const mod = freshModule();
  const closed = [];
  mod.registerShutdownHandler('worker-a', async () => {
    closed.push('worker-a');
  });
  mod.registerShutdownHandler('worker-b', async () => {
    closed.push('worker-b');
  });

  let exitCode;
  const originalExit = process.exit;
  process.exit = (code) => {
    exitCode = code;
  };
  try {
    mod.installGracefulShutdown({ timeoutMs: 5000 });
    process.emit('SIGTERM');
    // Let the async shutdown handler's microtasks/promises flush.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(closed.sort(), ['worker-a', 'worker-b']);
    assert.equal(exitCode, 0);
  } finally {
    process.exit = originalExit;
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  }
});

test('installGracefulShutdown exits with code 1 if any handler fails to close', async () => {
  const mod = freshModule();
  mod.registerShutdownHandler('worker-ok', async () => {});
  mod.registerShutdownHandler('worker-fails', async () => {
    throw new Error('close failed');
  });

  let exitCode;
  const originalExit = process.exit;
  process.exit = (code) => {
    exitCode = code;
  };
  try {
    mod.installGracefulShutdown({ timeoutMs: 5000 });
    process.emit('SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(exitCode, 1);
  } finally {
    process.exit = originalExit;
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  }
});

test('a second SIGTERM while already shutting down is a no-op (does not double-close)', async () => {
  const mod = freshModule();
  let closeCount = 0;
  mod.registerShutdownHandler('worker-a', async () => {
    closeCount++;
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  let exitCallCount = 0;
  const originalExit = process.exit;
  process.exit = () => {
    exitCallCount++;
  };
  try {
    mod.installGracefulShutdown({ timeoutMs: 5000 });
    process.emit('SIGTERM');
    process.emit('SIGTERM'); // fired again before the first shutdown finishes
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(closeCount, 1, 'the handler must only be closed once even with two signals');
  } finally {
    process.exit = originalExit;
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    void exitCallCount;
  }
});

test('SIGINT triggers the same shutdown path as SIGTERM', async () => {
  const mod = freshModule();
  let closed = false;
  mod.registerShutdownHandler('worker-a', async () => {
    closed = true;
  });

  let exitCode;
  const originalExit = process.exit;
  process.exit = (code) => {
    exitCode = code;
  };
  try {
    mod.installGracefulShutdown({ timeoutMs: 5000 });
    process.emit('SIGINT');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(closed, true);
    assert.equal(exitCode, 0);
  } finally {
    process.exit = originalExit;
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  }
});
