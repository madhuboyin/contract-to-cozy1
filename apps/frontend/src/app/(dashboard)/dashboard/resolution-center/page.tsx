import { Suspense } from 'react';
import ResolutionCenterClient from './ResolutionCenterClient';

export default function ResolutionCenterPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 pb-20">
          <div className="h-56 animate-pulse rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50" />
          <div className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <div className="h-64 animate-pulse rounded-[24px] border border-slate-200 bg-slate-100/70" />
              <div className="h-64 animate-pulse rounded-[24px] border border-slate-200 bg-slate-100/70" />
            </div>
            <div className="hidden space-y-4 xl:block">
              <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70" />
              <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70" />
            </div>
          </div>
        </div>
      }
    >
      <ResolutionCenterClient />
    </Suspense>
  );
}
