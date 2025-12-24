// apps/frontend/src/components/orchestration/ActionCenter.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api/client';
import { OrchestratedActionDTO, Property } from '@/types';
import { adaptOrchestrationSummary } from '@/adapters/orchestration.adapter';
import { OrchestrationActionCard } from './OrchestrationActionCard';

import { MaintenanceConfigModal } from '@/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal';
import {
  MaintenanceTaskTemplate,
  RecurrenceFrequency,
  ServiceCategory,
} from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2 } from 'lucide-react';

type Props = {
  propertyId: string;
  maxItems?: number;
};

export const ActionCenter: React.FC<Props> = ({
  propertyId,
  maxItems = 5,
}) => {
  const { toast } = useToast();

  const [actions, setActions] = useState<OrchestratedActionDTO[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [template, setTemplate] = useState<MaintenanceTaskTemplate | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  // Handled actions
  const [handledActions, setHandledActions] = useState<Set<string>>(new Set());

  // Post-save UX
  const [showPostSavePanel, setShowPostSavePanel] = useState(false);
  const [lastHandledAction, setLastHandledAction] =
    useState<OrchestratedActionDTO | null>(null);

  // ---------------------------------------------------------------------------
  // LOAD ACTIONS & PROPERTIES
  // ---------------------------------------------------------------------------

  const loadActions = async () => {
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
        setProperties(propertiesRes.data.properties || []);
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
    loadActions();
  }, [propertyId]);

  // ---------------------------------------------------------------------------
  // CTA HANDLER
  // ---------------------------------------------------------------------------

  const handleActionCta = (action: OrchestratedActionDTO) => {
    if (action.suppression?.suppressed || isModalOpen) return;

    setActiveActionId(action.id);
    setLastHandledAction(null);
    setShowPostSavePanel(false);

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

  // ---------------------------------------------------------------------------
  // SUCCESS HANDLER
  // ---------------------------------------------------------------------------

  const handleSuccess = () => {
    toast({
      title: 'Task scheduled successfully',
      description: "We've added this to your maintenance checklist.",
    });

    if (activeActionId) {
      setHandledActions(prev => new Set(prev).add(activeActionId));
      const action = actions.find(a => a.id === activeActionId) || null;
      setLastHandledAction(action);
    }

    setIsModalOpen(false);
    setTemplate(null);
    setActiveActionId(null);
    setShowPostSavePanel(true);

    setTimeout(loadActions, 3000);
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
          {items.slice(0, maxItems).map(action => {
            const isHandled = handledActions.has(action.id);
            const isActive = activeActionId === action.id;

            return (
              <OrchestrationActionCard
                key={action.id}
                action={action}
                onCtaClick={handleActionCta}
                ctaDisabled={isModalOpen || isHandled || isActive}
                ctaLabel={isHandled ? 'Task scheduled' : undefined}
              />
            );
          })}
        </div>
      </section>
    );
  };
  
  const getPostSaveCtas = (action: OrchestratedActionDTO) => {
    // Check category for roof-related items (from risk assessment)
    if (action.category && action.category.toUpperCase().includes('ROOF')) {
      return {
        primary: { label: 'Check warranty coverage', href: '/dashboard/warranties' },
        secondary: { label: 'View related tasks', href: '/dashboard/maintenance' },
      };
    }

    switch (action.serviceCategory) {
      case 'HVAC':
      case 'PLUMBING':
      case 'ELECTRICAL':
        return {
          primary: { label: 'Schedule a service', href: '/dashboard/bookings' },
          secondary: { label: 'Find a provider', href: '/dashboard/providers' },
        };
  
      case 'INSPECTION':
        return {
          primary: { label: 'Upload inspection report', href: '/dashboard/inspection-reports' },
          secondary: { label: 'View checklist', href: '/dashboard/maintenance' },
        };
  
      default:
        return {
          primary: { label: 'View maintenance checklist', href: '/dashboard/maintenance' },
        };
    }
  };
  
  return (
    <>
      {/* ================= POST SAVE PANEL ================= */}
      {showPostSavePanel && lastHandledAction && (() => {
      const ctas = getPostSaveCtas(lastHandledAction);

      return (
        <div className="rounded-lg border bg-green-50 p-4 text-sm mb-4">
          <div className="space-y-2">
            <div className="font-semibold text-green-800">
              Task scheduled
            </div>

            <div className="text-green-700">
              We’ve added this to your maintenance checklist.
              You can take the next step now — or come back anytime.
            </div>

            <div className="flex gap-2 flex-wrap pt-2">
              {ctas.primary && (
                <a
                  href={ctas.primary.href}
                  className="px-3 py-1.5 rounded-md bg-green-700 text-white text-xs font-medium"
                >
                  {ctas.primary.label}
                </a>
              )}

              {ctas.secondary && (
                <a
                  href={ctas.secondary.href}
                  className="px-3 py-1.5 rounded-md border border-green-700 text-green-700 text-xs font-medium"
                >
                  {ctas.secondary.label}
                </a>
              )}

              <button
                className="text-xs text-green-700 underline ml-auto"
                onClick={() => setShowPostSavePanel(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>   
      );
      })()}
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

      {/* ================= MODAL ================= */}
      <MaintenanceConfigModal
        isOpen={isModalOpen}
        orchestrationMode
        template={template}
        properties={properties}
        selectedPropertyId={propertyId}
        onClose={() => {
          setIsModalOpen(false);
          setTemplate(null);
          setActiveActionId(null);
        }}
        onSuccess={handleSuccess}
      />
    </>
  );
};
