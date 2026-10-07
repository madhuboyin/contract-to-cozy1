const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { healthGapFactKeys, isAppliancesInsight, healthGapCaptureFeature, deriveHealthGapCapture } = require('../../src/services/ask/healthGapCapture.ts');
const { buildFocusedHomeActionGuidance, INVENTORY_ADD_ACTION_MESSAGE } = require('../../src/services/ask/askFocusedGuidance.ts');
const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
const { getCaptureDefinitionForFact } = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

// Bounded inline capture for health-insight data gaps and appliances (FRD v1.172).

const ALL_FACTS = ['core.yearBuilt', 'core.dwellingType', 'structure.roofType', 'systems.heatingType', 'systems.coolingType', 'systems.waterHeaterType', 'core.propertySizeSqFt'];

const insight = (signal, overrides = {}) => ({
  id: `health-insight:p1:${signal}`, lineageId: `health-insight:p1:${signal.toLowerCase().replace(/\W+/g, '-')}`, source: { kind: 'SYSTEM' }, priority: 'PLAN', state: 'OPEN', signal,
  whyItMatters: 'why', recommendedAction: "Add your home's year built", expectedOutcome: 'Your Home Record reflects the real property.',
  presentation: { variant: 'HEALTH_FACTOR_REVIEW', summary: 's', keyFacts: [], factGroups: [] },
  primaryCta: { kind: 'REVIEW', label: 'Add year built', href: '/dashboard/properties/p1/focus/health/property-age-year-built' },
  governance: { safetyTier: 'LOW_CONSEQUENCE' }, timing: { dueAt: null, rationale: 'Advisory' }, confidence: { label: 'MEDIUM' },
  evidence: [], recommendationResponse: { status: 'AVAILABLE' }, ranking: { explanation: 'x' }, feedbackControls: ['SNOOZE'], ...overrides,
});
const focused = (action, options, captureRequest = null) => buildFocusedHomeActionGuidance(action, 'v1', undefined, captureRequest, options);
const guidance = (result) => result.blocks.find((block) => block.id === 'focused-home-action-guidance');

test('every capturable fact has a registered per-fact feature and a scalar capture definition', () => {
  for (const factKey of ALL_FACTS) {
    const feature = healthGapCaptureFeature(factKey);
    assert.equal(feature.featureKey, 'ASK_NEXT_ACTION');
    assert.equal(feature.operationKey, require('../../src/services/ask/askNextActions.ts').nextActionContextOperation(factKey), 'must equal the transform the registry and next-actions use');
    assert.doesNotThrow(() => getFeatureContextRequirement(feature.featureKey, feature.operationKey), factKey);
    const capture = getCaptureDefinitionForFact(factKey);
    assert.ok(capture && capture.mode === 'SCALAR', `${factKey} must be a bounded scalar capture`);
  }
  // Only these facts are ever derived; nothing else can slip in through the factor table.
  const derived = new Set(['Property Age (Year Built)', 'Structure Factor', 'Systems Factor', 'Size Factor'].flatMap((factor) => healthGapFactKeys(insight(factor))));
  assert.deepEqual([...derived].sort(), [...ALL_FACTS].sort());
});

test('only health-insight lineages of a known data-gap factor map to facts', () => {
  assert.deepEqual(healthGapFactKeys(insight('Structure Factor')), ['core.dwellingType', 'structure.roofType']);
  assert.deepEqual(healthGapFactKeys(insight('  property age (YEAR built) ')), ['core.yearBuilt']);
  assert.equal(healthGapFactKeys(insight('HVAC Age')), null, 'a maintenance factor is not a data gap');
  assert.equal(healthGapFactKeys(insight('Documents')), null);
  assert.equal(healthGapFactKeys(insight('Size Factor', { lineageId: 'recall:1' })), null, 'not a health insight');
  assert.equal(isAppliancesInsight(insight('Appliances')), true);
  assert.equal(isAppliancesInsight(insight('Appliances', { lineageId: 'operational-work:1' })), false);
  assert.equal(isAppliancesInsight(insight('Size Factor')), false);
});

