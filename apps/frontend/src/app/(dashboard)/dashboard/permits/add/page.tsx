'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { CreatePermitPayload, PermitWorkType } from '@/types';
import AddPermitForm from '@/components/features/permits/AddPermitForm';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';
import {
  complianceLaunchLineage,
  forwardComplianceLaunchQuery,
} from '@/features/tools/complianceLaunchContext';

export default function AddPermitPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = searchParams.get('propertyId') ?? '';
  const launchLineage = complianceLaunchLineage(searchParams);
  const returnQuery = forwardComplianceLaunchQuery(searchParams, propertyId);
  const formRef = useRef<HTMLFormElement>(null);
  const [workTypes, setWorkTypes] = useState<PermitWorkType[]>(['OTHER']);
  const [contextInvoked, setContextInvoked] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const [resumeRequested, setResumeRequested] = useState(false);
  const operationInput = useMemo(() => ({ workTypes }), [workTypes]);

  const handleWorkTypesChange = useCallback((nextWorkTypes: PermitWorkType[]) => {
    setWorkTypes(nextWorkTypes);
  }, []);

  useEffect(() => {
    setContextInvoked(false);
    setContextReady(false);
    setResumeRequested(false);
  }, [workTypes]);

  useEffect(() => {
    if (!contextReady || !resumeRequested) return;
    setResumeRequested(false);
    formRef.current?.requestSubmit();
  }, [contextReady, resumeRequested]);

  async function handleSubmit(payload: CreatePermitPayload) {
    if (!contextReady) {
      setContextInvoked(true);
      setResumeRequested(true);
      return;
    }
    await api.createManualPermit(propertyId, { ...payload, ...launchLineage });
    router.push(`/dashboard/permits?${returnQuery}`);
  }

  return (
    <div className="p-4 pb-10">
      <div className="mb-4 flex items-center gap-2">
        <Link href={`/dashboard/permits?${returnQuery}`} className="flex items-center gap-1 text-sm text-[hsl(var(--mobile-text-secondary))]">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <h1 className="mb-6 text-xl font-bold">Add Permit</h1>

      {contextInvoked ? <div className="mb-4">
        <PropertyContextCapturePanel
          propertyId={propertyId}
          featureKey="PERMITS"
          operationKey="CREATE_MANUAL_PERMIT"
          operationInput={operationInput}
          onReady={() => setContextReady(true)}
        />
      </div> : null}

      <AddPermitForm
        ref={formRef}
        onSubmit={handleSubmit}
        onWorkTypesChange={handleWorkTypesChange}
        onCancel={() => router.push(`/dashboard/permits?${returnQuery}`)}
      />
    </div>
  );
}
