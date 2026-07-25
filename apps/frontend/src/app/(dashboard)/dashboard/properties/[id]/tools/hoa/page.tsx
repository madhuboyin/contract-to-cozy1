'use client';
import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { forwardComplianceLaunchQuery } from '@/features/tools/complianceLaunchContext';

export default function PropertyHoaToolPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const launchQuery = searchParams.toString();

  useEffect(() => {
    router.replace(`/dashboard/hoa?${forwardComplianceLaunchQuery(
      new URLSearchParams(launchQuery),
      propertyId,
    )}`);
  }, [launchQuery, propertyId, router]);

  return (
    <div className="flex h-48 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
    </div>
  );
}
