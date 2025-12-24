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

type Props = {
  propertyId: string;
  maxItems?: number;
};

type HandledState = {
  // actionId -> createdAt
  [actionId: string]: number;
};

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

  // ---------------------------------------------------------------------------
  // ✅ Persistent handled actions (prevents duplicate tasks after refresh)
  // ---------------------------------------------------------------------------

  const handledStorageKey = `ctc:actioncenter:handled:${propertyId}`;

  const [handledActions, setHandledActions] = useState<Set<string>>(new Set());

  // Load handled actions whenever property changes
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
      nextSet.forEach(id => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // ---------------------------------------------------------------------------
  // CTA HANDLER
  // Fix 1: Disable CTA while modal open
  // Fix 2: Prevent CTA on active action only (also prevents double clicks)
  // + Prevent CTA if already handled (persistent)
  // ---------------------------------------------------------------------------

  const handleActionCta = (action: OrchestratedActionDTO) => {
    if (!action) return;

    if (action.suppression?.suppressed) return;
    if (isModalOpen) return;
    if (activeActionId && activeActionId === action.id) return;
    if (handledActions.has(action.id)) return;

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

  // ---------------------------------------------------------------------------
  // SUCCESS HANDLER
  // - Persist handled state
  // - Persist recent panel state
  // ---------------------------------------------------------------------------

  const handleSuccess = () => {
    const id = activeActionId;

    toast({
      title: 'Task scheduled successfully',
      description: "We've added this to your maintenance checklist.",
    });

    if (id) {
      markHandled(id);

      const action = actions.find(a => a.id === id) || null;
      if (action) recent.setScheduled(action);
    }

    setIsModalOpen(false);
    setTemplate(null);
    setActiveActionId(null);

    // Background refresh to sync server-side suppression (eventually)
    setTimeout(loadActions, 1500);
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
    // Still show recent panel if it exists, even if no actions
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
  // (keep simple + reliable; you can expand rules later)
  // ---------------------------------------------------------------------------

  const getPostSaveCtas = (title: string, serviceCategory?: string | null, category?: string | null) => {
    const upperCat = (category || '').toUpperCase();
    const upperSvc = (serviceCategory || '').toUpperCase();

    // Roof-related
    if (upperCat.includes('ROOF') || upperSvc.includes('ROOF')) {
      return {
        primary: { label: 'Check warranty coverage', href: '/dashboard/warranties' },
        secondary: { label: 'View checklist', href: '/dashboard/maintenance' },
      };
    }

    // Systems → bookings/providers
    if (['HVAC', 'PLUMBING', 'ELECTRICAL'].includes(upperSvc)) {
      return {
        primary: { label: 'Schedule a service', href: '/dashboard/bookings' },
        secondary: { label: 'Find a provider', href: '/dashboard/providers' },
      };
    }

    // Inspection
    if (upperSvc === 'INSPECTION') {
      return {
        primary: { label: 'Upload inspection report', href: '/dashboard/inspection-reports' },
        secondary: { label: 'View checklist', href: '/dashboard/maintenance' },
      };
    }

    // Default
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
          {items.slice(0, maxItems).map(action => {
            const isHandled = handledActions.has(action.id);
            const isActive = activeActionId === action.id;

            // Enforce CTA consistency:
            // - If handled → disable + label “Task scheduled”
            // - If modal open → disable
            // - If active → disable
            const ctaDisabled = Boolean(action.suppression?.suppressed) || isModalOpen || isHandled || isActive;

            return (
              <OrchestrationActionCard
                key={action.id}
                action={action}
                onCtaClick={handleActionCta}
                ctaDisabled={ctaDisabled}
                ctaLabel={isHandled ? 'Task scheduled' : undefined}
                forceShowCta // makes sure every card has a consistent CTA area
              />
            );
          })}
        </div>
      </section>
    );
  };

  const recentTitle = recent.recent?.actionTitle || '';
  const recentAction = recent.recent?.actionId
    ? actions.find(a => a.id === recent.recent!.actionId) || null
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
