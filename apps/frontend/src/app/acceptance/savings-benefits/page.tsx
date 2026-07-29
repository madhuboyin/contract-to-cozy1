import { notFound } from 'next/navigation';
import {
  InProgressPanel,
  RealizedPanel,
} from '@/app/(dashboard)/dashboard/properties/[id]/tools/savings-benefits/SavingsBenefitsUnifiedPanels';

export const dynamic = 'force-dynamic';

export default function SavingsBenefitsAcceptancePage() {
  if (process.env.SAVINGS_BENEFITS_ACCEPTANCE_FIXTURE !== '1') notFound();
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Savings and Benefits acceptance</h1>
      <section aria-labelledby="acceptance-in-progress">
        <h2 id="acceptance-in-progress" className="mb-3 text-lg font-semibold">In progress</h2>
        <InProgressPanel propertyId="savings-benefits-acceptance-property" />
      </section>
      <section aria-labelledby="acceptance-realized">
        <h2 id="acceptance-realized" className="mb-3 text-lg font-semibold">Realized</h2>
        <RealizedPanel propertyId="savings-benefits-acceptance-property" />
      </section>
    </main>
  );
}
