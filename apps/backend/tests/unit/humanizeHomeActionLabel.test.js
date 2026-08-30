const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { humanizeHomeActionLabel, getHomeAssetDisplayLabel } = require('../../src/productFramework/homeAssetDisplay.ts');
const { ensureHomeActionPresentation } = require('../../src/productFramework/homeActionPresentationRegistry.ts');
const { getGuidanceJourneyDisplayTitle } = require('../../src/services/guidanceEngine/guidanceTemplateRegistry.ts');

test('strips a risk-level prefix and expands the enum system name', () => {
  assert.equal(humanizeHomeActionLabel('HIGH Risk: HVAC_FURNACE'), 'Review the HVAC Furnace risk');
  assert.equal(humanizeHomeActionLabel('CRITICAL Risk: WATER_HEATER_TANK'), 'Review the Water Heater risk');
  assert.equal(humanizeHomeActionLabel('Moderate risk - ROOF_SHINGLE'), 'Review the Roof risk');
});

test('expands a bare SCREAMING_SNAKE identifier through the asset-label map', () => {
  assert.equal(humanizeHomeActionLabel('HVAC_FURNACE'), 'HVAC Furnace');
  assert.equal(humanizeHomeActionLabel('SAFETY_SMOKE_CO_DETECTORS'), 'Smoke & CO Detector Check');
});

test('maps a spaced identifier that is exactly a known asset ("Safety Smoke CO Detectors")', () => {
  assert.equal(humanizeHomeActionLabel('Safety Smoke CO Detectors'), 'Smoke & CO Detector Check');
});

test('drops generic decision filler suffixes', () => {
  assert.equal(humanizeHomeActionLabel('HIGH Risk: HVAC_FURNACE: continue the active decision'), 'Review the HVAC Furnace risk');
});

test('leaves homeowner prose untouched', () => {
  for (const prose of [
    'Review coverage for Water Heater',
    'Have your water heater inspected',
    'Choose warranty coverage',
    '',
  ]) {
    assert.equal(humanizeHomeActionLabel(prose), prose);
  }
});

test('ensureHomeActionPresentation humanizes a raw-enum signal in the built fallback headline', () => {
  const presented = ensureHomeActionPresentation({
    presentation: undefined,
    signal: 'HIGH Risk: HVAC_FURNACE',
    // an abstract recommendedAction forces the fallback to use `signal`
    recommendedAction: 'Review this decision',
    whyItMatters: 'A material recommendation is pending more information.',
    expectedOutcome: 'Clarify the decision.',
    evidence: [{ label: 'HIGH Risk: HVAC_FURNACE', source: 'Guidance journey', observedAt: '2026-08-29T00:00:00.000Z', freshness: 'CURRENT' }],
    timing: { windowStart: null, windowEnd: null },
    primaryCta: { kind: 'REVIEW', label: 'Review home information', href: '/dashboard' },
    secondaryCtas: [],
    governance: { safetyTier: 'MATERIAL_FINANCIAL' },
    confidence: { score: 0.4, label: 'LOW', missing: [] },
    source: { kind: 'GUIDANCE', entityId: 'j1', version: 'v1' },
  });
  assert.equal(presented.presentation.headline, 'Review the HVAC Furnace risk');
  assert.equal(presented.presentation.subject.label, 'Review the HVAC Furnace risk');
});

test('ensureHomeActionPresentation also sanitizes a producer-authored raw headline', () => {
  const base = {
    signal: 'HIGH Risk: HVAC_FURNACE',
    recommendedAction: 'Add the missing home information or continue with a qualified professional using the original records.',
    whyItMatters: 'A material recommendation was withheld pending more information.',
    expectedOutcome: 'Clarify the decision.',
    evidence: [{ label: 'x', source: 'Guidance journey', observedAt: '2026-08-29T00:00:00.000Z', freshness: 'CURRENT' }],
    timing: { windowStart: null, windowEnd: null },
    primaryCta: { kind: 'REVIEW', label: 'Review home information', href: '/dashboard' },
    secondaryCtas: [],
    governance: { safetyTier: 'MATERIAL_FINANCIAL' },
    confidence: { score: 0.4, label: 'LOW', missing: [] },
    source: { kind: 'GUIDANCE', entityId: 'j1', version: 'v1' },
    presentation: {
      variant: 'GENERIC_ACTION',
      eyebrow: null,
      headline: 'HIGH Risk: HVAC_FURNACE',
      summary: 'A pending decision.',
      whyNow: 'A pending decision.',
      keyFacts: [],
      factGroups: [],
      subject: { kind: 'PROPERTY', id: 'p1', label: 'HIGH Risk: HVAC_FURNACE' },
      detailLabel: 'Why this?',
      group: null,
    },
  };
  const presented = ensureHomeActionPresentation(base);
  assert.equal(presented.presentation.headline, 'Review the HVAC Furnace risk');
  assert.equal(presented.presentation.subject.label, 'Review the HVAC Furnace risk');

  // Prose headline is left exactly as-is (same object returned).
  const prose = { ...base, presentation: { ...base.presentation, headline: 'Review coverage for Water Heater', subject: { kind: 'PROPERTY', id: 'p1', label: 'Water Heater' } } };
  assert.equal(ensureHomeActionPresentation(prose), prose);
});

test('getGuidanceJourneyDisplayTitle no longer leaks a risk-enum issue key', () => {
  assert.equal(getGuidanceJourneyDisplayTitle(null, 'HIGH Risk: HVAC_FURNACE'), 'Review the HVAC Furnace risk');
  assert.equal(getGuidanceJourneyDisplayTitle(null, 'HVAC_FURNACE'), 'HVAC Furnace');
  // A known template key still resolves to its curated title.
  assert.equal(getGuidanceJourneyDisplayTitle('compliance_resolution', null), 'Resolve a compliance requirement');
});
