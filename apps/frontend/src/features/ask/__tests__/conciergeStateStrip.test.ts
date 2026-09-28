import { buildConciergeStateStrip } from '../conciergeStateStrip';
import type { ConciergeHomeView } from '../types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 slice D (FRD v1.111).
const item = (id: string, consumerPriority: 'DO_NOW' | 'PLAN_SOON' | 'WATCH' | 'OPTIONAL', extra = {}) => ({
  homeActionId: id, title: `Action ${id}`, askQuestion: `Ask about ${id}`, askCategoryId: 'MAINTAIN' as const, askCategoryLabel: 'Maintain' as const, subject: null,
  rawPriority: ({ DO_NOW: 'NOW', PLAN_SOON: 'SOON', WATCH: 'PLAN', OPTIONAL: 'CONSIDER' } as const)[consumerPriority],
  consumerPriority, comparativeReasonCodes: [], confidenceLabel: 'HIGH' as const, deadlineAt: null, cta: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false, ...extra,
});
const view = (overrides: Partial<ConciergeHomeView> = {}): ConciergeHomeView => ({
  propertyId: 'home', generatedAt: '2026-09-25T00:00:00.000Z',
  journeyContext: { state: 'AVAILABLE', ownershipState: 'ESTABLISHED_OWNER', operatingMode: 'OWNING', entryPath: null, propertyOrigin: null, contextVersion: null, capturedAt: null },
  priorityList: { state: 'AVAILABLE', rankingPolicyVersion: 'v1', generatedAt: null, items: [], truncated: false, href: '/dashboard' },
  changes: { state: 'NO_CHANGE', windowDays: 14, items: [], href: '/dashboard' },
  decisions: { state: 'NO_DECISIONS', items: [], href: '/dashboard' },
  homeContinuity: { state: 'AVAILABLE', decisions: [], activeMajorMoment: null },
  landingSpotlight: null, capabilityGroups: [], featuredPrompts: [], suggestedQuestions: [], ...overrides,
});

describe('buildConciergeStateStrip', () => {
  it('states what needs attention and exposes the two dashboard priority sections', () => {
    const strip = buildConciergeStateStrip(view({ priorityList: { ...view().priorityList, items: [item('a', 'DO_NOW'), item('b', 'DO_NOW'), item('c', 'PLAN_SOON')] } }));
    expect(strip.headline).toBe('2 things need attention now, and 1 more to plan soon.');
    expect(strip.chips.map((chip) => [chip.label, chip.count, chip.tone])).toEqual([
      ['What needs attention', 3, 'CRITICAL'],
      ['Plan ahead', 0, 'DEFAULT'],
    ]);
    expect(strip.urgent?.title).toBe('Action a');
  });

  it('preserves the server projection even when an item carries a disclosed state flag', () => {
    const items = [item('a', 'DO_NOW', { suppressed: true }), item('b', 'DO_NOW', { completed: true }), item('c', 'PLAN_SOON', { stale: true }), item('d', 'PLAN_SOON', { unavailable: true }), item('e', 'WATCH')];
    const strip = buildConciergeStateStrip(view({ priorityList: { ...view().priorityList, items } }));
    expect(strip.headline).toBe('2 things need attention now, and 2 more to plan soon.');
    expect(strip.chips.map((chip) => [chip.label, chip.count, chip.detail])).toEqual([
      ['What needs attention', 4, 'Action a'],
      ['Plan ahead', 1, 'Action e'],
    ]);
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

  it('opens with one line of state: what is urgent, what is coming, and what changed', () => {
    const changes = { changes: { state: 'AVAILABLE' as const, windowDays: 14, href: '/x', items: [importantChange] } };
    expect(buildConciergeStateStrip(withItems([item('a', 'DO_NOW'), item('b', 'DO_NOW')])).opening).toBe('2 items need attention');
    expect(buildConciergeStateStrip(withItems([item('a', 'PLAN_SOON')])).opening).toBe('1 item needs attention');
    expect(buildConciergeStateStrip(withItems([item('a', 'PLAN_SOON'), item('b', 'PLAN_SOON'), item('c', 'PLAN_SOON'), item('d', 'PLAN_SOON')], { changes: { state: 'AVAILABLE' as const, windowDays: 14, href: '/x', items: [importantChange, { ...importantChange, id: 'd' }, { ...importantChange, id: 'e' }] } })).opening).toBe('4 items need attention · 3 recent changes');
    expect(buildConciergeStateStrip(withItems([], changes)).opening).toBe('Nothing needs attention · 1 recent change');
    expect(buildConciergeStateStrip(withItems([item('a', 'DO_NOW')], changes)).opening).toBe('1 item needs attention · 1 recent change');
    expect(buildConciergeStateStrip(withItems([])).opening).toBe('Nothing needs your attention right now');
  });

  it('never says nothing or nothing-urgent when a source is unavailable, and leaves the opening unknown when priorities are', () => {
    const changesDown = { changes: { state: 'UNAVAILABLE' as const, windowDays: 14, href: '/x', items: [] } };
    expect(buildConciergeStateStrip(withItems([], changesDown)).opening).toBeNull();
    expect(buildConciergeStateStrip(withItems([item('a', 'PLAN_SOON')], changesDown)).opening).toBe('1 item needs attention');
    expect(buildConciergeStateStrip(view({ priorityList: { ...view().priorityList, state: 'UNAVAILABLE' } })).opening).toBeNull();
  });

  it('explains attention chips from governed fields only', () => {
    const chip = buildConciergeStateStrip(withItems([item('a', 'DO_NOW', { deadlineAt: '2026-09-20T00:00:00.000Z', comparativeReasonCodes: ['SAFETY_FLOOR', 'STABLE_TIE_BREAK'], confidenceLabel: 'LOW' })])).chips[0];
    expect(chip.explanation?.reasons).toEqual([
      'It is in “What needs attention” on your Home dashboard.',
      '“Action a” was due Sep 20.',
      'Safety-related items are ranked first.',
      'Confidence in “Action a”: low.',
    ]);
  });

  it('keeps Plan ahead second and counts both watch and optional priorities', () => {
    const strip = buildConciergeStateStrip(withItems([item('a', 'WATCH'), item('b', 'OPTIONAL')], { changes: { state: 'AVAILABLE', windowDays: 14, href: '/x', items: [importantChange] } }));
    expect(strip.chips.slice(0, 2).map((chip) => [chip.id, chip.count])).toEqual([
      ['strip-needs-attention', 0],
      ['strip-plan-ahead', 2],
    ]);
    expect(strip.chips[2]?.id).toBe('strip-changes');
    expect(strip.opening).toBe('Nothing needs attention · 2 to plan ahead · 1 recent change');
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
