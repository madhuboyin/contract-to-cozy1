// apps/frontend/src/app/(dashboard)/dashboard/notifications/page.tsx
'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BellOff, Check, Circle, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import { api } from '@/lib/api/client';
import { Notification } from '@/lib/notifications/NotificationContext';
import { toSafeAppPath } from '@/lib/security/url';
import { resolveNotificationActionUrl } from '@/lib/notifications/destination';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobileKpiStrip,
  MobileKpiTile,
  MobilePageIntro,
  MobileToolWorkspace,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

const SOURCE_BADGE_META: Record<string, { label: string }> = {
  SCHEDULED: { label: 'Scheduled' },
  INTELLIGENCE: { label: 'Intelligence' },
  COVERAGE: { label: 'Coverage' },
  MANUAL: { label: 'Manual' },
  SENSOR: { label: 'Sensor' },
  DOCUMENT: { label: 'Document' },
  EXTERNAL: { label: 'External' },
};

const PREFERENCE_CATEGORIES = [
  { value: 'ALL', label: 'All routine email' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'ACTIVE_DAMAGE', label: 'Active damage' },
  { value: 'MATERIAL_DEADLINE', label: 'Material deadlines' },
  { value: 'WORKFLOW', label: 'Workflow changes' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'COVERAGE', label: 'Coverage' },
  { value: 'PROJECT', label: 'Projects' },
  { value: 'RECALL', label: 'Recalls' },
  { value: 'REFINANCE', label: 'Mortgage refinance' },
  { value: 'GENERAL', label: 'General updates' },
] as const;

