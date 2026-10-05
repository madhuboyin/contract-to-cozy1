const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const allowlist = require('../../src/services/ask/suggestedActions/profileAreaAllowlist.ts');
const registry = require('../../src/services/ask/suggestedActions/actionableProfileRegistry.ts');
const outcomes = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { PROPERTY_AREA_CAPTURE_SCOPES } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
const { getFactDefinitionsForScope } = require('../../src/modules/propertyContext/catalog/factCatalog.ts');
const { areaEffectiveSkip, areaCaptureStateFrom } = require('../../src/services/ask/handlers/propertySummary.handler.ts');

// ASK_COZY_EXACT_FOUR_REGISTRY_PACKET D3 / step 8a: outcome registration, typed launch scope, and the server-owned fact allowlist.

const known = (value = true) => ({ state: 'KNOWN', value });
const fakeDeps = ({ facts = {}, audiences = [], audienceOk = true, failFacts = false } = {}) => ({
  async loadFacts() { if (failFacts) throw new Error('snapshot unavailable'); return facts; },
  async loadAudiences() { return { audiences, ok: audienceOk }; },
});
const askNow = async (scope, over) => (await allowlist.loadAreaCaptureAllowlist('u1', 'p1', scope, fakeDeps(over)));

// ---- outcomes and typed scope ----------------------------------------------------------------------------------------------------

test('the seven area outcomes are registered on PROPERTY_CONTEXT_AREA_CAPTURE and the registry still validates', () => {
  assert.deepEqual([...outcomes.SUGGESTED_ACTION_OUTCOMES.PROPERTY_CONTEXT_AREA_CAPTURE].sort(), Object.values(registry.PROFILE_AREA_OUTCOMES).sort());
  assert.deepEqual(outcomes.validateSuggestedNextActionRegistry(), []);
  assert.equal(outcomes.isRegisteredOutcome('PROPERTY_CONTEXT_AREA_CAPTURE', 'CAPTURE_SAFETY_DETAILS'), true);
  assert.equal(outcomes.isRegisteredOutcome('PROPERTY_CONTEXT_AREA_CAPTURE', 'CAPTURE_EVERYTHING'), false);
  assert.equal(outcomes.isRegisteredOutcome('PROPERTY_CONTEXT_AREA_CAPTURE', 'ADD_BRAND'), false, 'inventory outcomes are not area outcomes');
});

test('areas parity: the registry areas are exactly the area-capture scopes, and every outcome resolves to its own scope', () => {
  assert.deepEqual([...registry.PROFILE_AREAS].sort(), [...PROPERTY_AREA_CAPTURE_SCOPES].sort());
  for (const scope of PROPERTY_AREA_CAPTURE_SCOPES) assert.equal(allowlist.areaScopeForOutcome(registry.PROFILE_AREA_OUTCOMES[scope]), scope);
  for (const bad of [null, undefined, '', 'CAPTURE_EVERYTHING', 'ADD_BRAND', 'capture_safety_details', 'CAPTURE_SAFETY_DETAILS ']) assert.equal(allowlist.areaScopeForOutcome(bad), null, String(bad));
});

// ---- pure exclusions --------------------------------------------------------------------------------------------------------------

test('exclusions are the area\'s writable facts minus the registry askNow set, sorted', () => {
  const completeness = { unresolvedByArea: { SAFETY: { askNowFactKeys: ['safety.hasCoDetectors', 'safety.hasSmokeDetectors'] } } };
  const keys = ['safety.hasSmokeDetectors', 'safety.hasCoDetectors', 'safety.hasSecuritySystem', 'safety.hasFireExtinguisher'];
  assert.deepEqual(allowlist.areaExclusionsFor(keys, completeness, 'SAFETY'), ['safety.hasFireExtinguisher', 'safety.hasSecuritySystem']);
  assert.deepEqual(allowlist.areaExclusionsFor(keys, { unresolvedByArea: {} }, 'SAFETY'), [...keys].sort(), 'nothing askable: everything is excluded');
});

// ---- allowlist behavior ----------------------------------------------------------------------------------------------------------

