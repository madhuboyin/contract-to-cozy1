const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildFocusedHomeActionGuidance,
  focusedHomeActionCategory,
  focusedHomeActionQuestion,
  focusedOperationForLaunchContext,
  homeActionPriorityFilter,
} = require('../../src/services/ask/askFocusedGuidance.ts');

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
    { href: '/dashboard/properties/property-1/tools/coverage-intelligence?stage=questions', operationId: 'COVERAGE_GAPS' },
    { href: '/dashboard/home-event-radar?propertyId=property-1', operationId: 'HOME_EVENT_RADAR_FEED' },
    { href: '/dashboard/properties/property-1/tools/sell-hold-rent', operationId: 'SELL_HOLD_RENT_ANALYSIS' },
    { href: '/dashboard/properties/property-1/tools/mortgage-refinance-radar', operationId: 'REFINANCE_ANALYSIS' },
    { href: '/dashboard/properties/property-1/tools/savings-benefits', operationId: 'SAVINGS_OPPORTUNITIES' },
    { href: '/dashboard/properties/property-1/tools/property-tax?stage=appeal&caseId=case-1', operationId: 'PROPERTY_TAX_APPEAL_READINESS' },
    { href: '/dashboard/seasonal?propertyId=property-1', operationId: 'MAINTENANCE_STATUS' },
  ];

  for (const { href, operationId } of cases) {
    const action = { ...weatherAction(), primaryCta: { label: 'Open destination', href } };
    const result = buildFocusedHomeActionGuidance(action, 'context-v1');
    const focused = result.blocks.find((block) => block.id === 'focused-home-action-guidance');
    const primaryAction = focused.actions.find((candidate) => candidate.id === `home-action-primary-${action.id}`);
    assert.equal(primaryAction.interactionType, 'START_WORKFLOW', `${href} should start a workflow instead of navigating`);
    assert.equal(primaryAction.operationId, operationId, `${href} should route to ${operationId}`);
    assert.equal(primaryAction.href, undefined, `${href} should not also carry a navigation href`);
    assert.ok(primaryAction.message && primaryAction.message.length > 0, `${href} should carry a homeowner-visible message`);
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
  const agePrimary = ageFocused.actions.find((candidate) => candidate.id === `home-action-primary-${ageAction.id}`);
  assert.equal(agePrimary.href, ageAction.primaryCta.href);
  assert.equal(agePrimary.style, 'SECONDARY', 'CTA should be demoted once the checklist answers inline');
  assert.equal(agePrimary.interactionType, undefined);

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
    { href: '/dashboard/properties/property-1/tools/sale-case?section=readiness&itemId=item-1', overrides: {} },
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
