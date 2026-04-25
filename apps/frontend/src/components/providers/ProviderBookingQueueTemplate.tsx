'use client';

import { ReactNode } from 'react';
import {
  MobileFilterSurface,
  MobileKpiStrip,
  MobileKpiTile,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from './ProviderShellTemplate';

interface BookingQueueTab {
  key: string;
  label: string;
}

interface ProviderBookingQueueTemplateProps {
  title?: string;
  subtitle?: string;
  activeTab: string;
  tabs: BookingQueueTab[];
  onTabChange: (key: string) => void;
  pendingCount: number;
  confirmedCount: number;
  historyCount: number;
  primaryAction: {
    title: string;
    description: string;
    primaryAction: ReactNode;
    supportingAction?: ReactNode;
    impactLabel?: string;
    confidenceLabel?: string;
    eyebrow?: string;
  };
  trust?: {
    confidenceLabel?: string;
    freshnessLabel?: string;
    sourceLabel?: string;
    rationale?: string | null;
  };
  routeState?: {
    state: 'loading' | 'empty' | 'error' | 'offline' | 'success';
    title: string;
    description: string;
    action?: ReactNode;
    secondaryAction?: ReactNode;
  } | null;
  hideContentWhenState?: boolean;
  children: ReactNode;
}

export default function ProviderBookingQueueTemplate({
  title = 'Booking Queue',
  subtitle = 'Respond quickly, keep your schedule accurate, and protect conversion quality.',
  activeTab,
  tabs,
  onTabChange,
  pendingCount,
  confirmedCount,
  historyCount,
  primaryAction,
  trust,
  routeState,
  hideContentWhenState = false,
  children,
}: ProviderBookingQueueTemplateProps) {
  return (
    <ProviderShellTemplate
      title={title}
      subtitle={subtitle}
      eyebrow="Provider Booking Queue"
      primaryAction={primaryAction}
      trust={trust}
      summary={
        <MobileKpiStrip className="sm:grid-cols-3">
          <MobileKpiTile label="Pending" value={pendingCount} hint="Needs response" tone={pendingCount > 0 ? 'warning' : 'neutral'} />
          <MobileKpiTile label="Confirmed" value={confirmedCount} hint="Upcoming jobs" tone={confirmedCount > 0 ? 'positive' : 'neutral'} />
          <MobileKpiTile label="History" value={historyCount} hint="Closed jobs" />
        </MobileKpiStrip>
      }
      filters={
        <MobileFilterSurface className="space-y-2.5">
          <p className="text-[11px] font-medium tracking-normal text-slate-500">Queue</p>
          <div className="inline-flex w-full gap-1 rounded-xl bg-slate-100 p-1">
            {tabs.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onTabChange(tab.key)}
                  className={`min-h-[36px] flex-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </MobileFilterSurface>
      }
      routeState={routeState}
      hideContentWhenState={hideContentWhenState}
      className="lg:max-w-7xl lg:px-8 lg:pb-10"
    >
      {children}
    </ProviderShellTemplate>
  );
}
