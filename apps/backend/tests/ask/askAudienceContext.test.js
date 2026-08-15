const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskAudienceContext } = require('../../src/services/ask/askAudienceContext.ts');
const { evaluateAskAudienceApplicability, getAskAudiencePolicy, isAskOperationDiscoverableForAudience } = require('../../src/services/ask/askAudiencePolicy.ts');
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

test('semantic discovery excludes lifecycle-inapplicable and unauthorized operations before classification', () => {
  assert.equal(isAskOperationDiscoverableForAudience({
    operationId: 'REFINANCE_ANALYSIS', accountRole: 'HOMEOWNER', householdRole: 'OWNER', operatingMode: 'BUYING',
  }), false);
  assert.equal(isAskOperationDiscoverableForAudience({
    operationId: 'REFINANCE_ANALYSIS', accountRole: 'HOMEOWNER', householdRole: 'OWNER', operatingMode: 'OWNING',
  }), true);
  assert.equal(isAskOperationDiscoverableForAudience({
    operationId: 'HOUSEHOLD_INVITATION', accountRole: 'HOMEOWNER', householdRole: 'VIEWER', operatingMode: 'OWNING',
  }), false);
  assert.equal(isAskOperationDiscoverableForAudience({
    operationId: 'MAINTENANCE_STATUS', accountRole: 'HOMEOWNER', householdRole: 'VIEWER', operatingMode: 'BUYING',
  }), true);
});

test('safety routing removes untrusted property scope before authorization-dependent work', () => {
  const emergency = resolveAskRoutingCascade('I smell gas and feel dizzy. What should I do?');
  assert.equal(emergency.stage, 'SAFETY');
  assert.equal(propertyScopeForAskRouting(emergency, 'property-not-authorized'), null);

  const ordinary = resolveAskRoutingCascade('What maintenance is due?');
  assert.notEqual(ordinary.stage, 'SAFETY');
  assert.equal(propertyScopeForAskRouting(ordinary, 'property-1'), 'property-1');
});

test('unknown journey context does not block authorized maintenance workflows', () => {
  for (const operationId of [
    'MAINTENANCE_STATUS',
    'MAINTENANCE_TASK_CREATE',
    'MAINTENANCE_TASK_COMPLETE',
    'MAINTENANCE_TASK_UPDATE',
    'HOME_DEADLINE_MONITOR',
  ]) {
    const policy = getAskAudiencePolicy(operationId);
    const decision = evaluateAskAudienceApplicability({
      policy,
      accountRole: 'HOMEOWNER',
      householdRole: 'CONTRIBUTOR',
      operatingMode: 'UNKNOWN',
      purpose: 'EXECUTION',
    });

    assert.equal(decision.allowed, true, operationId);
    assert.equal(decision.outcome, 'APPLICABLE_GENERAL', operationId);
    assert.equal(decision.reasonCode, 'ASK_AUDIENCE_GENERAL_GUIDANCE', operationId);
    assert.equal(policy.journeyPresentation, 'NEUTRAL', operationId);
  }
});

test('maintenance task creation still enforces the contributor role floor', () => {
  const decision = evaluateAskAudienceApplicability({
    policy: getAskAudiencePolicy('MAINTENANCE_TASK_CREATE'),
    accountRole: 'HOMEOWNER',
    householdRole: 'VIEWER',
    operatingMode: 'UNKNOWN',
    purpose: 'EXECUTION',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.outcome, 'INAPPLICABLE_BLOCK');
  assert.equal(decision.reasonCode, 'ASK_PERMISSION_REQUIRED');
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

test('journey-neutral workflows do not add lifecycle copy or a journey-correction CTA', () => {
  const result = {
    status: 'NEEDS_CONTEXT', reasonCode: 'MAINTENANCE_TASK_INPUT_REQUIRED', suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'maintenance-create-input', title: 'Add the task details', body: 'Nothing has been created yet.', tone: 'DEFAULT', actions: [] }],
  };
  const presented = applyAskAudiencePresentation({
    result,
    householdRole: 'CONTRIBUTOR',
    propertyId: 'property-1',
    journeyContext: null,
    lifecycleFramingEnabled: false,
  });

  assert.equal(presented.blocks.length, 1);
  assert.equal(presented.blocks[0].body, 'Nothing has been created yet.');
  assert.deepEqual(presented.blocks[0].actions, []);
  assert.equal(presented.parameters.audiencePresentation.journeyCorrectionOffered, false);
});
