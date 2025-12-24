// apps/frontend/src/components/orchestration/ActionCenter.tsx
'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';

import { api } from '@/lib/api/client';
import { OrchestratedActionDTO, Property, SuppressionSourceDTO } from '@/types';
import { adaptOrchestrationSummary } from '@/adapters/orchestration.adapter';
import { OrchestrationActionCard } from './OrchestrationActionCard';

import { MaintenanceConfigModal } from '@/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal';
import {
  MaintenanceTaskTemplate,
  RecurrenceFrequency,
  ServiceCategory,
} from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { useRecentAction } from '@/hooks/useRecentAction';
import { DecisionTraceModal } from './DecisionTraceModal';

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

  const [showSuppressed, setShowSuppressed] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [template, setTemplate] = useState<MaintenanceTaskTemplate | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  const [traceAction, setTraceAction] =
    useState<OrchestratedActionDTO | null>(null);

  const recentKey = `ctc:actioncenter:recent:${propertyId}`;
  const recent = useRecentAction(recentKey);

  /* ------------------------------------------------------------------
     Load Actions
  ------------------------------------------------------------------- */

  const loadActions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summary, propertiesRes] = await Promise.all([
        api.getOrchestrationSummary(propertyId),
        api.getProperties(),
      ]);

      const adapted = adaptOrchestrationSummary(summary);

      // 🐛 DEBUG LOG
      console.log('📊 Actions loaded:', {
        totalActions: adapted.actions.length,
        totalSuppressed: adapted.suppressedActions.length,
        actions: adapted.actions.map(a => ({
          key: a.actionKey,
          title: a.title,
          suppressed: a.suppression?.suppressed,
          sourceType: a.suppression?.suppressionSource?.type,
        })),
      });

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
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    loadActions();
  }, [propertyId, loadActions]);

  /* ------------------------------------------------------------------
     CTA Handler
  ------------------------------------------------------------------- */

  const handleActionCta = (action: OrchestratedActionDTO) => {
    if (action.suppression?.suppressed) return;
    if (isModalOpen) return;
    if (activeActionKey === action.actionKey) return;
  
    setActiveActionKey(action.actionKey);
  
    setTemplate({
      id: `orchestration:${action.actionKey}`, // ✅ No change needed here - already correct
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

  /* ------------------------------------------------------------------
     Maintenance Modal Success
  ------------------------------------------------------------------- */

  const handleSuccess = () => {
    toast({
      title: 'Task scheduled successfully',
      description: "We've added this to your maintenance checklist.",
    });

    if (activeActionKey) {
      const action = actions.find(a => a.actionKey === activeActionKey);
      if (action) recent.setScheduled(action);
    }

    setIsModalOpen(false);
    setTemplate(null);
    setActiveActionKey(null);

    setTimeout(loadActions, 1000);
  };

  /* ------------------------------------------------------------------
     Decision Trace Actions
  ------------------------------------------------------------------- */

  const handleMarkCompletedFromTrace = useCallback(async () => {
    if (!traceAction) return;

    try {
      await api.markOrchestrationActionCompleted(
        propertyId,
        traceAction.actionKey
      );

      toast({
        title: 'Marked as completed',
        description: 'This recommendation will be suppressed going forward.',
      });

      setTraceAction(null);
      await loadActions();
    } catch (e: any) {
      toast({
        title: 'Unable to mark completed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [traceAction, propertyId, loadActions, toast]);

  const handleUndoCompletedFromTrace = useCallback(async () => {
    if (!traceAction) return;

    try {
      await api.undoOrchestrationActionCompleted(
        propertyId,
        traceAction.actionKey
      );

      toast({
        title: 'Completion undone',
        description: 'This action is active again.',
      });

      setTraceAction(null);
      await loadActions();
    } catch (e: any) {
      toast({
        title: 'Unable to undo completion',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [traceAction, propertyId, loadActions, toast]);

  /* ------------------------------------------------------------------
     Derived Groups
  ------------------------------------------------------------------- */

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

  /* ------------------------------------------------------------------
     Render Group
  ------------------------------------------------------------------- */

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
            // ✅ FIX: Check ANY authoritative suppression (PENDING 1)
            const isAuthoritativelySuppressed =
              action.suppression?.suppressed &&
              action.suppression?.suppressionSource !== null;
  
            // ✅ FIX: Optimistic disable during scheduling (PENDING 2)
            const isCurrentlyBeingScheduled = activeActionKey === action.actionKey;
            
            // 🐛 DEBUG LOG
            console.log('🎯 Rendering action:', {
              key: action.actionKey,
              title: action.title,
              suppressed: action.suppression?.suppressed,
              hasSource: action.suppression?.suppressionSource !== null,
              sourceType: action.suppression?.suppressionSource?.type,
              isAuthSuppressed: isAuthoritativelySuppressed,
              isBeingScheduled: isCurrentlyBeingScheduled,
              ctaWillBeDisabled: isAuthoritativelySuppressed || isCurrentlyBeingScheduled || isModalOpen,
            });

            return (
              <OrchestrationActionCard
                key={action.actionKey}
                action={action}
                onCtaClick={handleActionCta}
                ctaDisabled={
                  isAuthoritativelySuppressed ||
                  isCurrentlyBeingScheduled ||
                  isModalOpen
                }
                ctaLabel={
                  isAuthoritativelySuppressed
                    ? 'Already scheduled'
                    : undefined
                }
                forceShowCta
                onMarkCompleted={() => setTraceAction(action)}
              />
            );
          })}
        </div>
      </section>
    );
  };

  /* ------------------------------------------------------------------
     Render
  ------------------------------------------------------------------- */

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

  return (
    <>
      <div className="space-y-6">
        {renderGroup('Critical', critical, 'text-red-700')}
        {renderGroup('High Priority', high, 'text-amber-700')}
        {renderGroup('Other Actions', other, 'text-gray-700')}

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
                    key={action.actionKey}
                    action={action}
                    ctaDisabled
                    ctaLabel="Suppressed"
                    forceShowCta
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <MaintenanceConfigModal
        isOpen={isModalOpen}
        orchestrationMode
        template={template}
        properties={properties}
        selectedPropertyId={propertyId}
        orchestrationActionKey={activeActionKey} // 🔑 CHANGED FROM orchestrationActionId
        onClose={() => {
          setIsModalOpen(false);
          setTemplate(null);
          setActiveActionKey(null);
        }}
        onSuccess={handleSuccess}
      />

      <DecisionTraceModal
        open={Boolean(traceAction)}
        onClose={() => setTraceAction(null)}
        steps={traceAction?.decisionTrace?.steps ?? []}
        onMarkCompleted={handleMarkCompletedFromTrace}
        onUndo={handleUndoCompletedFromTrace}
      />
    </>
  );
};
