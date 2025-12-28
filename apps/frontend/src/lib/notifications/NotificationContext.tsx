// apps/frontend/src/lib/notifications/NotificationContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

type Notification = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string;
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
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = async () => {
    const [listRes, countRes] = await Promise.all([
      api.listNotifications(),
      api.getUnreadNotificationCount(),
    ]);

    if (listRes.success) setNotifications(listRes.data);
    if (countRes.success) setUnreadCount(countRes.data.count);
  };

  const markRead = async (id: string) => {
    // Optimistic UI Update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    
    await api.markNotificationAsRead(id);
    // Optional: full refresh to ensure sync
    await refresh(); // Optional: full refresh to ensure sync
  };

  const markAllRead = async () => {
    // Optimistic UI Update
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    
    await api.markAllNotificationsRead();
    // Optional: full refresh to ensure sync
    await refresh();
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
