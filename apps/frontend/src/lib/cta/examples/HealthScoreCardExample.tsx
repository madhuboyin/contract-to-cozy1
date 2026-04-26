/**
 * Example: Health Score Card with CTA Contract
 * 
 * Shows how to use CTA contracts in a dashboard card component.
 */

'use client';

import Link from 'next/link';
import { cta } from '../builder';
import { CTAValidator } from '../runtime-validator';

interface HealthScoreCardExampleProps {
  propertyId: string;
  healthScore: number;
  maintenanceCount: number;
  weeklyChange: number;
}

export function HealthScoreCardExample({
  propertyId,
  healthScore,
  maintenanceCount,
  weeklyChange,
}: HealthScoreCardExampleProps) {
  // Build CTA contract for maintenance items
  const maintenanceContract = cta('health-score-maintenance', 'HealthScoreCardExample')
    .promises('Review maintenance items')
    .withCount(maintenanceCount, 'maintenance items')
    .withPriority('critical')
    .navigatesTo('/dashboard/resolution-center')
    .withParams({
      propertyId,
      filter: 'maintenance',
      priority: 'high',
      expectedCount: maintenanceCount,
    })
    .requires('filter-maintenance')
    .requires('expected-count-validation')
    .build();

  // Build CTA contract for health score details
  const healthScoreContract = cta('health-score-details', 'HealthScoreCardExample')
    .promises('View health score breakdown')
    .withScore(healthScore, 'health score')
    .withDelta(weeklyChange, 'weekly change')
    .withPriority('high')
    .navigatesTo(`/dashboard/properties/${propertyId}/health-score`)
    .withParam('view', weeklyChange !== 0 ? 'trends' : 'overview')
    .requires('view-trends')
    .requires('maintenance-breakdown')
    .build();

  const maintenanceHref = maintenanceContract.destination.route + '?' + 
    new URLSearchParams(maintenanceContract.destination.params).toString();

  const healthScoreHref = healthScoreContract.destination.route + '?' + 
    new URLSearchParams(healthScoreContract.destination.params).toString();

  return (
    <div className="rounded-lg border bg-white p-6">
      {/* Runtime validation in development */}
      <CTAValidator contract={maintenanceContract} />
      <CTAValidator contract={healthScoreContract} />

      <h3 className="text-lg font-semibold">Property Health Score</h3>

      <div className="mt-4">
        <div className="text-4xl font-bold">{healthScore}</div>
        {weeklyChange !== 0 && (
          <div className="text-sm text-muted-foreground">
            {weeklyChange > 0 ? '+' : ''}{weeklyChange} pts this week
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div>
          <span className="text-sm text-muted-foreground">Maintenance</span>
          <div className={maintenanceCount > 0 ? 'text-amber-600' : 'text-foreground'}>
            {maintenanceCount > 0 ? `${maintenanceCount} required` : 'None pending'}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        {maintenanceCount > 0 && (
          <Link
            href={maintenanceHref}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Review Maintenance
          </Link>
        )}
        <Link
          href={healthScoreHref}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}