test('facts nothing consumes are never asked: an exterior launch excludes hasFence even though the area flow would ask it', async () => {
  const result = await askNow('EXTERIOR', {});
  assert.ok(getFactDefinitionsForScope('EXTERIOR').some((d) => d.key === 'exterior.hasFence' && d.writable), 'the unbounded flow would ask it');
  assert.ok(result.excludedFactKeys.includes('exterior.hasFence'));
  assert.ok(!result.askNowFactKeys.includes('exterior.hasFence'));
  const everyAsked = new Set([...result.askNowFactKeys, ...result.excludedFactKeys]);
  for (const definition of getFactDefinitionsForScope('EXTERIOR').filter((d) => d.writable)) assert.ok(everyAsked.has(definition.key), `${definition.key} is classified`);
});

test('governor first: an unanswered private-outdoor-space question holds back the outdoor-only dependents; answering opens or removes them', async () => {
  const dependents = ['exterior.hasLawn', 'exterior.hasIrrigation', 'exterior.hasTreesOrShrubs', 'exterior.outdoorSpaceTypes'];
  const unanswered = await askNow('EXTERIOR', {});
  assert.ok(unanswered.askNowFactKeys.includes('exterior.hasPrivateOutdoorSpace'));
  for (const key of dependents) assert.ok(unanswered.excludedFactKeys.includes(key), `${key} waits`);
  const yes = await askNow('EXTERIOR', { facts: { 'exterior.hasPrivateOutdoorSpace': known(true) } });
  for (const key of dependents) assert.ok(yes.askNowFactKeys.includes(key), `${key} opens`);
  assert.ok(!yes.askNowFactKeys.includes('exterior.hasPrivateOutdoorSpace'), 'answered facts are not asked again');
  const no = await askNow('EXTERIOR', { facts: { 'exterior.hasPrivateOutdoorSpace': known(false) } });
  for (const key of dependents) assert.ok(no.excludedFactKeys.includes(key), `${key} is not applicable`);
  // A responsibility dependent waits for its governor in another area.
  const resp = await askNow('RESPONSIBILITY', {});
  assert.ok(resp.excludedFactKeys.includes('responsibility.landscaping'));
  assert.ok(resp.askNowFactKeys.includes('responsibility.roof'));
});

test('catalog applicability: an attached dwelling removes private-exterior facts from the launch', async () => {
  const condo = await askNow('EXTERIOR', { facts: { 'core.dwellingType': known('CONDO_UNIT') } });
  for (const key of ['exterior.hasPoolOrSpa', 'exterior.hasOutdoorFaucets', 'exterior.lotSizeSqFt']) assert.ok(condo.excludedFactKeys.includes(key), key);
  const house = await askNow('EXTERIOR', { facts: { 'core.dwellingType': known('SINGLE_FAMILY_DETACHED') } });
  for (const key of ['exterior.hasPoolOrSpa', 'exterior.hasOutdoorFaucets', 'exterior.lotSizeSqFt']) assert.ok(house.askNowFactKeys.includes(key), key);
});

test('audience facts are asked only while their audience is active; an uncertain audience keeps them out and says so', async () => {
  const buyerKeys = ['systems.waterSource', 'systems.sewerSystem', 'systems.hasSolar', 'systems.hasFireplace'];
  const base = await askNow('SYSTEMS', { audiences: [] });
  for (const key of buyerKeys) assert.ok(base.excludedFactKeys.includes(key), `${key} excluded without the buyer audience`);
  assert.equal(base.denominatorVersion, 'actionable-profile-1:BASE');
  const buyer = await askNow('SYSTEMS', { audiences: ['BUYER'] });
  for (const key of buyerKeys) assert.ok(buyer.askNowFactKeys.includes(key), `${key} asked for an active buyer`);
  assert.equal(buyer.denominatorVersion, 'actionable-profile-1:BUYER');
  const uncertain = await askNow('SYSTEMS', { audiences: [], audienceOk: false });
  assert.equal(uncertain.audienceUncertain, true);
  for (const key of buyerKeys) assert.ok(uncertain.excludedFactKeys.includes(key));
});

