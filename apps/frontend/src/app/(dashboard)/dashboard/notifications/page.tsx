// apps/frontend/src/app/(dashboard)/dashboard/notifications/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { BellOff, Circle, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import { api } from '@/lib/api/client';
import { Notification } from '@/lib/notifications/NotificationContext';
import { toSafeAppPath } from '@/lib/security/url';
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
  const { notifications, markRead, markAllRead, refresh } = useNotifications();
  const [selectedCategory, setSelectedCategory] = React.useState('ALL');
  const [cadence, setCadence] = React.useState('WEEKLY_BRIEF');
  const [quietStart, setQuietStart] = React.useState('21:00');
  const [quietEnd, setQuietEnd] = React.useState('07:00');
  const [savingPreference, setSavingPreference] = React.useState(false);

  React.useEffect(() => {
    void refresh();
    void api.listNotificationPreferences().then((result) => {
      if (!result.success) return;
      const preference = result.data.find((item: any) => item.scopeKey === 'GLOBAL' && item.category === selectedCategory && item.channel === 'EMAIL');
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
  }, [refresh, selectedCategory]);

  const savePreference = async () => {
    setSavingPreference(true);
    try {
      await api.updateNotificationPreference({
        category: selectedCategory, channel: 'EMAIL', enabled: cadence !== 'MUTED', cadence,
        quietStart, quietEnd, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
    } finally {
      setSavingPreference(false);
    }
  };

  const recordOutcome = async (event: React.MouseEvent, id: string, type: 'USEFUL' | 'NOT_USEFUL' | 'MUTE_TYPE' | 'NOT_RELEVANT' | 'ALREADY_HANDLED') => {
    event.preventDefault();
    event.stopPropagation();
    await api.recordNotificationOutcome(id, type);
    await refresh();
  };

  const sortedNotifications = [...notifications].sort((a, b) => {
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
    } catch (err) {
      console.error('Failed to mark as unread:', err);
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
          <MobileKpiTile label="Total" value={notifications.length} hint="All notifications" />
        </MobileKpiStrip>
      }
    >
      <MobileCard className="space-y-3">
        <div>
          <p className="font-semibold text-slate-900">Notification preferences</p>
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
      {notifications.length === 0 ? (
        <EmptyStateCard title="No notifications yet" description="You will see intelligence, booking, and account alerts here." />
      ) : (
        <div className="space-y-2.5">
          {sortedNotifications.map((notification) => {
            const innerContent = (
              <MobileCard
                variant="compact"
                className={`space-y-2.5 transition-all ${
                  notification.isRead ? 'border-slate-200 bg-white/70' : 'border-brand-primary/25 bg-brand-primary/[0.04]'
                }`}
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
                          Reset
                        </button>
                      ) : null}
                      <button type="button" onClick={(event) => recordOutcome(event, notification.id, 'USEFUL')} className="inline-flex min-h-[32px] items-center gap-1 px-2 text-[11px] text-slate-500"><ThumbsUp className="h-3 w-3" /> Useful</button>
                      <button type="button" onClick={(event) => recordOutcome(event, notification.id, 'NOT_RELEVANT')} className="inline-flex min-h-[32px] items-center gap-1 px-2 text-[11px] text-slate-500"><ThumbsDown className="h-3 w-3" /> Not relevant</button>
                      <button type="button" onClick={(event) => recordOutcome(event, notification.id, 'ALREADY_HANDLED')} className="min-h-[32px] px-2 text-[11px] text-slate-500">Already handled</button>
                      <button type="button" onClick={(event) => recordOutcome(event, notification.id, 'MUTE_TYPE')} className="inline-flex min-h-[32px] items-center gap-1 px-2 text-[11px] text-slate-500"><BellOff className="h-3 w-3" /> Mute type</button>
                    </>
                  }
                />
              </MobileCard>
            );

            if (notification.actionUrl) {
              const contextAwareActionUrl = appendGuidanceContext(
                notification.actionUrl,
                notification.guidanceContext
              );
              const safePath = toSafeAppPath(contextAwareActionUrl);
              if (!safePath) {
                return (
                  <div
                    key={notification.id}
                    onClick={() => {
                      if (!notification.isRead) {
                        markRead(notification.id);
                      }
                    }}
                  >
                    {innerContent}
                  </div>
                );
              }
              const href =
                safePath.startsWith('/') && !safePath.startsWith('/dashboard')
                  ? `/dashboard${safePath}`
                  : safePath;

              return (
                <Link
                  key={notification.id}
                  href={href}
                  onClick={() => {
                    if (!notification.isRead) {
                      markRead(notification.id);
                    }
                  }}
                  className="no-brand-style block"
                >
                  {innerContent}
                </Link>
              );
            }

            return (
              <div
                key={notification.id}
                onClick={() => {
                  if (!notification.isRead) {
                    markRead(notification.id);
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
