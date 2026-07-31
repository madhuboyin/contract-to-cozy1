const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  PROPERTY_INTELLIGENCE_QUESTION_OWNERS,
  PROPERTY_INTELLIGENCE_CANONICAL_RULES,
  derivePropertyIntelligenceSafetyTier,
} = require('../../src/productFramework/propertyIntelligenceOwnership.contract.ts');
const {
  canonicalizeToolLifecycleId,
} = require('../../src/services/analytics/toolLifecycle.contract.ts');

const repoRoot = path.resolve(__dirname, '../../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Slice 1 registers the replacement portfolio and retires obsolete contracts', () => {
  assert.equal(canonicalCapabilityRegistry.getById('climate'), undefined);
  assert.equal(canonicalCapabilityRegistry.getById('home-gazette'), undefined);

  const briefing = canonicalCapabilityRegistry.getById('home-briefing');
  assert.equal(briefing.presentation.label, 'Home Briefing');
  assert.equal(briefing.recommendation.mode, 'CONTEXTUAL');
  assert.deepEqual(briefing.recommendation.triggerFamilies, ['MATERIAL_PROPERTY_CHANGE_UNSEEN']);
  assert.equal(briefing.lifecycle.completionKind, 'DECISION_RECORDED');

  const propertyBrief = canonicalCapabilityRegistry.getById('property-brief');
  assert.equal(propertyBrief.lifecycle.completionKind, 'ARTIFACT_CREATED');
  assert.equal(propertyBrief.governance.privacy.dataSensitivity, 'HIGHLY_SENSITIVE');
  assert.match(propertyBrief.governance.professionalBoundary, /inspection|appraisal|valuation/i);
});

test('Timeline, Past Hazard Exposure, and Around Your Home use corrected ownership and completion', () => {
  const timeline = canonicalCapabilityRegistry.getById('home-timeline');
  assert.equal(timeline.presentation.outcomeCategory, 'UNDERSTAND_HOME');
  assert.equal(timeline.lifecycle.completionKind, 'ARTIFACT_CREATED');
  assert.equal(timeline.lifecycle.completionSignal, 'home_timeline_history_action_completed');

  const pastExposure = canonicalCapabilityRegistry.getById('home-risk-replay');
  assert.equal(pastExposure.presentation.label, 'Past Hazard Exposure');
  assert.deepEqual(pastExposure.recommendation.triggerFamilies, ['PAST_HAZARD_EVIDENCE_UPDATED']);
  assert.equal(pastExposure.recommendation.requiresExplicitTrigger, true);
  assert.equal(pastExposure.lifecycle.completionKind, 'DECISION_RECORDED');

  const aroundHome = canonicalCapabilityRegistry.getById('neighborhood-change-radar');
  assert.equal(aroundHome.presentation.label, 'Around Your Home');
  assert.deepEqual(aroundHome.recommendation.triggerFamilies, ['REVIEWED_LOCAL_OBSERVATION_UPDATED']);
  assert.equal(aroundHome.lifecycle.completionKind, 'DECISION_RECORDED');
});

test('canonical question ownership and instance-based safety are executable', () => {
  assert.equal(PROPERTY_INTELLIGENCE_QUESTION_OWNERS.NEEDS_ATTENTION_NOW, 'HOME_ACTIONS');
  assert.equal(PROPERTY_INTELLIGENCE_QUESTION_OWNERS.ACTUALLY_HAPPENED_TO_HOME, 'HOME_TIMELINE');
  assert.equal(PROPERTY_INTELLIGENCE_QUESTION_OWNERS.LONG_TERM_HAZARD_CONTEXT, 'ENVIRONMENT_REPORT');
  assert.equal(PROPERTY_INTELLIGENCE_QUESTION_OWNERS.SAFE_SELECTIVE_SHARING, 'PROPERTY_BRIEF');
  assert.equal(PROPERTY_INTELLIGENCE_CANONICAL_RULES.compositeHomeScoreAllowed, false);

  assert.equal(derivePropertyIntelligenceSafetyTier({ verifiedHistoryRead: true }), 'LOW_CONSEQUENCE');
  assert.equal(
    derivePropertyIntelligenceSafetyTier({ insuranceOrValueImplication: true }),
    'MATERIAL_FINANCIAL',
  );
  assert.equal(
    derivePropertyIntelligenceSafetyTier({ possibleStructuralStress: true }),
    'SAFETY_EMERGENCY',
  );
});

test('legacy lifecycle ids and browser routes cut over to replacement owners', () => {
  assert.equal(canonicalizeToolLifecycleId('home-gazette'), 'home-briefing');
  assert.equal(canonicalizeToolLifecycleId('home-score-report'), 'property-brief');
  assert.equal(canonicalizeToolLifecycleId('climate'), null);

  const legacyGazette = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-gazette/page.tsx',
  );
  const legacyScore = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/home-score/page.tsx',
  );
  const buyerPreview = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/home-score/buyer-preview/page.tsx',
  );
  const publicScoreShare = read(
    'apps/frontend/src/app/home-score/share/[token]/page.tsx',
  );
  const publicGazetteShare = read(
    'apps/frontend/src/app/gazette/share/[token]/page.tsx',
  );

  assert.match(legacyGazette, /redirect\(.+home-briefing/);
  assert.match(legacyScore, /redirect\(.+property-brief/);
  assert.match(buyerPreview, /redirect\(.+property-brief/);
  assert.doesNotMatch(publicScoreShare, /BuyerReportClient/);
  assert.doesNotMatch(publicGazetteShare, /GazetteShareViewClient/);
});

test('replacement capabilities fail closed until their implementation foundations are ready', () => {
  const featureFlags = read('apps/backend/src/config/featureFlags.ts');

  assert.match(featureFlags, /HOME_BRIEFING:[^\n]+defaultPct: 0/);
  assert.match(featureFlags, /HOME_RISK_REPLAY:[^\n]+defaultPct: 0/);
  assert.match(featureFlags, /NEIGHBORHOOD_CHANGE_RADAR:[^\n]+defaultPct: 0/);
  assert.match(featureFlags, /PROPERTY_BRIEF:[^\n]+defaultPct: 0/);
  assert.doesNotMatch(featureFlags, /^\s*CLIMATE_RISK:/m);
  assert.doesNotMatch(featureFlags, /^\s*HOME_GAZETTE:/m);
});
