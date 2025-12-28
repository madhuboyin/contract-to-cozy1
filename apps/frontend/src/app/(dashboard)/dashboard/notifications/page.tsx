// apps/frontend/src/app/(dashboard)/dashboard/notifications/page.tsx
'use client';

import Link from 'next/link';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import { Badge } from '@/components/ui/badge';
import { Circle, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api/client';

export default function NotificationsPage() {
  const {
    notifications,
    markRead,
    markAllRead,
    refresh 
  } = useNotifications();

  // Sort: Unread items (isRead === false) go to the top
  const sortedNotifications = [...notifications].sort((a, b) => {
    if (a.isRead === b.isRead) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return a.isRead ? 1 : -1;
  });

  const handleToggleUnread = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      // Calls the persistent PATCH endpoint in the backend
      await api.patch(`/api/notifications/${id}/unread`, {}); 
      await refresh();
    } catch (err) {
      console.error('Failed to mark as unread:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-sm">
            Unread updates are shown first and persisted across sessions.
          </p>
        </div>

        {notifications.some(n => !n.isRead) && (
          <button
            onClick={markAllRead}
            className="text-sm font-medium text-primary hover:underline transition-all"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Empty State */}
      {notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-background">
          <p className="text-muted-foreground">No notifications yet</p>
        </div>
      )}

      {/* Notification List */}
      <div className="space-y-3">
        {sortedNotifications.map((n) => {
          const innerContent = (
            <div
              className={`relative flex items-start gap-4 rounded-lg border p-4 transition-all hover:shadow-sm ${
                n.isRead 
                  ? 'bg-background border-border/50 opacity-80' 
                  : 'bg-muted/30 border-primary/20 shadow-sm'
              }`}
            >
              {/* Unread Indicator Dot */}
              {!n.isRead && (
                <div className="mt-1.5">
                  <Circle className="h-2.5 w-2.5 fill-primary text-primary" />
                </div>
              )}

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className={`text-sm leading-none ${n.isRead ? 'font-medium text-muted-foreground' : 'font-bold text-foreground'}`}>
                    {n.title}
                  </div>
                  <div className="flex items-center gap-2 min-h-[24px]">
                    {!n.isRead ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 uppercase tracking-wider">
                        New
                      </Badge>
                    ) : (
                      /* Reset Button - Decoupled from main Link click area */
                      <button
                        onClick={(e) => handleToggleUnread(e, n.id)}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 px-2 hover:bg-muted rounded-md border border-transparent hover:border-border"
                        title="Mark as unread"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>
                <p className={`text-sm ${n.isRead ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                  {n.message}
                </p>
                <div className="text-[11px] text-muted-foreground/60 pt-1">
                  {new Date(n.createdAt).toLocaleString([], { 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </div>
              </div>
            </div>
          );

          return (
            <div key={n.id} className="block group">
              {n.actionUrl ? (
                <Link 
                  href={
                    (n.actionUrl.startsWith('/') && !n.actionUrl.startsWith('/dashboard')) 
                      ? `/dashboard${n.actionUrl}` 
                      : n.actionUrl
                  }
                  onClick={() => {
                    if (!n.isRead) markRead(n.id);
                  }}
                >
                  {innerContent}
                </Link>
              ) : (
                <div onClick={() => { if (!n.isRead) markRead(n.id); }}>
                  {innerContent}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}