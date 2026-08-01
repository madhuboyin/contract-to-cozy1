import { notFound } from 'next/navigation';
import MortgageRefinanceRadarClient from '@/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/MortgageRefinanceRadarClient';

export const dynamic = 'force-dynamic';

export default function MortgageRefinanceRadarAcceptancePage() {
  if (process.env.MORTGAGE_REFINANCE_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <MortgageRefinanceRadarClient />;
}
