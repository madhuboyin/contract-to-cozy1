const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { redis } = require('../../src/lib/redis.ts');

const originalRedisEval = redis.eval.bind(redis);
const originalRedisDecr = redis.decr.bind(redis);
const originalRedisDel = redis.del.bind(redis);

const bucketStore = new Map();

function clearBuckets() {
  bucketStore.clear();
}

function nowMs() {
  return Date.now();
}

function getBucket(key) {
  const bucket = bucketStore.get(key);
  if (!bucket) return null;

  if (bucket.expiresAt <= nowMs()) {
    bucketStore.delete(key);
    return null;
  }

  return bucket;
}

function installRedisMock() {
  redis.eval = async (_script, _numKeys, key, windowMsRaw) => {
    const windowMs = Number(windowMsRaw);
    const currentNow = nowMs();

    const existing = getBucket(key);
    if (!existing) {
      const next = { count: 1, expiresAt: currentNow + windowMs };
      bucketStore.set(key, next);
      return [next.count, Math.max(0, next.expiresAt - currentNow)];
    }

    existing.count += 1;
    return [existing.count, Math.max(0, existing.expiresAt - currentNow)];
  };

  redis.decr = async (key) => {
    const existing = getBucket(key);
    if (!existing) return 0;
    existing.count = Math.max(0, existing.count - 1);
    if (existing.count === 0) {
      bucketStore.delete(key);
    }
    return existing.count;
  };

  redis.del = async (key) => {
    bucketStore.delete(key);
    return 1;
  };
}

function restoreRedis() {
  redis.eval = originalRedisEval;
  redis.decr = originalRedisDecr;
  redis.del = originalRedisDel;
}

installRedisMock();

const {
  authRateLimiter,
  apiRateLimiter,
  geminiRateLimiter,
  ocrRateLimiter,
} = require('../../src/middleware/rateLimiter.middleware.ts');

function createMockReq({ params = {}, headers = {}, body = {}, method = 'POST', ip = '127.0.0.1', path = '/' } = {}) {
  return {
    method,
    params,
    headers,
    body,
    ip,
    path,
    url: path,
    originalUrl: path,
    socket: {
      remoteAddress: ip,
    },
    app: {
      get: () => false,
    },
  };
}

function createMockRes(done) {
  const headers = new Map();

  return {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      done();
      return this;
    },
    send(payload) {
      this.body = payload;
      this.headersSent = true;
      done();
      return this;
    },
    end(payload) {
      if (payload !== undefined) {
        this.body = payload;
      }
      this.headersSent = true;
      done();
      return this;
    },
  };
}

async function runLimiter(middleware, reqOptions = {}) {
  const req = createMockReq(reqOptions);

  return new Promise((resolve, reject) => {
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const res = createMockRes(() => done({ blocked: true, req, res }));

    const next = (error) => {
      if (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
        return;
      }
      done({ blocked: false, req, res });
    };

    try {
      const maybePromise = middleware(req, res, next);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch((error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
      }
    } catch (error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }
  });
}

test.after(() => {
  restoreRedis();
});

test('gemini rate limiter returns 429 with retry metadata after threshold', async () => {
  clearBuckets();

  for (let i = 0; i < 30; i += 1) {
    const allowed = await runLimiter(geminiRateLimiter, {
      path: '/api/gemini/chat',
    });
    assert.equal(allowed.blocked, false, `Request ${i + 1} should be allowed`);
  }

  const blocked = await runLimiter(geminiRateLimiter, {
    path: '/api/gemini/chat',
  });

  assert.equal(blocked.blocked, true);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body?.success, false);
  assert.equal(blocked.res.body?.error?.code, 'AI_RATE_LIMIT_EXCEEDED');

  const retryAfter = blocked.res.getHeader('retry-after');
  assert.ok(retryAfter, 'Expected Retry-After header on 429 response');
  assert.ok(Number(retryAfter) >= 0, 'Retry-After should be numeric');
});

test('ocr rate limiter returns 429 with retry metadata after threshold', async () => {
  clearBuckets();

  for (let i = 0; i < 6; i += 1) {
    const allowed = await runLimiter(ocrRateLimiter, {
      path: '/api/properties/property-123/inventory/ocr/label',
      params: { propertyId: 'property-123' },
    });
    assert.equal(allowed.blocked, false, `OCR request ${i + 1} should be allowed`);
  }

  const blocked = await runLimiter(ocrRateLimiter, {
    path: '/api/properties/property-123/inventory/ocr/label',
    params: { propertyId: 'property-123' },
  });

  assert.equal(blocked.blocked, true);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body?.success, false);
  assert.equal(blocked.res.body?.error?.code, 'OCR_RATE_LIMITED');

  const retryAfter = blocked.res.getHeader('retry-after');
  assert.ok(retryAfter, 'Expected Retry-After header on OCR 429 response');
  assert.ok(Number(retryAfter) >= 0, 'Retry-After should be numeric');
});

test('auth rate limiter scopes login attempts by email to avoid shared-IP collisions', async () => {
  clearBuckets();

  for (let i = 0; i < 20; i += 1) {
    const allowed = await runLimiter(authRateLimiter, {
      path: '/login',
      body: { email: 'alpha@example.com', password: 'Password!123' },
      ip: '10.0.0.1',
    });
    assert.equal(allowed.blocked, false, `alpha request ${i + 1} should be allowed`);
  }

  const blocked = await runLimiter(authRateLimiter, {
    path: '/login',
    body: { email: 'alpha@example.com', password: 'Password!123' },
    ip: '10.0.0.1',
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.res.statusCode, 429);

  const otherAccountAllowed = await runLimiter(authRateLimiter, {
    path: '/login',
    body: { email: 'beta@example.com', password: 'Password!123' },
    ip: '10.0.0.1',
  });
  assert.equal(otherAccountAllowed.blocked, false);
});

test('global api limiter skips /api/auth paths', async () => {
  clearBuckets();

  for (let i = 0; i < 150; i += 1) {
    const result = await runLimiter(apiRateLimiter, {
      method: 'POST',
      path: '/auth/login',
      body: { email: 'skip-check@example.com', password: 'Password!123' },
      ip: '192.168.1.5',
    });
    assert.equal(result.blocked, false, `auth path request ${i + 1} should be skipped`);
  }
});
