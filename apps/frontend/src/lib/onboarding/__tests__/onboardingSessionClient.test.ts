import {
  clearOnboardingLookupSession,
  persistCommittedOnboardingProperty,
} from '@/lib/onboarding/onboardingSessionClient';

describe('onboarding session completion helpers', () => {
  it('persists the committed Property ID with the existing onboarding data', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true });

    await expect(persistCommittedOnboardingProperty(
      { address: '1 Main St', activationContext: { entryPath: 'EXISTING_OWNER_TRIGGER' } },
      '4df2ac7b-b715-4ad9-9400-4ce0d10c4e78',
      fetcher,
    )).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledWith('/api/onboarding-lookup-session', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('4df2ac7b-b715-4ad9-9400-4ce0d10c4e78'),
    }));
  });

  it('never rejects successful onboarding when cleanup fails', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rejectedFetch = jest.fn().mockRejectedValue(new Error('offline'));
    const failedFetch = jest.fn().mockResolvedValue({ ok: false });

    await expect(clearOnboardingLookupSession(rejectedFetch)).resolves.toBeUndefined();
    await expect(clearOnboardingLookupSession(failedFetch)).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledTimes(2);
    warning.mockRestore();
  });
});
