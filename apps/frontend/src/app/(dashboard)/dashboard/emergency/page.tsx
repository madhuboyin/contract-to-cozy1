'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import EmergencyTroubleshooter from '@/components/EmergencyTroubleshooter';
import { usePropertyContext } from '@/lib/property/PropertyContext';

function EmergencyContent() {
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = searchParams.get('propertyId') || selectedPropertyId || undefined;

  return <EmergencyTroubleshooter propertyId={propertyId} />;
}

export default function EmergencyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EmergencyContent />
    </Suspense>
  );
}
