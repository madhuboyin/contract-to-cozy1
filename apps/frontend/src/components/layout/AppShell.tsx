'use client';

/**
 * AppShell audit, 2026-04-25:
 * 1. Root authenticated layout is apps/frontend/src/app/(dashboard)/layout.tsx.
 * 2. The existing desktop left nav is passed in from that layout so its rendering stays unchanged.
 * 3. Target dashboard pages share this shell through the dashboard route group; /knowledge is outside that group today.
 * 4. ResolutionCenterClient previously rendered a page-level right rail; AppShell now owns the shared RightSidebar.
 * 5. RightSidebar reuses existing cached property health, score snapshot, orchestration, incident, booking, and resolution queries.
 * 6. CtcTopCommandBar is now integrated as topBar prop, providing premium command/context layer above content.
 * 7. When topBar is provided, it replaces the legacy mobileHeader for a unified experience.
 */

import React from 'react';
import { RightSidebar } from '@/components/layout/RightSidebar';

type AppShellProps = {
  leftNav: React.ReactNode;
  mobileHeader?: React.ReactNode;
  topBar?: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({ leftNav, mobileHeader, topBar, banner, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--ctc-surface-base)] text-slate-950">
      {/* Top command bar (full width, fixed above everything) */}
      {topBar}
      
      {/* Legacy mobile header - only shown if topBar is not provided */}
      {!topBar && mobileHeader}
      
      <div className="flex min-h-0 flex-1 pt-[72px]">
        {/* Left sidebar - positioned below top bar, fixed */}
        {leftNav}

        <div className="flex min-w-0 flex-1 flex-col md:pl-[246px]">
          {banner}

          <div className="flex min-w-0 flex-1">
            {children}
            <RightSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
