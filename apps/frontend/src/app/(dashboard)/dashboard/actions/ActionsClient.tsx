// apps/frontend/src/app/(dashboard)/dashboard/actions/ActionsClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { OrchestratedActionDTO, Property, CompletionDataDTO } from '@/types';
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
import { useToast } from '@/components/ui/use-toast';
import { DecisionTraceModal } from '@/components/orchestration/DecisionTraceModal';
import { useCallback } from 'react';
import { SnoozeModal } from '@/components/orchestration/SnoozeModal';
import { CompletionModal } from '@/components/orchestration/CompletionModal';
import { useRouter, useSearchParams } from 'next/navigation';
import OnboardingReturnBanner from '@/components/onboarding/OnboardingReturnBanner';
import {
  BottomSafeAreaGuard,
  MobileActionRow,
  MobileKpiStrip,
  MobileKpiTile,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import {
  buildGuidanceCtaLabel,
  resolveGuidanceForOrchestrationAction,
} from '@/components/orchestration/guidanceActionLinking';
import { track } from '@/lib/analytics/events';

function orchestrationPriorityLabel(action: OrchestratedActionDTO): string {
  if (action.overdue) return 'URGENT';
  if (action.priority >= 80) return 'HIGH';
  if (action.priority >= 50) return 'MEDIUM';
  return 'LOW';
}

function orchestrationCategoryLabel(action: OrchestratedActionDTO): string {
  return String(action.serviceCategory || action.category || action.systemType || action.source || 'ORCHESTRATION');
}

export function ActionsClient() {
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. Prioritize URL parameter, fallback to context
  const urlPropertyId = searchParams.get('propertyId');
  const propertyId = urlPropertyId || selectedPropertyId;
  const { toast } = useToast();

  const [actions, setActions] = useState<OrchestratedActionDTO[]>([]);
  const [suppressedActions, setSuppressedActions] = useState<OrchestratedActionDTO[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [template, setTemplate] = useState<MaintenanceTaskTemplate | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  // Track which actions have been handled (task created)
  const [handledActions, setHandledActions] = useState<Set<string>>(new Set());
  const [traceAction, setTraceAction] = useState<OrchestratedActionDTO | null>(null);

  const [isSnoozeModalOpen, setIsSnoozeModalOpen] = useState(false);
  const [snoozedActions, setSnoozedActions] = useState<OrchestratedActionDTO[]>([]);
  const [showSnoozed, setShowSnoozed] = useState(false);

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [completionAction, setCompletionAction] = useState<OrchestratedActionDTO | null>(null);
  const guidanceQuery = useGuidance(propertyId, {
    enabled: Boolean(propertyId),
    limit: 12,
  });
  const guidanceByActionKey = useMemo(() => {
    const out = new Map<string, ReturnType<typeof resolveGuidanceForOrchestrationAction>>();
    const allActions = [...actions, ...suppressedActions, ...snoozedActions];
    for (const action of allActions) {
      const match = resolveGuidanceForOrchestrationAction({
        action,
        guidanceActions: guidanceQuery.actions,
      });
      if (match?.href) out.set(action.actionKey, match);
    }
    return out;
  }, [actions, suppressedActions, snoozedActions, guidanceQuery.actions]);

  const loadActions = useCallback(async () => {
    if (!propertyId) {
      try {
        setLoading(true);
        setError(null);

        const propertiesRes = await api.getProperties();
        if (propertiesRes.success) {
          const availableProperties = propertiesRes.data.properties || [];
          setProperties(availableProperties);

          if (availableProperties.length > 0) {
            setSelectedPropertyId(availableProperties[0].id);
            return;
          }
        }

        setError('No property selected.');
      } catch (err) {
        setError('Unable to load actions.');
      } finally {
        setLoading(false);
      }
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
      setSnoozedActions(summary.snoozedActions || []);

      if (propertyRes?.success) {
        setPropertyName(propertyRes.data.name ?? 'My Home');
      } else {
        setPropertyName('My Home');
      }

      if (propertiesRes.success) {
        setProperties(propertiesRes.data.properties || []);
      }
    } catch (err) {
      setError('Unable to load actions.');
    } finally {
      setLoading(false);
    }
  }, [propertyId, setSelectedPropertyId]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  // CTA handler - opens modal
  const handleActionCta = (action: OrchestratedActionDTO) => {
    if (action.suppression?.suppressed) return;

    // 🔑 PREVENT creating tasks from CHECKLIST actions
    if (action.source === 'CHECKLIST') {
      toast({
        title: 'View in Maintenance',
        description: 'This task is already in your maintenance schedule.',
        variant: 'default',
      });
      return;
    }

    const guidanceAction = guidanceByActionKey.get(action.actionKey);
    if (guidanceAction?.href) {
      router.push(guidanceAction.href);
      return;
    }

    // 🔑 FIX: Store actionKey instead of id
    setActiveActionId(action.actionKey); // Changed from action.id

    // 🔑 FIX: Map riskLevel to priority
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
      // 🔑 FIX: Add orchestration fields
      assetType: action.systemType,
      priority: derivedPriority,
      riskLevel: action.riskLevel,
      estimatedCost: action.exposure,
    } as any);

    setIsModalOpen(true);
  };

  // Success handler - mark action as handled and disable CTA
  const handleSuccess = () => {
    // Show success toast
    toast({
      title: 'Task scheduled successfully',
      description: "We're tracking this for you.",
    });

    // Mark action as handled (disable CTA)
    if (activeActionId) {
      setHandledActions((prev) => {
        const next = new Set(prev);
        next.add(activeActionId);
        return next;
      });
      
    }

    // Close modal and reset
    setIsModalOpen(false);
    setTemplate(null);
    setActiveActionId(null);

    // Background refresh to eventually sync with server suppression
    setTimeout(() => {
      loadActions();
    }, 3000);
  };

  const handleOpenDecisionTrace = useCallback((action: OrchestratedActionDTO) => {
    const isChecklist = action.source === 'CHECKLIST';
    const steps = action.decisionTrace?.steps ?? [];
    const checklistExplainOnly =
      !action.suppression?.suppressed &&
      (isChecklist || (steps.length === 1 && steps[0]?.rule === 'CHECKLIST_ACTIONABLE'));

    if (checklistExplainOnly) {
      // no modal – optionally set a toast or do nothing
      return;
    }

    setTraceAction(action);
  }, []);
  
  const handleMarkCompletedFromTrace = useCallback(() => {
    if (!traceAction) return;
    
    setCompletionAction(traceAction);
    setTraceAction(null);
    setIsCompletionModalOpen(true);
  }, [traceAction]);
  
  const handleUndoCompletedFromTrace = useCallback(async () => {
    if (!traceAction || !propertyId) return;
  
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
      loadActions(); // Reload actions
    } catch (e: any) {
      toast({
        title: 'Unable to undo completion',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [traceAction, propertyId, loadActions, toast]);
  const handleSnoozeFromTrace = useCallback(() => {
    if (!traceAction) {
      return;
    }

    setIsSnoozeModalOpen(true);
  }, [traceAction]);
  
  const handleSnooze = useCallback(
    async (snoozeUntil: Date, snoozeReason?: string) => {
      if (!traceAction || !propertyId) {
        return;
      }

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
        loadActions();
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
  
        loadActions();
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
    if (!completionAction || !propertyId) return;
  
    try {
      await api.markOrchestrationActionCompleted(
        propertyId,
        completionAction.actionKey,
        data
      );

      track('task_completed', {
        priority: orchestrationPriorityLabel(completionAction),
        category: orchestrationCategoryLabel(completionAction),
        propertyId: completionAction.propertyId || propertyId,
      });
  
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
    if (!completionAction || !propertyId) throw new Error('No action selected or property ID missing');
  
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
      <MobilePageContainer className="max-w-6xl space-y-6 pt-2">
        <OnboardingReturnBanner />
        <MobilePageIntro
          eyebrow={propertyName || 'Action Center'}
          title="What needs attention"
          subtitle="Everything your home needs right now."
        />
        <MobileKpiStrip className="sm:grid-cols-4">
          <MobileKpiTile
            label="Active"
            value={actions.length}
            hint={actions.length === 1 ? 'Needs attention' : 'Need attention'}
            tone={actions.length > 0 ? 'warning' : 'neutral'}
          />
          <MobileKpiTile
            label="Suppressed"
            value={suppressedActions.length}
            hint="Auto-hidden by system"
            tone={suppressedActions.length > 0 ? 'positive' : 'neutral'}
          />
          <MobileKpiTile
            label="Snoozed"
            value={snoozedActions.length}
            hint="Will return later"
            tone={snoozedActions.length > 0 ? 'danger' : 'neutral'}
          />
          <MobileKpiTile
            label="Total"
            value={actions.length + suppressedActions.length + snoozedActions.length}
            hint="Across all queues"
          />
        </MobileKpiStrip>

        {/* Active Actions */}
        <MobileSection className="space-y-4">
          <MobileSectionHeader
            title={`Active Actions (${actions.length})`}
            subtitle="Highest-priority items first."
          />

          {actions.length === 0 ? (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              No active actions at this time.
            </div>
          ) : (
            <div className="space-y-3">
              {actions.map((action) => {
                const isChecklistAction = action.source === 'CHECKLIST';
                const isSuppressed = action.suppression?.suppressed;
                const guidanceAction = guidanceByActionKey.get(action.actionKey);
                const guidanceCtaLabel = guidanceAction ? buildGuidanceCtaLabel(guidanceAction) : undefined;

                // Task created server-side (preferred truth)
                const hasTaskCreated = action.hasRelatedChecklistItem === true;

                // ✅ FIX: handledActions is keyed by actionKey (fallback to id)
                const handledKey = action.actionKey || action.id;
                const isHandled = handledActions.has(handledKey);

                return (
                  <OrchestrationActionCard
                    key={action.id}
                    action={action}
                    onCtaClick={handleActionCta}
                    onOpenTrace={handleOpenDecisionTrace}
                    ctaDisabled={isHandled || isSuppressed || hasTaskCreated || isChecklistAction}
                    ctaLabel={
                      isHandled
                        ? 'Task scheduled'
                        : isSuppressed
                          ? 'Suppressed'
                          : hasTaskCreated
                            ? 'Already scheduled'
                            : isChecklistAction
                              ? 'View in Maintenance'
                              : guidanceCtaLabel
                    }
                  />
                );
              })}

            </div>
          )}
        </MobileSection>

        {/* Suppressed Actions */}
        {suppressedActions.length > 0 && (
          <>
            <Separator />
            <MobileSection className="space-y-4">
              <MobileSectionHeader
                title={`Suppressed Actions (${suppressedActions.length})`}
                subtitle="Already handled by recent activity."
              />
              <div className="space-y-3">
              {suppressedActions.map(action => (
                <OrchestrationActionCard 
                  key={action.id} 
                  action={action}
                  onCtaClick={handleActionCta}
                  onOpenTrace={handleOpenDecisionTrace}
                />
              ))}
              </div>
            </MobileSection>
          </>
        )}
        {/* Snoozed Actions */}
        {snoozedActions.length > 0 && (
          <>
            <Separator />
            <MobileSection className="space-y-4">
              <MobileSectionHeader
                title={`Snoozed Actions (${snoozedActions.length})`}
                subtitle="Snoozed — check back later."
                action={
                  <button
                    onClick={() => setShowSnoozed(!showSnoozed)}
                    className="min-h-[40px] rounded-lg border border-slate-200 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    {showSnoozed ? 'Hide' : 'Show'}
                  </button>
                }
              />

              {showSnoozed && (
                <div className="space-y-3">
                  {snoozedActions.map(action => {
                    const snoozeInfo = action.snooze;
                    const snoozeLabel = snoozeInfo
                      ? `Snoozed for ${snoozeInfo.daysRemaining} more ${
                          snoozeInfo.daysRemaining === 1 ? 'day' : 'days'
                        }`
                      : 'Snoozed';

                    return (
                      <div key={action.id} className="space-y-2">
                        <OrchestrationActionCard
                          action={action}
                          onCtaClick={handleActionCta}
                          onOpenTrace={handleOpenDecisionTrace}
                          ctaDisabled
                          ctaLabel={snoozeLabel}
                        />
                        
                        <MobileActionRow>
                          <button
                            onClick={() => handleUnsnooze(action)}
                            className="min-h-[40px] rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Un-snooze now
                          </button>
                          <button
                            onClick={() => {
                              setTraceAction(action);
                              setIsSnoozeModalOpen(true);
                            }}
                            className="min-h-[40px] rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Extend snooze
                          </button>
                        </MobileActionRow>
                      </div>
                    );
                  })}
                </div>
              )}
            </MobileSection>
          </>
        )}
        <BottomSafeAreaGuard />
      </MobilePageContainer>
      {/* Modal */}
      <MaintenanceConfigModal
        isOpen={isModalOpen}
        orchestrationMode
        template={template}
        properties={properties}
        selectedPropertyId={propertyId}
        orchestrationActionKey={activeActionId} // 🔑 FIX: Pass the actionKey
        onClose={() => {
          setIsModalOpen(false);
          setTemplate(null);
          setActiveActionId(null);
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
      {propertyId && (
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
      )}
    </>
  );
}
