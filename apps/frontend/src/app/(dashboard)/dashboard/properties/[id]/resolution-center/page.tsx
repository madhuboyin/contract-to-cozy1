import { redirect } from 'next/navigation';

export default async function PropertyResolutionCenterRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);

  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        next.append(key, item);
      }
      continue;
    }
    next.set(key, value);
  }

  next.set('propertyId', id);
  redirect(`/dashboard/resolution-center?${next.toString()}`);
}
