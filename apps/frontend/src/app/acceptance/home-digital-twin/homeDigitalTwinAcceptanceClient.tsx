'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import HomeDigitalTwinClient from '../../(dashboard)/dashboard/properties/[id]/tools/home-digital-twin/HomeDigitalTwinClient';

export function HomeDigitalTwinAcceptanceClient() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <HomeDigitalTwinClient propertyIdOverride="home-digital-twin-acceptance-property" />
      </main>
    </QueryClientProvider>
  );
}
