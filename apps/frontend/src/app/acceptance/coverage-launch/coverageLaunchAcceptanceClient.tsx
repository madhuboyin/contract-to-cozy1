'use client';

import InsuranceMarketContextPanel from '@/components/coverage/InsuranceMarketContextPanel';

export const COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID =
  '11111111-1111-4111-8111-111111111111';

export function CoverageLaunchAcceptanceClient() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-5 p-4 sm:p-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Slice 10 browser acceptance</p>
        <h1 className="text-2xl font-semibold">Coverage &amp; Premium Review launch gate</h1>
      </header>
      <InsuranceMarketContextPanel propertyId={COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID} />
    </main>
  );
}
