import { notFound } from 'next/navigation';
import { UnifiedHomeSurface } from '@/components/home/UnifiedHomeSurface';

export const dynamic = 'force-dynamic';

export default function MortgageRefinanceHomeActionsAcceptancePage() {
  if (process.env.MORTGAGE_REFINANCE_ACCEPTANCE_FIXTURE !== '1') notFound();
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <UnifiedHomeSurface
        propertyId="refi-home-actions"
        properties={[
          { id: 'refi-home-actions', address: '123 Refinance Way' },
          { id: 'refi-second-property', address: '456 Priority Lane' },
        ]}
      />
    </main>
  );
}
