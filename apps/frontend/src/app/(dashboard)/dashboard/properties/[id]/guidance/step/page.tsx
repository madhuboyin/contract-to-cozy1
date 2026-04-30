import { redirect } from 'next/navigation';

type GuidanceStepPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GuidanceStepPage({
  params,
  searchParams,
}: GuidanceStepPageProps) {
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

  if (!query.get('journeyId') && query.get('guidanceJourneyId')) {
    query.set('journeyId', query.get('guidanceJourneyId') as string);
  }
  if (!query.get('stepKey') && query.get('guidanceStepKey')) {
    query.set('stepKey', query.get('guidanceStepKey') as string);
  }

  const href = `/dashboard/properties/${id}/tools/guidance-overview${
    query.toString() ? `?${query.toString()}` : ''
  }`;
  redirect(href);
}
