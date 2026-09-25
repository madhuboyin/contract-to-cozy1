import { planBulkWaive, computeCoverageBreakdown, computeRoomCoverage, donutGradient, getCoverageStatus, isCoverageWaived } from '../coverageBreakdown';

const item = (id: string, valueUsd: number, extra: Record<string, unknown> = {}) => ({ id, name: id, replacementCostCents: valueUsd * 100, roomId: 'r1', ...extra }) as any;

describe('coverage status and waiver', () => {
  it('reads the server coverage state first, then the waiver flag, then linked warranty or insurance', () => {
    expect(getCoverageStatus(item('a', 100, { coverageState: 'CONFIRMED' }))).toBe('confirmed');
    expect(getCoverageStatus(item('a', 100, { coverageState: 'MISSING' }))).toBe('missing');
    expect(getCoverageStatus(item('a', 100, { coverageState: 'INCOMPLETE' }))).toBe('incomplete');
    expect(getCoverageStatus(item('a', 100, { coverageState: 'NOT_REQUIRED' }))).toBe('excluded');
    expect(getCoverageStatus(item('a', 100, { coverageState: 'MANAGED_ELSEWHERE' }))).toBe('excluded');
    expect(getCoverageStatus(item('a', 100, { coverageNotRequired: true }))).toBe('excluded');
    expect(getCoverageStatus(item('a', 100, { warrantyId: 'w' }))).toBe('confirmed');
    expect(getCoverageStatus(item('a', 100))).toBe('incomplete');
  });

  it('waived means the homeowner said coverage is not needed; managed elsewhere is not a waiver', () => {
    expect(isCoverageWaived(item('a', 100, { coverageNotRequired: true }))).toBe(true);
    expect(isCoverageWaived(item('a', 100, { coverageState: 'NOT_REQUIRED' }))).toBe(true);
    expect(isCoverageWaived(item('a', 100, { coverageState: 'MANAGED_ELSEWHERE' }))).toBe(false);
    expect(isCoverageWaived(item('a', 100))).toBe(false);
  });
});

describe('computeCoverageBreakdown', () => {
  const items = [
    item('covered', 1000, { coverageState: 'CONFIRMED' }),
    item('missing', 1000, { coverageState: 'MISSING' }),
    item('incomplete', 500, { coverageState: 'INCOMPLETE' }),
    item('waived', 200, { coverageNotRequired: true, coverageState: 'NOT_REQUIRED' }),
    item('elsewhere', 300, { coverageState: 'MANAGED_ELSEWHERE' }),
    item('novalue', 0, { coverageState: 'MISSING' }),
  ];

  it('groups values, keeps waived out of both sides of the covered percentage, and ignores managed-elsewhere and valueless items', () => {
    expect(computeCoverageBreakdown(items)).toEqual({ confirmedValue: 1000, incompleteValue: 500, missingValue: 1000, waivedValue: 200, total: 2700, coveredPercent: 50 });
  });

  it('waiving a missing item removes it from the denominator, so the covered percentage rises', () => {
    const before = computeCoverageBreakdown([item('c', 1000, { coverageState: 'CONFIRMED' }), item('m', 1000, { coverageState: 'MISSING' })]);
    const after = computeCoverageBreakdown([item('c', 1000, { coverageState: 'CONFIRMED' }), item('m', 1000, { coverageState: 'NOT_REQUIRED', coverageNotRequired: true })]);
    expect(before.coveredPercent).toBe(50);
    expect(after.coveredPercent).toBe(100);
    expect(after.waivedValue).toBe(1000);
  });

  it('is zero and safe when nothing is valued', () => {
    expect(computeCoverageBreakdown([])).toEqual({ confirmedValue: 0, incompleteValue: 0, missingValue: 0, waivedValue: 0, total: 0, coveredPercent: 0 });
  });
});

