/**
 * Example: Savings Card with CTA Contract
 * 
 * Shows how to use CTA contracts with amount metrics.
 */

'use client';

import Link from 'next/link';
import { cta } from '../builder';
import { CTAValidator } from '../runtime-validator';

interface SavingsCardExampleProps {
  propertyId: string;
  monthlyPotential: number;
  annualPotential: number;
  opportunityCount: number;
}

export function SavingsCardExample({
  propertyId,
  monthlyPotential,
  annualPotential,
  opportunityCount,
}: SavingsCardExampleProps) {
  // Build CTA contract with amount validation
  const contract = cta('home-savings-view', 'SavingsCardExample')
    .promises('View savings breakdown')
    .withAmount(monthlyPotential, 'monthly savings', 'USD')
    .withAmount(annualPotential, 'annual savings', 'USD')
    .withCount(opportunityCount, 'opportunities')
    .withPriority('critical')
    .navigatesTo(`/dashboard/properties/${propertyId}/tools/home-savings`)
    .withParams({
      expectedMonthly: monthlyPotential.toString(),
      expectedAnnual: annualPotential.toString(),
      highlight: 'opportunities',
      action: 'view-breakdown',
      source: 'dashboard-card',
    })
    .requires('expected-amount-validation')
    .requires('highlight-opportunities')
    .requires('category-breakdown')
    .build();

  const href = contract.destination.route + '?' + 
    new URLSearchParams(contract.destination.params).toString();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="rounded-lg border bg-white p-6">
      {/* Runtime validation */}
      <CTAValidator contract={contract} />

      <h3 className="text-lg font-semibold">Home Savings Check</h3>

      <div className="mt-4">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold">{formatCurrency(monthlyPotential)}</span>
          <span className="text-lg text-muted-foreground">/mo</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatCurrency(annualPotential)}/yr potential
        </p>
      </div>

      <div className="mt-4">
        <p className="text-sm text-muted-foreground">
          {opportunityCount} savings {opportunityCount === 1 ? 'opportunity' : 'opportunities'} identified
        </p>
      </div>

      <div className="mt-6">
        <Link
          href={href}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          View Breakdown
        </Link>
      </div>
    </div>
  );
}
