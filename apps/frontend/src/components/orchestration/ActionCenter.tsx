// apps/frontend/src/components/orchestration/ActionCenter.tsx
'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';

import { api } from '@/lib/api/client';
import { OrchestratedActionDTO, Property, SuppressionSourceDTO, CompletionDataDTO } from '@/types';
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
import { CompletionModal } from './CompletionModal';

type Props = {
  propertyId: string;
  maxItems?: number;
};


export const ActionCenter: React.FC<Props> = ({
  propertyId,
  maxItems = 5,
}) => {
  const { toast } = useToast();

  // 🔑 FIXED: Separate state for each category - backend already separates them
  const [actions, setActions] = useState<OrchestratedActionDTO[]>([]);
  const [suppressedActions, setSuppressedActions] = useState<OrchestratedActionDTO[]>([]);
  const [snoozedActions, setSnoozedActions] = useState<OrchestratedActionDTO[]>([]);
  
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

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [completionAction, setCompletionAction] = useState<OrchestratedActionDTO | null>(null);

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

      // 🔑 FIXED: Set all three arrays directly from adapter - no filtering needed
      setActions(adapted.actions);
      setSuppressedActions(adapted.suppressedActions);
      setSnoozedActions(adapted.snoozedActions);

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
  
    // 🔑 FIX: Map riskLevel to priority (same as backend does)
    const priorityMap: Record<string, string> = {
      'CRITICAL': 'URGENT',
      'HIGH': 'HIGH',
      'ELEVATED': 'MEDIUM',
      'MODERATE': 'MEDIUM',
      'LOW': 'LOW',
    };
    const derivedPriority = action.riskLevel 
      ? priorityMap[action.riskLevel.toUpperCase()] || 'MEDIUM'
      : 'MEDIUM';
  
    setTemplate({
      id: `orchestration:${action.actionKey}`,
      title: action.title,
      description: action.description ?? '',
      serviceCategory:
        (action.serviceCategory as ServiceCategory) ??
        (action.category as ServiceCategory) ??
        'INSPECTION',
      defaultFrequency: RecurrenceFrequency.ANNUALLY,
      sortOrder: 0,
      // 🔑 FIX: Use correct field names from DTO
      assetType: action.systemType,        // systemType → assetType
      priority: derivedPriority,            // Derived from riskLevel
      riskLevel: action.riskLevel,
      estimatedCost: action.exposure,       // exposure → estimatedCost
    } as any);
  
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
  
    setTimeout(() => {
      loadActions();
    }, 500);
  };

  /* ------------------------------------------------------------------
     Decision Trace Actions
  ------------------------------------------------------------------- */

  const handleMarkCompletedFromTrace = useCallback(() => {
    if (!traceAction) return;
    
    setCompletionAction(traceAction);
    setTraceAction(null);
    setIsCompletionModalOpen(true);
  }, [traceAction]);

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

  const handleCompletionSubmit = useCallback(async (data: CompletionDataDTO) => {
    if (!completionAction) return;
  
    try {
      await api.markOrchestrationActionCompleted(
        propertyId,
        completionAction.actionKey,
        data
      );
  
      toast({
        title: 'Marked as completed',
        description: 'Your completion details have been saved.',
      });
  
      setIsCompletionModalOpen(false);
      setCompletionAction(null);
      await loadActions();
    } catch (e: any) {
      toast({
        title: 'Unable to mark completed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [completionAction, propertyId, loadActions, toast]);
  
  const handlePhotoUpload = useCallback(async (file: File, orderIndex: number) => {
    if (!completionAction) throw new Error('No action selected');
  
    const result = await api.uploadCompletionPhoto(
      propertyId,
      completionAction.actionKey,
      file,
      orderIndex
    );
  
    if (!result.success) {
      throw new Error('Upload failed');
    }
  
    return result.data.photo;
  }, [completionAction, propertyId]);

  /* ------------------------------------------------------------------
     Derived Groups - 🔑 FIXED: Only group by risk level, don't re-filter
  ------------------------------------------------------------------- */

  // Group active actions by risk level for display
  const critical = useMemo(() => actions.filter(a => a.riskLevel === 'CRITICAL'), [actions]);
  const high = useMemo(() => actions.filter(a => a.riskLevel === 'HIGH'), [actions]);
  const other = useMemo(() => actions.filter(
    a => a.riskLevel !== 'CRITICAL' && a.riskLevel !== 'HIGH'
  ), [actions]);

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
            const isSuppressed = action.suppression?.suppressed;
            const hasTaskCreated = action.hasRelatedChecklistItem === true;
            const isCurrentlyBeingScheduled = activeActionKey === action.actionKey;
            const isChecklistAction = action.source === 'CHECKLIST';
  
            return (
              <OrchestrationActionCard
                key={action.actionKey}
                action={action}
                onCtaClick={handleActionCta}
                ctaDisabled={
                  isSuppressed ||
                  hasTaskCreated ||
                  isCurrentlyBeingScheduled ||
                  isModalOpen ||
                  isChecklistAction
                }
                ctaLabel={
                  isSuppressed
                    ? 'Suppressed'
                    : hasTaskCreated
                      ? 'Already scheduled'
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

  if (!actions.length && !suppressedActions.length && !snoozedActions.length) {
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

        {/* Suppressed Actions */}
        {suppressedActions.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowSuppressed(v => !v)}
              className="text-sm font-medium text-muted-foreground hover:underline"
            >
              {showSuppressed
                ? 'Hide suppressed actions'
                : `Show suppressed actions (${suppressedActions.length})`}
            </button>

            {showSuppressed && (
              <div className="mt-3 space-y-3">
                {suppressedActions.map(action => (
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
        {snoozedActions.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowSnoozed(v => !v)}
              className="text-sm font-medium text-muted-foreground hover:underline"
            >
              {showSnoozed
                ? 'Hide snoozed actions'
                : `Show snoozed actions (${snoozedActions.length})`}
            </button>

            {showSnoozed && (
              <div className="mt-3 space-y-3">
                {snoozedActions.map(action => {
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
        orchestrationActionKey={activeActionKey}
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
          !traceAction.snooze
            ? handleMarkCompletedFromTrace
            : undefined
        }
        onSnooze={
          traceAction &&
          traceAction.source === 'RISK' &&
          !traceAction.suppression?.suppressed
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
      <CompletionModal
        open={isCompletionModalOpen}
        onClose={() => {
          setIsCompletionModalOpen(false);
          setCompletionAction(null);
        }}
        onSubmit={handleCompletionSubmit}
        actionTitle={completionAction?.title || ''}
        propertyId={propertyId}
        actionKey={completionAction?.actionKey || ''}
        onPhotoUpload={handlePhotoUpload}
      />
    </>
  );
};