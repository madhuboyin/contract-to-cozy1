// apps/frontend/src/app/(dashboard)/dashboard/actions/ActionsClient.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { OrchestratedActionDTO, Property } from '@/types';
import { adaptOrchestrationSummary } from '@/adapters/orchestration.adapter';
import { OrchestrationActionCard } from '@/components/orchestration/OrchestrationActionCard';
import { Separator } from '@/components/ui/separator';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { MaintenanceConfigModal } from '@/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal';
import {
  MaintenanceTaskTemplate,
  RecurrenceFrequency,
  ServiceCategory,
} from '@/types';

export function ActionsClient() {
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = selectedPropertyId;

  const [actions, setActions] = useState<OrchestratedActionDTO[]>([]);
  const [suppressedActions, setSuppressedActions] = useState<OrchestratedActionDTO[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [template, setTemplate] = useState<MaintenanceTaskTemplate | null>(null);

  const loadActions = async () => {
    if (!propertyId) {
      setError('No property selected.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [summary, propertyRes, propertiesRes] = await Promise.all([
        api.getOrchestrationSummary(propertyId),
        api.getProperty(propertyId),
        api.getProperties(),
      ]);

      const adapted = adaptOrchestrationSummary(summary);

      setActions(adapted.actions);
      setSuppressedActions(adapted.suppressedActions ?? []);

      if (propertyRes?.success) {
        setPropertyName(propertyRes.data.name ?? 'My Home');
      } else {
        setPropertyName('My Home');
      }

      if (propertiesRes.success) {
        setProperties(propertiesRes.data.properties || []);
      }
    } catch (err) {
      console.error('ActionsClient error:', err);
      setError('Unable to load actions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActions();
  }, [propertyId]);

  // CTA handler - opens modal
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
      sortOrder: 0,
    });

    setIsModalOpen(true);
  };

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
    <>
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
                <OrchestrationActionCard 
                  key={action.id} 
                  action={action}
                  onCtaClick={handleActionCta}
                />
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
                  <OrchestrationActionCard 
                    key={action.id} 
                    action={action}
                    onCtaClick={handleActionCta}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Modal */}
      <MaintenanceConfigModal
        isOpen={isModalOpen}
        orchestrationMode
        template={template}
        properties={properties}
        selectedPropertyId={propertyId}
        onClose={() => {
          setIsModalOpen(false);
          setTemplate(null);
        }}
        onSuccess={() => {
          setIsModalOpen(false);
          setTemplate(null);
          loadActions();
        }}
      />
    </>
  );
}