test('one fact per turn: the first still-unknown fact wins, in ask order, and evaluation stops there', async () => {
  const calls = [];
  const evaluator = (unknown) => async (feature) => { calls.push(feature.operationKey); return { contextVersion: 'ctx', requirements: unknown.has(feature.operationKey) ? [{ id: 'r' }] : [] }; };

  let derived = await deriveHealthGapCapture(insight('Systems Factor'), evaluator(new Set(['SYSTEMS_COOLINGTYPE', 'SYSTEMS_WATERHEATERTYPE'])));
  assert.equal(derived.factKey, 'systems.coolingType', 'heating is known, so cooling is asked next');
  assert.deepEqual(calls, ['SYSTEMS_HEATINGTYPE', 'SYSTEMS_COOLINGTYPE'], 'no evaluation past the first unknown fact');

  calls.length = 0;
  derived = await deriveHealthGapCapture(insight('Structure Factor'), evaluator(new Set(['CORE_DWELLINGTYPE', 'STRUCTURE_ROOFTYPE'])));
  assert.equal(derived.factKey, 'core.dwellingType');

  assert.equal(await deriveHealthGapCapture(insight('Size Factor'), evaluator(new Set())), null, 'everything known -> nothing to ask');
  calls.length = 0;
  assert.equal(await deriveHealthGapCapture(insight('HVAC Age'), evaluator(new Set(['X']))), null);
  assert.deepEqual(calls, [], 'a non-gap insight evaluates nothing');
});

test('a derived capture is shown inline, stores its own feature for submit, and demotes the link to an optional escape hatch', () => {
  const feature = healthGapCaptureFeature('core.yearBuilt');
  const captureRequest = { requirementId: 'req-1', captureKey: 'CORE_YEARBUILT' };
  const result = focused(insight('Property Age (Year Built)'), { canContribute: true, captureFeature: feature }, captureRequest);
  assert.deepEqual(result.captureRequests, [captureRequest]);
  assert.deepEqual(result.parameters.captureFeature, feature, 'capture-submit re-derives this card from the stored feature');
  assert.deepEqual(guidance(result).actions.map((action) => [action.label, action.style]), [['Add year built', 'SECONDARY']]);
  // Nothing outstanding (or a viewer): no capture, and the link stays the primary way forward.
  const plain = focused(insight('Property Age (Year Built)'), { canContribute: true });
  assert.equal(plain.captureRequests, undefined);
  assert.equal('captureFeature' in plain.parameters, false);
  assert.deepEqual(guidance(plain).actions.map((action) => [action.label, action.style]), [['Add year built', 'PRIMARY']]);
});

test('the appliances insight offers one appliance at a time and keeps the bulk form as the secondary link', () => {
  const appliances = () => insight('Appliances', { primaryCta: { kind: 'REVIEW', label: 'Add appliances', href: '/dashboard/properties/p1/edit?focus=appliances' } });
  const none = guidance(focused(appliances(), { canContribute: true, applianceCount: 0 })).actions;
  assert.deepEqual(none.map((action) => [action.label, action.style]), [['Add an appliance', 'PRIMARY'], ['Add appliances', 'SECONDARY']]);
  assert.equal(none[0].interactionType, 'START_WORKFLOW');
  assert.equal(none[0].operationId, 'INVENTORY_ITEM_CREATE');
  assert.equal(none[0].message, INVENTORY_ADD_ACTION_MESSAGE);
  assert.equal(none[0].href, undefined, 'the in-Ask action must not also navigate');
  assert.equal(none[1].href, '/dashboard/properties/p1/edit?focus=appliances');

  const some = guidance(focused(appliances(), { canContribute: true, applianceCount: 3 })).actions;
  assert.equal(some[0].label, 'Add another appliance');

  // A viewer, an unknown count, or a different insight keeps only the link.
  for (const options of [{ canContribute: false, applianceCount: 0 }, { canContribute: true }, { canContribute: true, applianceCount: null }]) {
    assert.deepEqual(guidance(focused(appliances(), options)).actions.map((action) => action.label), ['Add appliances']);
  }
  assert.deepEqual(guidance(focused(insight('Size Factor'), { canContribute: true, applianceCount: 0 })).actions.map((action) => action.label), ['Add year built']);
});

test('an appliance missing a purchase date is completed in Ask for that exact item, not through the edit page', () => {
  const appliances = () => insight('Appliances', { primaryCta: { kind: 'REVIEW', label: 'Complete appliance details', href: '/dashboard/properties/p1/edit?focus=appliances' } });
  const actions = guidance(focused(appliances(), { canContribute: true, applianceCount: 2, applianceNeedingDetails: { id: 'item-9', name: 'Microwave' } })).actions;
  assert.deepEqual(actions.map((action) => [action.label, action.style]), [['Complete appliance details', 'PRIMARY'], ['Add another appliance', 'SECONDARY']]);
  assert.equal(actions[0].operationId, 'INVENTORY_ITEM_CORRECT');
  assert.equal(actions[0].entityType, 'INVENTORY_ITEM');
  assert.equal(actions[0].entityId, 'item-9');
  assert.ok(actions.every((action) => action.href === undefined), 'no action may navigate out of Ask');
});

