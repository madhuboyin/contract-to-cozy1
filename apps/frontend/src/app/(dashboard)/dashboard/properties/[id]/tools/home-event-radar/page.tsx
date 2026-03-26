// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-event-radar/page.tsx
// Property-scoped entry point — redirects to the main Home Event Radar page
// with the property ID pre-selected and guidance context forwarded.

import { redirect } from 'next/navigation';

export default function HomeEventRadarToolPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  qs.set('propertyId', params.id);

  const guidanceJourneyId = searchParams['guidanceJourneyId'];
  const guidanceStepKey = searchParams['guidanceStepKey'];
  const guidanceSignalIntentFamily = searchParams['guidanceSignalIntentFamily'];

  if (guidanceJourneyId) qs.set('guidanceJourneyId', String(guidanceJourneyId));
  if (guidanceStepKey) qs.set('guidanceStepKey', String(guidanceStepKey));
  if (guidanceSignalIntentFamily) qs.set('guidanceSignalIntentFamily', String(guidanceSignalIntentFamily));

  redirect(`/dashboard/home-event-radar?${qs.toString()}`);
}
