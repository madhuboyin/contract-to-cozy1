import { redirect } from 'next/navigation';

type AIToolsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * AI is an implementation detail, not a separate homeowner job. Preserve old
 * links while converging discovery on the canonical Explore tools library.
 */
export default async function AIToolsPage({ searchParams }: AIToolsPageProps) {
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

  const suffix = query.toString();
  redirect(`/dashboard/home-tools${suffix ? `?${suffix}` : ''}`);
}