test('an area with nothing left to ask yields no askNow facts, so no chip should be offered for it', async () => {
  const keys = registry.ACTIONABLE_PROFILE_FACTS.filter((e) => e.area === 'SAFETY').map((e) => e.factKey);
  const facts = Object.fromEntries(keys.map((k) => [k, known(true)]));
  const done = await askNow('SAFETY', { facts });
  assert.deepEqual(done.askNowFactKeys, []);
});

test('a failed fact lookup throws (the caller fails closed); a failed audience lookup does not', async () => {
  await assert.rejects(() => allowlist.loadAreaCaptureAllowlist('u1', 'p1', 'SAFETY', fakeDeps({ failFacts: true })), /snapshot unavailable/);
  const ok = await askNow('SAFETY', { audienceOk: false });
  assert.equal(ok.audienceUncertain, true);
});

// ---- the flow reproduces the same question everywhere ----------------------------------------------------------------------------

test('areaEffectiveSkip unions the user skips and the server exclusions; the persisted state round-trips excluded facts separately', () => {
  assert.deepEqual(areaEffectiveSkip(new Set(['a']), new Set(['b', 'a'])).sort(), ['a', 'b']);
  assert.deepEqual(areaEffectiveSkip(new Set(), new Set()), []);
  const state = areaCaptureStateFrom({ areaScope: 'SAFETY', skipFactKeys: ['safety.hasSecuritySystem'], excludedFactKeys: ['safety.hasFireExtinguisher'], sourceExecutionId: null });
  assert.deepEqual(state, { scope: 'SAFETY', skipFactKeys: ['safety.hasSecuritySystem'], excludedFactKeys: ['safety.hasFireExtinguisher'], sourceExecutionId: null });
  const legacy = areaCaptureStateFrom({ areaScope: 'SAFETY', skipFactKeys: [], sourceExecutionId: 'e1' });
  assert.deepEqual(legacy.excludedFactKeys, [], 'a legacy execution has no exclusions and behaves as before');
});

test('wiring guard: every site that reproduces the area question applies the exclusions, and the typed launch fails closed', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../src/services/ask', p), 'utf8');
  const summary = read('handlers/propertySummary.handler.ts');
  const confirm = read('handlers/recordConfirm.handler.ts');
  const capture = read('execution/askCapture.ts');
  const support = read('support/capture.ts');
  assert.ok(!/operationInput: \{ scope, skipFactKeys: \[\.\.\.skip\] \}/.test(summary), 'no evaluation in the handler uses the user skips alone');
  assert.equal((summary.match(/skipFactKeys: areaEffectiveSkip\(skip, excluded\)/g) ?? []).length, 2, 'prompt and submit evaluate with the effective skip');
  assert.ok(/skipFactKeys: areaEffectiveSkip\(new Set\(state\.skipFactKeys\), new Set\(state\.excludedFactKeys\)\)/.test(confirm), 'confirm-time re-evaluation matches the question that was asked');
  assert.ok(/areaCaptureProgress\(userId, propertyId, state\.scope, skip, new Set\(state\.excludedFactKeys\)\)/.test(confirm));
  assert.ok(/!excluded\.has\(key\)/.test(support) && /skipped: unmet\.filter\(\(key\) => writable\.has\(key\) && skip\.has\(key\)\)/.test(support), 'excluded facts are not askable and never shown as skipped');
  assert.ok(/new Set\(state\.excludedFactKeys\)\);\s*\n\s*captureId = input\.idempotencyKey;/.test(capture), 'submit carries the stored exclusions');
  assert.ok(/typedOutcome \? areaScopeForOutcome\(typedOutcome\) : areaScopeForMessage\(envelope\.message\)/.test(capture), 'typed outcome decides scope; the message does not');
  assert.ok(/AREA_CAPTURE_ALLOWLIST_UNAVAILABLE/.test(capture) && /status: 'UNAVAILABLE'/.test(capture), 'typed launch fails closed');
  assert.ok(/if \(!typedOutcome\) excluded = new Set\(inherited\.excludedFactKeys\)/.test(capture), 'continue inherits the workflow allowlist');
  assert.ok(/new Set\(state\.excludedFactKeys\)\);\s*\n\s*\}\s*\n\s*return notRoutable/.test(capture) || /state\.sourceExecutionId, undefined, new Set\(state\.excludedFactKeys\)/.test(capture), 'refresh keeps its own stored exclusions');
});
