'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  Link2,
  ListPlus,
  MapPin,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  MOBILE_CARD_RADIUS,
  MOBILE_TYPE_TOKENS,
} from '@/components/mobile/dashboard/mobileDesignTokens';
import type {
  RadarCanonicalDetail,
  RadarCanonicalFeedItem,
  RadarFeedbackType,
  RadarNormalizedGeography,
  RadarUserState,
} from '@/types';
import {
  ACTION_PRIORITY_COLOR,
  ACTION_PRIORITY_LABEL,
  CANONICAL_IMPACT_COLOR,
  CANONICAL_IMPACT_LABELS,
  CANONICAL_SEVERITY_COLOR,
  CANONICAL_SEVERITY_DOT,
  CANONICAL_SEVERITY_LABELS,
  eventTypeIcon,
  formatEventType,
  formatRadarDateTime,
  formatSystemType,
} from './RadarUtils';

function trackRadarSheetEvent(
  propertyId: string,
  event: string,
  metadata?: Record<string, unknown>,
) {
  void api.trackHomeEventRadarEvent(propertyId, {
    event,
    section: 'detail_sheet',
    metadata: {
      tool_name: 'home_event_radar',
      property_id: propertyId,
      ...metadata,
    },
  }).catch(() => undefined);
}

interface Props {
  item: RadarCanonicalFeedItem | null;
  propertyId: string;
  onClose: () => void;
  onStateChange?: (matchId: string, state: RadarUserState) => void;
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
}

