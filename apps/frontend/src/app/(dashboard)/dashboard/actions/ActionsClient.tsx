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
import { useToast } from '@/components/ui/use-toast';
import { DecisionTraceModal } from '@/components/orchestration/DecisionTraceModal';
import { useCallback } from 'react';

export function ActionsClient() {
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = selectedPropertyId;
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

    // 🔑 PREVENT creating tasks from CHECKLIST actions
    if (action.source === 'CHECKLIST') {
      toast({
        title: 'View in Maintenance',
        description: 'This task is already in your maintenance schedule.',
        variant: 'default',
      });
      return;
    }

    setActiveActionId(action.id);
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
  
  const handleMarkCompletedFromTrace = useCallback(async () => {
    if (!traceAction || !propertyId) return; 
  
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
      loadActions(); // Reload actions
    } catch (e: any) {
      toast({
        title: 'Unable to mark completed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [traceAction, propertyId, toast]);
  
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
          !traceAction.suppression?.suppressed
            ? handleMarkCompletedFromTrace
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
    </>
  );
}