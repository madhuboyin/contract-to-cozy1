'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  AdminAccessState,
  AdminConsoleShell,
  AdminRouteState,
  useAdminOnlineStatus,
} from '@/components/ops/AdminConsoleShell';

export interface UseAdminGuardOptions {
  title: string;
  subtitle: string;
  /** Block rendering while offline. Defaults to true. */
  checkOnline?: boolean;
}

export type AdminGuardResult =
  | { status: 'loading' | 'unauthenticated' | 'forbidden' | 'offline'; node: ReactNode; isAdmin: false }
  | { status: 'ready'; node: null; isAdmin: true };

/**
 * Centralizes the loading/unauthenticated/forbidden/offline branches shared
 * by every admin console page. Pages own their own ready-state rendering;
 * this hook only ever returns the blocked-state node.
 */
export function useAdminGuard({ title, subtitle, checkOnline = true }: UseAdminGuardOptions): AdminGuardResult {
  const { user, loading } = useAuth();
  const isOnline = useAdminOnlineStatus();

  if (loading) {
    return {
      status: 'loading',
      isAdmin: false,
      node: (
        <AdminConsoleShell title={title} subtitle={subtitle}>
          <AdminRouteState
            state="loading"
            title="Checking admin access"
            description="Validating authentication and permissions."
          />
        </AdminConsoleShell>
      ),
    };
  }

  if (!user) {
    return {
      status: 'unauthenticated',
      isAdmin: false,
      node: (
        <AdminAccessState
          title="Sign in required"
          description="This internal admin view requires authentication."
        />
      ),
    };
  }

  if (user.role !== 'ADMIN') {
    return {
      status: 'forbidden',
      isAdmin: false,
      node: (
        <AdminAccessState
          title="Admin access required"
          description="Only platform admins can access this console."
        />
      ),
    };
  }

  if (checkOnline && !isOnline) {
    return {
      status: 'offline',
      isAdmin: false,
      node: (
        <AdminConsoleShell title={title} subtitle={subtitle}>
          <AdminRouteState
            state="offline"
            title="You're offline"
            description="This page requires a live connection. Reconnect and refresh."
          />
        </AdminConsoleShell>
      ),
    };
  }

  return { status: 'ready', isAdmin: true, node: null };
}
