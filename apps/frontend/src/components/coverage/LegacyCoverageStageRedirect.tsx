'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type CoverageReviewStage = 'questions' | 'renewal' | 'risk';

export default function LegacyCoverageStageRedirect({
  stage,
}: {
  stage: CoverageReviewStage;
}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();

  useEffect(() => {
    if (!params.id) return;
    const next = new URLSearchParams(serializedSearchParams);
    next.delete('tab');
    next.set('stage', stage);
    router.replace(
      `/dashboard/properties/${encodeURIComponent(params.id)}/tools/coverage-intelligence?${next.toString()}`,
    );
  }, [params.id, router, serializedSearchParams, stage]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Opening Coverage &amp; Premium Review…</p>
      </div>
    </div>
  );
}
