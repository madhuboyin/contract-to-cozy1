// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-volatility/page.tsx
import LegacyOwnershipCostsViewRedirect from '@/components/ownership-costs/LegacyOwnershipCostsViewRedirect';

export default function CostVolatilityPage() {
  return <LegacyOwnershipCostsViewRedirect view="variability" />;
}
