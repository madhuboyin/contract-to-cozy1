'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api/client';
import { OrchestratedActionDTO, OrchestrationSummaryDTO } from '@/types';
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

        if (!summary) {
          throw new Error('Failed to load orchestration summary');
        }

        const adapted = adaptOrchestrationSummary(summary);

        if (!cancelled) {
          setActions(adapted.actions);
        }
      } catch (err: any) {
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
  // RENDER
  // ---------------------------------------------------------------------------

  const visibleActions = actions.slice(0, maxItems);

  return (
    <section className="rounded-lg border bg-white p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Action Center
        </h2>

        <Link
          href={`/dashboard/actions?propertyId=${propertyId}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          View all
        </Link>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {visibleActions.map(action => (
          <OrchestrationActionCard
            key={action.id}
            action={action}
          />
        ))}
      </div>
    </section>
  );
};
