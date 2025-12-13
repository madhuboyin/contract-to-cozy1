'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import EmergencyTroubleshooter from '@/components/EmergencyTroubleshooter';

function EmergencyContent() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId') || undefined;

  return <EmergencyTroubleshooter propertyId={propertyId} />;
}

export default function EmergencyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EmergencyContent />
    </Suspense>
  );
}