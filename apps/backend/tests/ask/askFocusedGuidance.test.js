const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildFocusedHomeActionGuidance,
  focusedHomeActionCategory,
  focusedHomeActionQuestion,
  focusedOperationForLaunchContext,
  homeActionPriorityFilter,
  isPropertyContextCaptureAction,
} = require('../../src/services/ask/askFocusedGuidance.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

test('landing section prompts preserve the dashboard priority partitions', () => {
  assert.deepEqual(homeActionPriorityFilter('Show me what needs attention now or soon'), ['NOW', 'SOON']);
  assert.deepEqual(homeActionPriorityFilter('Show me what I should plan ahead for'), ['PLAN', 'CONSIDER']);
  assert.deepEqual(homeActionPriorityFilter('What is urgent?'), ['NOW']);
  assert.deepEqual(homeActionPriorityFilter('What is due soon?'), ['SOON']);
  assert.deepEqual(homeActionPriorityFilter('What can wait?'), ['PLAN', 'CONSIDER']);
  assert.equal(homeActionPriorityFilter('What should I do next?'), null);
});

function weatherAction() {
  return {
    id: 'incident:heat-1',
    lineageId: 'incident:heat-1',
    source: { kind: 'INCIDENT' },
    priority: 'PLAN',
    state: 'OPEN',
    signal: 'An official multi-day heat alert is active.',
    whyItMatters: 'Extended heat can increase household health and cooling-system risk.',
    recommendedAction: 'Review the alert and prepare the home before the hottest period.',
    expectedOutcome: 'The household has a clear heat-safety and cooling plan.',
    presentation: {
      variant: 'ENVIRONMENT_PREPARATION',
      headline: 'Multi-day heat risk ahead preparation',
      summary: 'Several high-heat days are expected for this property.',
      keyFacts: [
        { label: 'Forecast window', value: 'Through Friday' },
        { label: 'Preparation', value: 'Check cooling and hydration plans' },
      ],
      factGroups: [{
        label: 'Preparation checklist',
        facts: [
          { key: 'step-1', label: 'Step 1', value: 'Inspect the HVAC filter.', kind: 'RECORDED', source: 'Forecast and home record', observedAt: '2026-08-14T12:00:00.000Z' },
          { key: 'step-2', label: 'Step 2', value: 'Clear the outdoor condenser.', kind: 'RECORDED', source: 'Forecast and home record', observedAt: '2026-08-14T12:00:00.000Z' },
        ],
      }],
    },
    timing: { dueAt: '2026-08-16T12:00:00.000Z', rationale: 'Prepare before the alert begins.' },
    evidence: [{ id: 'weather-1', label: 'Official heat alert', source: 'Weather service', observedAt: '2026-08-14T12:00:00.000Z' }],
    confidence: { label: 'HIGH' },
    recommendationResponse: { status: 'AVAILABLE', reasonCode: 'RECOMMENDATION_AVAILABLE', safeNextAction: 'Review official guidance.' },
    governance: {
      safetyTier: 'LOW_CONSEQUENCE',
      emergencyEscalation: null,
      conservativeFallback: 'Follow official heat guidance if conditions worsen.',
      professionalBoundary: null,
    },
    primaryCta: { label: 'Open preparation checklist', href: '/weather/heat-1' },
    ranking: { explanation: 'Higher household relevance.' },
  };
}

test('contextual Ask prompts resolve exact subjects and produce focused Home Action guidance', () => {
  const action = weatherAction();
  assert.equal(focusedHomeActionQuestion(action), 'How should I prepare for the multi-day heat risk at this home?');
  assert.deepEqual(focusedHomeActionCategory(action), { categoryId: 'PROTECT', categoryLabel: 'Protect' });
  assert.equal(focusedOperationForLaunchContext({ entityType: 'HOME_ACTION', entityId: action.id, actionId: action.id }), 'HOME_ACTIONS');
  assert.equal(focusedOperationForLaunchContext({ entityType: 'DECISION_THREAD', entityId: 'decision-1' }), 'HVAC_DECISION_CONTINUE');
  assert.equal(focusedOperationForLaunchContext({ entityType: 'INVENTORY_ITEM', entityId: 'item-1' }), 'REPLACEMENT_GUIDANCE');
  assert.equal(focusedOperationForLaunchContext({ entityType: 'HOME_ACTION' }), null);

  const result = buildFocusedHomeActionGuidance(action, 'context-v1');
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.reasonCode, 'HOME_ACTION_FOCUSED_GUIDANCE');
  assert.deepEqual(result.parameters, { focusedHomeActionId: action.id });
  assert.equal(result.blocks.some((block) => block.type === 'PRIORITY_LIST'), false);
  assert.equal(result.blocks.find((block) => block.type === 'SUMMARY').title, 'Multi-day heat risk ahead');
  assert.deepEqual(result.blocks.find((block) => block.type === 'SUMMARY').actions, []);
  const focused = result.blocks.find((block) => block.id === 'focused-home-action-guidance');
  assert.equal(focused.title, 'Prepare this home');
  assert.match(focused.description, /preparation plan for this home/i);
  assert.deepEqual(focused.sections[0].items.map((item) => item.title), [
    'Inspect the HVAC filter.',
    'Clear the outdoor condenser.',
  ]);
  assert.deepEqual(focused.actions.map((candidate) => candidate.label), ['Open preparation checklist']);
  assert.equal(result.blocks.some((block) => JSON.stringify(block).includes('View in Home Actions')), false);
  assert.equal(result.blocks.find((block) => block.type === 'EVIDENCE').items.length, 1);
});

