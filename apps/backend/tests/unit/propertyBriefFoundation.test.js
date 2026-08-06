const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  createPropertyBriefSchema,
  createPropertyBriefShareSchema,
  PROPERTY_BRIEF_LIMITATION,
  PROPERTY_BRIEF_TEMPLATES,
} = require('../../src/propertyBrief/propertyBrief.contracts.ts');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) =>
  fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('purpose templates keep sensitive sections opt-in and constrain prospective-buyer scope', () => {
  assert.deepEqual(
    PROPERTY_BRIEF_TEMPLATES.PROSPECTIVE_BUYER.defaultSections,
    ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'OPEN_UNKNOWNS', 'WARRANTIES', 'MATERIAL_SPECS', 'PERMITS'],
  );
  assert.equal(PROPERTY_BRIEF_TEMPLATES.PROSPECTIVE_BUYER.allowedSections.includes('CLAIMS'), false);
  assert.equal(PROPERTY_BRIEF_TEMPLATES.PROSPECTIVE_BUYER.allowedSections.includes('INSURANCE'), false);
  // Slice 10: warranties/material specs/permits are successor value, not
  // seller-private — allowed and defaulted-on, but never treated as
  // sensitive (no extra acknowledgement gate, unlike DOCUMENTS/CLAIMS/
  // INSURANCE).
  for (const section of ['WARRANTIES', 'MATERIAL_SPECS', 'PERMITS']) {
    assert.equal(PROPERTY_BRIEF_TEMPLATES.PROSPECTIVE_BUYER.allowedSections.includes(section), true);
    assert.equal(PROPERTY_BRIEF_TEMPLATES.PROSPECTIVE_BUYER.sensitiveSections.includes(section), false);
  }

  assert.equal(createPropertyBriefSchema.safeParse({
    purpose: 'HOMEOWNER_REFERENCE',
    selectedSections: ['PROPERTY_FACTS', 'CLAIMS'],
    documentIds: [],
    acknowledgeSensitiveSections: false,
  }).success, false);
  assert.equal(createPropertyBriefSchema.safeParse({
    purpose: 'HOMEOWNER_REFERENCE',
    selectedSections: ['PROPERTY_FACTS', 'CLAIMS'],
    documentIds: [],
    acknowledgeSensitiveSections: true,
  }).success, true);
  assert.equal(createPropertyBriefSchema.safeParse({
    purpose: 'PROSPECTIVE_BUYER',
    selectedSections: ['PROPERTY_FACTS', 'CLAIMS'],
    documentIds: [],
    acknowledgeSensitiveSections: true,
  }).success, false);
});

