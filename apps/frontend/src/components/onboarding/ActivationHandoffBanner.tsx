'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { FileCheck2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ActivationFirstValueDTO } from '@/types';

export function ActivationHandoffBanner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const triggerId = searchParams.get('activationTriggerId');
  const triggerType = searchParams.get('activationTriggerType');
  const propertyId = searchParams.get('propertyId') ?? pathname.match(/\/dashboard\/properties\/([^/]+)/)?.[1] ?? null;
  const [firstValue, setFirstValue] = useState<ActivationFirstValueDTO | null>(null);

  useEffect(() => {
    if (!triggerId || !propertyId) {
      setFirstValue(null);
      return;
    }
    let active = true;
    api.getActivationFirstValue(propertyId)
      .then((response) => {
        if (active && response.success && response.data) setFirstValue(response.data);
      })
      .catch(() => {
        if (active) setFirstValue(null);
      });
    return () => { active = false; };
  }, [propertyId, triggerId]);

  if (!triggerId || !propertyId || !firstValue) return null;

  return (
    <aside className="mb-5 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
          <div>
            <p className="font-bold">Activation context carried into this workflow</p>
            <p className="mt-0.5 text-brand-800">
              {firstValue.action.signal} · {firstValue.action.evidence.length} evidence reference{firstValue.action.evidence.length === 1 ? '' : 's'} · {firstValue.action.confidence.label.toLowerCase()} confidence
            </p>
            {triggerType && <p className="mt-1 text-xs text-brand-700">Trigger: {triggerType.replaceAll('_', ' ').toLowerCase()}</p>}
          </div>
        </div>
        <Link
          href={`/onboarding/first-value?propertyId=${encodeURIComponent(propertyId)}`}
          className="font-semibold text-brand-800 underline underline-offset-4"
        >
          Review or add evidence
        </Link>
      </div>
    </aside>
  );
}