test('Group A home-action CTAs route to the matching Ask operation instead of navigating out of Ask', () => {
  const cases = [
    { href: '/dashboard/warranties', operationId: 'WARRANTY_LOOKUP' },
    { href: '/dashboard/properties/property-1/inventory?tab=coverage&highlight=item-1', operationId: 'WARRANTY_LOOKUP' },
    { href: '/dashboard/properties/property-1/inventory?openItemId=water-heater-1', operationId: 'INVENTORY_LOOKUP', entityId: 'water-heater-1' },
    { href: '/dashboard/properties/property-1/tools/coverage-intelligence?stage=questions', operationId: 'COVERAGE_GAPS' },
    { href: '/dashboard/properties/property-1/inventory/items/oven-range-1/coverage?from=home-action', operationId: 'COVERAGE_GAPS', entityId: 'oven-range-1' },
    { href: '/dashboard/home-event-radar?propertyId=property-1', operationId: 'HOME_EVENT_RADAR_FEED' },
    { href: '/dashboard/properties/property-1/tools/sell-hold-rent', operationId: 'SELL_HOLD_RENT_ANALYSIS' },
    { href: '/dashboard/properties/property-1/tools/mortgage-refinance-radar', operationId: 'REFINANCE_ANALYSIS' },
    { href: '/dashboard/properties/property-1/tools/savings-benefits', operationId: 'SAVINGS_OPPORTUNITIES' },
    { href: '/dashboard/properties/property-1/tools/property-tax?stage=appeal&caseId=case-1', operationId: 'PROPERTY_TAX_APPEAL_READINESS' },
    { href: '/dashboard/seasonal?propertyId=property-1', operationId: 'MAINTENANCE_STATUS' },
  ];

  for (const { href, operationId, entityId } of cases) {
    const action = { ...weatherAction(), primaryCta: { label: 'Open destination', href } };
    const result = buildFocusedHomeActionGuidance(action, 'context-v1');
    const focused = result.blocks.find((block) => block.id === 'focused-home-action-guidance');
    const primaryAction = focused.actions.find((candidate) => candidate.id === `home-action-primary-${action.id}`);
    assert.equal(primaryAction.interactionType, 'START_WORKFLOW', `${href} should start a workflow instead of navigating`);
    assert.equal(primaryAction.operationId, operationId, `${href} should route to ${operationId}`);
    assert.equal(primaryAction.href, undefined, `${href} should not also carry a navigation href`);
    assert.ok(primaryAction.message && primaryAction.message.length > 0, `${href} should carry a homeowner-visible message`);
    if (entityId) {
      assert.equal(primaryAction.entityType, 'INVENTORY_ITEM');
      assert.equal(primaryAction.entityId, entityId);
    }
  }

  // Seasonal checklist must include a seasonal keyword so MAINTENANCE_STATUS's internal
  // branch (maintenance.handler.ts's seasonal-context detection) actually activates.
  const seasonalAction = { ...weatherAction(), primaryCta: { label: 'View tasks', href: '/dashboard/seasonal?propertyId=property-1' } };
  const seasonalResult = buildFocusedHomeActionGuidance(seasonalAction, 'context-v1');
  const seasonalPrimary = seasonalResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${seasonalAction.id}`);
  assert.match(seasonalPrimary.message, /\b(?:seasonal|winter|spring|summer|fall|autumn)\b/i);
});

test('provider booking remains an explicit secondary handoff instead of looking like an in-Ask scheduling action', () => {
  const action = {
    ...weatherAction(),
    primaryCta: {
      label: 'Schedule Service',
      href: '/dashboard/providers?propertyId=property-1&category=PLUMBING&intent=service-booking&itemId=water-heater-1',
    },
  };
  const focused = buildFocusedHomeActionGuidance(action, 'context-v1').blocks
    .find((block) => block.id === 'focused-home-action-guidance');
  const handoff = focused.actions[0];
  assert.equal(handoff.label, 'Continue to provider search');
  assert.equal(handoff.style, 'SECONDARY');
  assert.equal(handoff.href, action.primaryCta.href);
  assert.equal(handoff.interactionType, undefined);
});

test('Group B health-factor checklist renders inline instead of only navigating', () => {
  const currentYear = new Date().getFullYear();

  const ageAction = {
    ...weatherAction(),
    signal: 'Age Factor',
    primaryCta: { label: 'See age-related checklist', href: '/dashboard/properties/property-1/focus/health/age-factor' },
  };
  const ageResult = buildFocusedHomeActionGuidance(ageAction, 'context-v1', { yearBuilt: currentYear - 12 });
  const ageFocused = ageResult.blocks.find((block) => block.id === 'focused-home-action-guidance');
  const ageChecklistSection = ageFocused.sections.find((section) => section.id === 'checklist');
  assert.ok(ageChecklistSection, 'age-factor checklist section should be present');
  assert.ok(ageChecklistSection.items.length > 0);
  assert.equal(ageChecklistSection.items[0].meta.length, 1, 'short metadata only carries urgency');
  assert.ok(ageChecklistSection.items[0].condition, 'the observed condition has a typed field');
  assert.ok(ageChecklistSection.items[0].description, 'recommendation remains the row description');
  for (const block of ageResult.blocks) AskPresentationBlockSchema.parse(block);
  assert.equal(ageResult.suppressSkillHandoff, true, 'generic maintenance handoff must not be offered for a focused action');
  assert.deepEqual(ageFocused.actions, [], 'no redundant CTA back to the page whose content is already inline');

  const hvacAction = {
    ...weatherAction(),
    signal: 'HVAC Age',
    primaryCta: { label: 'Book an HVAC check', href: '/dashboard/properties/property-1/focus/health/hvac-age' },
  };
  const hvacResult = buildFocusedHomeActionGuidance(hvacAction, 'context-v1', { hvacInstallYear: currentYear - 15 });
  const hvacChecklist = hvacResult.blocks.find((block) => block.id === 'focused-home-action-guidance').sections.find((section) => section.id === 'checklist');
  assert.ok(hvacChecklist, 'HVAC-age checklist section should be present');
  assert.ok(hvacChecklist.items.length > 0);

  // Missing the underlying year field: no checklist, same as the traditional page's own gating,
  // and the CTA stays the original PRIMARY navigation (no regression for a case we can't answer).
  const noDataAction = {
    ...weatherAction(),
    signal: 'Age Factor',
    primaryCta: { label: 'See age-related checklist', href: '/dashboard/properties/property-1/focus/health/age-factor' },
  };
  const noDataResult = buildFocusedHomeActionGuidance(noDataAction, 'context-v1', { yearBuilt: null });
  const noDataFocused = noDataResult.blocks.find((block) => block.id === 'focused-home-action-guidance');
  assert.equal(noDataFocused.sections.find((section) => section.id === 'checklist'), undefined);
  const noDataPrimary = noDataFocused.actions.find((candidate) => candidate.id === `home-action-primary-${noDataAction.id}`);
  assert.equal(noDataPrimary.style, 'PRIMARY');
  assert.equal(noDataPrimary.href, noDataAction.primaryCta.href);

  // No propertyFacts argument at all (existing callers before this change): unaffected, same as before.
  const noFactsResult = buildFocusedHomeActionGuidance(noDataAction, 'context-v1');
  const noFactsFocused = noFactsResult.blocks.find((block) => block.id === 'focused-home-action-guidance');
  assert.equal(noFactsFocused.sections.find((section) => section.id === 'checklist'), undefined);
  assert.equal(noFactsFocused.actions[0].style, 'PRIMARY');
});

test('Group C whole-tool destinations still navigate but are demoted to a secondary, honest action', () => {
  const cases = [
    { href: '/dashboard/properties/property-1/tools/savings-benefits?section=in-progress&actionId=action-1', overrides: {} },
    { href: '/dashboard/properties/property-1/renovations/case-1', overrides: {} },
    { href: '/dashboard/properties/property-1/tools/capital-timeline?category=roof', overrides: {} },
    // Risk Premium Optimizer mitigation plan: identified by lineageId, not href (the href is a
    // per-item DIY/PROVIDER/CARRIER handoff link, not a fixed tool path).
    { href: '/some-provider-directory/roofers', overrides: { lineageId: 'mitigation-plan:item-1' } },
  ];

  for (const { href, overrides } of cases) {
    const action = { ...weatherAction(), ...overrides, primaryCta: { label: 'Open tool', href } };
    const result = buildFocusedHomeActionGuidance(action, 'context-v1');
    const primary = result.blocks
      .find((block) => block.id === 'focused-home-action-guidance')
      .actions.find((candidate) => candidate.id === `home-action-primary-${action.id}`);
    assert.equal(primary.href, href, `${href} should still navigate`);
    assert.equal(primary.interactionType, undefined);
    assert.equal(primary.style, 'SECONDARY', `${href} should be demoted from PRIMARY`);
  }

  // A safety-emergency renovation action keeps its urgency: not demoted just because the
  // destination also matches the Group C renovations href pattern.
  const emergencyAction = {
    ...weatherAction(),
    governance: { ...weatherAction().governance, safetyTier: 'SAFETY_EMERGENCY' },
    primaryCta: { label: 'Review safety issue', href: '/dashboard/properties/property-1/renovations/case-1' },
  };
  const emergencyResult = buildFocusedHomeActionGuidance(emergencyAction, 'context-v1');
  const emergencyPrimary = emergencyResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${emergencyAction.id}`);
  assert.equal(emergencyPrimary.style, 'PRIMARY');

  // Unmapped destinations (no group match at all) are unaffected.
  const unmappedAction = { ...weatherAction(), primaryCta: { label: 'Open project', href: '/dashboard/properties/property-1/projects/project-1' } };
  const unmappedResult = buildFocusedHomeActionGuidance(unmappedAction, 'context-v1');
  const unmappedPrimary = unmappedResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${unmappedAction.id}`);
  assert.equal(unmappedPrimary.style, 'PRIMARY');
});

test('focused sale-prep review continues with the checklist in Ask', () => {
  const action = { ...weatherAction(), primaryCta: { label: 'Review sale-prep item', href: '/dashboard/properties/property-1/tools/sale-case?focusItemId=item-1' } };
  const result = buildFocusedHomeActionGuidance(action, 'context-v1');
  const primary = result.blocks.find((block) => block.id === 'focused-home-action-guidance').actions[0];
  assert.equal(primary.interactionType, 'START_WORKFLOW');
  assert.equal(primary.operationId, 'SELLER_PREP_CHECKLIST');
  assert.equal(primary.href, undefined);
});

test('Group D repair/replace decision routes to REPLACEMENT_GUIDANCE with the item entity, instead of navigating', () => {
  const hvacAction = {
    ...weatherAction(),
    id: 'repair-replace:analysis-1',
    lineageId: 'repair-replace:item-1',
    presentation: { ...weatherAction().presentation, subject: { kind: 'INVENTORY_ITEM', id: 'item-1', label: 'Furnace' } },
    primaryCta: { label: 'Review Decision', href: '/dashboard/properties/property-1/inventory/items/item-1/replace-repair' },
  };
  const hvacResult = buildFocusedHomeActionGuidance(hvacAction, 'context-v1');
  const hvacPrimary = hvacResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${hvacAction.id}`);
  assert.equal(hvacPrimary.interactionType, 'START_WORKFLOW');
  assert.equal(hvacPrimary.operationId, 'REPLACEMENT_GUIDANCE');
  assert.equal(hvacPrimary.entityType, 'INVENTORY_ITEM');
  assert.equal(hvacPrimary.entityId, 'item-1');
  assert.equal(hvacPrimary.href, undefined);
  assert.equal(hvacPrimary.style, 'PRIMARY');
  assert.match(hvacPrimary.message, /Furnace/);

  // Same routing whether or not an active guided journey changed the destination href --
  // the underlying decision content is the same either way, only the traditional href varies.
  const journeyAction = {
    ...weatherAction(),
    id: 'repair-replace:analysis-2',
    lineageId: 'appliance-repair-replace:item-2',
    presentation: { ...weatherAction().presentation, subject: { kind: 'INVENTORY_ITEM', id: 'item-2', label: 'Refrigerator' } },
    primaryCta: { label: 'Continue journey', href: '/dashboard/properties/property-1/tools/guidance-overview?journeyId=journey-1&itemId=item-2' },
  };
  const journeyResult = buildFocusedHomeActionGuidance(journeyAction, 'context-v1');
  const journeyPrimary = journeyResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${journeyAction.id}`);
  assert.equal(journeyPrimary.operationId, 'REPLACEMENT_GUIDANCE');
  assert.equal(journeyPrimary.entityId, 'item-2');

  const capitalWindowAction = {
    ...weatherAction(),
    id: 'home-capital-timeline-window:window-1',
    lineageId: 'home-capital-timeline-window:window-1',
    presentation: {
      ...weatherAction().presentation,
      variant: 'ASSET_LIFECYCLE',
      subject: { kind: 'INVENTORY_ITEM', id: 'item-3', label: 'Dishwasher' },
      factGroups: [
        { label: 'History', facts: [{ key: 'age', label: 'Age', value: '11.8 years', kind: 'DERIVED', source: 'Home Record', observedAt: null }] },
        { label: 'Plan', facts: [{ key: 'budget', label: 'Estimated budget', value: '$821–$1,232', kind: 'DERIVED', source: 'Home Capital Timeline', observedAt: null }] },
      ],
    },
    primaryCta: { label: 'Plan Dishwasher replacement', href: '/dashboard/properties/property-1/tools/capital-timeline?itemId=item-3' },
  };
  const capitalWindowResult = buildFocusedHomeActionGuidance(capitalWindowAction, 'context-v1');
  const capitalWindowPrimary = capitalWindowResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${capitalWindowAction.id}`);
  assert.equal(capitalWindowPrimary.operationId, 'REPLACEMENT_GUIDANCE');
  assert.equal(capitalWindowPrimary.entityType, 'INVENTORY_ITEM');
  assert.equal(capitalWindowPrimary.entityId, 'item-3');
  assert.equal(capitalWindowPrimary.href, undefined);
  const capitalWindowDetails = capitalWindowResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .sections.find((section) => section.id === 'known-details');
  assert.deepEqual(capitalWindowDetails.items.map((item) => [item.meta[0], item.title, item.description]), [
    ['History', 'Age', '11.8 years'],
    ['Plan', 'Estimated budget', '$821–$1,232'],
  ]);

  // A guidance journey with no INVENTORY_ITEM subject (the financial/weather continuation case) is
  // not routed -- it has no existing Ask operation yet and keeps navigating unaffected.
  const financialAction = {
    ...weatherAction(),
    lineageId: 'guidance:journey-3',
    presentation: { ...weatherAction().presentation, subject: { kind: 'GUIDANCE_JOURNEY', id: 'journey-3', label: 'Out-of-Pocket Exposure' } },
    primaryCta: { label: 'Review exposure', href: '/dashboard/properties/property-1/tools/guidance-overview?journeyId=journey-3' },
  };
  const financialResult = buildFocusedHomeActionGuidance(financialAction, 'context-v1');
  const financialPrimary = financialResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${financialAction.id}`);
  assert.equal(financialPrimary.href, financialAction.primaryCta.href);
  assert.equal(financialPrimary.interactionType, undefined);
});

test('Group B record-review destinations route to their (existing or new) Ask operation instead of navigating', () => {
  const recallAction = {
    ...weatherAction(),
    lineageId: 'recall:recall-1:item-1',
    primaryCta: { label: 'Review recall', href: '/dashboard/properties/property-1/recalls' },
  };
  const recallResult = buildFocusedHomeActionGuidance(recallAction, 'context-v1');
  const recallPrimary = recallResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${recallAction.id}`);
  assert.equal(recallPrimary.interactionType, 'START_WORKFLOW');
  assert.equal(recallPrimary.operationId, 'RECALL_REVIEW');
  assert.equal(recallPrimary.entityType, undefined);
  assert.equal(recallPrimary.href, undefined);

  // With a matched finding (the reported CTA shape).
  const findingAction = {
    ...weatherAction(),
    lineageId: 'inspection-finding:finding-1',
    primaryCta: { label: 'Review finding', href: '/dashboard/properties/property-1/inspection-hub/report-1?findingId=finding-1' },
  };
  const findingResult = buildFocusedHomeActionGuidance(findingAction, 'context-v1');
  const findingPrimary = findingResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${findingAction.id}`);
  assert.equal(findingPrimary.interactionType, 'START_WORKFLOW');
  assert.equal(findingPrimary.operationId, 'INSPECTION_FINDINGS');

  // No-finding fallback href resolves the same way.
  const openItemsAction = {
    ...weatherAction(),
    lineageId: 'inspection-finding:finding-2',
    primaryCta: { label: 'Review finding', href: '/dashboard/properties/property-1/inspection-hub/open-items' },
  };
  const openItemsResult = buildFocusedHomeActionGuidance(openItemsAction, 'context-v1');
  const openItemsPrimary = openItemsResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${openItemsAction.id}`);
  assert.equal(openItemsPrimary.operationId, 'INSPECTION_FINDINGS');
});

