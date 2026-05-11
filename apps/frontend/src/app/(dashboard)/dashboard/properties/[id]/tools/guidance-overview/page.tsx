import { redirect } from 'next/navigation';
import GuidanceOverviewClient from './GuidanceOverviewClient';
import { normalizeGuidanceOverviewSearchParams } from '@/lib/navigation/guidanceOverviewHref';

type GuidanceOverviewPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GuidanceOverviewPage({
  params,
  searchParams,
}: GuidanceOverviewPageProps) {
  const { id } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry) query.append(key, entry);
      });
      continue;
    }
    if (value) query.set(key, value);
  }

  const normalizedQuery = normalizeGuidanceOverviewSearchParams(query);
  if (normalizedQuery.toString() !== query.toString()) {
    const href = `/dashboard/properties/${id}/tools/guidance-overview${
      normalizedQuery.toString() ? `?${normalizedQuery.toString()}` : ''
    }`;
    redirect(href);
  }

  return <GuidanceOverviewClient />;
}
