// apps/frontend/src/components/orchestration/ActionCenter.tsx
'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';

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
import { useRecentAction } from '@/hooks/useRecentAction';
import { DecisionTraceModal } from './DecisionTraceModal';

type Props = {
  propertyId: string;
  maxItems?: number;
};

type HandledState = {
  // actionId -> createdAt
  [actionKey: string]: number;
};

function dedupeByActionKey(
  actions: OrchestratedActionDTO[]
): OrchestratedActionDTO[] {
  const map = new Map<string, OrchestratedActionDTO>();

  for (const action of actions) {
    // First one wins (highest priority already sorted by backend)
    if (!map.has(action.actionKey)) {
      map.set(action.actionKey, action);
    }
  }

  return Array.from(map.values());
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function formatLabelFromTitle(title?: string | null) {
  if (!title) return 'Task';
  return title;
}

function computeUiDedupeKey(a: OrchestratedActionDTO): string {
  const stable =
    a.checklistItemId ||
    a.orchestrationActionId ||
    a.serviceCategory ||
    a.systemType ||
    a.category ||
    a.title ||
    'UNKNOWN';

  // include date if checklist-driven duplicates exist
  const due = a.nextDueDate ? new Date(a.nextDueDate).toISOString().slice(0, 10) : '';

  return `${a.propertyId}:${a.source}:${String(stable).toUpperCase()}:${due}`;
}

function dedupeActionsForUi(list: OrchestratedActionDTO[]): OrchestratedActionDTO[] {
  const map = new Map<string, OrchestratedActionDTO>();

  for (const a of list) {
    const key = computeUiDedupeKey(a);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, a);
      continue;
    }

    // pick the "better" one (higher priority; then higher confidence)
    const aConf = a.confidence?.score ?? 0;
    const eConf = existing.confidence?.score ?? 0;

    const winner =
      (a.priority ?? 0) > (existing.priority ?? 0)
        ? a
        : (a.priority ?? 0) < (existing.priority ?? 0)
          ? existing
          : aConf >= eConf
            ? a
            : existing;

    map.set(key, winner);
  }

  return Array.from(map.values());
}

