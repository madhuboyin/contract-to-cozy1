import { redirect } from 'next/navigation';

export default async function RenovationAdvisorLegacyToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/properties/${encodeURIComponent(id)}/renovations`);
}
