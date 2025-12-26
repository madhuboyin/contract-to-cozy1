// apps/frontend/src/components/notifications/NotificationBell.tsx
'use client';

import Link from 'next/link';
import { useNotifications } from '@/lib/notifications/NotificationContext';

export function NotificationBell() {
  const { unreadCount } = useNotifications();

  return (
    <Link
      href="/dashboard/notifications"
      className="relative inline-flex items-center"
      aria-label="Notifications"
    >
      <span className="text-lg">🔔</span>

      {unreadCount > 0 && (
        <span
          className="
            absolute -top-1 -right-2
            min-w-[18px] h-[18px]
            px-1
            flex items-center justify-center
            rounded-full
            bg-red-600
            text-white
            text-xs
            font-medium
          "
        >
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
