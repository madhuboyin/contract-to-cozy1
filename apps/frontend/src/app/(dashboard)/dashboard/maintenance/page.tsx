import { redirect } from 'next/navigation';
import JobHubRedirectPage from '@/components/navigation/JobHubRedirectPage';

type MaintenanceRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MaintenanceRedirectPage({ searchParams }: MaintenanceRedirectPageProps) {
  const search = await searchParams;
  const propertyIdValue = search.propertyId;
  const propertyId = Array.isArray(propertyIdValue) ? propertyIdValue[0] : propertyIdValue;

  if (propertyId) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      if (key === 'propertyId' || value === undefined) continue;
      if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
      else query.set(key, value);
    }
    const suffix = query.toString();
    redirect(
      `/dashboard/properties/${encodeURIComponent(propertyId)}/maintenance${suffix ? `?${suffix}` : ''}`
    );
  }

  return <JobHubRedirectPage jobKey="maintenance" />;
}