function digitalTwinFactReviewAction() {
  return {
    ...weatherAction(),
    id: 'home-digital-twin-fact-review:component-1',
    lineageId: 'home-digital-twin-fact-review:component-1',
    presentation: { ...weatherAction().presentation, subject: { kind: 'INVENTORY_ITEM', id: 'item-1', label: 'Refrigerator' } },
    propertyContextFeature: {
      featureKey: 'CAPITAL_TIMELINE',
      operationKey: 'RUN_TIMELINE',
      operationInput: { inventoryItemId: 'item-1' },
    },
    primaryCta: {
      kind: 'CORRECT_FACT',
      label: 'Confirm Refrigerator details',
      href: '/dashboard/resolution-center?propertyId=property-1&sourceActionId=home-digital-twin-fact-review%3Acomponent-1',
    },
  };
}

function fakeCaptureRequest(action) {
  return {
    requirementId: 'req-1',
    captureKey: 'INVENTORY_ITEM_PURCHASE_DATE',
    classification: 'ENHANCEMENT_ACCURACY',
    state: 'UNKNOWN',
    title: "Refrigerator's purchase date",
    question: 'About when was the Refrigerator purchased?',
    helpText: null,
    inputSchema: { type: 'DATE' },
    allowNotSure: true,
    sensitivity: 'STANDARD',
    destinationLabel: 'Saved to this home’s Property Context',
    fallbackHref: action.primaryCta.href,
    confirmationText: null,
    expectedContextVersion: 'context-v1',
  };
}

