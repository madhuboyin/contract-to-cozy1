'use client';

import HomeEventRadarPageClient from '@/app/(dashboard)/dashboard/home-event-radar/HomeEventRadarPageClient';
import { PropertyProvider } from '@/lib/property/PropertyContext';

export const HOME_EVENT_RADAR_ACCEPTANCE_PROPERTY_ID =
  '11111111-1111-4111-8111-111111111111';

export function HomeEventRadarAcceptanceClient() {
  return (
    <PropertyProvider>
      <HomeEventRadarPageClient propertyId={HOME_EVENT_RADAR_ACCEPTANCE_PROPERTY_ID} />
    </PropertyProvider>
  );
}
