// apps/frontend/src/app/(dashboard)/dashboard/actions/ActionsClient.tsx
'use client';

import React, { useEffect, useState } from 'react';
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
import { useSearchParams } from 'next/navigation';

export function ActionsClient() {
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const searchParams = useSearchParams();
  
  // 1. Prioritize URL parameter, fallback to context
  const urlPropertyId = searchParams.get('propertyId');
  const propertyId = urlPropertyId || selectedPropertyId;
  console.log('🔍 ActionsClient propertyId:', propertyId);
  console.log('🔍 URL propertyId:', urlPropertyId);
  console.log('🔍 selectedPropertyId:', selectedPropertyId);
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
      console.error('ActionsClient error:', err);
      setError('Unable to load actions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 2. If we have an ID in the URL but not in context, sync them
    if (urlPropertyId && urlPropertyId !== selectedPropertyId) {
      setSelectedPropertyId(urlPropertyId);
    }
    loadActions();
  }, [urlPropertyId, selectedPropertyId, setSelectedPropertyId, loadActions]);

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
      setHandledActions(prev => new Set(prev).add(activeActionId));
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
  }, [traceAction, propertyId, toast]);
  const handleSnoozeFromTrace = useCallback(() => {
    console.log('🔍 SNOOZE BUTTON CLICKED IN TRACE MODAL');
    console.log('🔍 traceAction:', traceAction);
    
    if (!traceAction) {
      console.log('🔍 ABORT: No traceAction');
      return;
    }
    
    console.log('🔍 Opening SnoozeModal...');
    setIsSnoozeModalOpen(true);
    console.log('🔍 isSnoozeModalOpen set to true');
  }, [traceAction]);
  
  const handleSnooze = useCallback(
    async (snoozeUntil: Date, snoozeReason?: string) => {
      console.log('🔍 SNOOZE HANDLER CALLED:', { 
        hasTraceAction: !!traceAction, 
        hasPropertyId: !!propertyId,
        snoozeUntil, 
        snoozeReason 
      });

      if (!traceAction || !propertyId) {
        console.log('🔍 SNOOZE ABORTED: Missing traceAction or propertyId');
        return;
      }
  
      try {
        console.log('🔍 CALLING API snoozeOrchestrationAction:', {
          propertyId,
          actionKey: traceAction.actionKey,
          snoozeUntil: snoozeUntil.toISOString(),
        });

        await api.snoozeOrchestrationAction(
          propertyId,
          traceAction.actionKey,
          snoozeUntil.toISOString(),
          snoozeReason
        );

        console.log('🔍 SNOOZE API SUCCESS');
  
        toast({
          title: 'Action snoozed',
          description: `We'll remind you about this on ${snoozeUntil.toLocaleDateString()}.`,
        });
  
        setTraceAction(null);
        setIsSnoozeModalOpen(false);
        loadActions();
      } catch (e: any) {
        console.error('🔍 SNOOZE API ERROR:', e);
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
              {actions.map(action => {
                const isChecklistAction = action.source === 'CHECKLIST';
                const isSuppressed = action.suppression?.suppressed;
                
                // 🔑 NEW: Check if task was created from this RISK action
                const hasTaskCreated = action.hasRelatedChecklistItem === true;

                return (
                  <OrchestrationActionCard 
                    key={action.id} 
                    action={action}
                    onCtaClick={handleActionCta}
                    onOpenTrace={handleOpenDecisionTrace}
                    ctaDisabled={
                      handledActions.has(action.id) ||
                      isSuppressed ||
                      hasTaskCreated ||        // 🔑 NEW: Task already created
                      isChecklistAction
                    }
                    ctaLabel={
                      handledActions.has(action.id)
                        ? 'Task scheduled'
                        : isSuppressed
                          ? 'Suppressed'
                          : hasTaskCreated
                            ? 'Already scheduled'  // 🔑 NEW: Show for created tasks
                            : isChecklistAction
                              ? 'View in Maintenance'
                              : undefined
                    }
                  />
                );
              })}
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
                  onOpenTrace={handleOpenDecisionTrace}
                />
              ))}
              </div>
            </section>
          </>
        )}
        {/* Snoozed Actions */}
        {snoozedActions.length > 0 && (
          <>
            <Separator />
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-700">
                  Snoozed Actions ({snoozedActions.length})
                </h2>
                <button
                  onClick={() => setShowSnoozed(!showSnoozed)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {showSnoozed ? 'Hide' : 'Show'}
                </button>
              </div>

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
                        
                        <div className="flex gap-2">
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