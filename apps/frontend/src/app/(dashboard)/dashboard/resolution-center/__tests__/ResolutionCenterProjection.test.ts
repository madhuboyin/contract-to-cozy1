import {
  canCaptureResolutionInline,
  composeResolutionCases,
  isDecisionAction,
  isExecutionExceptionAction,
  isMissingInformationAction,
  isProviderExecutionAction,
  isUrgentAction,
  resolutionCaseCtas,
  resolutionCaseKind,
  resolveAssetTitle,
  resolveIssueDescription,
  resolveIssueHeadline,
  toResolutionAction,
} from '../ResolutionCenterClient';

function canonicalAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'maintenance:washer-1',
    lineageId: 'maintenance:washer-1',
    priority: 'SOON',
    state: 'OPEN',
    signal: 'Washer maintenance is approaching',
    whyItMatters: 'The recorded service interval is approaching.',
    recommendedAction: 'Review washer maintenance',
    expectedOutcome: 'Keep the washer reliable.',
    presentation: {
      variant: 'GENERIC_ACTION',
      eyebrow: 'Maintenance',
      headline: 'Review washer maintenance',
      summary: 'The recorded washer service interval is approaching.',
      whyNow: 'Your Home Record shows the washer service window is approaching.',
      keyFacts: [],
      factGroups: [],
      subject: { kind: 'INVENTORY_ITEM', id: 'washer-1', label: 'Washer' },
      detailLabel: 'Why this?',
      group: null,
    },
    timing: { dueAt: null, windowStart: null, windowEnd: null, rationale: 'No exact due date.' },
    evidence: [{ id: 'e1', label: 'Washer', source: 'Home Record', freshness: 'CURRENT', confidence: 0.8 }],
    assumptions: [],
    confidence: { score: 0.8, label: 'HIGH', missing: [] },
    primaryCta: { kind: 'REVIEW', label: 'Review maintenance', href: '/dashboard/maintenance' },
    secondaryCtas: [],
    feedbackControls: ['SNOOZE'],
    source: { kind: 'MAINTENANCE', entityId: 'washer-1', version: 'v1' },
    job: 'STAY_AHEAD',
    options: [],
    tradeoffs: [],
    recommendationResponse: {},
    governance: { safetyTier: 'LOW_CONSEQUENCE' },
    decisionLineage: null,
    ranking: { rank: 1, score: 1, explanation: '', components: {} },
    deduplication: { canonicalKey: 'asset-service-item:washer-1', mergedActionIds: [] },
    workItem: null,
    ...overrides,
  } as any;
}

