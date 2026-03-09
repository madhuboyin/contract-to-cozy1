// apps/frontend/src/components/notifications/NotificationBell.tsx
'use client';

import Link from 'next/link';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import { resolveIconByConcept } from '@/lib/icons';

export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const BellIcon = resolveIconByConcept('notifications');

  return (
    <Link
      href="/dashboard/notifications"
      className="relative inline-flex items-center"
      aria-label="Notifications"
    >
      <BellIcon className="h-5 w-5" />

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
