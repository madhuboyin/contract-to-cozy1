'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function InspectionHubToolPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/dashboard/properties/${params.id}/inspection-hub`);
  }, [params.id, router]);

  return (
    <div className="flex h-48 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
    </div>
  );
}
