// apps/workers/tests/unit/sendPropertyBriefUpdateNoticeJob.test.js
//
// Slice 7's "republish notifications" — mirrors
// sendPropertyBriefInvitationJob.test.js's shape for the update-notice job.
// Deliberately verifies NO share link is included (tokens are never stored
// in plaintext server-side, so republishing genuinely cannot include one —
// the recipient's original link still works and doesn't need to change).

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

let sentEmails = [];

const emailServicePath = require.resolve('../../src/email/email.service.ts');
require.cache[emailServicePath] = {
  id: emailServicePath,
  filename: emailServicePath,
  loaded: true,
  exports: {
    sendEmail: async (to, subject, html) => {
      sentEmails.push({ to, subject, html });
    },
  },
};

const { sendPropertyBriefUpdateNoticeJob } = require('../../src/jobs/sendPropertyBriefUpdateNotice.job.ts');

function fixture(overrides = {}) {
  return {
    to: 'carol@example.com',
    recipientName: 'Aunt Carol',
    propertyBriefTitle: 'Prospective buyer Property Brief',
    propertyAddress: '123 Main St, Springfield, IL',
    changedSections: ['VERIFIED_HISTORY', 'MATERIAL_SPECS'],
    ...overrides,
  };
}

test('sends one email naming the changed sections, with no share link', async () => {
  sentEmails = [];
  await sendPropertyBriefUpdateNoticeJob(fixture());
  assert.equal(sentEmails.length, 1);
  const [email] = sentEmails;
  assert.equal(email.to, 'carol@example.com');
  assert.match(email.subject, /123 Main St, Springfield, IL/);
  assert.match(email.html, /Aunt Carol/);
  assert.match(email.html, /Verified History, Material Specs/);
  assert.match(email.html, /original link still works/);
  assert.doesNotMatch(email.html, /href="https?:\/\//);
});

test('falls back to a generic greeting when no recipient name was given', async () => {
  sentEmails = [];
  await sendPropertyBriefUpdateNoticeJob(fixture({ recipientName: null }));
  assert.equal(sentEmails.length, 1);
  assert.doesNotMatch(sentEmails[0].html, /Hi Aunt Carol/);
  assert.match(sentEmails[0].html, /Hi,/);
});

test('falls back to generic wording when changedSections is empty', async () => {
  sentEmails = [];
  await sendPropertyBriefUpdateNoticeJob(fixture({ changedSections: [] }));
  assert.equal(sentEmails.length, 1);
  assert.match(sentEmails[0].html, /some details/);
});

test('escapes recipient name and title to prevent HTML injection from user-entered fields', async () => {
  sentEmails = [];
  await sendPropertyBriefUpdateNoticeJob(fixture({
    recipientName: '<script>alert(1)</script>',
    propertyBriefTitle: '<img src=x onerror=alert(1)>',
  }));
  assert.equal(sentEmails.length, 1);
  assert.doesNotMatch(sentEmails[0].html, /<script>/);
  assert.doesNotMatch(sentEmails[0].html, /<img src=x/);
  assert.match(sentEmails[0].html, /&lt;script&gt;/);
});

test('skips sending (does not throw) when the recipient address is missing', async () => {
  sentEmails = [];
  await sendPropertyBriefUpdateNoticeJob(fixture({ to: '' }));
  assert.equal(sentEmails.length, 0);
});
