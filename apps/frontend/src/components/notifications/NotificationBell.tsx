import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    api.getUnreadNotificationCount().then((res) => {
      if (res.success) {
        setCount(res.data.count);
      }
    });
  }, []);

  return (
    <a href="/dashboard/notifications" className="relative">
      🔔
      {count > 0 && (
        <span className="badge">{count}</span>
      )}
    </a>
  );
}
