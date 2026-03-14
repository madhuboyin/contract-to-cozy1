// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-event-radar/page.tsx
// Property-scoped entry point — redirects to the main Home Event Radar page
// with the property ID pre-selected via query param.

import { redirect } from 'next/navigation';

export default function HomeEventRadarToolPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/dashboard/home-event-radar?propertyId=${encodeURIComponent(params.id)}`);
}