function appendGuidanceContext(
  actionUrl: string,
  guidanceContext?: {
    guidanceJourneyId?: string | null;
    guidanceStepKey?: string | null;
    guidanceSignalIntentFamily?: string | null;
    itemId?: string | null;
  } | null
): string {
  if (!guidanceContext) return actionUrl;

  const hasAnyGuidance =
    Boolean(guidanceContext.guidanceJourneyId) ||
    Boolean(guidanceContext.guidanceStepKey) ||
    Boolean(guidanceContext.guidanceSignalIntentFamily) ||
    Boolean(guidanceContext.itemId);
  if (!hasAnyGuidance) return actionUrl;

  try {
    const url = new URL(actionUrl, 'https://contracttocozy.local');
    if (guidanceContext.guidanceJourneyId && !url.searchParams.get('guidanceJourneyId')) {
      url.searchParams.set('guidanceJourneyId', guidanceContext.guidanceJourneyId);
    }
    if (guidanceContext.guidanceStepKey && !url.searchParams.get('guidanceStepKey')) {
      url.searchParams.set('guidanceStepKey', guidanceContext.guidanceStepKey);
    }
    if (guidanceContext.guidanceSignalIntentFamily && !url.searchParams.get('guidanceSignalIntentFamily')) {
      url.searchParams.set('guidanceSignalIntentFamily', guidanceContext.guidanceSignalIntentFamily);
    }
    if (guidanceContext.itemId && !url.searchParams.get('itemId')) {
      url.searchParams.set('itemId', guidanceContext.itemId);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return actionUrl;
  }
}

function renderSignalBadge(n: Notification) {
  const sourceType = n?.signalSource?.sourceType;
  if (!sourceType) return null;

  const meta = SOURCE_BADGE_META[sourceType] ?? { label: sourceType };
  const title = n?.signalSource?.summary ? `${meta.label}: ${n.signalSource.summary}` : meta.label;

  return (
    <StatusChip tone="info" className="text-[11px] tracking-normal" >
      <span title={title}>{meta.label}</span>
    </StatusChip>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId');
  const preferenceScopeKey = propertyId ? `PROPERTY:${propertyId}` : 'GLOBAL';
  const { toast } = useToast();
  const { notifications, markRead, markAllRead, refresh } = useNotifications();
  const [selectedCategory, setSelectedCategory] = React.useState('ALL');
  const [cadence, setCadence] = React.useState('WEEKLY_BRIEF');
  const [quietStart, setQuietStart] = React.useState('21:00');
  const [quietEnd, setQuietEnd] = React.useState('07:00');
  const [savingPreference, setSavingPreference] = React.useState(false);
  const [pendingOutcomeById, setPendingOutcomeById] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    void refresh();
    void api.listNotificationPreferences().then((result) => {
      if (!result.success) return;
      const preference = result.data.find((item: any) => item.scopeKey === preferenceScopeKey && item.category === selectedCategory && item.channel === 'EMAIL');
      const fallback = result.data.find((item: any) => item.scopeKey === 'GLOBAL' && item.category === 'ALL' && item.channel === 'EMAIL');
      const resolved = preference ?? fallback;
      if (resolved) {
        setCadence(resolved.cadence);
        setQuietStart(resolved.quietStart ?? '21:00');
        setQuietEnd(resolved.quietEnd ?? '07:00');
      } else {
        setCadence('WEEKLY_BRIEF');
        setQuietStart('21:00');
        setQuietEnd('07:00');
      }
    }).catch(() => undefined);
  }, [preferenceScopeKey, refresh, selectedCategory]);

  const savePreference = async () => {
    setSavingPreference(true);
    try {
      await api.updateNotificationPreference({
        propertyId,
        category: selectedCategory, channel: 'EMAIL', enabled: cadence !== 'MUTED', cadence,
        quietStart, quietEnd, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
    } finally {
      setSavingPreference(false);
    }
  };

  const recordOutcome = async (
    event: React.MouseEvent,
    notification: Notification,
    type: 'USEFUL' | 'NOT_USEFUL' | 'MUTE_TYPE' | 'NOT_RELEVANT' | 'ALREADY_HANDLED',
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const id = notification.id;
    const existingOutcome = notification.outcomes?.some((outcome) => outcome.type === type);
    if (type === 'MUTE_TYPE' && !existingOutcome) {
      const reminderLabel = notification.type === 'MAINTENANCE_TASK_REMINDER'
        ? 'maintenance reminder emails'
        : 'email notifications like this';
      const confirmed = window.confirm(
        `Mute ${reminderLabel} for this property? In-app alerts will remain available.`,
      );
      if (!confirmed) return;
    }

    setPendingOutcomeById((current) => ({ ...current, [id]: type }));
    try {
      if (type === 'USEFUL' && existingOutcome) {
        await api.revokeNotificationOutcome(id, type);
        toast({ title: 'Feedback removed' });
      } else {
        await api.recordNotificationOutcome(id, type);
        if (type === 'USEFUL') {
          toast({ title: 'Thanks for the feedback' });
        } else if (type === 'MUTE_TYPE') {
          toast({
            title: 'Email reminders muted',
            description: 'In-app alerts remain available. You can change email cadence in Notification preferences.',
          });
        } else {
          const originalIsRead = notification.isRead;
          const outcomeLabel = type === 'NOT_RELEVANT' ? 'Notification dismissed' : 'Marked as already handled';
          toast({
            title: outcomeLabel,
            action: (
              <ToastAction
                altText="Undo"
                onClick={async () => {
                  try {
                    await api.revokeNotificationOutcome(id, type, originalIsRead);
                    await refresh();
                  } catch (error: any) {
                    toast({
                      title: 'Unable to undo',
                      description: error?.message || 'Please try again.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Undo
              </ToastAction>
            ),
          });
        }
      }
      await refresh();
    } catch (error: any) {
      toast({
        title: 'Notification update failed',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPendingOutcomeById((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  const visibleNotifications = notifications.filter((notification) =>
    !notification.outcomes?.some((outcome) =>
      outcome.type === 'NOT_RELEVANT' || outcome.type === 'ALREADY_HANDLED'
    )
  );

  const sortedNotifications = [...visibleNotifications].sort((a, b) => {
    if (a.isRead === b.isRead) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return a.isRead ? 1 : -1;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleToggleUnread = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.markNotificationAsUnread(id);
      await refresh();
      toast({ title: 'Marked as unread' });
    } catch (err) {
      console.error('Failed to mark as unread:', err);
      toast({ title: 'Unable to mark as unread', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <MobilePageIntro
          title="Notifications"
          subtitle="Unread updates are prioritized and sync across sessions."
          action={
            unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Mark all read
              </button>
            ) : undefined
          }
        />
      }
      summary={
        <MobileKpiStrip>
          <MobileKpiTile label="Unread" value={unreadCount} hint="Needs review" tone={unreadCount > 0 ? 'warning' : 'neutral'} />
          <MobileKpiTile label="Total" value={visibleNotifications.length} hint="All notifications" />
        </MobileKpiStrip>
      }
    >
      <MobileCard className="space-y-3">
        <div>
          <p className="font-semibold text-slate-900">
            {propertyId ? 'Notification preferences for this home' : 'Notification preferences'}
          </p>
          <p className="text-sm text-slate-600">Routine updates are bundled into your Home Brief. Urgent safety, active damage, material deadlines, and workflow changes can still arrive immediately.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          In-app alerts remain enabled for safety and product continuity. During the pilot, email is the only configurable external channel.
        </div>
        <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <label className="text-xs font-medium text-slate-600">Category<select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="mt-1 min-h-[40px] w-full rounded-lg border bg-white px-2 text-sm">{PREFERENCE_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">Email cadence<select value={cadence} onChange={(event) => setCadence(event.target.value)} className="mt-1 min-h-[40px] w-full rounded-lg border bg-white px-2 text-sm"><option value="WEEKLY_BRIEF">Weekly Home Brief</option><option value="DAILY_DIGEST">Daily digest</option><option value="IMMEDIATE">Immediate</option><option value="MUTED">Muted</option></select></label>
          <label className="text-xs font-medium text-slate-600">Quiet hours start<input type="time" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} className="mt-1 min-h-[40px] w-full rounded-lg border bg-white px-2 text-sm" /></label>
          <label className="text-xs font-medium text-slate-600">Quiet hours end<input type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} className="mt-1 min-h-[40px] w-full rounded-lg border bg-white px-2 text-sm" /></label>
          <button type="button" disabled={savingPreference} onClick={savePreference} className="min-h-[40px] rounded-lg bg-brand-primary px-3 text-sm font-semibold text-white disabled:opacity-60">{savingPreference ? 'Saving…' : 'Save preferences'}</button>
        </div>
      </MobileCard>
      {visibleNotifications.length === 0 ? (
        <EmptyStateCard
          title={notifications.length === 0 ? 'No notifications yet' : "You're all caught up"}
          description={notifications.length === 0
            ? 'You will see intelligence, booking, and account alerts here.'
            : 'Dismissed and handled notifications no longer need your attention.'}
        />
      ) : (
        <div className="space-y-2.5">
          {sortedNotifications.map((notification) => {
            const resolvedActionUrl = resolveNotificationActionUrl(notification);
            const contextAwareActionUrl = resolvedActionUrl
              ? appendGuidanceContext(resolvedActionUrl, notification.guidanceContext)
              : null;
            const safePath = contextAwareActionUrl ? toSafeAppPath(contextAwareActionUrl) : null;
            const href = safePath
              ? safePath.startsWith('/') && !safePath.startsWith('/dashboard')
                ? `/dashboard${safePath}`
                : safePath
              : null;
            const usefulSelected = notification.outcomes?.some((outcome) => outcome.type === 'USEFUL') ?? false;
            const emailMuted = notification.outcomes?.some((outcome) => outcome.type === 'MUTE_TYPE') ?? false;
            const outcomePending = Boolean(pendingOutcomeById[notification.id]);

            const innerContent = (
              <MobileCard
                variant="compact"
                className={`space-y-2.5 transition-all ${
                  notification.isRead ? 'border-slate-200 bg-white/70' : 'border-brand-primary/25 bg-brand-primary/[0.04]'
                } ${href ? 'cursor-pointer hover:border-brand-primary/40 hover:shadow-sm' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    {!notification.isRead ? <Circle className="mt-1 h-2.5 w-2.5 shrink-0 fill-brand-primary text-brand-primary" /> : null}
                    <div className="min-w-0">
                      <p className={`mb-0 truncate text-sm ${notification.isRead ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>
                        {notification.title}
                      </p>
                      <p className={`mb-0 mt-1 text-sm ${notification.isRead ? 'text-slate-500' : 'text-slate-600'}`}>
                        {notification.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {renderSignalBadge(notification)}
                    {!notification.isRead ? <StatusChip tone="needsAction">New</StatusChip> : null}
                  </div>
                </div>

                <ActionPriorityRow
                  secondaryActions={
                    <>
                      <span className="text-[11px] text-slate-500">
                        {new Date(notification.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {notification.isRead ? (
                        <button
                          type="button"
                          onClick={(e) => handleToggleUnread(e, notification.id)}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-transparent px-2 text-[11px] font-medium text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-brand-primary"
                          title="Mark as unread"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Mark unread
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={outcomePending}
                        aria-pressed={usefulSelected}
                        onClick={(event) => recordOutcome(event, notification, 'USEFUL')}
                        className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 text-[11px] disabled:opacity-50 ${usefulSelected ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        {usefulSelected ? <Check className="h-3 w-3" /> : <ThumbsUp className="h-3 w-3" />}
                        {usefulSelected ? 'Useful · saved' : 'Useful'}
                      </button>
                      <button type="button" disabled={outcomePending} onClick={(event) => recordOutcome(event, notification, 'NOT_RELEVANT')} className="inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-50"><ThumbsDown className="h-3 w-3" /> Not relevant</button>
                      <button type="button" disabled={outcomePending} onClick={(event) => recordOutcome(event, notification, 'ALREADY_HANDLED')} className="min-h-[32px] rounded-md px-2 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-50">Already handled</button>
                      <button
                        type="button"
                        disabled={outcomePending || emailMuted}
                        onClick={(event) => recordOutcome(event, notification, 'MUTE_TYPE')}
                        className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 text-[11px] disabled:opacity-70 ${emailMuted ? 'bg-slate-100 font-medium text-slate-600' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        {emailMuted ? <Check className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                        {emailMuted ? 'Email muted' : 'Mute email type'}
                      </button>
                    </>
                  }
                />
              </MobileCard>
            );

            return (
              <div
                key={notification.id}
                role={href ? 'link' : undefined}
                tabIndex={href ? 0 : undefined}
                aria-label={href ? `Open ${notification.title}` : undefined}
                onClick={() => {
                  if (!notification.isRead) {
                    void markRead(notification.id);
                  }
                  if (href) router.push(href);
                }}
                onKeyDown={(event) => {
                  if (href && event.currentTarget === event.target && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    if (!notification.isRead) void markRead(notification.id);
                    router.push(href);
                  }
                }}
              >
                {innerContent}
              </div>
            );
          })}
        </div>
      )}

      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}
