import HomeEventRadarPageClient from '@/app/(dashboard)/dashboard/home-event-radar/HomeEventRadarPageClient';

export default function HomeEventRadarToolPage({
  params,
}: {
  params: { id: string };
}) {
  return <HomeEventRadarPageClient propertyId={params.id} />;
}
