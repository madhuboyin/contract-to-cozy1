'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
  type StatusChipTone,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { createSaleCase, getSaleCase, setItemDecision, transitionStatus } from './saleCaseApi';
import {
  CATEGORY_LABELS,
  REQUIREMENT_CLASS_LABELS,
  type SaleCaseOverview,
  type SaleCaseStatus,
  type SaleReadinessItem,
  type SaleReadinessRequirementClass,
} from './types';

const STATUS_TONE: Record<SaleCaseStatus, StatusChipTone> = {
  PREPARING: 'info',
  LISTED: 'good',
  UNDER_CONTRACT: 'good',
  CLOSED: 'protected',
  CANCELLED: 'danger',
};

const NEXT_STATUS: Partial<Record<SaleCaseStatus, { status: SaleCaseStatus; label: string }>> = {
  PREPARING: { status: 'LISTED', label: 'Mark as listed' },
  LISTED: { status: 'UNDER_CONTRACT', label: 'Mark under contract' },
  UNDER_CONTRACT: { status: 'CLOSED', label: 'Mark closed' },
};

// Ordered so material blockers surface first — matches plan §8's
// distinguished requirement classes, most-urgent-first.
const REQUIREMENT_CLASS_ORDER: SaleReadinessRequirementClass[] = [
  'MATERIAL_BLOCKER',
  'VERIFICATION_NEEDED',
  'PROFESSIONAL_DECISION',
  'OPTIONAL_IMPROVEMENT',
  'PRESENTATION',
];

const REQUIREMENT_CLASS_TONE: Record<SaleReadinessRequirementClass, StatusChipTone> = {
  MATERIAL_BLOCKER: 'danger',
  VERIFICATION_NEEDED: 'needsAction',
  PROFESSIONAL_DECISION: 'needsAction',
  OPTIONAL_IMPROVEMENT: 'elevated',
  PRESENTATION: 'info',
};

function groupByRequirementClass(items: SaleReadinessItem[]) {
  const open = items.filter((item) => item.status === 'OPEN');
  const groups = new Map<SaleReadinessRequirementClass, SaleReadinessItem[]>();
  for (const item of open) {
    const bucket = groups.get(item.requirementClass) ?? [];
    bucket.push(item);
    groups.set(item.requirementClass, bucket);
  }
  return REQUIREMENT_CLASS_ORDER
    .map((requirementClass) => ({ requirementClass, items: groups.get(requirementClass) ?? [] }))
    .filter((group) => group.items.length > 0);
}

