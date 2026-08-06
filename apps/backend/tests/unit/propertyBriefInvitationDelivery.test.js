const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

// Closes the gap HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_
// IMPLEMENTATION_PLAN.md Slice 7 explicitly left open: "no existing sync
// send-to-arbitrary-external-address path... UI copy says 'you still need
// to send it yourself' rather than claiming a 'sent' capability that
// doesn't exist." Real delivery now exists — these tests lock down the
// wiring, not just the worker job itself (see
// apps/workers/tests/unit/sendPropertyBriefInvitationJob.test.js for that).

test('createPropertyBriefShare returns the title/address the route needs to send an invitation, reusing the already-loaded brief', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  const fnStart = service.indexOf('export async function createPropertyBriefShare');
  const fnEnd = service.indexOf('export async function', fnStart + 1);
  const fnBody = service.slice(fnStart, fnEnd);
  // brief is loaded once via findAccessibleBrief near the top of the
  // function; the new return fields must read off that same variable, not
  // trigger a second lookup.
  assert.match(fnBody, /const brief = await findAccessibleBrief/);
  const returnBlock = service.slice(service.lastIndexOf('return {', fnEnd), fnEnd);
  assert.match(returnBlock, /propertyBriefTitle:\s*brief\.title/);
  assert.match(returnBlock, /propertyAddress:.*brief\.property/);
  assert.doesNotMatch(returnBlock, /await/, 'the return block itself must not run a new query');
});

test('the share route enqueues a real invitation email, fire-and-forget, only when a recipient email was given', () => {
  const routes = readBackend('src/propertyBrief/propertyBrief.routes.ts');
  assert.match(routes, /getEmailNotificationQueue/);
  const shareRouteIndex = routes.indexOf("'/properties/:propertyId/property-briefs/:briefId/share'");
  const shareRouteBlock = routes.slice(shareRouteIndex, routes.indexOf('router.', shareRouteIndex + 50));
  assert.match(shareRouteBlock, /if \(result\.recipientEmail\)/);
  assert.match(shareRouteBlock, /'SEND_PROPERTY_BRIEF_INVITATION'/);
  // Fire-and-forget: the enqueue call itself must not be awaited into the
  // response path, and a failed enqueue must only be logged, never thrown.
  assert.match(shareRouteBlock, /\.catch\(\(err\) => \{/);
  assert.doesNotMatch(shareRouteBlock, /await getEmailNotificationQueue/);
});

test('the email-notification-queue payload type documents the new ad-hoc invitation fields', () => {
  const jobQueue = readBackend('src/services/JobQueue.service.ts');
  const interfaceBlock = jobQueue.slice(
    jobQueue.indexOf('export interface EmailNotificationJobPayload'),
    jobQueue.indexOf('}', jobQueue.indexOf('export interface EmailNotificationJobPayload')),
  );
  for (const field of ['recipientName', 'propertyBriefTitle', 'propertyAddress', 'shareUrl', 'expiresAt']) {
    assert.match(interfaceBlock, new RegExp(field));
  }
});

test('the worker registers a handler for SEND_PROPERTY_BRIEF_INVITATION on the email-notification-queue', () => {
  const workerSource = readRepository('apps/workers/src/worker.ts');
  assert.match(workerSource, /sendPropertyBriefInvitationJob/);
  assert.match(workerSource, /job\.name === 'SEND_PROPERTY_BRIEF_INVITATION'/);
});

test('the owner UI now promises real delivery instead of disclaiming it — an honest capability, not an overclaim', () => {
  const ownerUi = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/property-brief/PropertyBriefClient.tsx',
  );
  assert.doesNotMatch(ownerUi, /doesn't email it for you/);
  assert.match(ownerUi, /sends them the link directly/);
  // The confirmation only ever renders when this specific share actually
  // had a recipient email — never an unconditional "email sent" claim.
  assert.match(ownerUi, /shareInvitationEmail &&/);
});