describe('donutGradient', () => {
  it('adds a grey slice for waived value after covered, incomplete and missing', () => {
    const gradient = donutGradient({ confirmedValue: 25, incompleteValue: 25, missingValue: 25, waivedValue: 25, total: 100, coveredPercent: 50 });
    expect(gradient).toBe('conic-gradient(#10b981 0% 25%, #f59e0b 25% 50%, #ef4444 50% 75%, #9ca3af 75% 100%)');
  });
  it('has no grey slice when nothing is waived', () => {
    expect(donutGradient({ confirmedValue: 50, incompleteValue: 0, missingValue: 50, waivedValue: 0, total: 100, coveredPercent: 50 })).toContain('#9ca3af 100% 100%');
  });
});

describe('computeRoomCoverage', () => {
  const rooms = [{ id: 'r1', name: 'Kitchen' }, { id: 'r2', name: 'Office' }, { id: 'r3', name: 'Empty' }] as any;
  it('marks a room whose items are all waived so it can show a dash instead of 0%', () => {
    const result = computeRoomCoverage([
      item('a', 100, { roomId: 'r2', coverageNotRequired: true }), item('b', 200, { roomId: 'r2', coverageState: 'NOT_REQUIRED' }),
      item('c', 100, { roomId: 'r1', coverageState: 'CONFIRMED' }), item('d', 100, { roomId: 'r1', coverageState: 'MISSING' }),
    ], rooms);
    expect(result.find((room) => room.id === 'r2')).toMatchObject({ allWaived: true, coverageRate: null, itemCount: 2 });
    expect(result.find((room) => room.id === 'r1')).toMatchObject({ allWaived: false, coverageRate: 50, itemCount: 2 });
    expect(result.find((room) => room.id === 'r3')).toBeUndefined();
  });

  it('a room with waived and assessed items rates only the assessed ones', () => {
    const [room] = computeRoomCoverage([item('a', 100, { coverageNotRequired: true }), item('b', 300, { coverageState: 'CONFIRMED' })], rooms);
    expect(room).toMatchObject({ allWaived: false, coverageRate: 100, itemCount: 2 });
  });

  it('a room with only incomplete items is unrated but not waived', () => {
    const [room] = computeRoomCoverage([item('a', 100, { coverageState: 'INCOMPLETE' })], rooms);
    expect(room).toMatchObject({ allWaived: false, coverageRate: null });
  });

  it('whole-home systems get their own row', () => {
    const result = computeRoomCoverage([item('hvac', 5000, { roomId: null, recordGroup: 'SYSTEMS_STRUCTURE', coverageState: 'MISSING' })], rooms);
    expect(result).toEqual([{ id: 'whole-home', name: 'Whole home', coverageRate: 0, allWaived: false, itemCount: 1 }]);
  });
});

describe('planBulkWaive', () => {
  it('takes open items under the high-value threshold, holds back valuable ones, and skips waived, confirmed and managed-elsewhere items', () => {
    const plan = planBulkWaive([
      item('desk', 150, { coverageState: 'MISSING' }), item('mirror', 200, { coverageState: 'INCOMPLETE' }),
      item('sofa', 500, { coverageState: 'MISSING' }), item('tv', 1200, { coverageState: 'INCOMPLETE' }),
      item('done', 100, { coverageState: 'CONFIRMED' }), item('waived', 100, { coverageNotRequired: true, coverageState: 'MISSING' }),
      item('elsewhere', 100, { coverageState: 'MANAGED_ELSEWHERE' }), item('cheap', 499, { coverageState: 'MISSING' }),
    ]);
    expect(plan.eligible.map((entry) => entry.id)).toEqual(['desk', 'mirror', 'cheap']);
    expect(plan.heldBack.map((entry) => entry.id)).toEqual(['sofa', 'tv']);
    expect(plan.eligibleValue).toBe(849);
  });

  it('an item with no recorded value counts as under the threshold', () => {
    expect(planBulkWaive([item('novalue', 0, { coverageState: 'INCOMPLETE' })]).eligible).toHaveLength(1);
  });
});
