'use client';
import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { inspectionHubLaunchQuery } from '@/features/tools/inspectionHubLaunchContext';

export default function InspectionHubToolPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const launchQuery = searchParams.toString();

  useEffect(() => {
    const query = inspectionHubLaunchQuery(new URLSearchParams(launchQuery));
    router.replace(
      `/dashboard/properties/${params.id}/inspection-hub${query ? `?${query}` : ''}`,
    );
  }, [launchQuery, params.id, router]);

  return (
    <div className="flex h-48 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
    </div>
  );
}
