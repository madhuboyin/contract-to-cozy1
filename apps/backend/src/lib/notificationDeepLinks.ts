// apps/backend/src/lib/notificationDeepLinks.ts
//
// W1 item 7: typed builder for the warranty notification destination —
// mirrors apps/workers/src/lib/deepLinks.ts's rationale for the
// worker-owned destinations (recalls, permits, reserve fund, neighborhood,
// seasonal, claims). Warranty deadline notifications are produced by a
// backend-owned service (newHomeWarrantyDeadline.service.ts, invoked by the
// worker via runNewHomeWarrantyDeadlineJob), not a worker-owned one, so its
// builder lives here rather than in the workers-only module — workers can
// import from backend via @worker-shared, not the reverse.

export function newHomeWarrantyPlanUrl(propertyId: string): string {
  return `/dashboard/properties/${propertyId}/new-home-plan`;
}
