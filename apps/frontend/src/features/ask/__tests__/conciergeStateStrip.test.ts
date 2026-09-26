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

// ACUI-001 / ACUI-002.
describe('buildConciergeStateStrip opening and explanations', () => {
  const withItems = (items: ReturnType<typeof item>[], extra: Partial<ConciergeHomeView> = {}) => view({ priorityList: { ...view().priorityList, items }, ...extra });
  const importantChange = { id: 'c', source: 'Weather', summary: 'Hail reported', materiality: 'IMPORTANT' as const, detectedAt: '2026-09-20T12:00:00.000Z', effectiveAt: '2026-09-28T00:00:00.000Z' };

  it('opens with the state: attention, upcoming, change, or genuinely quiet', () => {
    expect(buildConciergeStateStrip(withItems([item('a', 'DO_NOW'), item('b', 'DO_NOW')])).opening).toBe('2 things need your attention now.');
    expect(buildConciergeStateStrip(withItems([item('a', 'PLAN_SOON')])).opening).toBe('Nothing urgent. 1 thing to plan soon.');
    expect(buildConciergeStateStrip(withItems([], { changes: { state: 'AVAILABLE', windowDays: 14, href: '/x', items: [importantChange] } })).opening).toBe('1 important change to review.');
    expect(buildConciergeStateStrip(withItems([item('a', 'DO_NOW')], { changes: { state: 'AVAILABLE', windowDays: 14, href: '/x', items: [importantChange] } })).opening).toBe('1 thing needs your attention now. 1 important change to review.');
    expect(buildConciergeStateStrip(withItems([])).opening).toBe('Nothing needs your attention right now.');
  });

  it('never says nothing or nothing-urgent when a source is unavailable, and leaves the opening unknown when priorities are', () => {
    const changesDown = { changes: { state: 'UNAVAILABLE' as const, windowDays: 14, href: '/x', items: [] } };
    expect(buildConciergeStateStrip(withItems([], changesDown)).opening).toBeNull();
    expect(buildConciergeStateStrip(withItems([item('a', 'PLAN_SOON')], changesDown)).opening).toBe('1 thing to plan soon.');
    expect(buildConciergeStateStrip(view({ priorityList: { ...view().priorityList, state: 'UNAVAILABLE' } })).opening).toBeNull();
  });

  it('explains attention chips from governed fields only', () => {
    const chip = buildConciergeStateStrip(withItems([item('a', 'DO_NOW', { deadlineAt: '2026-09-20T00:00:00.000Z', comparativeReasonCodes: ['SAFETY_FLOOR', 'STABLE_TIE_BREAK'], confidenceLabel: 'LOW' })])).chips[0];
    expect(chip.explanation?.reasons).toEqual([
      'It is ranked “do now” in your home priorities.',
      '“Action a” was due Sep 20.',
      'Safety-related items are ranked first.',
      'Confidence in “Action a”: low.',
    ]);
  });

  it('explains change and decision entries, and skips an unparseable date instead of guessing', () => {
    const decisions = { state: 'AVAILABLE' as const, href: '/x', items: [{ decisionThreadId: 't1', title: 'Roof', lifecycleStatus: 'IN_PROGRESS', contextStatus: 'CURRENT', verdict: null, confidenceLabel: null, subject: null, updatedAt: 'not-a-date' }] };
    const strip = buildConciergeStateStrip(withItems([], { decisions, changes: { state: 'AVAILABLE', windowDays: 14, href: '/x', items: [importantChange] } }));
    expect(strip.chips.find((chip) => chip.id === 'strip-changes')?.explanation?.reasons).toEqual([
      'A change in the last 14 days was marked important.',
      'The latest was detected Sep 20 and takes effect Sep 28.',
    ]);
    expect(strip.chips.find((chip) => chip.id === 'strip-decision-t1')?.explanation?.reasons).toEqual(['You have an open decision (in progress).']);
  });
});

