type SessionFetch = typeof fetch;

export async function persistCommittedOnboardingProperty(
  data: Record<string, unknown>,
  committedPropertyId: string,
  fetcher: SessionFetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher('/api/onboarding-lookup-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...data, committedPropertyId } }),
    });
    if (!response.ok) {
      console.error('Unable to persist committed onboarding Property ID');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Unable to persist committed onboarding Property ID:', error);
    return false;
  }
}

export async function clearOnboardingLookupSession(
  fetcher: SessionFetch = fetch,
): Promise<void> {
  try {
    const response = await fetcher('/api/onboarding-lookup-session', { method: 'DELETE' });
    if (!response.ok) {
      console.warn('Onboarding lookup session cleanup was deferred');
    }
  } catch (error) {
    console.warn('Onboarding lookup session cleanup was deferred:', error);
  }
}
