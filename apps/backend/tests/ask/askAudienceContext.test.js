const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskAudienceContext } = require('../../src/services/ask/askAudienceContext.ts');
const { applyAskAudiencePresentation } = require('../../src/services/ask/askAudiencePresentation.ts');
const { propertyScopeForAskRouting, resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

test('effective audience context keeps authorization and lifecycle dimensions distinct', () => {
  const journeyContext = {
    propertyId: 'property-1', ownershipState: 'UNDER_CONTRACT', operatingMode: 'BUYING',
    entryPath: 'BUYER', propertyOrigin: null, contextVersion: 'journey-v2', capturedAt: null,
  };
  const primary = resolveAskAudienceContext({
    accountRole: 'HOMEOWNER',
    propertyAccess: { propertyId: 'property-1', role: 'OWNER', isPrimaryOwner: true },
    journeyContext,
    observedAt: '2026-08-14T12:00:00.000Z',
  });
  assert.deepEqual(primary, {
    schemaVersion: '1.0', accountRole: 'HOMEOWNER', householdRole: 'OWNER',
    ownershipState: 'UNDER_CONTRACT', operatingMode: 'BUYING', propertyRelationship: 'PRIMARY_OWNER',
    entryPath: 'BUYER', sourceVersion: 'journey-v2', observedAt: '2026-08-14T12:00:00.000Z',
  });

  const member = resolveAskAudienceContext({
    accountRole: 'HOMEOWNER',
    propertyAccess: { propertyId: 'property-1', role: 'VIEWER', isPrimaryOwner: false },
  });
  assert.equal(member.propertyRelationship, 'HOUSEHOLD_MEMBER');
  assert.equal(member.ownershipState, 'UNKNOWN');
  assert.equal(member.operatingMode, 'UNKNOWN');
});

test('safety routing removes untrusted property scope before authorization-dependent work', () => {
  const emergency = resolveAskRoutingCascade('I smell gas and feel dizzy. What should I do?');
  assert.equal(emergency.stage, 'SAFETY');
  assert.equal(propertyScopeForAskRouting(emergency, 'property-not-authorized'), null);

  const ordinary = resolveAskRoutingCascade('What maintenance is due?');
  assert.notEqual(ordinary.stage, 'SAFETY');
  assert.equal(propertyScopeForAskRouting(ordinary, 'property-1'), 'property-1');
});

test('audience presentation removes protected preference values for non-owner roles', () => {
  const result = {
    status: 'ANSWERED', reasonCode: 'TEST', suggestions: [],
    blocks: [
      { type: 'PREFERENCE_REFERENCE', id: 'private', title: 'Private plan', preferenceKey: 'PRIVATE', summary: 'Secret value', visibility: 'PRIVATE', confirmedAt: null, expiresAt: null },
      { type: 'PREFERENCE_REFERENCE', id: 'owner', title: 'Owner plan', preferenceKey: 'OWNER', summary: 'Owner value', visibility: 'OWNER_ONLY', confirmedAt: null, expiresAt: null },
      { type: 'PREFERENCE_REFERENCE', id: 'household', title: 'Household plan', preferenceKey: 'HOUSEHOLD', summary: 'Household summary', visibility: 'HOUSEHOLD_SUMMARY', confirmedAt: null, expiresAt: null },
    ],
  };
  const viewer = applyAskAudiencePresentation({ result, householdRole: 'VIEWER', journeyContext: null });
  assert.deepEqual(viewer.blocks.filter((block) => block.type === 'PREFERENCE_REFERENCE').map((block) => block.id), ['household']);
  assert.equal(JSON.stringify(viewer).includes('Secret value'), false);
  assert.equal(JSON.stringify(viewer).includes('Owner value'), false);

  const contributor = applyAskAudiencePresentation({ result, householdRole: 'CONTRIBUTOR', journeyContext: null });
  assert.deepEqual(contributor.blocks.filter((block) => block.type === 'PREFERENCE_REFERENCE').map((block) => block.id), ['household']);

  const owner = applyAskAudiencePresentation({ result, householdRole: 'OWNER', journeyContext: null });
  assert.deepEqual(owner.blocks.filter((block) => block.type === 'PREFERENCE_REFERENCE').map((block) => block.id), ['owner', 'household']);
});