test('a reviewed personalization recommendation has no link back to the personalization page', () => {
  const action = focused(insight('Size Factor', { lineageId: 'personalization:rec-1', primaryCta: { kind: 'REVIEW', label: 'Review recommendation', href: '/dashboard/personalization?propertyId=p1' } }), { canContribute: true });
  assert.deepEqual(guidance(action).actions, []);
});

test('an ownership-cost change continues in Ask and keeps its category tool as the secondary link', () => {
  const action = focused(insight('Insurance up', { lineageId: 'ownership-cost-change:p1:INSURANCE', primaryCta: { kind: 'REVIEW', label: 'Review coverage and premium', href: '/dashboard/properties/p1/tools/coverage-intelligence' } }), { canContribute: true });
  const actions = guidance(action).actions;
  assert.deepEqual(actions.map((a) => [a.label, a.style, a.operationId ?? 'link']), [['Show my ownership costs', 'PRIMARY', 'OWNERSHIP_COSTS'], ['Review coverage and premium', 'SECONDARY', 'link']]);
  assert.equal(actions[0].href, undefined);
  // The refinance lever keeps its own, more specific routing.
  const refi = guidance(focused(insight('Mortgage up', { lineageId: 'ownership-cost-change:p1:MORTGAGE', primaryCta: { kind: 'REVIEW', label: 'Compare refinance options', href: '/dashboard/properties/p1/tools/mortgage-refinance-radar' } }), { canContribute: true })).actions;
  assert.equal(refi[0].operationId, 'REFINANCE_ANALYSIS');
  for (const block of action.blocks) assert.ok(AskPresentationBlockSchema.safeParse(block).success, block.id);
});

test('weather preparation and environment report links are secondary, never the primary action', () => {
  for (const href of ['/dashboard/properties/p1/environment-report/preparation?insightId=i1', '/dashboard/properties/p1/environment-report']) {
    const actions = guidance(focused(insight('Heat', { lineageId: 'weather:1', primaryCta: { kind: 'START', label: 'Start checklist', href } }), { canContribute: true })).actions;
    assert.deepEqual(actions.map((a) => [a.href, a.style]), [[href, 'SECONDARY']]);
  }
});

test('the add-appliance message is the exact text the inventory handler recognises, and routes on its own', () => {
  const { INVENTORY_ADD_MESSAGE } = require('../../src/services/ask/handlers/inventory.handler.ts');
  assert.equal(INVENTORY_ADD_ACTION_MESSAGE, INVENTORY_ADD_MESSAGE, 'a drifted literal would silently stop being recognised as the declared add action');
  assert.ok(resolveAskOperation(INVENTORY_ADD_ACTION_MESSAGE).operationId, 'sanity: the message resolves to some operation');
});

test('the blocks validate against the real presentation schema for both new shapes', () => {
  const withCapture = focused(insight('Size Factor'), { canContribute: true, captureFeature: healthGapCaptureFeature('core.propertySizeSqFt') }, null);
  const withAppliance = focused(insight('Appliances', { primaryCta: { kind: 'REVIEW', label: 'Add appliances', href: '/dashboard/properties/p1/edit?focus=appliances' } }), { canContribute: true, applianceCount: 1 });
  for (const result of [withCapture, withAppliance]) {
    for (const block of result.blocks) {
      const parsed = AskPresentationBlockSchema.safeParse(block);
      assert.ok(parsed.success, `${block.id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues).slice(0, 300)}`);
    }
  }
});

test('handler wiring: viewers are never offered capture, and the derived feature and appliance count reach the builder', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/homeActions.handler.ts'), 'utf8');
  assert.match(source, /!featureCaptureEvaluation && access\.role !== HouseholdRole\.VIEWER\s*\?\s*await deriveHealthGapCapture\(/);
  // Derived cards never offer "Not sure": it is stored as an UNKNOWN observation and would re-ask the same question.
  assert.match(source, /baseCaptureRequest && derivedCapture \? \{ \.\.\.baseCaptureRequest, allowNotSure: false \} : baseCaptureRequest/);
  assert.match(source, /prisma\.inventoryItem\.count\(\{ where: \{ propertyId, category: 'APPLIANCE' \} \}\)/);
  assert.match(source, /\{ canContribute: access\.role !== HouseholdRole\.VIEWER, policyConflict, captureFeature, applianceCount, applianceNeedingDetails \}/);
});
