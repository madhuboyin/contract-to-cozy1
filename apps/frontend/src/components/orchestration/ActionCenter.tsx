// apps/frontend/src/components/orchestration/ActionCenter.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Frontend-only UX state
  const [showSuppressed, setShowSuppressed] = useState(false);

  // ---------------------------------------------------------------------------
  // DATA LOAD
  // ---------------------------------------------------------------------------

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
  // DERIVED STATE
  // ---------------------------------------------------------------------------

  const { active, suppressed } = useMemo(() => {
    return {
      active: actions.filter(a => !a.suppression?.suppressed),
      suppressed: actions.filter(a => a.suppression?.suppressed),
    };
  }, [actions]);

  const critical = active.filter(a => a.riskLevel === 'CRITICAL');
  const high = active.filter(a => a.riskLevel === 'HIGH');
  const other = active.filter(
    a => a.riskLevel !== 'CRITICAL' && a.riskLevel !== 'HIGH'
  );

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

  if (!active.length && !suppressed.length) {
    return (
      <div className="rounded-lg border p-4 bg-white">
        <div className="text-sm text-muted-foreground">
          No urgent actions at the moment.
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER (cards only — parent controls header)
  // ---------------------------------------------------------------------------

  const renderGroup = (
    label: string,
    items: OrchestratedActionDTO[],
    labelClass: string
  ) => {
    if (!items.length) return null;

    return (
      <section className="space-y-2">
        <div className={`text-xs font-semibold uppercase ${labelClass}`}>
          {label} ({items.length})
        </div>

        <div className="space-y-3">
          {items.slice(0, maxItems).map(action => (
            <OrchestrationActionCard
              key={action.id}
              action={action}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6">
      {renderGroup('Critical', critical, 'text-red-700')}
      {renderGroup('High Priority', high, 'text-amber-700')}
      {renderGroup('Other Actions', other, 'text-gray-700')}

      {/* Suppressed (collapsed by default) */}
      {suppressed.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowSuppressed(v => !v)}
            className="text-sm font-medium text-muted-foreground hover:underline"
          >
            {showSuppressed
              ? 'Hide suppressed actions'
              : `Show suppressed actions (${suppressed.length})`}
          </button>

          {showSuppressed && (
            <div className="mt-3 space-y-3">
              {suppressed.map(action => (
                <OrchestrationActionCard
                  key={action.id}
                  action={action}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
