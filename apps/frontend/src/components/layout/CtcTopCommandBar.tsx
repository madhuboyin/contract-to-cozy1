// apps/frontend/src/components/layout/CtcTopCommandBar.tsx
'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, CheckSquare, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { CtcCommandSearch } from './CtcCommandSearch';
import { CtcPropertySelector } from './CtcPropertySelector';
import { CtcModeSwitch } from './CtcModeSwitch';

interface CtcTopCommandBarProps {
  className?: string;
}

function usePropertyData() {
  const { selectedPropertyId } = usePropertyContext();

  const { data: property } = useQuery({
    queryKey: ['property', selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return null;
      const response = await api.getProperty(selectedPropertyId);
      return response.success ? response.data : null;
    },
    enabled: !!selectedPropertyId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    propertyId: selectedPropertyId,
    propertyName: property?.name || 'Main Home',
  };
}

function useAlertsCounts() {
  const { selectedPropertyId } = usePropertyContext();

  const { data: orchestration } = useQuery({
    queryKey: ['orchestration-summary', selectedPropertyId],
    queryFn: () => 
      selectedPropertyId 
        ? api.getOrchestrationSummary(selectedPropertyId) 
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
    staleTime: 3 * 60 * 1000,
  });

  const actions = (orchestration as any)?.actions || [];
  const urgentCount = actions.filter((a: any) => 
    a.riskLevel === 'CRITICAL' || a.riskLevel === 'HIGH' || a.overdue === true
  ).length;

  const pendingCount = actions.filter((a: any) => 
    a.status === 'PENDING' || a.status === 'IN_PROGRESS'
  ).length;

  return {
    alertsCount: urgentCount > 0 ? urgentCount : null,
    tasksCount: pendingCount > 0 ? pendingCount : null,
  };
}

function AlertsButton({ count }: { count: number | null }) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex items-center justify-center h-9 w-9 rounded-lg",
        "border border-slate-200 bg-white hover:bg-slate-50",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
      )}
    >
      <Bell className="h-4 w-4 text-slate-600" />
      {count !== null && count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}

function TasksButton({ count }: { count: number | null }) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex items-center justify-center h-9 w-9 rounded-lg",
        "border border-slate-200 bg-white hover:bg-slate-50",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
      )}
    >
      <CheckSquare className="h-4 w-4 text-slate-600" />
      {count !== null && count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-teal-500 px-1.5 text-[10px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}

function UserProfileButton({ userName = 'User' }: { userName?: string }) {
  const initial = userName.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 h-9 px-2 pr-3 rounded-lg",
        "border border-slate-200 bg-white hover:bg-slate-50",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
      )}
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
        {initial}
      </div>
      <span className="hidden lg:inline text-sm font-medium text-slate-700">
        {userName}
      </span>
      <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
    </button>
  );
}

export function CtcTopCommandBar({ className }: CtcTopCommandBarProps) {
  const { user } = useAuth();
  const { propertyId, propertyName } = usePropertyData();
  const { alertsCount, tasksCount } = useAlertsCounts();

  const userName = user?.firstName || 'User';

  return (
    <>
      {/* Desktop Command Bar */}
      <div
        className={cn(
          "hidden lg:block sticky top-0 z-40 w-full",
          "border-b border-slate-200 bg-white/95 backdrop-blur-sm",
          "shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
          className
        )}
      >
        <div className="mx-auto max-w-[1920px] px-6">
          <div className="flex items-center justify-between h-[72px] gap-6">
            {/* Left: Logo */}
            <Link 
              href="/dashboard" 
              className="flex items-center gap-2 shrink-0 group"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white transition-transform group-hover:scale-105">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
              </div>
              <span className="text-base font-semibold text-slate-900 tracking-tight">
                ContractToCozy
              </span>
            </Link>

            {/* Center-Left: Command Search */}
            <CtcCommandSearch className="flex-1 max-w-[480px]" />

            {/* Center: Property Selector */}
            <CtcPropertySelector propertyName={propertyName} />

            {/* Center-Right: Mode Switch */}
            <CtcModeSwitch propertyId={propertyId} />

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <AlertsButton count={alertsCount} />
              <TasksButton count={tasksCount} />
              <UserProfileButton userName={userName} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Command Bar */}
      <div
        className={cn(
          "lg:hidden sticky top-0 z-40 w-full",
          "border-b border-slate-200 bg-white/95 backdrop-blur-sm",
          "shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
          className
        )}
      >
        <div className="px-4">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Logo */}
            <Link 
              href="/dashboard" 
              className="flex items-center gap-2 shrink-0"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-white">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-900 tracking-tight">
                ContractToCozy
              </span>
            </Link>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white"
              >
                <Bell className="h-4 w-4 text-slate-600" />
                {alertsCount !== null && alertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
                )}
              </button>
              <UserProfileButton userName={userName} />
            </div>
          </div>

          {/* Mobile Mode Switch - Horizontal Scroll */}
          <div className="pb-3 -mx-4 px-4 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2 min-w-max">
              <CtcPropertySelector propertyName={propertyName} className="shrink-0" />
              <CtcModeSwitch propertyId={propertyId} className="shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
