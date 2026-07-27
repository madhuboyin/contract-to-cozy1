// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeRecordReadinessCard.tsx
//
// Home Record hub summary (Home Digital Twin audit, Slice 2). Shows which
// system facts are known vs. need attention (conflicting, defaulted, or
// unknown) and links each one to its existing owning surface — property
// edit, a specific inventory item, or the inventory list. This is
// deliberately not a new place to edit data: "Fix" navigates away, and
// "Looks right" only confirms the projection's current values, it never
// changes them.

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, AlertTriangle } from 'lucide-react';
import { MobileCard, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import {
  getHomeDigitalTwinFactReadiness,
  confirmHomeDigitalTwinComponent,
} from '../tools/home-digital-twin/homeDigitalTwinApi';
import type { HomeTwinFactReadinessItemDTO } from '@/types';

const MAX_VISIBLE_ITEMS = 4;

export default function HomeRecordReadinessCard({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['home-digital-twin-fact-readiness', propertyId],
    queryFn: () => getHomeDigitalTwinFactReadiness(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 5 * 60 * 1000,
  });

  const confirmMutation = useMutation({
    mutationFn: (componentId: string) =>
      confirmHomeDigitalTwinComponent(propertyId, componentId, true),
    onMutate: (componentId: string) => setConfirmingId(componentId),
    onSettled: () => {
      setConfirmingId(null);
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin-fact-readiness', propertyId] });
    },
  });

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-[22px] bg-slate-100" aria-hidden="true" />;
  }

  // No twin yet — this is a normal state for a new property. The broader
  // onboarding/completeness flow handles getting facts in; this card only
  // appears once there's a projection to review.
  if (!data || !data.hasTwin) return null;

  const visibleItems = data.items.slice(0, MAX_VISIBLE_ITEMS);
  const overflowCount = data.items.length - visibleItems.length;

  return (
    <MobileCard variant="standard" className="space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]">
            <ClipboardList className="h-3.5 w-3.5 text-[hsl(var(--mobile-brand-strong))]" aria-hidden="true" />
          </div>
          <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
            Home Record
          </p>
        </div>
        {data.needsAttentionCount === 0 ? (
          <StatusChip tone="good">Up to date</StatusChip>
        ) : (
          <StatusChip tone="elevated">{data.needsAttentionCount} to review</StatusChip>
        )}
      </div>

      <p className="mb-0 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
        What we know about your home&apos;s major systems, and what still needs a look.
      </p>

      {data.needsAttentionCount === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="mb-0 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
            {data.knownFactCount} facts confirmed or reported. Nothing needs your attention right now.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <ReadinessRow
              key={`${item.componentId}:${item.fieldName}`}
              item={item}
              isConfirming={confirmingId === item.componentId && confirmMutation.isPending}
              onConfirm={() => confirmMutation.mutate(item.componentId)}
            />
          ))}
          {overflowCount > 0 && (
            <p className="mb-0 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
              +{overflowCount} more item{overflowCount === 1 ? '' : 's'} to review
            </p>
          )}
        </div>
      )}
    </MobileCard>
  );
}

function ReadinessRow({
  item,
  isConfirming,
  onConfirm,
}: {
  item: HomeTwinFactReadinessItemDTO;
  isConfirming: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] px-3 py-2.5 space-y-1.5">
      <div className="flex items-start gap-2">
        {item.isConflict && (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
        )}
        <p className="mb-0 text-[12px] leading-snug text-[hsl(var(--mobile-text-primary))]">
          {item.reason}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {item.correctionDestination && (
          <Link
            href={item.correctionDestination}
            className="no-brand-style text-[12px] font-medium text-[hsl(var(--mobile-brand-strong))]"
          >
            Fix it
          </Link>
        )}
        <button
          type="button"
          onClick={onConfirm}
          disabled={isConfirming}
          className="text-[12px] font-medium text-[hsl(var(--mobile-text-secondary))] hover:text-[hsl(var(--mobile-text-primary))] disabled:opacity-50"
        >
          {isConfirming ? 'Saving…' : 'Looks right'}
        </button>
      </div>
    </div>
  );
}
