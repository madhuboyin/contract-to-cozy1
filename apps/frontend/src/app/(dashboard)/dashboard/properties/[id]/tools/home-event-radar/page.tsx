import HomeEventRadarPageClient from '@/app/(dashboard)/dashboard/home-event-radar/HomeEventRadarPageClient';

export default async function HomeEventRadarToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HomeEventRadarPageClient propertyId={id} />;
}
