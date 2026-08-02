import { redirect } from 'next/navigation';

type RetiredHealthScorePageProps = {
  params: Promise<{ id: string }>;
};

export default async function RetiredHealthScorePage({ params }: RetiredHealthScorePageProps) {
  const { id } = await params;
  redirect(`/dashboard/properties/${encodeURIComponent(id)}/property-brief`);
}
