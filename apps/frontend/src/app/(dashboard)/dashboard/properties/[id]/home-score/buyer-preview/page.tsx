'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import RouteStateCard from '@/components/system/RouteStateCard';
import BuyerReportView from '@/components/home-score/BuyerReportView';
import { api } from '@/lib/api/client';

export default function BuyerReportPreviewPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['buyer-report-preview', propertyId],
    queryFn: () => api.getBuyerReportPreview(propertyId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <RouteStateCard state="loading" title="Loading preview…" description="Preparing the buyer view of your report." />
      </div>
    );
  }

  if (isError || !data?.success) {
    const msg = (error as any)?.message || (data as any)?.message || 'Could not load the buyer report preview.';
    return (
      <div className="mx-auto max-w-3xl p-6">
        <RouteStateCard
          state="error"
          title="Preview unavailable"
          description={msg}
          action={
            <Button asChild variant="outline">
              <Link href={`/dashboard/properties/${propertyId}/home-score`}>Back to Home Score</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <BuyerReportView
      report={data.data.report}
      previewPropertyId={propertyId}
    />
  );
}
