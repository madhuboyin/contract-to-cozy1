'use client';

// Skeleton loading blocks for admin analytics sections.

import React from 'react';
import { cn } from '@/lib/utils';

function Block({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-slate-100', className)} />
  );
}

export function OverviewCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-sm"
        >
          <Block className="mb-3 h-3 w-2/3" />
          <Block className="h-7 w-1/2" />
          <Block className="mt-2 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ label }: { label?: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-sm">
      {label && <Block className="mb-4 h-4 w-40" />}
      <Block className="h-[180px] w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Block className="h-9 w-full rounded-t-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <Block key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function SectionSkeleton() {
  return (
    <div className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-sm">
      <Block className="mb-4 h-5 w-48" />
      <Block className="mb-2 h-3 w-full" />
      <Block className="h-3 w-4/5" />
    </div>
  );
}