export const ActionCenter: React.FC<Props> = ({ propertyId, maxItems = 5 }) => {
  const { toast } = useToast();

  const [actions, setActions] = useState<OrchestratedActionDTO[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Maintenance modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [template, setTemplate] = useState<MaintenanceTaskTemplate | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  // ✅ Decision trace modal state (GLOBAL, not inside map)
  const [traceAction, setTraceAction] = useState<OrchestratedActionDTO | null>(
    null
  );

  // ---------------------------------------------------------------------------
  // ✅ Persistent handled actions (prevents duplicate tasks after refresh)
  // ---------------------------------------------------------------------------

  const handledStorageKey = `ctc:actioncenter:handled:${propertyId}`;
  const [handledActions, setHandledActions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!propertyId) return;

    const parsed = safeJsonParse<HandledState>(
      typeof window !== 'undefined'
        ? window.localStorage.getItem(handledStorageKey)
        : null
    );

    const ids = parsed ? Object.keys(parsed) : [];
    setHandledActions(new Set(ids));
  }, [propertyId, handledStorageKey]);

  const persistHandled = useCallback(
    (nextSet: Set<string>) => {
      setHandledActions(nextSet);

      if (typeof window === 'undefined') return;

      const state: HandledState = {};
      nextSet.forEach((id) => {
        state[id] = Date.now();
      });

      window.localStorage.setItem(handledStorageKey, JSON.stringify(state));
    },
    [handledStorageKey]
  );

  const markHandled = useCallback(
    (actionId: string) => {
      const next = new Set(handledActions);
      next.add(actionId);
      persistHandled(next);
    },
    [handledActions, persistHandled]
  );

  // ---------------------------------------------------------------------------
  // ✅ Recent action panel (persistent)
  // ---------------------------------------------------------------------------

  const recentKey = `ctc:actioncenter:recent:${propertyId}`;
  const recent = useRecentAction(recentKey);

  // ---------------------------------------------------------------------------
  // LOAD ACTIONS & PROPERTIES
  // ---------------------------------------------------------------------------

  const loadActions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summary, propertiesRes] = await Promise.all([
        api.getOrchestrationSummary(propertyId),
        api.getProperties(),
      ]);

      const adapted = adaptOrchestrationSummary(summary);
      const deduped = dedupeByActionKey(adapted.actions);
      setActions(deduped);

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

  // ---------------------------------------------------------------------------
  // CTA HANDLER
  // ---------------------------------------------------------------------------

  const handleActionCta = (action: OrchestratedActionDTO) => {
    if (!action) return;

    if (action.suppression?.suppressed) return;
    if (isModalOpen) return;
    if (activeActionId && activeActionId === action.actionKey) return;
    if (handledActions.has(action.actionKey)) return;

    setActiveActionId(action.actionKey);

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
    });

    setIsModalOpen(true);
  };

  // ---------------------------------------------------------------------------
  // SUCCESS HANDLER
  // ---------------------------------------------------------------------------

  const handleSuccess = () => {
    const id = activeActionId;

    toast({
      title: 'Task scheduled successfully',
      description: "We've added this to your maintenance checklist.",
    });

    if (id) {
      markHandled(id);

      const action = actions.find((a) => a.id === id) || null;
      if (action) recent.setScheduled(action);
    }

    setIsModalOpen(false);
    setTemplate(null);
    setActiveActionId(null);

    // Background refresh to sync server-side suppression (eventually)
    setTimeout(loadActions, 1500);
  };

  // ---------------------------------------------------------------------------
  // ✅ Mark as completed from DecisionTraceModal
  // ---------------------------------------------------------------------------

  const handleMarkCompletedFromTrace = useCallback(async () => {
    if (!traceAction?.id) return;

    try {
      // You should have a backend endpoint for this.
      // If your api client name differs, adjust accordingly.
      // The intention: mark orchestration action as USER_MARKED_COMPLETE.
      await api.markOrchestrationActionCompleted(
        propertyId,
        traceAction.actionKey
      );

      toast({
        title: 'Marked as completed',
        description: 'This recommendation will be suppressed going forward.',
      });

      setTraceAction(null);

      // Refresh actions to reflect suppression immediately
      await loadActions();
    } catch (e: any) {
      console.error('Mark completed failed:', e);
      toast({
        title: 'Unable to mark completed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [traceAction, toast, loadActions]);

  // ---------------------------------------------------------------------------
  // DERIVED GROUPS
  // ---------------------------------------------------------------------------

  const { active, suppressed } = useMemo(() => {
    return {
      active: actions.filter((a) => !a.suppression?.suppressed),
      suppressed: actions.filter((a) => a.suppression?.suppressed),
    };
  }, [actions]);

  const critical = active.filter((a) => a.riskLevel === 'CRITICAL');
  const high = active.filter((a) => a.riskLevel === 'HIGH');
  const other = active.filter(
    (a) => a.riskLevel !== 'CRITICAL' && a.riskLevel !== 'HIGH'
  );

  // ---------------------------------------------------------------------------
  // States
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
      <div className="space-y-4">
        {recent.visible && recent.recent && (
          <div className="rounded-lg border bg-green-50 p-4 text-sm">
            <div className="font-semibold text-green-800">Task scheduled</div>
            <div className="mt-1 text-green-700">
              <span className="font-medium">
                {formatLabelFromTitle(recent.recent.actionTitle)}
              </span>{' '}
              has been added to your maintenance checklist.
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <a
                href="/dashboard/maintenance"
                className="px-3 py-1.5 rounded-md bg-green-700 text-white text-xs font-medium"
              >
                View maintenance checklist
              </a>
              <button
                type="button"
                className="text-xs text-green-700 underline ml-auto"
                onClick={recent.dismiss}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg border p-4 bg-white">
          <div className="text-sm text-muted-foreground">
            No urgent actions at the moment.
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Post-save contextual CTA suggestions
  // ---------------------------------------------------------------------------

  const getPostSaveCtas = (
    title: string,
    serviceCategory?: string | null,
    category?: string | null
  ) => {
    const upperCat = (category || '').toUpperCase();
    const upperSvc = (serviceCategory || '').toUpperCase();

    if (upperCat.includes('ROOF') || upperSvc.includes('ROOF')) {
      return {
        primary: { label: 'Check warranty coverage', href: '/dashboard/warranties' },
        secondary: { label: 'View checklist', href: '/dashboard/maintenance' },
      };
    }

    if (['HVAC', 'PLUMBING', 'ELECTRICAL'].includes(upperSvc)) {
      return {
        primary: { label: 'Schedule a service', href: '/dashboard/bookings' },
        secondary: { label: 'Find a provider', href: '/dashboard/providers' },
      };
    }

    if (upperSvc === 'INSPECTION') {
      return {
        primary: { label: 'Upload inspection report', href: '/dashboard/inspection-reports' },
        secondary: { label: 'View checklist', href: '/dashboard/maintenance' },
      };
    }

    return {
      primary: { label: 'View maintenance checklist', href: '/dashboard/maintenance' },
    };
  };

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
          {items.slice(0, maxItems).map((action) => {
            const isHandled = handledActions.has(action.actionKey);
            const isActive = activeActionId === action.actionKey;

            const ctaDisabled =
              Boolean(action.suppression?.suppressed) ||
              isModalOpen ||
              isHandled ||
              isActive;

            return (
              <OrchestrationActionCard
                key={action.actionKey}
                action={action}
                onCtaClick={handleActionCta}
                ctaDisabled={ctaDisabled}
                ctaLabel={isHandled ? 'Task scheduled' : undefined}
                forceShowCta
                onMarkCompleted={(a) => setTraceAction(a)} // optional: can be handled in modal
              />
            );
          })}
        </div>
      </section>
    );
  };

  const recentTitle = recent.recent?.actionTitle || '';
  const recentAction = recent.recent?.actionId
    ? actions.find((a) => a.id === recent.recent!.actionId) || null
    : null;

  const recentCtas = recentTitle
    ? getPostSaveCtas(
        recentTitle,
        recentAction?.serviceCategory ?? null,
        recentAction?.category ?? null
      )
    : null;

  return (
    <>
      {/* ================= POST SAVE PANEL (persistent) ================= */}
      {recent.visible && recent.recent && (
        <div className="rounded-lg border bg-green-50 p-4 text-sm mb-4">
          <div className="space-y-2">
            <div className="font-semibold text-green-800">Task scheduled</div>

            <div className="text-green-700">
              <span className="font-medium">
                {formatLabelFromTitle(recent.recent.actionTitle)}
              </span>{' '}
              has been added to your maintenance checklist.
            </div>

            <div className="flex gap-2 flex-wrap pt-2 items-center">
              {recentCtas?.primary && (
                <a
                  href={recentCtas.primary.href}
                  className="px-3 py-1.5 rounded-md bg-green-700 text-white text-xs font-medium"
                >
                  {recentCtas.primary.label}
                </a>
              )}

              {recentCtas?.secondary && (
                <a
                  href={recentCtas.secondary.href}
                  className="px-3 py-1.5 rounded-md border border-green-700 text-green-700 text-xs font-medium"
                >
                  {recentCtas.secondary.label}
                </a>
              )}

              <button
                type="button"
                className="text-xs text-green-700 underline ml-auto"
                onClick={recent.dismiss}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ACTION LIST ================= */}
      <div className="space-y-6">
        {renderGroup('Critical', critical, 'text-red-700')}
        {renderGroup('High Priority', high, 'text-amber-700')}
        {renderGroup('Other Actions', other, 'text-gray-700')}

        {/* Suppressed Actions */}
        {suppressed.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowSuppressed((v) => !v)}
              className="text-sm font-medium text-muted-foreground hover:underline"
            >
              {showSuppressed
                ? 'Hide suppressed actions'
                : `Show suppressed actions (${suppressed.length})`}
            </button>

            {showSuppressed && (
              <div className="mt-3 space-y-3">
                {suppressed.map((action) => (
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

      {/* ================= Maintenance Modal ================= */}
      <MaintenanceConfigModal
        isOpen={isModalOpen}
        orchestrationMode
        template={template}
        properties={properties}
        selectedPropertyId={propertyId}
        orchestrationActionId={activeActionId as any}
        onClose={() => {
          setIsModalOpen(false);
          setTemplate(null);
          setActiveActionId(null);
        }}
        onSuccess={handleSuccess}
      />

      {/* ================= Decision Trace Modal ================= */}
      <DecisionTraceModal
        open={Boolean(traceAction)}
        onClose={() => setTraceAction(null)}
        steps={traceAction?.decisionTrace?.steps ?? []}
        isMarkedCompleted={
          traceAction?.suppression?.reasons?.some(
            r => r.reason === 'USER_MARKED_COMPLETE'
          )
        }
        onUndoCompleted={async () => {
          await api.unmarkOrchestrationActionCompleted(
            propertyId,
            traceAction!.actionKey
          );
          await loadActions();
        }}
        onMarkCompleted={
          traceAction ? handleMarkCompletedFromTrace : undefined
        }
      />
    </>
  );
};
