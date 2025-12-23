// apps/frontend/src/app/actions/page.tsx
import { Suspense } from 'react';
import { ActionsClient } from './ActionsClient';

export default function ActionsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">
          Loading actions…
        </div>
      }
    >
      <ActionsClient />
    </Suspense>
  );
}
