'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import RouteStateCard, { RouteStateKind } from '@/components/system/RouteStateCard';

interface AdminConsoleShellProps {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  chips?: ReactNode;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  dense?: boolean;
}

export function AdminConsoleShell({
  title,
  subtitle,
  actions,
  chips,
  children,
  backHref = '/dashboard',
  backLabel = 'Back to dashboard',
  dense = true,
}: AdminConsoleShellProps) {
  return (
    <DashboardShell className={`py-6 lg:max-w-7xl lg:px-8 lg:pb-10 ${dense ? 'space-y-3' : 'space-y-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="h-8 px-2 text-xs text-slate-600">
          <Link href={backHref}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            {backLabel}
          </Link>
        </Button>
        {actions}
      </div>

      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                Admin
              </Badge>
              <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <Shield className="h-3 w-3" />
                Operations
              </span>
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h1>
            <p className="text-xs leading-5 text-slate-600 sm:text-sm">{subtitle}</p>
          </div>
          {chips ? <div className="flex flex-wrap items-center gap-1.5">{chips}</div> : null}
        </div>
      </header>

      {children}
    </DashboardShell>
  );
}

interface AdminRouteStateProps {
  state: RouteStateKind;
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}

export function AdminRouteState({
  state,
  title,
  description,
  action,
  secondaryAction,
}: AdminRouteStateProps) {
  return (
    <RouteStateCard
      state={state}
      title={title}
      description={description}
      action={action}
      secondaryAction={secondaryAction}
      className="rounded-2xl p-5"
    />
  );
}

export function useAdminOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function AdminAccessState({ title, description }: { title: string; description: string }) {
  return (
    <AdminConsoleShell title="Admin Console" subtitle="Operational surfaces for internal CtC teams." dense>
      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 py-10 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">{description}</p>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </AdminConsoleShell>
  );
}
