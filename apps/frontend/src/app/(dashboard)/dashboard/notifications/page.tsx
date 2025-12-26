'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    api.listNotifications().then((res) => {
      if (res.success) {
        setNotifications(res.data);
      }
    });
  }, []);

  const handleClick = async (n: any) => {
    if (!n.isRead) {
      await api.markNotificationAsRead(n.id);
      setNotifications((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, isRead: true } : x
        )
      );
    }

    if (n.actionUrl) {
      window.location.href = n.actionUrl;
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Notifications</h1>

      {notifications.length === 0 && (
        <div className="text-muted-foreground">
          No notifications yet
        </div>
      )}

      {notifications.map((n) => (
        <div
          key={n.id}
          onClick={() => handleClick(n)}
          className={`cursor-pointer rounded border p-4 ${
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
      ))}
    </div>
  );
}