export default function SaleCaseClient() {
  const params = useParams();
  const propertyId = String(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const overviewQuery = useQuery({
    queryKey: ['sale-case', propertyId],
    queryFn: () => getSaleCase(propertyId),
    enabled: Boolean(propertyId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sale-case', propertyId] });

  const createMutation = useMutation({
    mutationFn: () => createSaleCase(propertyId),
    onSuccess: invalidate,
    onError: (error: any) => toast({ title: 'Could not start sale case', description: error?.message, variant: 'destructive' }),
  });

  const transitionMutation = useMutation({
    mutationFn: (status: SaleCaseStatus) => transitionStatus(propertyId, status),
    onSuccess: invalidate,
    onError: (error: any) => toast({ title: 'Could not update status', description: error?.message, variant: 'destructive' }),
  });

  const decisionMutation = useMutation({
    mutationFn: ({ itemId, action }: { itemId: string; action: 'WAIVE' | 'REOPEN' }) =>
      setItemDecision(propertyId, itemId, action),
    onSuccess: invalidate,
    onError: (error: any) => toast({ title: 'Could not update item', description: error?.message, variant: 'destructive' }),
  });

  const overview = overviewQuery.data;

  return (
    <MobilePageContainer>
      <div className="mb-4 hidden items-center gap-2 lg:flex">
        <Link
          href={`/dashboard/properties/${propertyId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--mobile-text-secondary))] hover:text-[hsl(var(--mobile-text-primary))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to property
        </Link>
      </div>

      <MobilePageIntro
        eyebrow="Home tool"
        title="Sale Readiness"
        subtitle="A governed sale case projected from your property's real findings, projects, permits, Home Actions, and records — not a self-reported checklist."
      />

      {overviewQuery.isLoading ? (
        <MobileCard className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--mobile-text-muted))]" />
        </MobileCard>
      ) : !overview?.saleIntentConfirmed ? (
        <EmptyStateCard
          title="Confirm you're preparing to sell"
          description="Sale Readiness only opens once this property is marked for sale, so it never appears uninvited."
          action={
            <Link href={`/dashboard/properties/${propertyId}/edit`}>
              <Button size="sm">Update property details</Button>
            </Link>
          }
        />
      ) : !overview.saleCase ? (
        <EmptyStateCard
          title="Start a sale case"
          description="This creates one shared readiness case for the property, visible to every household member."
          action={
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !overview.canCreate}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start sale case
            </Button>
          }
        />
      ) : (
        <SaleCaseBody
          overview={overview as SaleCaseOverview & { saleCase: NonNullable<SaleCaseOverview['saleCase']> }}
          onTransition={(status) => transitionMutation.mutate(status)}
          transitionPending={transitionMutation.isPending}
          onDecision={(itemId, action) => decisionMutation.mutate({ itemId, action })}
          decisionPending={decisionMutation.isPending}
        />
      )}

      <BottomSafeAreaReserve />
    </MobilePageContainer>
  );
}

function SaleCaseBody({
  overview,
  onTransition,
  transitionPending,
  onDecision,
  decisionPending,
}: {
  overview: SaleCaseOverview & { saleCase: NonNullable<SaleCaseOverview['saleCase']> };
  onTransition: (status: SaleCaseStatus) => void;
  transitionPending: boolean;
  onDecision: (itemId: string, action: 'WAIVE' | 'REOPEN') => void;
  decisionPending: boolean;
}) {
  const saleCase = overview.saleCase;
  const groups = groupByRequirementClass(overview.readinessItems);
  const waived = overview.readinessItems.filter((item) => item.status === 'WAIVED');
  const openCount = overview.readinessItems.filter((item) => item.status === 'OPEN').length;
  const nextStep = NEXT_STATUS[saleCase.status];

  return (
    <>
      <MobileSection className="mb-4">
        <MobileCard className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <StatusChip tone={STATUS_TONE[saleCase.status]}>{saleCase.status}</StatusChip>
            {nextStep ? (
              <Button size="sm" variant="outline" onClick={() => onTransition(nextStep.status)} disabled={transitionPending}>
                {transitionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {nextStep.label}
              </Button>
            ) : null}
          </div>
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
            {openCount === 0
              ? 'No open readiness items right now — this reflects real property records, not a fixed checklist.'
              : `${openCount} open readiness item${openCount === 1 ? '' : 's'} projected from your property's records.`}
          </p>
        </MobileCard>
      </MobileSection>

      {groups.map((group) => (
        <MobileSection key={group.requirementClass} className="mb-4">
          <MobileSectionHeader title={REQUIREMENT_CLASS_LABELS[group.requirementClass]} />
          <div className="space-y-2">
            {group.items.map((item) => (
              <MobileCard key={item.id} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn('mb-0.5 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                      {item.title}
                    </p>
                    {item.detail ? (
                      <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                        {item.detail}
                      </p>
                    ) : null}
                  </div>
                  <StatusChip tone={REQUIREMENT_CLASS_TONE[item.requirementClass]}>
                    {CATEGORY_LABELS[item.category]}
                  </StatusChip>
                </div>
                {item.requirementClass === 'PROFESSIONAL_DECISION' ? (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDecision(item.id, 'WAIVE')}
                      disabled={decisionPending}
                    >
                      Disclose and waive
                    </Button>
                  </div>
                ) : null}
              </MobileCard>
            ))}
          </div>
        </MobileSection>
      ))}

      {waived.length > 0 ? (
        <MobileSection className="mb-4">
          <MobileSectionHeader title="Disclosed, not addressed" />
          <div className="space-y-2">
            {waived.map((item) => (
              <MobileCard key={item.id} className="space-y-2">
                <p className={cn('mb-0 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                  {item.title}
                </p>
                {item.waivedReason ? (
                  <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                    "{item.waivedReason}"
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => onDecision(item.id, 'REOPEN')} disabled={decisionPending}>
                    Reopen
                  </Button>
                </div>
              </MobileCard>
            ))}
          </div>
        </MobileSection>
      ) : null}

      {groups.length === 0 && waived.length === 0 ? (
        <EmptyStateCard
          title="Nothing outstanding"
          description="No open findings, unfinished projects, unverified permits, Home Actions, or record gaps are currently projected for this property."
        />
      ) : null}
    </>
  );
}
