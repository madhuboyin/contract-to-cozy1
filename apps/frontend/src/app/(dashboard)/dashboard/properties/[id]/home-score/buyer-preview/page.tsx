import { redirect } from 'next/navigation';

type LegacyBuyerPreviewPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LegacyBuyerPreviewPage({ params }: LegacyBuyerPreviewPageProps) {
  const { id } = await params;
  redirect(`/dashboard/properties/${encodeURIComponent(id)}/property-brief`);
}