test('isPropertyContextCaptureAction identifies a CORRECT_FACT CTA carrying a propertyContextFeature ref', () => {
  assert.equal(isPropertyContextCaptureAction(digitalTwinFactReviewAction()), true);
  assert.equal(isPropertyContextCaptureAction(weatherAction()), false, 'a REVIEW cta with no propertyContextFeature is not capture-shaped');
  const ctaOnlyAction = { ...weatherAction(), primaryCta: { kind: 'CORRECT_FACT', label: 'Fix', href: '/dashboard/resolution-center' } };
  assert.equal(isPropertyContextCaptureAction(ctaOnlyAction), false, 'CORRECT_FACT alone with no propertyContextFeature is not enough');
});

test('Group B resolution-center capture slice renders an inline captureRequest instead of only navigating', () => {
  const action = digitalTwinFactReviewAction();
  const captureRequest = fakeCaptureRequest(action);

  const result = buildFocusedHomeActionGuidance(action, 'context-v1', undefined, captureRequest);
  assert.deepEqual(result.captureRequests, [captureRequest]);
  assert.deepEqual(result.parameters, {
    focusedHomeActionId: action.id,
    captureFeature: action.propertyContextFeature,
  });
  const primary = result.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${action.id}`);
  assert.equal(primary, undefined, 'the inline capture replaces the redundant resolution-center CTA');

  // No captureRequest supplied (e.g. the handler found nothing active to ask, or the household
  // role can't improve context): unaffected, same PRIMARY navigation as before this slice.
  const noCaptureResult = buildFocusedHomeActionGuidance(action, 'context-v1', undefined, null);
  assert.equal(noCaptureResult.captureRequests, undefined);
  assert.deepEqual(noCaptureResult.parameters, { focusedHomeActionId: action.id });
  const noCapturePrimary = noCaptureResult.blocks
    .find((block) => block.id === 'focused-home-action-guidance')
    .actions.find((candidate) => candidate.id === `home-action-primary-${action.id}`);
  assert.equal(noCapturePrimary.style, 'PRIMARY');
  assert.equal(noCapturePrimary.href, action.primaryCta.href);
});

test('focused Ask preserves neutral pre-snapshot HVAC guidance without manufacturing a verdict', () => {
  const action = {
    ...weatherAction(),
    id: 'repair-replace:analysis-1',
    source: { kind: 'GUIDANCE' },
    signal: 'Repair vs Replace: Furnace',
    whyItMatters: 'This HVAC system is ready for a repair-or-replace review, but no current Decision Platform recommendation is available yet.',
    recommendedAction: 'Review the available facts and start or resume the tracked HVAC decision.',
    expectedOutcome: 'A documented repair-or-replace decision for this item.',
    presentation: null,
    evidence: [{
      id: 'analysis-1',
      label: 'Supporting HVAC lifecycle analysis: Furnace',
      source: 'Lifespan Engine (supporting evidence only)',
      observedAt: '2026-08-14T12:00:00.000Z',
    }],
    confidence: { label: 'LOW' },
    recommendationResponse: {
      status: 'NEEDS_INPUT',
      reasonCode: 'CURRENT_HVAC_RECOMMENDATION_MISSING',
      safeNextAction: 'Start or resume the tracked HVAC decision.',
    },
    primaryCta: { label: 'Review Decision', href: '/dashboard/properties/property-1/inventory/items/item-1/replace-repair' },
  };

  const result = buildFocusedHomeActionGuidance(action, 'context-v1');
  const rendered = JSON.stringify(result.blocks);
  assert.match(rendered, /no current Decision Platform recommendation/i);
  assert.match(rendered, /start or resume the tracked HVAC decision/i);
  assert.doesNotMatch(rendered, /favors (?:repair|replacement)|replace immediately|verdict:/i);
});

// Group E (FRD v1.169): accepted Operational Work's "Open work" CTA was navigating out of Ask.
function acceptedWorkAction(overrides = {}) {
  return {
    ...weatherAction(),
    id: 'operational-work:work-1',
    lineageId: 'operational-work:work-1',
    source: { kind: 'MAINTENANCE' },
    signal: 'Seal driveway cracks before freezing',
    recommendedAction: 'Seal driveway cracks before freezing',
    expectedOutcome: 'Complete the task and record the outcome.',
    presentation: { variant: 'ACCEPTED_WORK', summary: 'Fill cracks in driveway and apply sealant if needed', keyFacts: [], factGroups: [] },
    primaryCta: { label: 'Open work', href: '/dashboard/properties/property-1/home-operations?focusWorkItemId=work-1&openManage=1' },
    workItem: { id: 'work-1', workKey: 'k', state: 'ACCEPTED', acceptanceState: 'ACCEPTED', disposition: 'ACTIVE' },
    feedbackControls: ['CORRECT_FACT', 'SNOOZE', 'COMPLETE', 'ALREADY_DONE'],
    ...overrides,
  };
}

test('accepted work offers Complete and Snooze in Ask instead of navigating to Work', () => {
  const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
  const result = buildFocusedHomeActionGuidance(acceptedWorkAction(), 'context-v1', undefined, null, { canContribute: true });
  const actions = result.blocks.find((block) => block.id === 'focused-home-action-guidance').actions;
  assert.deepEqual(actions.map((candidate) => candidate.label), ['Mark complete', 'Snooze reminders']);
  assert.deepEqual(actions.map((candidate) => candidate.style), ['PRIMARY', 'SECONDARY']);
  for (const candidate of actions) {
    assert.equal(candidate.interactionType, 'START_WORKFLOW');
    assert.equal(candidate.operationId, 'OPERATIONAL_WORK_UPDATE');
    assert.equal(candidate.entityType, 'WORK_ITEM');
    assert.equal(candidate.entityId, 'work-1');
    assert.equal(candidate.href, undefined, 'must not also navigate');
    // The message alone routes to the operation even without the forced hint.
    assert.equal(resolveAskOperation(candidate.message).operationId, 'OPERATIONAL_WORK_UPDATE');
  }
  // Verb inference in the handler is loose (complete|done|finished): a title must never be in the message.
  assert.ok(actions.every((candidate) => !candidate.message.includes('driveway')));
  assert.match(actions[0].message, /^Complete\b/);
  assert.match(actions[1].message, /^Snooze\b/);
});

test('degraded accepted work names missing facts and makes record correction the primary action', () => {
  const action = acceptedWorkAction({
    confidence: { score: 0.35, label: 'LOW', missing: ['Installation year', 'Current condition'] },
    recommendationResponse: {
      status: 'LOW_CONFIDENCE',
      reasonCode: 'RECOMMENDATION_LOW_CONFIDENCE',
      safeNextAction: 'Add the missing home information before acting.',
      missingFacts: ['Installation year', 'Current condition'],
    },
    presentation: {
      variant: 'ACCEPTED_WORK', summary: 'The HVAC record is incomplete.', keyFacts: [], factGroups: [],
      subject: { kind: 'INVENTORY_ITEM', id: 'hvac-1', label: 'HVAC Furnace' },
    },
    feedbackControls: ['CORRECT_FACT', 'SNOOZE'],
  });
  const result = buildFocusedHomeActionGuidance(action, 'context-v1', undefined, null, { canContribute: true });
  const guidance = result.blocks.find((block) => block.id === 'focused-home-action-guidance');
  assert.match(guidance.sections[0].items[0].title, /Installation year, Current condition/);
  assert.deepEqual(guidance.actions.map((candidate) => [candidate.label, candidate.style]), [
    ['Add missing details', 'PRIMARY'],
    ['Snooze reminders', 'SECONDARY'],
  ]);
  assert.deepEqual(guidance.actions[0], {
    id: `home-action-missing-details-${action.id}`,
    label: 'Add missing details',
    interactionType: 'START_WORKFLOW',
    message: 'Complete the missing details for this inventory item.',
    operationId: 'INVENTORY_ITEM_CORRECT',
    entityType: 'INVENTORY_ITEM',
    entityId: 'hvac-1',
    style: 'PRIMARY',
  });
  assert.equal(require('../../src/services/ask/askOperationRegistry.ts').resolveAskOperation(guidance.actions[0].message).operationId, 'INVENTORY_ITEM_CORRECT');
  assert.ok(require('../../src/services/ask/execution/executeOperation.ts').ASK_MUTATION_IMPACT_MAP.INVENTORY_ITEM_CORRECT.includes('HOME_ACTIONS'));
  const limitation = result.blocks.find((block) => block.id === 'focused-home-action-missing-details');
  assert.match(limitation.body, /Missing: Installation year, Current condition/);
  assert.match(limitation.body, /recompute this same Home Action/);
  for (const block of result.blocks) {
    const parsed = AskPresentationBlockSchema.safeParse(block);
    assert.ok(parsed.success, `${block.id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`);
  }

  const viewer = buildFocusedHomeActionGuidance(action, 'context-v1', undefined, null, { canContribute: false });
  const viewerLimitation = viewer.blocks.find((block) => block.id === 'focused-home-action-missing-details');
  assert.match(viewerLimitation.body, /owner or contributor must update/i);
  assert.deepEqual(
    viewer.blocks.find((block) => block.id === 'focused-home-action-guidance').actions.map((candidate) => candidate.label),
    ['Open work'],
  );
});

test('degraded accepted work still offers missing-detail correction when the producer names no missing fields', () => {
  const action = acceptedWorkAction({
    confidence: { score: null, label: 'LOW', missing: [] },
    recommendationResponse: {
      status: 'DATA_UNAVAILABLE',
      reasonCode: 'RECOMMENDATION_DATA_UNAVAILABLE',
      safeNextAction: 'Add the missing home information or continue with a qualified professional using the original records.',
      missingFacts: [],
    },
    presentation: {
      variant: 'ACCEPTED_WORK', summary: 'The HVAC record is incomplete.', keyFacts: [], factGroups: [],
      subject: { kind: 'INVENTORY_ITEM', id: 'hvac-1', label: 'HVAC Furnace' },
    },
    feedbackControls: ['CORRECT_FACT', 'SNOOZE'],
  });
  const result = buildFocusedHomeActionGuidance(action, 'context-v1', undefined, null, { canContribute: true });
  const guidance = result.blocks.find((block) => block.id === 'focused-home-action-guidance');
  assert.equal(guidance.sections[0].items[0].title, 'Add or update the missing home details to continue.');
  assert.deepEqual(guidance.actions.map((candidate) => [candidate.label, candidate.style]), [
    ['Add missing details', 'PRIMARY'],
    ['Snooze reminders', 'SECONDARY'],
  ]);
  assert.equal(guidance.actions[0].message, 'Complete the missing details for this inventory item.');
  assert.equal(guidance.actions[0].operationId, 'INVENTORY_ITEM_CORRECT');
  assert.equal(guidance.actions[0].entityId, 'hvac-1');
  const limitation = result.blocks.find((block) => block.id === 'focused-home-action-missing-details');
  assert.match(limitation.body, /does not identify the exact missing fields/i);
  assert.match(limitation.body, /Choose Add missing details/i);
});

test('legacy accepted work with no typed asset asks for an inventory-scoped correction instead of property completeness', () => {
  const action = acceptedWorkAction({
    confidence: { score: null, label: 'LOW', missing: [] },
    recommendationResponse: {
      status: 'DATA_UNAVAILABLE', reasonCode: 'RECOMMENDATION_DATA_UNAVAILABLE',
      safeNextAction: 'Add the missing home information.', missingFacts: [],
    },
    presentation: {
      variant: 'ACCEPTED_WORK', summary: 'The HVAC record is incomplete.', keyFacts: [], factGroups: [],
      subject: { kind: 'WORK_ITEM', id: 'work-1', label: 'HVAC Furnace' },
    },
    feedbackControls: ['CORRECT_FACT', 'SNOOZE'],
  });
  const result = buildFocusedHomeActionGuidance(action, 'context-v1', undefined, null, { canContribute: true });
  const primary = result.blocks.find((block) => block.id === 'focused-home-action-guidance').actions[0];
  assert.equal(primary.label, 'Add missing details');
  assert.equal(primary.operationId, 'INVENTORY_ITEM_CORRECT');
  assert.equal(primary.message, 'Complete the missing details for inventory item "HVAC Furnace".');
  assert.notEqual(primary.operationId, 'PROPERTY_SUMMARY');
  assert.equal(primary.entityId, undefined, 'without a canonical item id the correction handler must clarify rather than guess');
});

test('accepted work follows governed controls and resolves reported completion inside Ask', () => {
  const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
  const build = (action, options) => buildFocusedHomeActionGuidance(action, 'context-v1', undefined, null, options).blocks.find((block) => block.id === 'focused-home-action-guidance').actions;
  // Not completion-eligible: Snooze only, promoted to primary.
  const snoozeOnly = build(acceptedWorkAction({ feedbackControls: ['CORRECT_FACT', 'SNOOZE'] }), { canContribute: true });
  assert.deepEqual(snoozeOnly.map((candidate) => [candidate.label, candidate.style]), [['Snooze reminders', 'PRIMARY']]);
  // Completion reported: give a contributor the two decisions that actually close the loop.
  const reported = build(acceptedWorkAction({ workItem: { id: 'work-1', state: 'REPORTED_COMPLETE' }, primaryCta: { label: 'Review completion', href: '/dashboard/properties/property-1/home-operations?focusWorkItemId=work-1&openManage=1' } }), { canContribute: true });
  assert.deepEqual(reported.map((candidate) => [candidate.label, candidate.style]), [['Confirm completion', 'PRIMARY'], ['Still needs attention', 'SECONDARY']]);
  assert.ok(reported.every((candidate) => candidate.operationId === 'OPERATIONAL_WORK_UPDATE' && candidate.href === undefined));
  assert.match(reported[0].message, /^Verify\b/);
  assert.match(reported[1].message, /^Reopen\b/);
  assert.ok(reported.every((candidate) => resolveAskOperation(candidate.message).operationId === 'OPERATIONAL_WORK_UPDATE'));
  // Homeowner attestation cannot verify regulated or safety-sensitive work, but reopening remains available.
  const regulated = build(acceptedWorkAction({ governance: { ...weatherAction().governance, safetyTier: 'REGULATED_COVERAGE' }, workItem: { id: 'work-1', state: 'REPORTED_COMPLETE' } }), { canContribute: true });
  assert.deepEqual(regulated.map((candidate) => [candidate.label, candidate.style]), [['Still needs attention', 'PRIMARY']]);
  // A viewer, or a caller that does not say, fails closed to the navigation (the operation needs CONTRIBUTOR).
  for (const options of [{ canContribute: false }, undefined, {}]) {
    assert.deepEqual(build(acceptedWorkAction(), options).map((candidate) => candidate.label), ['Open work']);
  }
  // Only accepted work is affected.
  const other = build({ ...acceptedWorkAction(), presentation: { ...acceptedWorkAction().presentation, variant: 'PLAIN' } }, { canContribute: true });
  assert.deepEqual(other.map((candidate) => candidate.label), ['Open work']);
});

// Sweep of the remaining producers (FRD v1.170): incident-detail and project-detail fallbacks.
test('incident-detail and project-detail primary CTAs route to their Ask operation, and only those paths', () => {
  const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
  const primaryFor = (href, overrides = {}) => {
    const action = { ...weatherAction(), ...overrides, primaryCta: { label: 'Review', href } };
    return buildFocusedHomeActionGuidance(action, 'context-v1').blocks
      .find((block) => block.id === 'focused-home-action-guidance').actions
      .find((candidate) => candidate.id === `home-action-primary-${action.id}`);
  };

  for (const [href, operationId] of [
    ['/dashboard/properties/property-1/incidents/incident-1', 'INCIDENT_CLAIM_STATUS'],
    ['/dashboard/properties/property-1/projects/project-1', 'PROJECT_TRACKER_PROJECTS'],
  ]) {
    const primary = primaryFor(href);
    assert.equal(primary.interactionType, 'START_WORKFLOW', href);
    assert.equal(primary.operationId, operationId, href);
    assert.equal(primary.href, undefined, `${href} must not also navigate`);
    // The message must route to the same operation by itself, not only via the forced hint: a phrasing the
    // deterministic router does not recognise would fall through to the remote-generation fallback.
    assert.equal(resolveAskOperation(primary.message).operationId, operationId, `${primary.message} must route deterministically`);
  }

  // Not matched: the bare lists (an incident list only ever appears as a secondary escalation link;
  // /projects is an onboarding activation handoff that must keep carrying its activation context).
  for (const href of ['/dashboard/properties/property-1/incidents', '/dashboard/properties/property-1/projects', '/dashboard/properties/property-1/incidents/incident-1/edit']) {
    const primary = primaryFor(href);
    assert.equal(primary.href, href, `${href} should still navigate`);
    assert.equal(primary.interactionType, undefined, href);
  }
  // A project with a renovation case stays Group C (navigation, demoted), not the tracker list.
  const renovation = primaryFor('/dashboard/properties/property-1/renovations/case-1');
  assert.equal(renovation.href, '/dashboard/properties/property-1/renovations/case-1');
  assert.equal(renovation.style, 'SECONDARY');
});
