// apps/frontend/src/components/orchestration/ActionCenter.tsx
'use client';

import React, { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import { OrchestratedActionDTO } from '@/types';
import { adaptOrchestrationSummary } from '@/adapters/orchestration.adapter';
import { OrchestrationActionCard } from './OrchestrationActionCard';

type Props = {
  propertyId: string;
  maxItems?: number; // default 5
};

export const ActionCenter: React.FC<Props> = ({
  propertyId,
  maxItems = 5,
}) => {
  const [actions, setActions] = useState<OrchestratedActionDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const summary = await api.getOrchestrationSummary(propertyId);
        const adapted = adaptOrchestrationSummary(summary);

        if (!cancelled) {
          setActions(adapted.actions);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('ActionCenter error:', err);
          setError('Unable to load actions right now.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  // ---------------------------------------------------------------------------
  // STATES
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="rounded-lg border p-4 bg-white">
        <div className="text-sm text-muted-foreground">
          Loading prioritized actions…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border p-4 bg-white">
        <div className="text-sm text-red-600">{error}</div>
      </div>
    );
  }

  if (!actions.length) {
    return (
      <div className="rounded-lg border p-4 bg-white">
        <div className="text-sm text-muted-foreground">
          No urgent actions at the moment.
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER (cards only — no header)
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-3">
      {actions.slice(0, maxItems).map(action => (
        <OrchestrationActionCard
          key={action.id}
          action={action}
        />
      ))}
    </div>
  );
};
