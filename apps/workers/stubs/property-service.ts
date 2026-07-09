// Stub: property.service — worker build only
//
// analytics/emitter.ts dynamically imports '../property.service' to call
// maybeMarkPropertyActivated() as a side effect of every tracked event. The
// full property.service.ts is backend-only (pulls in a large web of other
// backend services) and isn't part of the workers shared-source copy list.
// This stub lets tsc resolve the dynamic import; the no-op means events
// emitted from worker-side jobs (e.g. gazette generation) still record
// normally, they just don't retrigger property-activation bookkeeping —
// that already happens from the backend API request that originated the
// underlying user action.
export async function maybeMarkPropertyActivated(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _propertyId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: string | null,
): Promise<void> {
  return undefined;
}
