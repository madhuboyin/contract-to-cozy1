import { redirect } from 'next/navigation';

type ToolsIndexPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ToolsIndexPage({ params, searchParams }: ToolsIndexPageProps) {
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

  query.set('propertyId', id);
  redirect(`/dashboard/home-tools?${query.toString()}`);
}
