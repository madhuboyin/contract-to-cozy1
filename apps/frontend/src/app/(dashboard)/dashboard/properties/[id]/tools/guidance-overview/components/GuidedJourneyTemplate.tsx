'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BottomSafeAreaReserve } from '@/components/mobile/dashboard/MobilePrimitives';

interface GuidedJourneyTemplateProps {
  phase: 'A' | 'B';
  title: string;
  subtitle: string;
  main: ReactNode;
  trustPanel?: ReactNode;
  progressLabel?: string;
  progressValue?: string;
  stickyAction?: ReactNode;
  stickyHelpText?: string;
}

export function GuidedJourneyTemplate({
  phase,
  title,
  subtitle,
  main,
  trustPanel,
  progressLabel,
  progressValue,
  stickyAction,
  stickyHelpText,
}: GuidedJourneyTemplateProps) {
  const hasStickyAction = Boolean(stickyAction);
  const hasSidebar = phase === 'B' && Boolean(trustPanel);

  return (
    <>
      <section className={cn('space-y-4', hasStickyAction ? 'pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pb-10' : 'pb-6')}>
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="mb-0 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Guided Journey · Phase {phase}
            </p>
            {progressLabel && progressValue ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                {progressLabel}: {progressValue}
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 mb-0 text-xl font-semibold text-slate-900 md:text-2xl">{title}</h1>
          <p className="mt-1 mb-0 text-sm text-slate-600">{subtitle}</p>
        </header>

        <div className={cn('grid gap-4', hasSidebar ? 'lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start' : '')}>
          <div className="space-y-4">
            {main}
            {hasSidebar ? <div className="lg:hidden">{trustPanel}</div> : null}
          </div>
          {hasSidebar ? (
            <aside className="hidden lg:block lg:sticky lg:top-4">
              <div className="space-y-4">{trustPanel}</div>
            </aside>
          ) : null}
        </div>
      </section>

      {hasStickyAction ? (
        <>
          <div data-chat-collision-zone="true" className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.65)]">
              {(progressLabel || stickyHelpText) ? (
                <div className="mb-2">
                  {progressLabel && progressValue ? (
                    <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      {progressLabel}: {progressValue}
                    </p>
                  ) : null}
                  {stickyHelpText ? (
                    <p className="mt-1 mb-0 text-xs text-slate-600">{stickyHelpText}</p>
                  ) : null}
                </div>
              ) : null}
              {stickyAction}
            </div>
          </div>
          <div className="lg:hidden">
            <BottomSafeAreaReserve size="floatingAction" />
          </div>
        </>
      ) : null}
    </>
  );
}

export default GuidedJourneyTemplate;
