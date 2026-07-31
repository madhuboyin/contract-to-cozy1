'use client';

import HomeBriefingClient from '@/app/(dashboard)/dashboard/properties/[id]/tools/home-briefing/HomeBriefingClient';
import NeighborhoodChangeRadarClient from '@/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/NeighborhoodChangeRadarClient';

export const PROPERTY_INTELLIGENCE_ACCEPTANCE_PROPERTY_ID =
  '22222222-2222-4222-8222-222222222222';

export function PropertyIntelligenceAcceptanceClient() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-10 p-4 sm:p-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Property Intelligence pilot acceptance</p>
        <h1 className="text-2xl font-semibold">Property Intelligence launch acceptance</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reviewed source coverage, honest geography, one meaningful delta, canonical ownership,
          and homeowner feedback are exercised together.
        </p>
      </header>
      <section aria-labelledby="acceptance-around-heading" className="space-y-4">
        <h2 id="acceptance-around-heading" className="text-xl font-semibold">
          Reviewed local source
        </h2>
        <NeighborhoodChangeRadarClient
          propertyId={PROPERTY_INTELLIGENCE_ACCEPTANCE_PROPERTY_ID}
        />
      </section>
      <section aria-labelledby="acceptance-briefing-heading" className="space-y-4">
        <h2 id="acceptance-briefing-heading" className="text-xl font-semibold">
          Meaningful delta delivery
        </h2>
        <HomeBriefingClient
          propertyId={PROPERTY_INTELLIGENCE_ACCEPTANCE_PROPERTY_ID}
        />
      </section>
    </main>
  );
}
