import { Suspense } from 'react';
import ResolutionCenterClient from './ResolutionCenterClient';

/**
 * Phase 8 canonical Home Action surface. Property selection is accepted by
 * query string and synchronized by the client; there is no Fix redirect hop.
 */
export default function ResolutionCenterPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] animate-pulse rounded-2xl bg-slate-100" />}>
      <ResolutionCenterClient />
    </Suspense>
  );
}
