import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS } from '@/components/mobile/dashboard/mobileDesignTokens';

function SkeletonBox({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-[hsl(var(--mobile-bg-muted))]', className)} />;
}

export function AdvisorSkeleton() {
  return (
    <div className="space-y-4">
      <div className={cn(MOBILE_CARD_RADIUS, 'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4')}>
        <SkeletonBox className="mb-3 h-4 w-40" />
        <SkeletonBox className="mb-2 h-16 w-full" />
        <SkeletonBox className="h-10 w-full" />
      </div>
      <div className={cn(MOBILE_CARD_RADIUS, 'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4')}>
        <SkeletonBox className="mb-3 h-5 w-48" />
        <SkeletonBox className="mb-2 h-4 w-full" />
        <SkeletonBox className="mb-2 h-4 w-5/6" />
        <SkeletonBox className="h-4 w-4/6" />
      </div>
      <div className={cn(MOBILE_CARD_RADIUS, 'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4')}>
        <SkeletonBox className="mb-3 h-4 w-36" />
        <div className="grid grid-cols-2 gap-2">
          <SkeletonBox className="h-16" />
          <SkeletonBox className="h-16" />
        </div>
      </div>
    </div>
  );
}
