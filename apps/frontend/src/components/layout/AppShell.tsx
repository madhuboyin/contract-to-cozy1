'use client';

/**
 * AppShell audit, 2026-04-25:
 * 1. Root authenticated layout is apps/frontend/src/app/(dashboard)/layout.tsx.
 * 2. The existing desktop left nav is passed in from that layout so its rendering stays unchanged.
 * 3. Target dashboard pages share this shell through the dashboard route group; /knowledge is outside that group today.
 * 4. CtcTopCommandBar is now integrated as topBar prop, providing premium command/context layer above content.
 * 5. When topBar is provided, it replaces the legacy mobileHeader for a unified experience.
 * 6. Right sidebar removed for cleaner, more focused layout.
 */

import React from 'react';

type AppShellProps = {
  leftNav: React.ReactNode;
  mobileHeader?: React.ReactNode;
  topBar?: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
  sidebarCollapsed?: boolean;
};

export function AppShell({ leftNav, mobileHeader, topBar, banner, children, sidebarCollapsed = false }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--ctc-surface-base)] text-slate-950">
      {/* Top command bar (full width, fixed above everything) */}
      {topBar}
      
      {/* Legacy mobile header - only shown if topBar is not provided */}
      {!topBar && mobileHeader}
      
      <div className="flex min-h-0 flex-1 pt-[72px]">
        {/* Left sidebar - positioned below top bar, fixed */}
        {leftNav}

        <div className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ${sidebarCollapsed ? 'md:pl-[64px]' : 'md:pl-[246px]'}`}>
          {banner}

          <div className="flex min-w-0 flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
