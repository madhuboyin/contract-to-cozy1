import { calculateSeasonalProgress } from '../seasonalProgress';

describe('seasonal progress', () => {
  it('returns 0 when no tasks completed', () => {
    const result = calculateSeasonalProgress([
      { status: 'RECOMMENDED' },
      { status: 'ADDED' },
    ]);
    expect(result.completedCount).toBe(0);
    expect(result.totalCount).toBe(2);
    expect(result.progress).toBe(0);
  });

  it('returns 50 when half tasks completed', () => {
    const result = calculateSeasonalProgress([
      { status: 'completed' },
      { status: 'RECOMMENDED' },
    ]);
    expect(result.completedCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.progress).toBe(50);
  });

  it('returns 100 when all tasks completed', () => {
    const result = calculateSeasonalProgress([
      { status: 'COMPLETED' },
      { status: 'completed' },
    ]);
    expect(result.completedCount).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(result.progress).toBe(100);
  });

  it('handles empty task array without dividing by zero', () => {
    const result = calculateSeasonalProgress([]);
    expect(result.totalCount).toBe(0);
    expect(result.completedCount).toBe(0);
    expect(result.progress).toBe(0);
    expect(result.noTasks).toBe(true);
  });
});

