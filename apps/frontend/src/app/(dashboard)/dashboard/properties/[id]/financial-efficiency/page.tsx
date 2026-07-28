import { redirect } from 'next/navigation';

// Financial Efficiency was retired as a parallel Save dashboard — its
// insurance/warranty/utility benchmark comparison overlapped with Savings
// and Benefits' recurring-cost tracking of the same canonical records.
// Redirects into the canonical workspace instead of hosting its own score.
type FinancialEfficiencyRedirectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function FinancialEfficiencyRedirectPage({ params }: FinancialEfficiencyRedirectPageProps) {
  const { id } = await params;
  redirect(`/dashboard/properties/${encodeURIComponent(id)}/tools/savings-benefits?section=recurring`);
}
