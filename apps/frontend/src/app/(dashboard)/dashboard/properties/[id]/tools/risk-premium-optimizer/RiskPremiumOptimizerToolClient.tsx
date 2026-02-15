'use client';

import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import RiskPremiumOptimizerPanel from '@/components/ai/RiskPremiumOptimizerPanel';

export default function RiskPremiumOptimizerToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  return (
    <div className="p-6 space-y-4">
      <SectionHeader
        icon="🧭"
        title="Risk-to-Premium Optimizer"
        description="Lower premium pressure without increasing risk."
      />

      <RiskPremiumOptimizerPanel propertyId={propertyId} />
    </div>
  );
}
