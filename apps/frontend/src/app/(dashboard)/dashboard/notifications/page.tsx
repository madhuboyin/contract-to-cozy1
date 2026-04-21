// apps/frontend/src/app/(dashboard)/dashboard/notifications/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { Circle, RotateCcw } from 'lucide-react';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import { api } from '@/lib/api/client';
import { Notification } from '@/lib/notifications/NotificationContext';
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

function appendGuidanceContext(
  actionUrl: string,
  guidanceContext?: {
    guidanceJourneyId?: string | null;
    guidanceStepKey?: string | null;
    guidanceSignalIntentFamily?: string | null;
    itemId?: string | null;
    homeAssetId?: string | null;
  } | null
): string {
  if (!guidanceContext) return actionUrl;

  const hasAnyGuidance =
    Boolean(guidanceContext.guidanceJourneyId) ||
    Boolean(guidanceContext.guidanceStepKey) ||
    Boolean(guidanceContext.guidanceSignalIntentFamily) ||
    Boolean(guidanceContext.itemId) ||
    Boolean(guidanceContext.homeAssetId);
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
    if (guidanceContext.homeAssetId && !url.searchParams.get('homeAssetId')) {
      url.searchParams.set('homeAssetId', guidanceContext.homeAssetId);
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
    <StatusChip tone="info" className="text-[10px] uppercase tracking-wide" >
      <span title={title}>{meta.label}</span>
    </StatusChip>
  );
}

export default function NotificationsPage() {
  const { notifications, markRead, markAllRead, refresh } = useNotifications();

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

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
              const href =
                contextAwareActionUrl.startsWith('/') && !contextAwareActionUrl.startsWith('/dashboard')
                  ? `/dashboard${contextAwareActionUrl}`
                  : contextAwareActionUrl;

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
