'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export type OwnershipCostsView =
  | 'current'
  | 'changes'
  | 'forecast'
  | 'variability';

export default function LegacyOwnershipCostsViewRedirect({
  view,
}: {
  view: OwnershipCostsView;
}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();

  useEffect(() => {
    if (!params.id) return;
    const next = new URLSearchParams(serializedSearchParams);
    next.delete('stage');
    next.set('view', view);
    router.replace(
      `/dashboard/properties/${encodeURIComponent(params.id)}/ownership-costs?${next.toString()}`,
    );
  }, [params.id, router, serializedSearchParams, view]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm text-slate-500">Opening Ownership Costs…</p>
      </div>
    </div>
  );
}
