'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Retired as standalone — merged as ?tab=options under Coverage Intelligence.
export default function CoverageOptionsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!params.id) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', 'options');
    router.replace(`/dashboard/properties/${params.id}/tools/coverage-intelligence?${next.toString()}`);
  }, [params.id, router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Opening tool...</p>
      </div>
    </div>
  );
}
