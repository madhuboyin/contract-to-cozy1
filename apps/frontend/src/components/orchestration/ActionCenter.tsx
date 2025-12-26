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
import { SnoozeModal } from './SnoozeModal';

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
  const [showSnoozed, setShowSnoozed] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [template, setTemplate] = useState<MaintenanceTaskTemplate | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  const [traceAction, setTraceAction] =
    useState<OrchestratedActionDTO | null>(null);
  const [isSnoozeModalOpen, setIsSnoozeModalOpen] = useState(false);

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

      // 🐛 EXPLICIT DEBUG LOG - NO OBJECTS
      console.log('=== ACTIONS LOADED ===');
      console.log('Total Active:', adapted.actions.length);
      console.log('Total Suppressed:', adapted.suppressedActions.length);
      
      console.log('\n--- ACTIVE ACTIONS ---');
      adapted.actions.forEach((a, i) => {
        console.log(`[${i}] ${a.actionKey}`);
        console.log(`    Title: ${a.title}`);
        console.log(`    Source: ${a.source}`);
        console.log(`    Suppressed: ${a.suppression?.suppressed}`);
        console.log(`    SuppressionSource: ${a.suppression?.suppressionSource?.type || 'NONE'}`);
      });
      
      console.log('\n--- SUPPRESSED ACTIONS ---');
      adapted.suppressedActions.forEach((a, i) => {
        console.log(`[${i}] ${a.actionKey}`);
        console.log(`    Title: ${a.title}`);
        console.log(`    Source: ${a.source}`);
        console.log(`    Suppressed: ${a.suppression?.suppressed}`);
        console.log(`    SuppressionSource: ${a.suppression?.suppressionSource?.type || 'NONE'}`);
      });
      
      console.log('===================\n');
      
      setActions(adapted.actions);

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
  
    // 🔑 Reduced timeout - action stays active with hasRelatedChecklistItem = true
    setTimeout(() => {
      loadActions();
    }, 500);  // Reduced from 1000ms or 2000ms
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

  const handleOpenDecisionTrace = useCallback((action: OrchestratedActionDTO) => {
    setTraceAction(action);
  }, []);
  const handleSnoozeFromTrace = useCallback(() => {
    if (!traceAction) return;
    setIsSnoozeModalOpen(true);
  }, [traceAction]);
  
  const handleSnooze = useCallback(
    async (snoozeUntil: Date, snoozeReason?: string) => {
      if (!traceAction || !propertyId) return;
  
      try {
        await api.snoozeOrchestrationAction(
          propertyId,
          traceAction.actionKey,
          snoozeUntil.toISOString(),
          snoozeReason
        );
  
        toast({
          title: 'Action snoozed',
          description: `We'll remind you about this on ${snoozeUntil.toLocaleDateString()}.`,
        });
  
        setTraceAction(null);
        setIsSnoozeModalOpen(false);
        await loadActions();
      } catch (e: any) {
        toast({
          title: 'Unable to snooze action',
          description: e?.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [traceAction, propertyId, loadActions, toast]
  );
  
  const handleUnsnooze = useCallback(
    async (action: OrchestratedActionDTO) => {
      if (!propertyId) return;
  
      try {
        await api.unsnoozeOrchestrationAction(propertyId, action.actionKey);
  
        toast({
          title: 'Action un-snoozed',
          description: 'This action is now active again.',
        });
  
        await loadActions();
      } catch (e: any) {
        toast({
          title: 'Unable to un-snooze action',
          description: e?.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [propertyId, loadActions, toast]
  );


  /* ------------------------------------------------------------------
     Derived Groups
  ------------------------------------------------------------------- */

  const { active, suppressed, snoozed } = useMemo(() => {
    return {
      active: actions.filter(a => !a.suppression?.suppressed),
      suppressed: actions.filter(a => a.suppression?.suppressed),
      snoozed: actions.filter(a => a.snooze !== null),
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
            // 🔑 Check suppression status
            const isSuppressed = action.suppression?.suppressed;
            
            // 🔑 NEW: Check if task was created from this action
            const hasTaskCreated = action.hasRelatedChecklistItem === true;
            
            // 🔑 Check if currently being scheduled
            const isCurrentlyBeingScheduled = activeActionKey === action.actionKey;
            
            // 🔑 CHECKLIST actions
            const isChecklistAction = action.source === 'CHECKLIST';
  
            return (
              <OrchestrationActionCard
                key={action.actionKey}
                action={action}
                onCtaClick={handleActionCta}
                ctaDisabled={
                  isSuppressed ||           // Suppressed actions
                  hasTaskCreated ||         // 🔑 NEW: Task already created
                  isCurrentlyBeingScheduled ||  // Currently being processed
                  isModalOpen ||            // Modal is open
                  isChecklistAction         // Checklist items always disabled
                }
                ctaLabel={
                  isSuppressed
                    ? 'Suppressed'
                    : hasTaskCreated
                      ? 'Already scheduled'  // 🔑 NEW: Show for created tasks
                      : isChecklistAction
                        ? 'View in Maintenance'
                        : undefined
                }
                forceShowCta
                onOpenTrace={handleOpenDecisionTrace}
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
                    onOpenTrace={handleOpenDecisionTrace}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Snoozed Actions */}
        {snoozed.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowSnoozed(v => !v)}
              className="text-sm font-medium text-muted-foreground hover:underline"
            >
              {showSnoozed
                ? 'Hide snoozed actions'
                : `Show snoozed actions (${snoozed.length})`}
            </button>

            {showSnoozed && (
              <div className="mt-3 space-y-3">
                {snoozed.map(action => {
                  const snoozeInfo = action.snooze;
                  const snoozeLabel = snoozeInfo
                    ? `Snoozed for ${snoozeInfo.daysRemaining} more ${
                        snoozeInfo.daysRemaining === 1 ? 'day' : 'days'
                      }`
                    : 'Snoozed';

                  return (
                    <div key={action.actionKey} className="relative">
                      <OrchestrationActionCard
                        action={action}
                        ctaDisabled
                        ctaLabel={snoozeLabel}
                        forceShowCta
                        onOpenTrace={handleOpenDecisionTrace}
                      />
                      
                      {/* Un-snooze Button */}
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleUnsnooze(action)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Un-snooze now
                        </button>
                        <button
                          onClick={() => {
                            setTraceAction(action);
                            setIsSnoozeModalOpen(true);
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Extend snooze
                        </button>
                      </div>
                    </div>
                  );
                })}
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
        onMarkCompleted={
          traceAction && 
          traceAction.source === 'RISK' && 
          !traceAction.suppression?.suppressed &&
          !traceAction.snooze  // 🔑 Don't show if snoozed
            ? handleMarkCompletedFromTrace
            : undefined
        }
        onSnooze={
          traceAction &&
          traceAction.source === 'RISK' &&
          !traceAction.suppression?.suppressed  // 🔑 NEW: Show for non-suppressed RISK
            ? handleSnoozeFromTrace
            : undefined
        }
        onUndo={
          traceAction &&
          traceAction.source === 'RISK' &&
          traceAction.suppression?.suppressionSource?.type === 'USER_EVENT' &&
          traceAction.suppression?.suppressionSource?.eventType === 'USER_MARKED_COMPLETE'
            ? handleUndoCompletedFromTrace
            : undefined
        }
      />
      <SnoozeModal
        open={isSnoozeModalOpen}
        onClose={() => setIsSnoozeModalOpen(false)}
        onSnooze={handleSnooze}
        currentSnoozeUntil={traceAction?.snooze?.snoozeUntil}
      />
    </>
  );
};
