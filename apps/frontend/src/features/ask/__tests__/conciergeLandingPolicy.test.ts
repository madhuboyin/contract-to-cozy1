import { resolveConciergeLandingSpotlight, visibleConciergeFeaturedPrompts } from '../conciergeLandingPolicy';
import type { ConciergeHomeView } from '../types';

const refrigerator = { kind: 'INVENTORY_ITEM' as const, id: 'refrigerator-1', label: 'Refrigerator' };

function view(overrides: Partial<ConciergeHomeView> = {}): ConciergeHomeView {
  return {
    propertyId: 'home-1',
    generatedAt: '2026-08-14T12:00:00.000Z',
    journeyContext: { state: 'UNKNOWN', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null, propertyOrigin: null, contextVersion: null, capturedAt: null },
    priorityList: {
      state: 'AVAILABLE', rankingPolicyVersion: 'v1', generatedAt: '2026-08-14T12:00:00.000Z', truncated: false, href: '/actions',
      items: [{
        homeActionId: 'fridge-action', title: 'Plan ahead for Refrigerator', askQuestion: 'What should I do next for the refrigerator?', askCategoryId: 'MAINTAIN', askCategoryLabel: 'Maintain', subject: refrigerator,
        consumerPriority: 'PLAN_SOON', comparativeReasonCodes: [], confidenceLabel: 'HIGH', deadlineAt: null, cta: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false,
      }],
    },
    changes: { state: 'NO_CHANGE', windowDays: 30, items: [], href: '/changes' },
    decisions: {
      state: 'AVAILABLE', href: '/decisions',
      items: [{ decisionThreadId: 'fridge-decision', title: 'Repair or replace the refrigerator', lifecycleStatus: 'IN_PROGRESS', contextStatus: 'CURRENT', verdict: null, confidenceLabel: 'MEDIUM', subject: refrigerator, updatedAt: '2026-08-14T12:00:00.000Z' }],
    },
    landingSpotlight: null,
    capabilityGroups: [
      { id: 'UNDERSTAND', label: 'Understand', description: '', capabilityIds: [], prompts: [{ id: 'understand', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'Summarize this home.' }] },
      { id: 'MAINTAIN', label: 'Maintain', description: '', capabilityIds: [], prompts: [{ id: 'maintain', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance is due?' }] },
      { id: 'PROTECT', label: 'Protect', description: '', capabilityIds: [], prompts: [{ id: 'protect', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'What needs protection?' }] },
      { id: 'SAVE', label: 'Save', description: '', capabilityIds: [], prompts: [{ id: 'save', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where can I save?' }] },
    ],
    featuredPrompts: [
      { id: 'decision-fridge-decision', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Should I repair or replace my refrigerator?', subject: refrigerator, context: { entityType: 'DECISION_THREAD', entityId: 'fridge-decision' }, source: 'PERSONALIZED' },
      { id: 'attention-fridge-action', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What should I do next for the refrigerator?', subject: refrigerator, context: { entityType: 'HOME_ACTION', entityId: 'fridge-action' }, source: 'PERSONALIZED' },
    ],
    suggestedQuestions: [],
    ...overrides,
  };
}

describe('Ask Cozy landing precedence', () => {
  it('places actionable attention ahead of an active decision', () => {
    expect(resolveConciergeLandingSpotlight(view())).toEqual({ kind: 'ATTENTION', entityId: 'fridge-action' });
  });

  it('places a decision ahead of watch-only attention', () => {
    const current = view();
    current.priorityList.items[0].consumerPriority = 'WATCH';
    expect(resolveConciergeLandingSpotlight(current)).toEqual({ kind: 'DECISION', entityId: 'fridge-decision' });
  });

  it('reserves the spotlight subject and fills discovery with diverse capabilities', () => {
    const current = view({ landingSpotlight: { kind: 'ATTENTION', entityId: 'fridge-action' } });
    const prompts = visibleConciergeFeaturedPrompts(current);
    expect(prompts).toHaveLength(4);
    expect(prompts.map((prompt) => prompt.categoryId)).toEqual(['UNDERSTAND', 'MAINTAIN', 'PROTECT', 'SAVE']);
    expect(prompts.some((prompt) => prompt.question.toLowerCase().includes('refrigerator'))).toBe(false);
  });
});
