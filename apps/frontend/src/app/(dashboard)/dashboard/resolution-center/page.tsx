import { Suspense } from 'react';
import { ActionsClient } from '../actions/ActionsClient';

export default function ResolutionCenterPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">
          Loading your action queue...
        </div>
      }
    >
      <ActionsClient />
    </Suspense>
  );
}