const FEEDBACK_OPTIONS: Array<{ value: RadarFeedbackType; label: string }> = [
  { value: 'wrong_location', label: 'Wrong location' },
  { value: 'not_relevant', label: 'Not relevant to my home' },
  { value: 'duplicate', label: 'Duplicate event' },
  { value: 'stale', label: 'Information is stale' },
  { value: 'other', label: 'Something else' },
];

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5',
      MOBILE_TYPE_TOKENS.chip,
      className,
    )}>
      {children}
    </span>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-muted))]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function humanize(value: string): string {
  return value
    .replace(/^property\./, '')
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

export function formatRadarGeography(geography: RadarNormalizedGeography | null): string {
  if (!geography) return 'The provider did not supply a displayable coverage area.';
  switch (geography.type) {
    case 'property':
      return 'Matched directly to this property.';
    case 'postal_code':
      return `Matched to postal code ${geography.postalCode}.`;
    case 'administrative_area':
      return `Matched to the ${geography.level.replaceAll('_', ' ')} area ${geography.name}.`;
    case 'point':
      return 'Matched to a provider location near this property.';
    case 'radius':
      return `Matched within the provider's ${Math.round(geography.radiusMeters / 1_609.344)} mile coverage radius.`;
    case 'polygon':
      return 'This property is inside the provider-defined event area.';
  }
}

type RadarRecommendedAction = RadarCanonicalDetail['recommendedActions'][number];

function RadarTaskControls({
  action,
  propertyId,
  matchId,
}: {
  action: RadarRecommendedAction;
  propertyId: string;
  matchId: string;
}) {
  const queryClient = useQueryClient();
  const [showOptions, setShowOptions] = React.useState(false);
  const [showCandidates, setShowCandidates] = React.useState(false);
  const [dueAt, setDueAt] = React.useState('');
  const [selectedTaskId, setSelectedTaskId] = React.useState('');
  const [assigneeUserId, setAssigneeUserId] = React.useState('');

  const membersQuery = useQuery({
    queryKey: ['household-members', propertyId],
    queryFn: () => api.listHouseholdMembers(propertyId),
    enabled: showOptions && !action.taskLink,
    staleTime: 5 * 60 * 1000,
  });

  const candidatesQuery = useQuery({
    queryKey: ['radar-task-candidates', propertyId, matchId, action.code],
    queryFn: () => api.getRadarTaskCandidates(propertyId, matchId, action.code),
    enabled: showCandidates && !action.taskLink,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (
      input: Parameters<typeof api.createOrLinkRadarTask>[3],
    ) => api.createOrLinkRadarTask(propertyId, matchId, action.code, input),
    onSuccess: () => {
      setShowOptions(false);
      setShowCandidates(false);
      void queryClient.invalidateQueries({
        queryKey: ['radar-event-detail', propertyId, matchId],
      });
      trackRadarSheetEvent(propertyId, 'TASK_INTEGRATION_COMPLETED', {
        property_event_match_id: matchId,
        action_code: action.code,
      });
    },
    onError: () => {
      trackRadarSheetEvent(propertyId, 'ERROR', {
        stage: 'task_integration',
        action_code: action.code,
      });
    },
  });

  const requestedDueAt = (): string | null => (
    dueAt ? new Date(dueAt).toISOString() : null
  );

  if (action.taskLink) {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <p className="mb-0 text-xs font-semibold text-emerald-900">
          {action.taskLink.operation === 'create_reminder' ? 'Reminder created' : 'Maintenance task linked'}
        </p>
        <Link
          href={action.taskLink.task.href}
          className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-emerald-800 underline underline-offset-2"
        >
          Open {action.taskLink.task.title}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
        {action.taskLink.task.nextDueDate ? (
          <p className="mb-0 text-xs text-emerald-800">
            Due {formatRadarDateTime(action.taskLink.task.nextDueDate)}
          </p>
        ) : null}
      </div>
    );
  }

  if (action.supportedTaskOperations.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[hsl(var(--mobile-border-subtle))] pt-3">
      {!showOptions ? (
        <button
          type="button"
          onClick={() => setShowOptions(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] px-3 py-2 text-xs font-semibold text-[hsl(var(--mobile-brand-strong))]"
        >
          <ListPlus className="h-4 w-4" aria-hidden />
          Plan this action
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[hsl(var(--mobile-text-secondary))]">
            Due date (optional; Radar uses event timing when safe)
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => {
                setDueAt(event.target.value);
                mutation.reset();
              }}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[hsl(var(--mobile-text-secondary))]">
            Assign to (optional)
            <select
              value={assigneeUserId}
              onChange={(event) => {
                setAssigneeUserId(event.target.value);
                mutation.reset();
              }}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {membersQuery.data?.map((member) => (
                <option key={member.id} value={member.userId}>
                  {member.displayName
                    || `${member.user.firstName} ${member.user.lastName}`.trim()
                    || member.user.email}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {action.supportedTaskOperations.includes('create_task') ? (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({
                  operation: 'create_task',
                  dueAt: requestedDueAt(),
                  assigneeUserId: assigneeUserId || null,
                })}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-xs font-semibold"
              >
                <ListPlus className="h-4 w-4" aria-hidden />
                Add task
              </button>
            ) : null}
            {action.supportedTaskOperations.includes('create_reminder') ? (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({
                  operation: 'create_reminder',
                  dueAt: requestedDueAt(),
                  assigneeUserId: assigneeUserId || null,
                })}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-xs font-semibold"
              >
                <CalendarClock className="h-4 w-4" aria-hidden />
                Set reminder
              </button>
            ) : null}
            {action.supportedTaskOperations.includes('link_existing_task') ? (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => setShowCandidates((current) => !current)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-xs font-semibold"
              >
                <Link2 className="h-4 w-4" aria-hidden />
                Link existing
              </button>
            ) : null}
          </div>
          {showCandidates ? (
            <div className="space-y-2">
              {candidatesQuery.isLoading ? (
                <p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">Loading tasks…</p>
              ) : candidatesQuery.data?.length ? (
                <>
                  <label className="sr-only" htmlFor={`radar-task-${matchId}-${action.code}`}>
                    Existing maintenance task
                  </label>
                  <select
                    id={`radar-task-${matchId}-${action.code}`}
                    value={selectedTaskId}
                    onChange={(event) => setSelectedTaskId(event.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Choose a task</option>
                    {candidatesQuery.data.map((task) => (
                      <option key={task.id} value={task.id}>{task.title}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedTaskId || mutation.isPending}
                    onClick={() => mutation.mutate({
                      operation: 'link_existing_task',
                      maintenanceTaskId: selectedTaskId,
                      assigneeUserId: assigneeUserId || null,
                    })}
                    className="inline-flex min-h-[44px] items-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Link selected task
                  </button>
                </>
              ) : (
                <p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">
                  No active maintenance tasks are available to link.
                </p>
              )}
            </div>
          ) : null}
          {mutation.isPending ? (
            <p role="status" className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">Saving…</p>
          ) : null}
          {mutation.isError ? (
            <p role="alert" className="mb-0 text-xs text-rose-600">
              {mutation.error instanceof Error
                ? mutation.error.message
                : 'Could not save this task. Please try again.'}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DetailLoading() {
  return (
    <div aria-label="Loading event details" className="space-y-3">
      {[80, 60, 90, 72].map((width) => (
        <div
          key={width}
          className="h-4 animate-pulse rounded-md bg-[hsl(var(--mobile-border-subtle))]"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}

function DetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className={cn(MOBILE_CARD_RADIUS, 'border border-rose-200 bg-rose-50 p-4')}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden />
        <div>
          <p className="mb-0 text-sm font-semibold text-rose-900">Unable to load event details</p>
          <p className="mb-0 mt-1 text-xs text-rose-800">
            The summary card remains available, but detailed source and property-match evidence
            could not be loaded.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-800"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Retry details
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailContent({
  detail,
  propertyId,
}: {
  detail: RadarCanonicalDetail;
  propertyId: string;
}) {
  const drivers = detail.impactFactors?.drivers ?? [];
  const explanation = detail.matchExplanation;
  const confidenceLimited = detail.confidence === 'low' || detail.confidence === 'medium';

  return (
    <>
      {detail.isSourceStale ? (
        <div className={cn(MOBILE_CARD_RADIUS, 'border border-amber-200 bg-amber-50 px-4 py-3')}>
          <p className={cn('mb-0 text-amber-900', MOBILE_TYPE_TOKENS.caption)}>
            The source has not refreshed within its usual window. The latest status may be delayed.
          </p>
        </div>
      ) : null}

      <DetailSection title="Official event details">
        <div className={cn(MOBILE_CARD_RADIUS, 'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4')}>
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
            {detail.summary}
          </p>
          <p className="mb-0 mt-3 text-xs text-[hsl(var(--mobile-text-muted))]">
            Source: {detail.sourceName}{detail.provider ? ` · ${detail.provider}` : ''}
          </p>
          {detail.canonicalUrl ? (
            <a
              href={detail.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))] underline underline-offset-2"
            >
              Open official source
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ) : (
            <p className="mb-0 mt-2 text-xs text-[hsl(var(--mobile-text-muted))]">
              No external source link was supplied.
            </p>
          )}
        </div>
      </DetailSection>

      <DetailSection title="Event timing">
        <dl className={cn(MOBILE_CARD_RADIUS, 'grid gap-3 border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 text-sm')}>
          <div>
            <dt className="text-xs text-[hsl(var(--mobile-text-muted))]">Effective</dt>
            <dd className="mt-0.5 text-[hsl(var(--mobile-text-primary))]">{formatRadarDateTime(detail.effectiveAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[hsl(var(--mobile-text-muted))]">Provider observed</dt>
            <dd className="mt-0.5 text-[hsl(var(--mobile-text-primary))]">{formatRadarDateTime(detail.revision.observedAt)}</dd>
          </div>
          {detail.revision.materialUpdatedAt ? (
            <div>
              <dt className="text-xs text-[hsl(var(--mobile-text-muted))]">Property match updated</dt>
              <dd className="mt-0.5 text-[hsl(var(--mobile-text-primary))]">{formatRadarDateTime(detail.revision.materialUpdatedAt)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-[hsl(var(--mobile-text-muted))]">Expires</dt>
            <dd className="mt-0.5 text-[hsl(var(--mobile-text-primary))]">
              {detail.expiresAt ? formatRadarDateTime(detail.expiresAt) : 'No expiration supplied'}
            </dd>
          </div>
        </dl>
      </DetailSection>

      <DetailSection title="Why this event matches">
        <div className={cn(MOBILE_CARD_RADIUS, 'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4')}>
          <p className="mb-0 flex items-start gap-2 text-sm text-[hsl(var(--mobile-text-primary))]">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mobile-brand-strong))]" aria-hidden />
            <span>{explanation?.homeownerExplanation ?? formatRadarGeography(detail.geography)}</span>
          </p>
          {explanation?.reasons?.length ? (
            <ul className="mb-0 mt-3 space-y-1 pl-5 text-xs text-[hsl(var(--mobile-text-secondary))]">
              {explanation.reasons.map((reason) => <li key={reason} className="list-disc">{reason}</li>)}
            </ul>
          ) : null}
        </div>
      </DetailSection>

      <DetailSection title="Impact on your home">
        <div className={cn(
          MOBILE_CARD_RADIUS,
          'border p-4',
          detail.impact === 'critical' || detail.impact === 'high'
            ? 'border-rose-200 bg-rose-50'
            : detail.impact === 'moderate'
              ? 'border-amber-200 bg-amber-50'
              : 'border-[hsl(var(--mobile-border-subtle))] bg-white',
        )}>
          <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
            {CANONICAL_IMPACT_LABELS[detail.impact]}
          </p>
          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
            {detail.impactSummary ?? 'This event is shown for awareness based on the available property evidence.'}
          </p>
          {confidenceLimited ? (
            <p className="mb-0 mt-3 text-xs font-medium text-violet-700">
              {detail.confidence === 'low' ? 'Limited' : 'Moderate'} confidence — review the missing facts below before acting.
            </p>
          ) : (
            <p className="mb-0 mt-3 text-xs text-[hsl(var(--mobile-text-muted))]">
              Confidence: {detail.confidence ?? 'not rated'}
            </p>
          )}
        </div>
      </DetailSection>

      {drivers.length > 0 ? (
        <DetailSection title="Confirmed impact factors">
          <div className="space-y-2">
            {drivers.map((driver) => (
              <div key={driver.code} className={cn(MOBILE_CARD_RADIUS, 'border border-[hsl(var(--mobile-border-subtle))] bg-white px-3.5 py-3')}>
                <p className="mb-0 text-xs font-semibold text-[hsl(var(--mobile-text-muted))]">
                  {driver.effect === 'increase' ? 'Increases impact' : driver.effect === 'decrease' ? 'Reduces impact' : 'Context'}
                </p>
                <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.caption)}>
                  {driver.description}
                </p>
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {detail.missingFacts.length > 0 || explanation?.missingFactReasons?.length ? (
        <DetailSection title="Details that would improve confidence">
          <div className="space-y-2">
            {detail.missingFacts.map((fact) => (
              <div key={`${fact.factKey}-${fact.reasonCode}`} className={cn(MOBILE_CARD_RADIUS, 'border border-violet-200 bg-violet-50 px-3.5 py-3')}>
                <p className="mb-0 text-sm text-violet-950">{fact.detail}</p>
                <Link
                  href={fact.correctionPath}
                  className="mt-2 inline-flex min-h-[44px] items-center text-xs font-semibold text-violet-800 underline underline-offset-2"
                >
                  Review {humanize(fact.factKey)}
                </Link>
              </div>
            ))}
            {explanation?.missingFactReasons?.map((reason) => (
              <p key={`${reason.component}-${reason.code}`} className="mb-0 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3 text-sm text-violet-950">
                {reason.detail}
              </p>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {detail.matchedSystems.length > 0 ? (
        <DetailSection title="Affected home systems">
          <div className="flex flex-wrap gap-2">
            {detail.matchedSystems.map((system) => (
              <Chip
                key={`${system.type}-${system.relevance}`}
                className={system.relevance === 'high'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : system.relevance === 'medium'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600'}
              >
                {formatSystemType(system.type)} · {system.relevance}
              </Chip>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {detail.recommendedActions.length > 0 ? (
        <DetailSection title="Recommended actions">
          <div className="space-y-2">
            {detail.recommendedActions.map((action) => (
              <div key={action.code} className={cn(MOBILE_CARD_RADIUS, 'border border-[hsl(var(--mobile-border-subtle))] bg-white px-3.5 py-3')}>
                <div className="flex items-start gap-3">
                  <Chip className={ACTION_PRIORITY_COLOR[action.priority]}>
                    {ACTION_PRIORITY_LABEL[action.priority]}
                  </Chip>
                  <div className="min-w-0">
                    <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                      {action.label}
                    </p>
                    {action.responsibleParty ? (
                      <p className="mb-0 mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                        Responsibility: {humanize(action.responsibleParty)}
                      </p>
                    ) : null}
                    {action.destination.kind === 'internal' && action.destination.href ? (
                      <Link
                        href={action.destination.href}
                        onClick={() => trackRadarSheetEvent(propertyId, 'ACTION_HANDOFF_OPENED', {
                          property_event_match_id: detail.propertyMatchId,
                          action_code: action.code,
                          destination_purpose: action.destination.purpose,
                          target_capability: action.targetCapability,
                        })}
                        className="mt-2 inline-flex min-h-[44px] items-center text-xs font-semibold text-[hsl(var(--mobile-brand-strong))] underline underline-offset-2"
                      >
                        {action.destination.label ?? 'Continue'}
                      </Link>
                    ) : action.destination.kind === 'external' && action.destination.href ? (
                      <a
                        href={action.destination.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackRadarSheetEvent(propertyId, 'ACTION_HANDOFF_OPENED', {
                          property_event_match_id: detail.propertyMatchId,
                          action_code: action.code,
                          destination_purpose: action.destination.purpose,
                          target_capability: null,
                        })}
                        className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-[hsl(var(--mobile-brand-strong))] underline underline-offset-2"
                      >
                        {action.destination.label ?? 'Open official instructions'}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    ) : (
                      <p className="mb-0 mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                        Informational recommendation
                      </p>
                    )}
                    <RadarTaskControls
                      action={action}
                      propertyId={propertyId}
                      matchId={detail.propertyMatchId}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {detail.relatedIncident || detail.relatedGuidance ? (
        <DetailSection title="Related resolution">
          <div className="space-y-2">
            {detail.relatedIncident ? (
              <Link href={detail.relatedIncident.href} className={cn(MOBILE_CARD_RADIUS, 'block min-h-[44px] border border-[hsl(var(--mobile-border-subtle))] bg-white p-3.5')}>
                <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">{detail.relatedIncident.title}</p>
                <p className="mb-0 mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">Incident · {humanize(detail.relatedIncident.status)}</p>
              </Link>
            ) : null}
            {detail.relatedGuidance ? (
              <Link href={detail.relatedGuidance.href} className={cn(MOBILE_CARD_RADIUS, 'block min-h-[44px] border border-[hsl(var(--mobile-border-subtle))] bg-white p-3.5')}>
                <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">Open guidance</p>
                <p className="mb-0 mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">Status · {humanize(detail.relatedGuidance.status)}</p>
              </Link>
            ) : null}
          </div>
        </DetailSection>
      ) : null}

      <p className="mb-0 text-[11px] text-[hsl(var(--mobile-text-muted))]">
        Match rules: {detail.matcherVersion ?? 'not recorded'} · Property geography version:{' '}
        {detail.propertyGeographyVersion ?? 'not recorded'} · Property {propertyId.slice(0, 8)}
      </p>
    </>
  );
}

export function RadarDetailSheet({
  item,
  propertyId,
  onClose,
  onStateChange,
  guidanceJourneyId,
  guidanceStepKey,
  guidanceSignalIntentFamily,
}: Props) {
  const queryClient = useQueryClient();
  const isOpen = item !== null;
  const [isDesktop, setIsDesktop] = React.useState(false);
  const openedMatchRef = React.useRef<string | null>(null);
  const actionsViewedMatchRef = React.useRef<string | null>(null);
  const autoSeenMatchRef = React.useRef<string | null>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);
  const wasOpenRef = React.useRef(false);
  const [feedbackType, setFeedbackType] = React.useState<RadarFeedbackType | null>(null);
  const [feedbackComment, setFeedbackComment] = React.useState('');

  React.useLayoutEffect(() => {
    if (isOpen && !wasOpenRef.current && document.activeElement instanceof HTMLElement) {
      const activeElement = document.activeElement;
      openerRef.current = activeElement === document.body ? null : activeElement;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const detailQuery = useQuery({
    queryKey: ['radar-event-detail', propertyId, item?.propertyMatchId],
    queryFn: async () => {
      if (!item) throw new Error('No Radar event selected.');
      return api.getRadarEventDetail(propertyId, item.propertyMatchId);
    },
    enabled: isOpen && !!item?.propertyMatchId,
    staleTime: 2 * 60 * 1000,
    retry: 1,
    retryDelay: 250,
  });

  const detail = detailQuery.data;
  const currentState = detail?.userState ?? item?.userState ?? 'new';

  React.useEffect(() => {
    setFeedbackType(detail?.userFeedback?.feedbackType ?? null);
    setFeedbackComment(detail?.userFeedback?.comment ?? '');
  }, [
    detail?.userFeedback?.comment,
    detail?.userFeedback?.feedbackType,
    item?.propertyMatchId,
  ]);

  React.useEffect(() => {
    if (!item || !propertyId || openedMatchRef.current === item.propertyMatchId) return;
    openedMatchRef.current = item.propertyMatchId;
    trackRadarSheetEvent(propertyId, 'EVENT_OPENED', {
      property_event_match_id: item.propertyMatchId,
      home_event_id: item.eventId,
      event_type: item.eventType,
      severity: item.severity,
      impact_level: item.impact,
      prior_state: item.userState,
    });
  }, [item, propertyId]);

  React.useEffect(() => {
    if (!item || !detail || detail.recommendedActions.length === 0
      || actionsViewedMatchRef.current === item.propertyMatchId) return;
    actionsViewedMatchRef.current = item.propertyMatchId;
    trackRadarSheetEvent(propertyId, 'ACTIONS_VIEWED', {
      property_event_match_id: item.propertyMatchId,
      action_count: detail.recommendedActions.length,
    });
  }, [detail, item, propertyId]);

  const stateMutation = useMutation({
    mutationFn: async (newState: Exclude<RadarUserState, 'new'>) => {
      if (!item) return;
      return api.updateRadarMatchState(
        propertyId,
        item.propertyMatchId,
        newState,
        { guidanceJourneyId, guidanceStepKey, guidanceSignalIntentFamily },
      );
    },
    onSuccess: (_data, newState) => {
      if (!item) return;
      queryClient.invalidateQueries({ queryKey: ['radar-events', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['radar-overview', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['radar-event-detail', propertyId, item.propertyMatchId] });
      onStateChange?.(item.propertyMatchId, newState);
      trackRadarSheetEvent(propertyId, 'STATE_CHANGED', {
        property_event_match_id: item.propertyMatchId,
        new_state: newState,
        prior_state: currentState,
      });
      if (newState === 'dismissed') onClose();
    },
    onError: () => {
      trackRadarSheetEvent(propertyId, 'ERROR', { stage: 'state_change' });
    },
  });

  React.useEffect(() => {
    if (
      !item
      || !detail
      || currentState !== 'new'
      || stateMutation.isPending
      || autoSeenMatchRef.current === item.propertyMatchId
    ) return;
    autoSeenMatchRef.current = item.propertyMatchId;
    stateMutation.mutate('seen');
  }, [currentState, detail, item, stateMutation]);

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      if (!item || !feedbackType) throw new Error('Choose a feedback reason.');
      return api.submitRadarMatchFeedback(
        propertyId,
        item.propertyMatchId,
        feedbackType,
        feedbackComment,
      );
    },
    onSuccess: (feedback) => {
      if (!item) return;
      queryClient.setQueryData<RadarCanonicalDetail>(
        ['radar-event-detail', propertyId, item.propertyMatchId],
        (current) => current ? { ...current, userFeedback: feedback } : current,
      );
      trackRadarSheetEvent(propertyId, 'FEEDBACK_SUBMITTED', {
        property_event_match_id: item.propertyMatchId,
        feedback_type: feedback.feedbackType,
        has_comment: Boolean(feedback.comment),
      });
    },
    onError: () => {
      trackRadarSheetEvent(propertyId, 'ERROR', { stage: 'feedback' });
    },
  });

  const isSaved = currentState === 'saved';
  const isActedOn = currentState === 'acted_on';
  const isDismissed = currentState === 'dismissed';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        onCloseAutoFocus={(event) => {
          if (!openerRef.current?.isConnected) return;
          event.preventDefault();
          openerRef.current.focus({ preventScroll: true });
          openerRef.current = null;
        }}
        className={cn(
          'overflow-y-auto px-0 pt-0',
          isDesktop
            ? 'h-full w-full max-w-[560px] pb-0 sm:max-w-[560px]'
            : 'max-h-[92dvh] rounded-t-[24px] pb-[env(safe-area-inset-bottom)]',
        )}
      >
        {!isDesktop ? (
          <div className="flex justify-center pb-1 pt-3" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-[hsl(var(--mobile-border-subtle))]" />
          </div>
        ) : null}

        {item ? (
          <div className="px-5 pb-8">
            <SheetHeader className="mb-5 text-left">
              <div className="flex items-start gap-3">
                <span className="mt-1 shrink-0 text-2xl leading-none" aria-hidden>
                  {eventTypeIcon(item.eventType)}
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-base font-semibold leading-snug text-[hsl(var(--mobile-text-primary))]">
                    {item.title}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                    {item.sourceName}{item.provider ? ` · ${item.provider}` : ''}
                  </SheetDescription>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip className={CANONICAL_SEVERITY_COLOR[item.severity]}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', CANONICAL_SEVERITY_DOT[item.severity])} />
                  {CANONICAL_SEVERITY_LABELS[item.severity]}
                </Chip>
                <Chip className={CANONICAL_IMPACT_COLOR[item.impact]}>
                  {CANONICAL_IMPACT_LABELS[item.impact]}
                </Chip>
                <Chip className="border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))]">
                  {formatEventType(item.eventType)}
                </Chip>
                {item.isMaterialUpdate ? <Chip className="border-sky-200 bg-sky-50 text-sky-700">Updated</Chip> : null}
              </div>
            </SheetHeader>

            <div className="space-y-6">
              {detailQuery.isLoading ? <DetailLoading /> : null}
              {detailQuery.isError ? <DetailError onRetry={() => void detailQuery.refetch()} /> : null}
              {detail ? <DetailContent detail={detail} propertyId={propertyId} /> : null}

              <div className="border-t border-[hsl(var(--mobile-border-subtle))] pt-4">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    aria-pressed={isSaved}
                    disabled={stateMutation.isPending}
                    onClick={() => stateMutation.mutate(isSaved ? 'seen' : 'saved')}
                    className={cn(
                      'flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center',
                      isSaved
                        ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]'
                        : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]',
                    )}
                  >
                    {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    <span className="text-[11px] font-medium">{isSaved ? 'Saved' : 'Save'}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={isActedOn}
                    disabled={stateMutation.isPending || isActedOn}
                    onClick={() => stateMutation.mutate('acted_on')}
                    className={cn(
                      'flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center',
                      isActedOn
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]',
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-[11px] font-medium">{isActedOn ? 'Done' : 'Mark done'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={stateMutation.isPending}
                    onClick={() => stateMutation.mutate(isDismissed ? 'seen' : 'dismissed')}
                    className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 py-2.5 text-center text-[hsl(var(--mobile-text-secondary))]"
                  >
                    {isDismissed ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    <span className="text-[11px] font-medium">{isDismissed ? 'Restore' : 'Dismiss'}</span>
                  </button>
                </div>
                {stateMutation.isError ? (
                  <p role="alert" className="mt-2 text-center text-xs text-rose-600">
                    Could not save changes. Please try again.
                  </p>
                ) : null}
              </div>

              {detail ? (
                <div className="border-t border-[hsl(var(--mobile-border-subtle))] pt-4">
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                      Help improve this match
                    </legend>
                    <p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">
                      Tell us when an event does not look right for this property.
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {FEEDBACK_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={cn(
                            'flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs',
                            feedbackType === option.value
                              ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]'
                              : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]',
                          )}
                        >
                          <input
                            type="radio"
                            name={`radar-feedback-${item.propertyMatchId}`}
                            value={option.value}
                            checked={feedbackType === option.value}
                            onChange={() => {
                              setFeedbackType(option.value);
                              feedbackMutation.reset();
                            }}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                    <div>
                      <label
                        htmlFor={`radar-feedback-comment-${item.propertyMatchId}`}
                        className="text-xs font-medium text-[hsl(var(--mobile-text-secondary))]"
                      >
                        Comment (optional)
                      </label>
                      <textarea
                        id={`radar-feedback-comment-${item.propertyMatchId}`}
                        aria-describedby={`radar-feedback-comment-count-${item.propertyMatchId}`}
                        value={feedbackComment}
                        maxLength={500}
                        rows={3}
                        onChange={(event) => {
                          setFeedbackComment(event.target.value);
                          feedbackMutation.reset();
                        }}
                        className="mt-1 w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm text-[hsl(var(--mobile-text-primary))]"
                        placeholder="Add context without including sensitive information"
                      />
                      <p
                        id={`radar-feedback-comment-count-${item.propertyMatchId}`}
                        className="mb-0 mt-1 text-right text-[11px] text-[hsl(var(--mobile-text-muted))]"
                      >
                        {feedbackComment.length}/500
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!feedbackType || feedbackMutation.isPending}
                      onClick={() => feedbackMutation.mutate()}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {feedbackMutation.isPending ? 'Saving feedback…' : 'Save feedback'}
                    </button>
                    {feedbackMutation.isSuccess ? (
                      <p role="status" className="mb-0 text-xs font-medium text-emerald-700">
                        Feedback saved. Thank you.
                      </p>
                    ) : null}
                    {feedbackMutation.isError ? (
                      <p role="alert" className="mb-0 text-xs text-rose-600">
                        Could not save feedback. Please try again.
                      </p>
                    ) : null}
                  </fieldset>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
