type ProviderSearchContext = {
  decision: { status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN' };
};

/**
 * Discovery remains available when responsibility is unknown. Only a confirmed
 * not-applicable decision (for example, landlord/association responsibility)
 * pauses the marketplace search.
 */
export function shouldPauseProviderSearch(context?: ProviderSearchContext | null): boolean {
  return context?.decision.status === 'NOT_APPLICABLE';
}
