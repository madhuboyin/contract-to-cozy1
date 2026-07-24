import { redirect } from 'next/navigation';

type ProtectPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CoverageOverviewRedirectPage({ params, searchParams }: ProtectPageProps) {
  const { id } = await params;
  const search = await searchParams;
  const query = new URLSearchParams();
  query.set('tab', 'risk-protection');
  for (const [key, value] of Object.entries(search)) {
    if (key !== 'tab' && typeof value === 'string') query.set(key, value);
  }
  redirect(`/dashboard/properties/${encodeURIComponent(id)}?${query.toString()}`);
}