describe('Resolution Center canonical projection', () => {
  it('renders canonical subject, headline, and rationale without keyword-authored diagnoses', () => {
    const item = toResolutionAction(canonicalAction());

    expect(resolveAssetTitle(item)).toBe('Washer');
    expect(resolveIssueHeadline(item)).toBe('Review washer maintenance');
    expect(resolveIssueDescription(item, resolveIssueHeadline(item))).toBe(
      'Your Home Record shows the washer service window is approaching.',
    );
  });

  it('does not classify every SOON action as urgent', () => {
    const soon = toResolutionAction(canonicalAction());
    const now = toResolutionAction(canonicalAction({ priority: 'NOW' }));

    expect(isUrgentAction(soon)).toBe(false);
    expect(isUrgentAction(now)).toBe(true);
  });

  it('uses the canonical accepted-work variant rather than source kind for provider execution', () => {
    const maintenance = toResolutionAction(canonicalAction());
    const acceptedWork = toResolutionAction(canonicalAction({
      presentation: {
        ...canonicalAction().presentation,
        variant: 'ACCEPTED_WORK',
      },
    }));

    expect(isProviderExecutionAction(maintenance)).toBe(false);
    expect(isProviderExecutionAction(acceptedWork)).toBe(true);
  });

  it('keeps routine and ordinary accepted work out of the Resolution Center', () => {
    const preventive = toResolutionAction(canonicalAction());
    const accepted = toResolutionAction(canonicalAction({
      presentation: { ...canonicalAction().presentation, variant: 'ACCEPTED_WORK' },
      workItem: { state: 'ACCEPTED' },
    }));

    expect(resolutionCaseKind(preventive)).toBeNull();
    expect(resolutionCaseKind(accepted)).toBeNull();
  });

  it('includes exact information gaps and accepted-work exceptions', () => {
    const information = toResolutionAction(canonicalAction({
      confidence: { score: 0.4, label: 'LOW', missing: ['Installation year'] },
      recommendationResponse: { status: 'LOW_CONFIDENCE', missingFacts: ['Installation year'] },
    }));
    const exception = toResolutionAction(canonicalAction({
      presentation: { ...canonicalAction().presentation, variant: 'ACCEPTED_WORK' },
      workItem: { state: 'BLOCKED' },
    }));

    expect(isMissingInformationAction(information)).toBe(true);
    expect(resolutionCaseKind(information)).toBe('information');
    expect(isExecutionExceptionAction(exception)).toBe(true);
    expect(resolutionCaseKind(exception)).toBe('exceptions');
  });

  it('does not turn low-confidence accepted work into a dead review case', () => {
    const accepted = toResolutionAction(canonicalAction({
      presentation: { ...canonicalAction().presentation, variant: 'ACCEPTED_WORK' },
      confidence: { score: 0.4, label: 'LOW', missing: ['Contractor assignment'] },
      recommendationResponse: { status: 'LOW_CONFIDENCE', missingFacts: ['Contractor assignment'] },
      workItem: { state: 'ACCEPTED' },
    }));

    expect(isMissingInformationAction(accepted)).toBe(false);
    expect(resolutionCaseKind(accepted)).toBeNull();
  });

  it('opens canonical correction contracts inline', () => {
    const correction = toResolutionAction(canonicalAction({
      primaryCta: { kind: 'CORRECT_FACT', label: 'Update item details', href: '/inventory' },
      propertyContextFeature: {
        featureKey: 'CAPITAL_TIMELINE',
        operationKey: 'RUN_TIMELINE',
        operationInput: { inventoryItemId: 'washer-1' },
      },
    }));

    expect(canCaptureResolutionInline(correction)).toBe(true);
    expect(canCaptureResolutionInline(toResolutionAction(canonicalAction()))).toBe(false);
  });

  it('promotes an information card correction CTA over its planning CTA', () => {
    const action = canonicalAction({
      confidence: { score: 0.6, label: 'MEDIUM', missing: ['Installation year'] },
      primaryCta: { kind: 'REVIEW', label: 'Plan replacement', href: '/capital-timeline' },
      secondaryCtas: [{ kind: 'CORRECT_FACT', label: 'Update item details', href: '/inventory' }],
      propertyContextFeature: {
        featureKey: 'CAPITAL_TIMELINE', operationKey: 'RUN_TIMELINE', operationInput: { inventoryItemId: 'washer-1' },
      },
    });
    const [item] = composeResolutionCases([action]);
    const { primary, secondary } = resolutionCaseCtas(item);

    expect(primary.kind).toBe('CORRECT_FACT');
    expect(canCaptureResolutionInline(item.action, primary)).toBe(true);
    expect(secondary?.kind).toBe('REVIEW');
  });

  it('includes real decisions without treating ordinary upkeep as a decision', () => {
    expect(isDecisionAction(toResolutionAction(canonicalAction({ job: 'DECIDE' })))).toBe(true);
    expect(isDecisionAction(toResolutionAction(canonicalAction()))).toBe(false);
  });

  it('folds multiple signals for one inventory item into one case', () => {
    const decision = canonicalAction({
      id: 'replace:washer-1',
      job: 'DECIDE',
      presentation: {
        ...canonicalAction().presentation,
        headline: 'Consider replacing the washer',
      },
    });
    const information = canonicalAction({
      id: 'facts:washer-1',
      confidence: { score: 0.4, label: 'LOW', missing: ['Installation year'] },
      recommendationResponse: { status: 'LOW_CONFIDENCE', missingFacts: ['Installation year'] },
      presentation: {
        ...canonicalAction().presentation,
        headline: 'Confirm washer installation year',
      },
    });

    const cases = composeResolutionCases([decision, information]);
    expect(cases).toHaveLength(1);
    expect(cases[0].kind).toBe('information');
    expect(cases[0].relatedActions).toHaveLength(1);
    expect(cases[0].missingInformation).toEqual(['Installation year']);
  });

  it('keeps cases for different inventory items separate', () => {
    const washer = canonicalAction({ job: 'DECIDE' });
    const refrigerator = canonicalAction({
      id: 'replace:refrigerator-1',
      job: 'DECIDE',
      presentation: {
        ...canonicalAction().presentation,
        subject: { kind: 'INVENTORY_ITEM', id: 'refrigerator-1', label: 'Refrigerator' },
      },
    });

    expect(composeResolutionCases([washer, refrigerator])).toHaveLength(2);
  });

  it('shows one decision for an environment insight and its durable preparation checklist', () => {
    const insight = canonicalAction({
      id: 'environment:heat-window',
      job: 'DECIDE',
      presentation: {
        ...canonicalAction().presentation,
        variant: 'ENVIRONMENT_PREPARATION',
        headline: 'Unseasonable multi-day heat risk ahead',
        subject: { kind: 'CHECKLIST', id: 'heat-window', label: 'Heat risk' },
      },
      deduplication: { canonicalKey: 'weather-preparation:property-1:heat-window', mergedActionIds: [] },
    });
    const preparation = canonicalAction({
      id: 'incident:preparation-1',
      job: 'DECIDE',
      presentation: {
        ...canonicalAction().presentation,
        variant: 'ENVIRONMENT_PREPARATION',
        headline: 'Unseasonable multi-day heat risk ahead preparation',
        subject: { kind: 'CHECKLIST', id: 'heat-window', label: 'Heat preparation checklist' },
      },
      deduplication: { canonicalKey: 'weather-preparation:property-1:heat-window', mergedActionIds: ['environment:heat-window'] },
    });

    expect(composeResolutionCases([insight, preparation])).toHaveLength(1);
  });
});
