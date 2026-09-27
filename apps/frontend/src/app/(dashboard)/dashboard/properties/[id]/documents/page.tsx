import { redirect } from 'next/navigation';

type PropertyDocumentsPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// Home Records replaces the legacy Documents workspace as the place for a home's documents. This route stays only so existing links,
// bookmarks and the /dashboard/documents job-hub redirect land on it; ?action=upload and ?backTo= are carried across.
export default async function PropertyDocumentsPage({ params, searchParams }: PropertyDocumentsPageProps) {
  const { id } = await params;
  const resolved = (await searchParams) ?? {};
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (key === 'propertyId') continue;
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (value !== undefined) query.set(key, value);
  }
  const suffix = query.toString();
  redirect(`/dashboard/properties/${encodeURIComponent(id)}/tools/home-records${suffix ? `?${suffix}` : ''}`);
}
