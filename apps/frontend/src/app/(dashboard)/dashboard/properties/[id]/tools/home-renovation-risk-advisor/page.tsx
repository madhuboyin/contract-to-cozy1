import HomeRenovationRiskAdvisorPageClient from '@/app/(dashboard)/dashboard/home-renovation-risk-advisor/HomeRenovationRiskAdvisorPageClient';

export default async function HomeRenovationRiskAdvisorToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HomeRenovationRiskAdvisorPageClient propertyId={id} />;
}
