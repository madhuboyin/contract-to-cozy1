import {
  isProviderExecutionAction,
  isUrgentAction,
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
});
