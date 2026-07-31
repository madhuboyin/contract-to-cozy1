import { redirect } from 'next/navigation';

type LegacyHomeScorePageProps = {
  params: Promise<{ id: string }>;
};

export default async function LegacyHomeScorePage({ params }: LegacyHomeScorePageProps) {
  const { id } = await params;
  redirect(`/dashboard/properties/${encodeURIComponent(id)}/property-brief`);
}
