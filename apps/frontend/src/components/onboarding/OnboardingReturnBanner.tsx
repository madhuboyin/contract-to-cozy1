'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function OnboardingReturnBanner() {
  const searchParams = useSearchParams();

  const returnTo = useMemo(() => {
    if (searchParams.get('fromOnboarding') !== '1') {
      return null;
    }

    const raw = searchParams.get('returnTo');
    if (!raw || !raw.startsWith('/dashboard/properties/')) {
      return null;
    }

    return raw;
  }, [searchParams]);

  if (!returnTo) {
    return null;
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-2 text-sm">
      <Link
        href={returnTo}
        className="inline-flex items-center gap-2 font-medium text-teal-700 hover:text-teal-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to setup checklist
      </Link>
    </div>
  );
}