test('brief sections are immutable snapshots with item-level evidence and explicit exclusions', () => {
  const schema = readBackend('prisma/schema.prisma');
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');

  assert.match(schema, /model PropertyBrief \{[\s\S]*selectedSections\s+PropertyBriefSectionType\[\]/);
  assert.match(schema, /excludedSections\s+PropertyBriefSectionType\[\]/);
  assert.match(schema, /model PropertyBriefSection \{[\s\S]*payload\s+Json/);
  assert.match(schema, /model PropertyBriefEvidenceLink \{[\s\S]*itemKey[\s\S]*sourceAsOf[\s\S]*verification/);
  assert.match(service, /sections:\s*\{\s*create:/);
  assert.match(service, /evidenceLinks:/);
  assert.match(service, /PropertyBriefStatus\.SHARED/);
  assert.doesNotMatch(service, /PropertyScoreSnapshot|HomeScoreReport|overallScore|grade|benchmark/);
});

test('only confirmed history and explicitly selected verified documents enter the brief', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  assert.match(service, /HomeEventVerificationStatus\.HOMEOWNER_CONFIRMED/);
  assert.match(service, /HomeEventVerificationStatus\.EVIDENCE_VERIFIED/);
  assert.match(service, /id:\s*\{\s*in:\s*input\.documentIds\s*\}/);
  assert.match(service, /DocumentVerificationStatus\.VERIFIED/);
  assert.match(service, /Unverified, missing, or non-property documents were excluded/);
});

test('claims and insurance omit high-risk identifiers and financial fields', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  assert.match(service, /excludedFields: \['claimNumber', 'loss amounts', 'settlement amounts'\]/);
  assert.match(service, /excludedFields: \['policyNumber', 'premium', 'deductible', 'coverage limits'\]/);
  assert.doesNotMatch(service, /claimNumber:\s*claim\.claimNumber/);
  assert.doesNotMatch(service, /policyNumber:\s*policy\.policyNumber/);
});

test('sharing requires preview and limitation acknowledgement, expires, revokes, and logs access', () => {
  assert.equal(createPropertyBriefShareSchema.safeParse({
    expiresInDays: 14,
    downloadPolicy: 'VIEW_ONLY',
    previewAcknowledged: true,
    limitationAcknowledged: true,
  }).success, true);
  assert.equal(createPropertyBriefShareSchema.safeParse({
    expiresInDays: 14,
    downloadPolicy: 'VIEW_ONLY',
    previewAcknowledged: false,
    limitationAcknowledged: true,
  }).success, false);
  assert.match(PROPERTY_BRIEF_LIMITATION, /not an inspection, appraisal, certification, title report/i);

  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  const schema = readBackend('prisma/schema.prisma');
  assert.match(service, /randomBytes\(32\)/);
  assert.match(service, /createHash\('sha256'\)/);
  assert.match(service, /PropertyBriefShareStatus\.REVOKED/);
  assert.match(service, /PropertyBriefShareStatus\.EXPIRED/);
  assert.match(service, /PropertyBriefAccessKind\.DENIED/);
  assert.match(service, /ipHash: requestHash/);
  assert.match(schema, /model PropertyBriefAccessLog/);
});

test('legacy score APIs are retired and the UI previews the exact snapshot before sharing', () => {
  const reportRoutes = readBackend('src/routes/homeScoreReport.routes.ts');
  const shareRoutes = readBackend('src/routes/homeScoreShare.routes.ts');
  const ownerUi = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/property-brief/PropertyBriefClient.tsx',
  );
  const recipientUi = readRepository(
    'apps/frontend/src/app/property-brief/share/[token]/page.tsx',
  );

  assert.match(reportRoutes, /HOME_SCORE_RETIRED/);
  assert.doesNotMatch(reportRoutes, /getHomeScoreReport|refreshHomeScoreReport/);
  assert.match(shareRoutes, /HOME_SCORE_SHARING_RETIRED/);
  assert.doesNotMatch(shareRoutes, /createBuyerShareToken|getBuyerReport/);
  assert.match(ownerUi, /Preview is required before sharing/);
  assert.match(ownerUi, /Explicitly excluded/);
  assert.match(ownerUi, /Create controlled share link/);
  assert.match(ownerUi, /Revoke/);
  assert.match(recipientUi, /Important limitations/);
  assert.match(recipientUi, /Source:/);
});

test('creation and sharing use Property Brief analytics instead of page views', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  const taxonomy = readBackend('src/services/analytics/taxonomy.ts');
  const capability = readBackend('src/productFramework/capabilities/definitions/understandHome.ts');
  assert.match(taxonomy, /PROPERTY_BRIEF:\s+'property_brief'/);
  assert.match(service, /actionType: 'property_brief_created'/);
  assert.match(service, /actionType: 'property_brief_shared'/);
  assert.match(capability, /completionSignal: 'property_brief_created'/);
  assert.doesNotMatch(service, /FEATURE_OPENED|TOOL_USED/);
});

test('Slice 7: shares support a named recipient with real acceptance tracking and owner-side test access, not just an anonymous link', () => {
  const schema = readBackend('prisma/schema.prisma');
  assert.match(schema, /enum PropertyBriefShareInvitationStatus \{[\s\S]*NOT_SET[\s\S]*PENDING[\s\S]*ACCEPTED/);
  assert.match(schema, /recipientEmail\s+String\?/);
  assert.match(schema, /invitationStatus\s+PropertyBriefShareInvitationStatus/);
  assert.match(schema, /acceptedAt\s+DateTime\?/);
  assert.match(schema, /lastTestedAt\s+DateTime\?/);

  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  // Acceptance is the first real open of an invited link, tracked
  // separately from accessCount/lastAccessedAt (which move on every visit).
  assert.match(service, /isFirstAcceptance = share\.invitationStatus === 'PENDING'/);
  assert.match(service, /invitationStatus: 'ACCEPTED', acceptedAt: now/);
  // testPropertyBriefShareAccess must not look like a real recipient visit.
  assert.match(service, /export async function testPropertyBriefShareAccess/);
  const testFn = service.slice(service.indexOf('export async function testPropertyBriefShareAccess'));
  assert.doesNotMatch(testFn.slice(0, testFn.indexOf('\n}')), /accessCount:\s*\{\s*increment/);

  const routes = readBackend('src/propertyBrief/propertyBrief.routes.ts');
  assert.match(routes, /shares\/:shareId\/test/);

  const ownerUi = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/property-brief/PropertyBriefClient.tsx',
  );
  assert.match(ownerUi, /Test access/);
});

// A later pass (2026-08-05) closed the "doesn't email it for you" gap this
// same test used to lock down — a real send path now exists
// (sendPropertyBriefInvitation.job.ts) — see
// propertyBriefInvitationDelivery.test.js for the send-path coverage. The
// UI copy above no longer disclaims delivery because delivery is real, not
// because the disclaimer requirement went away.
