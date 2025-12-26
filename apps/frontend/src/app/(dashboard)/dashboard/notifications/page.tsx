// apps/frontend/src/app/(dashboard)/dashboard/notifications/page.tsx
'use client';

import Link from 'next/link';
import { useNotifications } from '@/lib/notifications/NotificationContext';

export default function NotificationsPage() {
  const {
    notifications,
    markRead,
    markAllRead,
  } = useNotifications();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notifications</h1>

        {notifications.some(n => !n.isRead) && (
          <button
            onClick={markAllRead}
            className="text-sm text-blue-600 hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Empty State */}
      {notifications.length === 0 && (
        <div className="text-muted-foreground">
          No notifications yet
        </div>
      )}

      {/* Notification List */}
      {notifications.map((n) => {
        const content = (
          <div
            className={`rounded border p-4 ${
              n.isRead ? 'bg-background' : 'bg-muted'
            }`}
          >
            <div className="font-medium">{n.title}</div>
            <div className="text-sm text-muted-foreground">
              {n.message}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {new Date(n.createdAt).toLocaleString()}
            </div>
          </div>
        );

        return (
          <div
            key={n.id}
            onClick={() => {
              if (!n.isRead) {
                markRead(n.id);
              }
            }}
            className="cursor-pointer"
          >
            {n.actionUrl ? (
              <Link href={n.actionUrl}>
                {content}
              </Link>
            ) : (
              content
            )}
          </div>
        );
      })}
    </div>
  );
}
