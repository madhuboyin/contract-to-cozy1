// apps/frontend/src/lib/providers/QueryProvider.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';

// Define a default client instance
const makeQueryClient = () => {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // With SSR, we usually want to set staleTime to non-zero,
                // but since we are using client-side fetching in the dashboard,
                // we use a reasonable time.
                staleTime: 60 * 1000, // 60 seconds
            },
        },
    });
};

export function QueryProvider({ children }: { children: React.ReactNode }) {
    // Use state to ensure the client is only created once per component lifecycle
    const [queryClient] = useState(makeQueryClient);

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}