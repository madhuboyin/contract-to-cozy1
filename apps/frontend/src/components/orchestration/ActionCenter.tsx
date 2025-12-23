// apps/frontend/src/components/orchestration/ActionCenter.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api/client';
import {
  OrchestratedActionDTO,
  MaintenanceTaskTemplate,
  RecurrenceFrequency,
  ServiceCategory,
  Property,
} from '@/types';

import { adaptOrchestrationSummary } from '@/adapters/orchestration.adapter';
import { OrchestrationActionCard } from './OrchestrationActionCard';

import { MaintenanceConfigModal } from '@/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal';

type Props = {
  propertyId: string;
  maxItems?: number;
};

export const ActionCenter: React.FC<Props> = ({
  propertyId,
  maxItems = 5,
}) => {
  const [actions, setActions] = useState<OrchestratedActionDTO[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [template, setTemplate] = useState<MaintenanceTaskTemplate | null>(null);

  // ---------------------------------------------------------------------------
  // LOAD ACTIONS + PROPERTIES
  // ---------------------------------------------------------------------------

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summary, propertiesRes] = await Promise.all([
        api.getOrchestrationSummary(propertyId),
        api.getProperties(),
      ]);

      const adapted = adaptOrchestrationSummary(summary);

      setActions(adapted.actions);

      if (propertiesRes.success) {
        setProperties(propertiesRes.data.properties);
      }
    } catch (err) {
      console.error('ActionCenter error:', err);
      setError('Unable to load actions right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!propertyId) return;
    loadData();
  }, [propertyId]);

  // ---------------------------------------------------------------------------
  // CTA HANDLER → OPEN MAINTENANCE MODAL
  // ---------------------------------------------------------------------------

  const handleActionCta = (action: OrchestratedActionDTO) => {
    if (action.suppression?.suppressed) return;

    setTemplate({
      id: `orchestration:${action.id}`,
      title: action.title,
      description: action.description ?? '',
      serviceCategory:
        (action.serviceCategory as ServiceCategory) ??
        (action.category as ServiceCategory) ??
        'INSPECTION',
      defaultFrequency: RecurrenceFrequency.ANNUALLY,

      // Required by type
      sortOrder: 0,
    });

    setIsModalOpen(true);
  };

  // ---------------------------------------------------------------------------
  // DERIVED GROUPS
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
  // RENDER GROUP
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
              onCtaClick={handleActionCta}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {renderGroup('Critical', critical, 'text-red-700')}
        {renderGroup('High Priority', high, 'text-amber-700')}
        {renderGroup('Other Actions', other, 'text-gray-700')}

        {/* Suppressed Actions */}
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

      {/* ================= MAINTENANCE MODAL ================= */}
      <MaintenanceConfigModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setTemplate(null);
        }}
        template={template}
        properties={properties}
        selectedPropertyId={propertyId}
        onSuccess={() => {
          setIsModalOpen(false);
          setTemplate(null);
          loadData(); // refresh orchestration after task creation
        }}
      />
    </>
  );
};
