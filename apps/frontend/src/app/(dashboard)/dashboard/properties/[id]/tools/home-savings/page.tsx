import { redirect } from 'next/navigation';

type HomeSavingsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomeSavingsToolPage({
  params,
  searchParams,
}: HomeSavingsPageProps) {
  const { id } = await params;
  const search = await searchParams;
  const query = new URLSearchParams();
  query.set('section', 'recurring');
  for (const [key, value] of Object.entries(search)) {
    if (key !== 'section' && typeof value === 'string') query.set(key, value);
  }
  redirect(`/dashboard/properties/${encodeURIComponent(id)}/tools/savings-benefits?${query.toString()}`);
}
