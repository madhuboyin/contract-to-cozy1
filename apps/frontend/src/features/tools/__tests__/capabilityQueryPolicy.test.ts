import { shouldRetryCapabilityQuery } from '../capabilityQueryPolicy';

describe('shouldRetryCapabilityQuery', () => {
  it('does not retry a rate-limited request', () => {
    expect(shouldRetryCapabilityQuery(0, { status: 429 })).toBe(false);
    expect(shouldRetryCapabilityQuery(0, { status: '429' })).toBe(false);
  });

  it('allows one retry for a non-rate-limit failure', () => {
    expect(shouldRetryCapabilityQuery(0, { status: 503 })).toBe(true);
    expect(shouldRetryCapabilityQuery(1, { status: 503 })).toBe(false);
  });
});
