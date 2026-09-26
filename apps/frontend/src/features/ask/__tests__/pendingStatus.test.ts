import { pendingStage, pendingStageText, pendingStatusLabel } from '../pendingStatus';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-006 (FRD v1.112).
describe('pendingStatusLabel', () => {
  it('names the area the question points at, from the question alone', () => {
    expect(pendingStatusLabel('What maintenance tasks are coming due?')).toBe('Checking your maintenance records…');
    expect(pendingStatusLabel('Which items may be missing coverage?')).toBe('Checking your coverage and warranty records…');
    expect(pendingStatusLabel('Where could I reduce ownership costs?')).toBe('Checking your costs and finances…');
    expect(pendingStatusLabel('Is there a storm coming this weekend?')).toBe('Checking your weather and local alerts…');
    expect(pendingStatusLabel('Find my dishwasher manual')).toBe('Checking your documents…');
  });
  it('stays generic when the question does not point at one area', () => {
    expect(pendingStatusLabel('Give me a summary of my home record.')).toBe('Checking your home record…');
    expect(pendingStatusLabel('hello')).toBe('Checking your home record…');
  });
});

describe('pendingStage', () => {
  it('moves from the plain line to "still working" to a stop-and-retry note as time passes', () => {
    expect(pendingStage(0)).toBe('WORKING');
    expect(pendingStage(5_999)).toBe('WORKING');
    expect(pendingStage(6_000)).toBe('STILL_WORKING');
    expect(pendingStage(14_999)).toBe('STILL_WORKING');
    expect(pendingStage(15_000)).toBe('SLOW');
  });
  it('says something different at each stage', () => {
    expect(pendingStageText('WORKING', 'Checking your maintenance records…')).toBe('Checking your maintenance records…');
    expect(pendingStageText('STILL_WORKING', 'x')).toBe('Still working on this…');
    expect(pendingStageText('SLOW', 'x')).toBe('This is taking longer than usual. You can stop and try again.');
  });
});
