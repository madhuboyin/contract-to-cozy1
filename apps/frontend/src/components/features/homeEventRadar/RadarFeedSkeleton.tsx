'use client';

// apps/frontend/src/components/features/homeEventRadar/RadarFeedSkeleton.tsx
// Skeleton placeholders shown while the event feed is loading.

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS } from '@/components/mobile/dashboard/mobileDesignTokens';

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-[hsl(var(--mobile-border-subtle))]', className)} />
  );
}

function FeedItemSkeleton() {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-card-bg))] p-4'
      )}
    >
      <div className="flex items-start gap-3">
        <SkeletonBlock className="h-6 w-6 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-3 w-12 shrink-0" />
          </div>
          <div className="flex gap-1.5">
            <SkeletonBlock className="h-4 w-16 rounded-full" />
            <SkeletonBlock className="h-4 w-14 rounded-full" />
          </div>
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function RadarFeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <FeedItemSkeleton key={i} />
      ))}
    </div>
  );
}
