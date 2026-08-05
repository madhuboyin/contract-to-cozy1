const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyBriefShareSchema } = require('../../src/propertyBrief/propertyBrief.contracts.ts');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

// Closes an audit gap: sharing selected home information externally
// (Property Brief / Home Continuity Plan) previously had zero household
// co-owner consent anywhere in the codebase, even though the plan's Slice 7
// explicitly calls for it ("add household co-owner consent where
// necessary"). Required only when another household member with
// CONTRIBUTOR+ access actually exists — solo-owned properties are
// unaffected, matching the plan's "where necessary" framing.

test('createPropertyBriefShareSchema accepts a share request without householdConsentAcknowledged (the DB-backed check happens in the service, not here)', () => {
  const result = createPropertyBriefShareSchema.safeParse({
    expiresInDays: 14,
    downloadPolicy: 'VIEW_ONLY',
    previewAcknowledged: true,
    limitationAcknowledged: true,
    sensitiveDataAcknowledged: true,
  });
  assert.equal(result.success, true);
});

test('createPropertyBriefShare blocks sharing when another household member has access and consent was not acknowledged', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  const shareFn = service.slice(
    service.indexOf('export async function createPropertyBriefShare'),
    service.indexOf('export async function', service.indexOf('export async function createPropertyBriefShare') + 1),
  );
  assert.match(shareFn, /prisma\.householdMember\.count/);
  assert.match(shareFn, /otherHouseholdMemberCount > 0 && !input\.householdConsentAcknowledged/);
  assert.match(shareFn, /PROPERTY_BRIEF_SHARE_HOUSEHOLD_CONSENT_REQUIRED/);
  // Excludes the sharer themselves from the count — otherwise a solo owner
  // (who is their own only HouseholdMember row) would always be blocked.
  assert.match(shareFn, /userId: \{ not: input\.userId \}/);
});

test('the share route and frontend actually pass householdConsentAcknowledged through, and the checkbox is real (not hardcoded true)', () => {
  const routes = readBackend('src/propertyBrief/propertyBrief.routes.ts');
  assert.match(routes, /householdConsentAcknowledged: req\.body\.householdConsentAcknowledged/);

  const client = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/property-brief/PropertyBriefClient.tsx',
  );
  assert.match(client, /listHouseholdMembers/);
  assert.match(client, /shareHouseholdConsentAcknowledged/);
  assert.match(client, /householdConsentAcknowledged: shareHouseholdConsentAcknowledged/);
  // The button must actually be gated by the checkbox's real state when
  // other household members exist, not just always enabled.
  assert.match(client, /otherHouseholdMemberCount > 0 && !shareHouseholdConsentAcknowledged/);
});
