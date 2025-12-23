// apps/frontend/src/app/actions/ActionsClient.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { api } from '@/lib/api/client';
import { OrchestratedActionDTO } from '@/types';
import { adaptOrchestrationSummary } from '@/adapters/orchestration.adapter';
import { OrchestrationActionCard } from '@/components/orchestration/OrchestrationActionCard';
import { Separator } from '@/components/ui/separator';

export function ActionsClient() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId');

  const [actions, setActions] = useState<OrchestratedActionDTO[]>([]);
  const [suppressedActions, setSuppressedActions] = useState<OrchestratedActionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setError('No property selected.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // TypeScript knows propertyId is not null due to the early return above
        const summary = await api.getOrchestrationSummary(propertyId!);
        const adapted = adaptOrchestrationSummary(summary);

        if (!cancelled) {
          setActions(adapted.actions);
          setSuppressedActions(adapted.suppressedActions ?? []);
        }
      } catch (err) {
        console.error('ActionsClient error:', err);
        if (!cancelled) {
          setError('Unable to load actions.');
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

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading actions…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <ol className="flex items-center space-x-2">
          <li>
            <a href="/dashboard" className="hover:text-gray-900">
              Dashboard
            </a>
          </li>
          <li>/</li>
          <li className="text-gray-900 font-medium">Actions</li>
        </ol>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          All Actions
        </h1>
        <p className="text-sm text-muted-foreground">
          A complete view of everything your home needs right now — including
          suppressed items and decision reasoning.
        </p>
      </div>

      {/* Active Actions */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Active Actions ({actions.length})
        </h2>

        {actions.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            No active actions at this time.
          </div>
        ) : (
          <div className="space-y-3">
            {actions.map(action => (
              <OrchestrationActionCard key={action.id} action={action} />
            ))}
          </div>
        )}
      </section>

      {/* Suppressed Actions */}
      {suppressedActions.length > 0 && (
        <>
          <Separator />
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">
              Suppressed Actions ({suppressedActions.length})
            </h2>
            <div className="space-y-3">
              {suppressedActions.map(action => (
                <OrchestrationActionCard key={action.id} action={action} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
