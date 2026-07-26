'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import type {
  RadarCanonicalImpact,
  RadarCanonicalSeverity,
  RadarNotificationChannel,
  RadarNotificationDeliveryMode,
  RadarNotificationPreferences,
  RadarSourceFamily,
  UpdateRadarNotificationPreferencesInput,
} from '@/types';

const CATEGORY_OPTIONS: Array<{ value: RadarSourceFamily; label: string }> = [
  { value: 'weather', label: 'Weather' },
  { value: 'air_quality', label: 'Air quality' },
  { value: 'disaster', label: 'Emergency and disaster' },
  { value: 'utility', label: 'Utilities' },
  { value: 'tax', label: 'Property tax' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other property events' },
];

const CHANNEL_OPTIONS: Array<{ value: RadarNotificationChannel; label: string }> = [
  { value: 'in_app', label: 'In-app' },
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
];

const SEVERITY_OPTIONS: Array<{ value: RadarCanonicalSeverity; label: string }> = [
  { value: 'info', label: 'Informational or higher' },
  { value: 'low', label: 'Low or higher' },
  { value: 'moderate', label: 'Moderate or higher' },
  { value: 'high', label: 'High or higher' },
  { value: 'severe', label: 'Severe or higher' },
  { value: 'extreme', label: 'Extreme only' },
];

const IMPACT_OPTIONS: Array<{ value: RadarCanonicalImpact; label: string }> = [
  { value: 'none', label: 'Any property impact' },
  { value: 'low', label: 'Low or higher' },
  { value: 'moderate', label: 'Moderate or higher' },
  { value: 'high', label: 'High or higher' },
  { value: 'critical', label: 'Critical only' },
];

function preferenceInput(
  preference: RadarNotificationPreferences,
): UpdateRadarNotificationPreferencesInput {
  return {
    isEnabled: preference.isEnabled,
    enabledCategories: [...preference.enabledCategories],
    channels: [...preference.channels],
    minimumSeverity: preference.minimumSeverity,
    minimumImpact: preference.minimumImpact,
    deliveryMode: preference.deliveryMode,
    criticalSafetyOverrideEnabled: preference.criticalSafetyOverrideEnabled,
    quietHours: preference.quietHours ? { ...preference.quietHours } : null,
    timezone: preference.timezone,
  };
}

function toggleOrderedValue<T extends string>(
  current: T[],
  value: T,
  order: readonly T[],
): T[] {
  const selected = new Set(current);
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  return order.filter((option) => selected.has(option));
}

export function RadarNotificationPreferencesCard({
  propertyId,
}: {
  propertyId: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = React.useState(false);
  const [draft, setDraft] = React.useState<UpdateRadarNotificationPreferencesInput | null>(null);
  const [savedMessage, setSavedMessage] = React.useState('');
  const queryKey = React.useMemo(
    () => ['radar-notification-preferences', propertyId] as const,
    [propertyId],
  );
  const preferencesQuery = useQuery({
    queryKey,
    queryFn: () => api.getRadarNotificationPreferences(propertyId),
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
  });

  React.useEffect(() => {
    if (!preferencesQuery.data) return;
    setDraft(preferenceInput(preferencesQuery.data));
  }, [preferencesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (input: UpdateRadarNotificationPreferencesInput) =>
      api.updateRadarNotificationPreferences(propertyId, input),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      setDraft(preferenceInput(saved));
      setSavedMessage('Notification preferences saved.');
    },
    onError: () => setSavedMessage('Preferences could not be saved. Try again.'),
  });

  const setDraftValue = React.useCallback(
    <K extends keyof UpdateRadarNotificationPreferencesInput>(
      key: K,
      value: UpdateRadarNotificationPreferencesInput[K],
    ) => {
      setSavedMessage('');
      setDraft((current) => current ? { ...current, [key]: value } : current);
    },
    [],
  );

  const canSave = Boolean(
    draft
    && draft.enabledCategories.length
    && draft.channels.length
    && (!draft.quietHours || draft.quietHours.start !== draft.quietHours.end),
  );

  return (
    <section
      aria-labelledby="radar-notification-preferences-title"
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white',
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="radar-notification-preferences-panel"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]">
            <Bell className="h-4 w-4" />
          </span>
          <span>
            <span
              id="radar-notification-preferences-title"
              className="block text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
            >
              Radar notifications
            </span>
            <span className={cn(
              'mt-0.5 block text-[hsl(var(--mobile-text-secondary))]',
              MOBILE_TYPE_TOKENS.caption,
            )}>
              Choose what reaches you, when, and through which channels.
            </span>
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded ? (
        <div
          id="radar-notification-preferences-panel"
          className="space-y-5 border-t border-[hsl(var(--mobile-border-subtle))] px-4 py-4"
        >
          {preferencesQuery.isLoading ? (
            <p role="status" className="mb-0 text-sm text-[hsl(var(--mobile-text-muted))]">
              Loading notification preferences…
            </p>
          ) : preferencesQuery.isError || !draft ? (
            <div role="alert">
              <p className="mb-0 text-sm text-rose-700">Notification preferences are unavailable.</p>
              <button
                type="button"
                onClick={() => void preferencesQuery.refetch()}
                className="mt-2 min-h-[44px] text-sm font-semibold underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <label className="flex min-h-[44px] items-center gap-3">
                <input
                  type="checkbox"
                  checked={draft.isEnabled}
                  onChange={(event) => setDraftValue('isEnabled', event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                  Notify me about matching property events
                </span>
              </label>

              <fieldset disabled={!draft.isEnabled}>
                <legend className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                  Categories
                </legend>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {CATEGORY_OPTIONS.map((option) => (
                    <label key={option.value} className="flex min-h-[40px] items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.enabledCategories.includes(option.value)}
                        onChange={() => setDraftValue(
                          'enabledCategories',
                          toggleOrderedValue(
                            draft.enabledCategories,
                            option.value,
                            CATEGORY_OPTIONS.map((item) => item.value),
                          ),
                        )}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {!draft.enabledCategories.length ? (
                  <p role="alert" className="mb-0 mt-1 text-xs text-rose-700">
                    Select at least one category.
                  </p>
                ) : null}
              </fieldset>

              <label className="flex min-h-[52px] items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  checked={draft.criticalSafetyOverrideEnabled}
                  disabled={!draft.isEnabled}
                  onChange={(event) => setDraftValue(
                    'criticalSafetyOverrideEnabled',
                    event.target.checked,
                  )}
                  className="mt-1 h-4 w-4 rounded border-amber-300"
                />
                <span>
                  <span className="block text-sm font-medium text-amber-950">
                    Allow verified extreme safety alerts during quiet hours
                  </span>
                  <span className="block text-xs text-amber-900">
                    Applies only to reviewed, observed, immediate official alerts with verified
                    confidence and high property impact.
                  </span>
                </span>
              </label>

              <fieldset disabled={!draft.isEnabled}>
                <legend className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                  Channels
                </legend>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  {CHANNEL_OPTIONS.map((option) => (
                    <label key={option.value} className="flex min-h-[40px] items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.channels.includes(option.value)}
                        onChange={() => setDraftValue(
                          'channels',
                          toggleOrderedValue(
                            draft.channels,
                            option.value,
                            CHANNEL_OPTIONS.map((item) => item.value),
                          ),
                        )}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {!draft.channels.length ? (
                  <p role="alert" className="mb-0 mt-1 text-xs text-rose-700">
                    Select at least one channel.
                  </p>
                ) : null}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Minimum event severity
                  <select
                    value={draft.minimumSeverity}
                    disabled={!draft.isEnabled}
                    onChange={(event) => setDraftValue(
                      'minimumSeverity',
                      event.target.value as RadarCanonicalSeverity,
                    )}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3"
                  >
                    {SEVERITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Minimum property impact
                  <select
                    value={draft.minimumImpact}
                    disabled={!draft.isEnabled}
                    onChange={(event) => setDraftValue(
                      'minimumImpact',
                      event.target.value as RadarCanonicalImpact,
                    )}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3"
                  >
                    {IMPACT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset disabled={!draft.isEnabled}>
                <legend className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                  Delivery timing
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {([
                    ['immediate', 'Immediate', 'Send each eligible event when policy permits.'],
                    ['digest', 'Digest', 'Group eligible non-urgent events into a summary.'],
                  ] as Array<[RadarNotificationDeliveryMode, string, string]>).map(
                    ([value, label, detail]) => (
                      <label key={value} className="flex min-h-[52px] gap-3 rounded-xl border border-slate-200 p-3">
                        <input
                          type="radio"
                          name="radar-delivery-mode"
                          value={value}
                          checked={draft.deliveryMode === value}
                          onChange={() => setDraftValue('deliveryMode', value)}
                          className="mt-1 h-4 w-4"
                        />
                        <span>
                          <span className="block text-sm font-medium">{label}</span>
                          <span className="block text-xs text-slate-600">{detail}</span>
                        </span>
                      </label>
                    ),
                  )}
                </div>
              </fieldset>

              <fieldset disabled={!draft.isEnabled}>
                <legend className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                  Quiet hours
                </legend>
                <label className="mt-2 flex min-h-[40px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.quietHours)}
                    onChange={(event) => setDraftValue(
                      'quietHours',
                      event.target.checked ? { start: '22:00', end: '07:00' } : null,
                    )}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Pause eligible notifications during local quiet hours
                </label>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  {draft.quietHours ? (
                    <>
                    <label className="text-sm">
                      Start
                      <input
                        type="time"
                        value={draft.quietHours.start}
                        onChange={(event) => setDraftValue('quietHours', {
                          ...draft.quietHours!,
                          start: event.target.value,
                        })}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3"
                      />
                    </label>
                    <label className="text-sm">
                      End
                      <input
                        type="time"
                        value={draft.quietHours.end}
                        onChange={(event) => setDraftValue('quietHours', {
                          ...draft.quietHours!,
                          end: event.target.value,
                        })}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3"
                      />
                    </label>
                    </>
                  ) : null}
                  <label className="text-sm">
                    Timezone
                    <input
                      type="text"
                      value={draft.timezone}
                      onChange={(event) => setDraftValue('timezone', event.target.value)}
                      autoComplete="off"
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3"
                    />
                  </label>
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!canSave || saveMutation.isPending}
                  onClick={() => draft && saveMutation.mutate(draft)}
                  className="min-h-[44px] rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save notification settings'}
                </button>
                {savedMessage ? (
                  <p
                    role={saveMutation.isError ? 'alert' : 'status'}
                    className={cn(
                      'mb-0 text-sm',
                      saveMutation.isError ? 'text-rose-700' : 'text-emerald-700',
                    )}
                  >
                    {savedMessage}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
