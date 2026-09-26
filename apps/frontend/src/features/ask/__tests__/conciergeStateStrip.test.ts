import { buildConciergeStateStrip } from '../conciergeStateStrip';
import type { ConciergeHomeView } from '../types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 slice D (FRD v1.111).
const item = (id: string, consumerPriority: 'DO_NOW' | 'PLAN_SOON' | 'WATCH', extra = {}) => ({
  homeActionId: id, title: `Action ${id}`, askQuestion: `Ask about ${id}`, askCategoryId: 'MAINTAIN' as const, askCategoryLabel: 'Maintain' as const, subject: null,
  consumerPriority, comparativeReasonCodes: [], confidenceLabel: 'HIGH' as const, deadlineAt: null, cta: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false, ...extra,
});
const view = (overrides: Partial<ConciergeHomeView> = {}): ConciergeHomeView => ({
  propertyId: 'home', generatedAt: '2026-09-25T00:00:00.000Z',
  journeyContext: { state: 'AVAILABLE', ownershipState: 'ESTABLISHED_OWNER', operatingMode: 'OWNING', entryPath: null, propertyOrigin: null, contextVersion: null, capturedAt: null },
  priorityList: { state: 'AVAILABLE', rankingPolicyVersion: 'v1', generatedAt: null, items: [], truncated: false, href: '/dashboard' },
  changes: { state: 'NO_CHANGE', windowDays: 14, items: [], href: '/dashboard' },
  decisions: { state: 'NO_DECISIONS', items: [], href: '/dashboard' },
  landingSpotlight: null, capabilityGroups: [], featuredPrompts: [], suggestedQuestions: [], ...overrides,
});

describe('buildConciergeStateStrip', () => {
  it('states what needs attention and offers one chip per count', () => {
    const strip = buildConciergeStateStrip(view({ priorityList: { ...view().priorityList, items: [item('a', 'DO_NOW'), item('b', 'DO_NOW'), item('c', 'PLAN_SOON')] } }));
    expect(strip.headline).toBe('2 things need attention now, and 1 more to plan soon.');
    expect(strip.chips.map((chip) => [chip.label, chip.tone])).toEqual([['2 to do now', 'CRITICAL'], ['1 to plan soon', 'CAUTION']]);
    expect(strip.urgent?.title).toBe('Action a');
  });

  it('ignores suppressed, completed, stale, unavailable and watch-only items when counting', () => {
    const items = [item('a', 'DO_NOW', { suppressed: true }), item('b', 'DO_NOW', { completed: true }), item('c', 'PLAN_SOON', { stale: true }), item('d', 'PLAN_SOON', { unavailable: true }), item('e', 'WATCH')];
    const strip = buildConciergeStateStrip(view({ priorityList: { ...view().priorityList, items } }));
    expect(strip.headline).toBe('Nothing needs your attention right now.');
    expect(strip.chips).toEqual([]);
  });

  it('says so instead of implying the home is fine when priorities are unavailable', () => {
    const strip = buildConciergeStateStrip(view({ priorityList: { ...view().priorityList, state: 'UNAVAILABLE' }, changes: { ...view().changes, state: 'UNAVAILABLE' } }));
    expect(strip.headline).toBeNull();
    expect(strip.notes).toEqual(['Your priorities are temporarily unavailable.', 'Recent changes are temporarily unavailable.']);
  });

  it('adds a change chip only for important or urgent changes, tone by the worst one', () => {
    const changes = { state: 'AVAILABLE' as const, windowDays: 14, href: '/x', items: [
      { id: '1', source: 'Weather', summary: 's', materiality: 'INFORMATIONAL' as const, detectedAt: 'd', effectiveAt: null },
      { id: '2', source: 'Weather', summary: 's', materiality: 'IMPORTANT' as const, detectedAt: 'd', effectiveAt: null },
      { id: '3', source: 'Radar', summary: 's', materiality: 'URGENT' as const, detectedAt: 'd', effectiveAt: null },
    ] };
    const chip = buildConciergeStateStrip(view({ changes })).chips.find((entry) => entry.id === 'strip-changes');
    expect(chip?.label).toBe('2 important changes');
    expect(chip?.tone).toBe('CRITICAL');
    expect(chip?.prompt.question).toBe('What changed around my home lately?');
  });

  it('offers to continue the open decision and carries its thread id', () => {
    const decisions = { state: 'AVAILABLE' as const, href: '/x', items: [{ decisionThreadId: 't1', title: 'Replace the water heater', lifecycleStatus: 'OPEN', contextStatus: 'CURRENT', verdict: null, confidenceLabel: null, subject: null, updatedAt: 'x' }] };
    const chip = buildConciergeStateStrip(view({ decisions })).chips.at(-1);
    expect(chip?.label).toBe('Continue: Replace the water heater');
    expect(chip?.source).toBe('DECISION');
    expect(chip?.prompt.context).toEqual({ entityType: 'DECISION_THREAD', entityId: 't1' });
  });

  it('has no urgent item when the spotlight is a decision', () => {
    const decisions = { state: 'AVAILABLE' as const, href: '/x', items: [{ decisionThreadId: 't1', title: 'T', lifecycleStatus: 'OPEN', contextStatus: 'CURRENT', verdict: null, confidenceLabel: null, subject: null, updatedAt: 'x' }] };
    const strip = buildConciergeStateStrip(view({ decisions, landingSpotlight: { kind: 'DECISION', entityId: 't1' }, priorityList: { ...view().priorityList, items: [item('a', 'WATCH')] } }));
    expect(strip.urgent).toBeNull();
  });
});
