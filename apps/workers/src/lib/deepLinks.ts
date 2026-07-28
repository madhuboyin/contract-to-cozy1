// apps/workers/src/lib/deepLinks.ts
//
// W1 item 7: typed builders for worker-generated notification `actionUrl`
// destinations. Previously each job inlined its own template string (or, for
// claims/recalls, a small locally-scoped function) — a typo or a frontend
// route rename had no compile-time signal, and only the runtime
// route-disposition audit (apps/frontend/scripts/product-framework/
// check-route-disposition.mjs, which now also scans apps/workers/src) would
// catch it, after the fact in CI. This doesn't replace that audit — a
// builder here can still point at a route that gets renamed — it adds a
// compile-time layer in front of it: every call site now goes through a
// typed function instead of an ad hoc template literal, so a destination
// changes in exactly one place instead of N inlined copies.

export function reserveFundUrl(propertyId: string): string {
  return `/dashboard/properties/${propertyId}/tools/reserve-fund`;
}

export function seasonalChecklistUrl(propertyId: string): string {
  return `/dashboard/seasonal?propertyId=${propertyId}`;
}

export function permitTrackerUrl(propertyId: string): string {
  return `/dashboard/properties/${propertyId}/tools/permits`;
}

export function savingsBenefitsUrl(propertyId: string): string {
  return `/dashboard/properties/${propertyId}/tools/savings-benefits`;
}

export function homeHabitCoachUrl(propertyId: string): string {
  return `/dashboard/properties/${propertyId}/tools/home-habit-coach`;
}

export function neighborhoodChangeRadarUrl(propertyId: string): string {
  return `/dashboard/properties/${propertyId}/tools/neighborhood-change-radar`;
}

export function homeEventRadarUrl(
  propertyId: string,
  options: {
    matchId?: string | null;
    view?: 'now' | 'upcoming' | 'recently_ended' | null;
    family?: 'weather' | 'air_quality' | 'disaster' | 'utility' | 'tax' | 'insurance' | 'other' | null;
    launchSurface?: string | null;
  } = {},
): string {
  const query = new URLSearchParams();
  if (options.view) query.set('view', options.view);
  if (options.family) query.set('family', options.family);
  if (options.matchId) query.set('matchId', options.matchId);
  if (options.launchSurface) query.set('launchSurface', options.launchSurface);
  const path = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-event-radar`;
  return query.size ? `${path}?${query.toString()}` : path;
}

export function claimDetailUrl(propertyId?: string | null, claimId?: string | null): string | undefined {
  if (!propertyId || !claimId) return undefined;
  return `/dashboard/properties/${propertyId}/claims/${claimId}`;
}

export interface RecallGuidanceContext {
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  itemId?: string | null;
}

export function recallFollowUpUrl(
  propertyId: string,
  matchId: string,
  guidanceContext?: RecallGuidanceContext | null,
): string {
  const params = new URLSearchParams();
  params.set('matchId', matchId);
  if (guidanceContext?.guidanceJourneyId) params.set('guidanceJourneyId', guidanceContext.guidanceJourneyId);
  if (guidanceContext?.guidanceStepKey) params.set('guidanceStepKey', guidanceContext.guidanceStepKey);
  if (guidanceContext?.guidanceSignalIntentFamily) {
    params.set('guidanceSignalIntentFamily', guidanceContext.guidanceSignalIntentFamily);
  }
  if (guidanceContext?.itemId) params.set('itemId', guidanceContext.itemId);
  return `/dashboard/properties/${propertyId}/recalls?${params.toString()}`;
}
