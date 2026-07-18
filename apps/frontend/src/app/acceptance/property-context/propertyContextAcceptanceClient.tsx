'use client';

import { useState } from 'react';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';

const contracts = {
  scalar: { featureKey: 'SELLER_PREP', operationKey: 'OPEN_PLAN' },
  structured: { featureKey: 'PLANT_ADVISOR', operationKey: 'GENERATE_OUTDOOR_RECOMMENDATIONS' },
  relational: { featureKey: 'MAINTENANCE', operationKey: 'SET_UP_INSTALLED_SYSTEMS' },
} as const;

export function PropertyContextAcceptanceClient({ scenario }: { scenario: keyof typeof contracts }) {
  const contract = contracts[scenario];
  const [captureCount, setCaptureCount] = useState(0);
  const [readyCount, setReadyCount] = useState(0);

  return <main className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-8">
    <h1 className="text-2xl font-semibold">Property Context browser acceptance</h1>
    <label className="block text-sm font-medium">
      Feature draft
      <input aria-label="Feature draft" defaultValue="Keep this value while context is captured" className="mt-1 min-h-11 w-full rounded-lg border px-3 py-2" />
    </label>
    <PropertyContextCapturePanel
      propertyId="property-browser-fixture"
      featureKey={contract.featureKey}
      operationKey={contract.operationKey}
      operationInput={{ acceptanceScenario: scenario }}
      onCaptured={() => setCaptureCount((count) => count + 1)}
      onReady={() => setReadyCount((count) => count + 1)}
    />
    <output aria-label="Capture callback count">Captured: {captureCount}</output>
    <output aria-label="Ready callback count">Ready: {readyCount}</output>
  </main>;
}
