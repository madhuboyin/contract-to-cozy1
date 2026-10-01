'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';

export function useAskAccount() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const accountName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined;
  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await logout(); } finally { setLoggingOut(false); }
  }, [loggingOut, logout]);
  return { accountName, accountEmail: user?.email, loggingOut, handleLogout };
}
