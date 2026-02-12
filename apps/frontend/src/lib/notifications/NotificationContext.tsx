// apps/frontend/src/lib/notifications/NotificationContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

type SignalSourceBadge = {
  sourceType: string;   // "SCHEDULED" | "INTELLIGENCE" | ...
  triggerType: string;  // "RULE" | "MODEL" | ...
  sourceSystem?: string | null;
  summary?: string | null;
  confidence?: number | null;
};


export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  signalSource?: SignalSourceBadge;
};

type NotificationContextType = {
  notifications: Notification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);


  const refresh = async () => {
    // Use Promise.allSettled so one failing call doesn't prevent the other
    const [listResult, countResult] = await Promise.allSettled([
      api.listNotifications(),
      api.getUnreadNotificationCount(),
    ]);

    if (listResult.status === 'fulfilled' && listResult.value.success) {
      setNotifications(listResult.value.data);
    } else if (listResult.status === 'rejected') {
      console.error("Failed to fetch notifications", listResult.reason);
    }

    if (countResult.status === 'fulfilled' && countResult.value.success) {
      setUnreadCount(countResult.value.data.count);
    } else if (countResult.status === 'rejected') {
      console.error("Failed to fetch unread count", countResult.reason);
    }
  };

  const markRead = async (id: string) => {
    // Optimistic UI Update — derive unread decrement from current state
    setNotifications(prev => {
      const target = prev.find(n => n.id === id);
      if (target && !target.isRead) {
        setUnreadCount(c => Math.max(0, c - 1));
      }
      return prev.map(n => (n.id === id ? { ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() } : n));
    });

    try {
      await api.markNotificationAsRead(id);
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    } finally {
      await refresh();
    }
  };

  const markAllRead = async () => {
    // Optimistic UI Update
    const nowIso = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: n.readAt ?? nowIso })));
    setUnreadCount(0);

    try {
      await api.markAllNotificationsRead();
    } catch (err) {
      console.error('Failed to mark all notifications as read', err);
    } finally {
      await refresh();
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, refresh, markRead, markAllRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}
