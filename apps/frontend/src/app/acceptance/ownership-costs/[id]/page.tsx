import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import OwnershipCostsClient from '@/app/(dashboard)/dashboard/properties/[id]/ownership-costs/OwnershipCostsClient';

export default function OwnershipCostAcceptancePage() {
  if (process.env.OWNERSHIP_COST_ACCEPTANCE_FIXTURE !== '1') notFound();
  return (
    <Suspense>
      <OwnershipCostsClient />
    </Suspense>
  );
}
