import HomeRenovationRiskAdvisorPageClient from '@/app/(dashboard)/dashboard/home-renovation-risk-advisor/HomeRenovationRiskAdvisorPageClient';

export default function HomeRenovationRiskAdvisorToolPage({
  params,
}: {
  params: { id: string };
}) {
  return <HomeRenovationRiskAdvisorPageClient propertyId={params.id} />;
}
