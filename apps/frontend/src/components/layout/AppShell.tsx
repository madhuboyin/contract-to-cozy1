'use client';

/**
 * AppShell audit, 2026-04-25:
 * 1. Root authenticated layout is apps/frontend/src/app/(dashboard)/layout.tsx.
 * 2. The existing desktop left nav is passed in from that layout so its rendering stays unchanged.
 * 3. Target dashboard pages share this shell through the dashboard route group; /knowledge is outside that group today.
 * 4. ResolutionCenterClient previously rendered a page-level right rail; AppShell now owns the shared RightSidebar.
 * 5. RightSidebar reuses existing cached property health, score snapshot, orchestration, incident, booking, and resolution queries.
 */

import React from 'react';
import { RightSidebar } from '@/components/layout/RightSidebar';

type AppShellProps = {
  leftNav: React.ReactNode;
  mobileHeader: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({ leftNav, mobileHeader, banner, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-[var(--ctc-surface-base)] text-slate-950">
      {leftNav}

      <div className="flex min-w-0 flex-1 flex-col md:pl-[246px]">
        {mobileHeader}
        {banner}

        <div className="flex min-w-0 flex-1">
          {children}
          <RightSidebar />
        </div>
      </div>
    </div>
  );
}
