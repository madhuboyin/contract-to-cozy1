// apps/workers/tests/unit/jobFailureAlert.test.js
//
// WKR-015: alertOnJobFailure() previously embedded up to 2000 raw characters
// of an error's stack/message directly into an outbound admin email — this
// covers that the redactText() scrub (redact.test.js) is actually applied
// to that text before it's sent, not just available as an unused utility.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadAlert({ admins = [{ email: 'admin@example.com' }] } = {}) {
  const calls = { sentEmails: [] };

  const prismaMock = {
    user: {
      findMany: async () => admins,
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const emailPath = require.resolve('../../src/email/email.service.ts');
  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: {
      sendEmail: async (to, subject, html) => {
        calls.sentEmails.push({ to, subject, html });
      },
    },
  };

  const modulePath = require.resolve('../../src/lib/jobFailureAlert.ts');
  delete require.cache[modulePath];
  return { ...require(modulePath), calls };
}

test('redacts sensitive text out of the stack trace before emailing it', async () => {
  const { alertOnJobFailure, calls } = loadAlert();

  const err = new Error('boom');
  err.stack =
    'Error: boom\n' +
    '    at connect (pg.ts:1) postgres://c2c_user:sup3rSecret@db-host:5432/c2c\n' +
    '    notify sarah@example.com Authorization: Bearer sk_live_abc123def456ghi789';

  const job = { name: 'test-job', id: 'j1', attemptsMade: 3, opts: { attempts: 3 } };
  await alertOnJobFailure('test-queue', job, err);

  assert.equal(calls.sentEmails.length, 1);
  const { html } = calls.sentEmails[0];
  assert.doesNotMatch(html, /sup3rSecret/);
  assert.doesNotMatch(html, /sarah@example\.com/);
  assert.doesNotMatch(html, /sk_live_abc123def456ghi789/);
  assert.match(html, /\[REDACTED\]/);
  // Non-sensitive context (queue/job identifiers) must still be readable —
  // this is a scrub, not a blanket wipe of the alert's debugging value.
  assert.match(html, /test-queue/);
  assert.match(html, /test-job/);
});

test('does not alter text that has nothing sensitive in it', async () => {
  const { alertOnJobFailure, calls } = loadAlert();

  const err = new Error("Cannot read properties of undefined (reading 'id')");
  const job = { name: 'clean-job', id: 'j2', attemptsMade: 1, opts: { attempts: 1 } };
  await alertOnJobFailure('test-queue', job, err);

  assert.match(calls.sentEmails[0].html, /Cannot read properties of undefined/);
});
