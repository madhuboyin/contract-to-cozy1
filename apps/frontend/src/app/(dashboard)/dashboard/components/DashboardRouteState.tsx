'use client';

import { ReactNode } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import RouteStateCard, { RouteStateKind } from '@/components/system/RouteStateCard';

interface DashboardRouteStateProps {
  state: RouteStateKind;
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}

export default function DashboardRouteState({
  state,
  title,
  description,
  action,
  secondaryAction,
}: DashboardRouteStateProps) {
  return (
    <DashboardShell className="pt-8">
      <RouteStateCard
        state={state}
        title={title}
        description={description}
        action={action}
        secondaryAction={secondaryAction}
      />
    </DashboardShell>
  );
}
