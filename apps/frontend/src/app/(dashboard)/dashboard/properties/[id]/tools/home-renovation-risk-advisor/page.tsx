// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-renovation-risk-advisor/page.tsx
// Property-scoped entry point — redirects to the main Home Renovation Risk Advisor page
// with the property ID pre-selected via query param.

import { redirect } from 'next/navigation';

export default function HomeRenovationRiskAdvisorToolPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/dashboard/home-renovation-risk-advisor?propertyId=${encodeURIComponent(params.id)}`);
}
