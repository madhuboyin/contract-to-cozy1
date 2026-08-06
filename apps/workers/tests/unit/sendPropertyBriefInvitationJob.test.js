// apps/workers/tests/unit/sendPropertyBriefInvitationJob.test.js
//
// Closes the gap HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_
// IMPLEMENTATION_PLAN.md Slice 7 explicitly left open: "no existing sync
// send-to-arbitrary-external-address path" for Property Brief invitations.
// This is that path — same ad-hoc-recipient shape as
// sendFeedbackNotification.job.ts, no NotificationDelivery/User row
// involved.

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

const { sendPropertyBriefInvitationJob } = require('../../src/jobs/sendPropertyBriefInvitation.job.ts');

function fixture(overrides = {}) {
  return {
    to: 'carol@example.com',
    recipientName: 'Aunt Carol',
    propertyBriefTitle: 'Prospective buyer Property Brief',
    propertyAddress: '123 Main St, Springfield, IL',
    shareUrl: 'https://app.example.com/property-brief/share/abc123',
    expiresAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

test('sends one email to the named recipient with the share link, address, and expiry', async () => {
  sentEmails = [];
  await sendPropertyBriefInvitationJob(fixture());
  assert.equal(sentEmails.length, 1);
  const [email] = sentEmails;
  assert.equal(email.to, 'carol@example.com');
  assert.match(email.subject, /123 Main St, Springfield, IL/);
  assert.match(email.html, /Aunt Carol/);
  assert.match(email.html, /https:\/\/app\.example\.com\/property-brief\/share\/abc123/);
  assert.match(email.html, /Prospective buyer Property Brief/);
});

test('falls back to a generic greeting when no recipient name was given', async () => {
  sentEmails = [];
  await sendPropertyBriefInvitationJob(fixture({ recipientName: null }));
  assert.equal(sentEmails.length, 1);
  assert.doesNotMatch(sentEmails[0].html, /Hi Aunt Carol/);
  assert.match(sentEmails[0].html, /Hi,/);
});

test('escapes recipient name and title to prevent HTML injection from user-entered fields', async () => {
  sentEmails = [];
  await sendPropertyBriefInvitationJob(fixture({
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
  await sendPropertyBriefInvitationJob(fixture({ to: '' }));
  assert.equal(sentEmails.length, 0);
});
