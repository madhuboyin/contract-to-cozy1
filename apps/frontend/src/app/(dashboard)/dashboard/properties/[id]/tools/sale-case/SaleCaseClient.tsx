'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { PROPERTY_USE_LABELS, type PropertyUse } from '@/components/property/PropertyOwnershipResponsibilitySection';
import {
  completeTransition,
  confirmSaleIntent,
  createSaleCase,
  getSaleCase,
  listBuyerPackageShares,
  listRevocableShares,
  recordTransition,
  setItemDecision,
  transitionStatus,
  updateTransition,
  type BuyerPackageShareOption,
  type RevocableShareOption,
} from './saleCaseApi';
import {
  CATEGORY_LABELS,
  RETENTION_DECISION_LABELS,
  REQUIREMENT_CLASS_LABELS,
  type PropertyTransition,
  type SaleCaseOverview,
  type SaleCaseStatus,
  type SaleReadinessItem,
  type SaleReadinessRequirementClass,
  type SaleTransitionRetentionDecision,
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

// Slice 11 cross-linking: readiness items already carry real
// sourceEntityType/sourceEntityId (propertySaleCase.service.ts projects
// them straight from canonical records), but nothing rendered them as a
// link back to that source — a homeowner could see "unverified material
// spec" with no way to jump to it.
//
// PROJECT and HOME_ACTION added in a follow-up pass — both already had a
// real per-item route/deep-link (projects/[projectId]; home-operations's
// existing ?focusWorkItemId= param, confirmed via grep), they just hadn't
// been wired here yet.
//
// INSPECTION_FINDING added in a second follow-up pass: open-items/page.tsx
// gained findingId deep-link support (scroll-into-view + highlight, since
// there's no per-finding detail sheet to open) — that page already lists
// every open finding for the property with no report-scoping needed, so
// no report id is required in this href.
//
// PERMIT fixed in a third follow-up pass: the backend previously mapped
// two different models (PropertyPermitRecord and PermitUnpermittedFlag)
// onto the same 'PERMIT' sourceEntityType, so an id alone couldn't say
// which one it was. propertySaleCase.service.ts now emits a distinct
// PERMIT_UNPERMITTED_FLAG type for the flags model, so each type maps to
// exactly one model. PERMIT (PropertyPermitRecord) already had a real
// per-item route (same one PermitCard uses in the permits hub);
// PERMIT_UNPERMITTED_FLAG's flags page gained flagId deep-link support
// (scroll-into-view + highlight + auto-expand, mirroring open-items'
// findingId — no per-flag detail page exists to open instead). Both
// routes are global (/dashboard/permits/...), not property-scoped, so
// propertyId is forwarded as a query param the same way PermitCard does.
function sourceEntityHref(propertyId: string, item: SaleReadinessItem): string | null {
  switch (item.sourceEntityType) {
    case 'MATERIAL_SPEC': return `/dashboard/properties/${propertyId}/materials/${item.sourceEntityId}`;
    case 'PROPERTY_RECORD': return `/dashboard/properties/${propertyId}/tools/home-records?recordId=${item.sourceEntityId}`;
    case 'TIMELINE_EVENT': return `/dashboard/properties/${propertyId}/timeline?eventId=${item.sourceEntityId}`;
    case 'PROJECT': return `/dashboard/properties/${propertyId}/projects/${item.sourceEntityId}`;
    case 'HOME_ACTION': return `/dashboard/properties/${propertyId}/home-operations?focusWorkItemId=${item.sourceEntityId}`;
    case 'INSPECTION_FINDING': return `/dashboard/properties/${propertyId}/inspection-hub/open-items?findingId=${item.sourceEntityId}`;
    case 'PERMIT': return `/dashboard/permits/${item.sourceEntityId}?propertyId=${propertyId}`;
    case 'PERMIT_UNPERMITTED_FLAG': return `/dashboard/permits/flags?propertyId=${propertyId}&flagId=${item.sourceEntityId}`;
    default: return null;
  }
}

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

  const confirmIntentMutation = useMutation({
    mutationFn: () => confirmSaleIntent(propertyId),
    onSuccess: invalidate,
    onError: (error: any) => toast({ title: 'Could not confirm sale intent', description: error?.message, variant: 'destructive' }),
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

  const startTransitionMutation = useMutation({
    mutationFn: () => recordTransition(propertyId, {}),
    onSuccess: invalidate,
    onError: (error: any) => toast({ title: 'Could not start transition', description: error?.message, variant: 'destructive' }),
  });

  const updateTransitionMutation = useMutation({
    mutationFn: ({ transitionId, input }: { transitionId: string; input: Parameters<typeof updateTransition>[2] }) =>
      updateTransition(propertyId, transitionId, input),
    onSuccess: invalidate,
    onError: (error: any) => toast({ title: 'Could not save transition details', description: error?.message, variant: 'destructive' }),
  });

  const completeTransitionMutation = useMutation({
    mutationFn: ({ transitionId, revokeShareIds }: { transitionId: string; revokeShareIds: string[] }) =>
      completeTransition(propertyId, transitionId, revokeShareIds),
    onSuccess: (result) => {
      invalidate();
      const failed = result.revokeResults.filter((r) => !r.revoked);
      if (failed.length > 0) {
        toast({ title: 'Transition completed', description: `${failed.length} share revoke(s) failed and need manual follow-up.`, variant: 'destructive' });
      } else {
        toast({ title: 'Transition completed' });
      }
    },
    onError: (error: any) => toast({ title: 'Could not complete transition', description: error?.message, variant: 'destructive' }),
  });

  const overview = overviewQuery.data;

  return (
    <MobilePageContainer className="lg:max-w-5xl lg:px-8 lg:pb-10">
      <div className="mb-4 hidden items-center gap-2 lg:flex">
        <Link
          href={`/dashboard/properties/${propertyId}/seller-prep`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--mobile-text-secondary))] hover:text-[hsl(var(--mobile-text-primary))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sale Readiness
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
        <ConfirmSaleIntentCard
          propertyId={propertyId}
          overview={overview}
          onConfirm={() => confirmIntentMutation.mutate()}
          pending={confirmIntentMutation.isPending}
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
          propertyId={propertyId}
          overview={overview as SaleCaseOverview & { saleCase: NonNullable<SaleCaseOverview['saleCase']> }}
          onTransition={(status) => transitionMutation.mutate(status)}
          transitionPending={transitionMutation.isPending}
          onDecision={(itemId, action) => decisionMutation.mutate({ itemId, action })}
          decisionPending={decisionMutation.isPending}
          onStartTransition={() => startTransitionMutation.mutate()}
          startTransitionPending={startTransitionMutation.isPending}
          onUpdateTransition={(transitionId, input) => updateTransitionMutation.mutate({ transitionId, input })}
          updateTransitionPending={updateTransitionMutation.isPending}
          onCompleteTransition={(transitionId, revokeShareIds) => completeTransitionMutation.mutate({ transitionId, revokeShareIds })}
          completeTransitionPending={completeTransitionMutation.isPending}
        />
      )}

      <BottomSafeAreaReserve />
    </MobilePageContainer>
  );
}

// Sale Readiness gates on one property field (propertyUse === 'FOR_SALE').
// This confirms it inline, in place, rather than routing the homeowner
// through the full ~30-field property edit form for a single toggle — the
// full form remains reachable as a de-emphasized fallback for anyone who
// wants to review other property details while they're at it, and that
// fallback round-trips back here via returnTo instead of dead-ending on
// the property overview.
function ConfirmSaleIntentCard({
  propertyId,
  overview,
  onConfirm,
  pending,
}: {
  propertyId: string;
  overview: SaleCaseOverview | undefined;
  onConfirm: () => void;
  pending: boolean;
}) {
  const canConfirm = overview?.canConfirmSaleIntent !== false;
  const currentUse = overview?.currentPropertyUse as PropertyUse | null | undefined;
  const currentUseLabel = currentUse && currentUse !== 'FOR_SALE' && currentUse !== 'UNKNOWN'
    ? PROPERTY_USE_LABELS[currentUse]
    : null;
  const editHref = `/dashboard/properties/${propertyId}/edit?focus=property-use&returnTo=${encodeURIComponent(`/dashboard/properties/${propertyId}/tools/sale-case`)}&fromSaleCase=1`;

  return (
    <MobileCard variant="compact" className="space-y-3 text-center">
      <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>
        Confirm you're preparing to sell
      </p>
      <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
        Sale Readiness only opens once this property is marked for sale, so it never appears uninvited.
      </p>

      {canConfirm ? (
        <>
          <div className="flex justify-center">
            <Button size="sm" onClick={onConfirm} disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mark this home for sale
            </Button>
          </div>
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
            This sets "How you use this home" to For sale on your property record.
            {currentUseLabel ? ` It's currently set to "${currentUseLabel}".` : ''}
          </p>
          <Link href={editHref} className="mt-1 inline-block text-xs font-medium text-sky-700 hover:underline">
            Review other property details instead →
          </Link>
        </>
      ) : (
        <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          Ask a household owner or contributor to confirm this property is for sale.
        </p>
      )}
    </MobileCard>
  );
}

function SaleCaseBody({
  propertyId,
  overview,
  onTransition,
  transitionPending,
  onDecision,
  decisionPending,
  onStartTransition,
  startTransitionPending,
  onUpdateTransition,
  updateTransitionPending,
  onCompleteTransition,
  completeTransitionPending,
}: {
  propertyId: string;
  overview: SaleCaseOverview & { saleCase: NonNullable<SaleCaseOverview['saleCase']> };
  onTransition: (status: SaleCaseStatus) => void;
  transitionPending: boolean;
  onDecision: (itemId: string, action: 'WAIVE' | 'REOPEN') => void;
  decisionPending: boolean;
  onStartTransition: () => void;
  startTransitionPending: boolean;
  onUpdateTransition: (transitionId: string, input: { sellerRetentionDecision?: SaleTransitionRetentionDecision | null; sellerRetentionNotes?: string | null; buyerPackageId?: string | null }) => void;
  updateTransitionPending: boolean;
  onCompleteTransition: (transitionId: string, revokeShareIds: string[]) => void;
  completeTransitionPending: boolean;
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
          <Link href={`/dashboard/properties/${propertyId}/property-brief?purpose=LISTING_AGENT`}>
            <Button size="sm" variant="outline">Compose agent package</Button>
          </Link>
        </MobileCard>
      </MobileSection>

      {groups.map((group) => (
        <MobileSection key={group.requirementClass} className="mb-4">
          <MobileSectionHeader title={REQUIREMENT_CLASS_LABELS[group.requirementClass]} />
          <div className="space-y-2">
            {group.items.map((item) => {
              const sourceHref = sourceEntityHref(propertyId, item);
              return (
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
                    {sourceHref ? (
                      <Link href={sourceHref} className="mt-1 inline-block text-xs font-medium text-sky-700 hover:underline">
                        View source →
                      </Link>
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
              );
            })}
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

      {saleCase.status === 'CLOSED' ? (
        <MobileSection className="mb-4">
          <MobileSectionHeader title="Ownership transition" />
          <TransitionSection
            propertyId={propertyId}
            transition={overview.transitions[0] ?? null}
            onStart={onStartTransition}
            startPending={startTransitionPending}
            onUpdate={onUpdateTransition}
            updatePending={updateTransitionPending}
            onComplete={onCompleteTransition}
            completePending={completeTransitionPending}
          />
        </MobileSection>
      ) : null}
    </>
  );
}

function TransitionSection({
  propertyId,
  transition,
  onStart,
  startPending,
  onUpdate,
  updatePending,
  onComplete,
  completePending,
}: {
  propertyId: string;
  transition: PropertyTransition | null;
  onStart: () => void;
  startPending: boolean;
  onUpdate: (transitionId: string, input: { sellerRetentionDecision?: SaleTransitionRetentionDecision | null; sellerRetentionNotes?: string | null; buyerPackageId?: string | null }) => void;
  updatePending: boolean;
  onComplete: (transitionId: string, revokeShareIds: string[]) => void;
  completePending: boolean;
}) {
  const buyerSharesQuery = useQuery({
    queryKey: ['sale-case-buyer-shares', propertyId],
    queryFn: () => listBuyerPackageShares(propertyId),
    enabled: Boolean(transition) && !transition?.completedAt,
  });
  const revocableSharesQuery = useQuery({
    queryKey: ['sale-case-revocable-shares', propertyId],
    queryFn: () => listRevocableShares(propertyId),
    enabled: Boolean(transition) && !transition?.completedAt,
  });

  const [notes, setNotes] = React.useState(transition?.sellerRetentionNotes ?? '');
  const [revokeIds, setRevokeIds] = React.useState<string[]>([]);
  React.useEffect(() => {
    setNotes(transition?.sellerRetentionNotes ?? '');
  }, [transition?.id, transition?.sellerRetentionNotes]);

  if (!transition) {
    return (
      <MobileCard className="space-y-2">
        <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
          Capture how ownership actually transferred — retention decisions, the buyer's handoff package, and access cleanup.
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={onStart} disabled={startPending}>
            {startPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Start transition
          </Button>
        </div>
      </MobileCard>
    );
  }

  if (transition.completedAt) {
    return (
      <MobileCard className="space-y-2">
        <StatusChip tone="protected">Transition complete</StatusChip>
        <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
          Completed {new Date(transition.completedAt).toLocaleDateString()}
          {transition.acceptedAt ? ` — buyer package accepted ${new Date(transition.acceptedAt).toLocaleDateString()}` : ''}.
        </p>
        {transition.sellerRetentionDecision ? (
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            {RETENTION_DECISION_LABELS[transition.sellerRetentionDecision]}
          </p>
        ) : null}
      </MobileCard>
    );
  }

  const buyerShares = buyerSharesQuery.data ?? [];
  const revocableShares = revocableSharesQuery.data ?? [];
  const canComplete = Boolean(transition.sellerRetentionDecision)
    && (!transition.buyerPackageId || Boolean(transition.acceptedAt));

  return (
    <MobileCard className="space-y-4">
      <div className="space-y-1.5">
        <Label>Buyer handoff package</Label>
        <Select
          value={transition.buyerPackageId ?? '__none__'}
          onValueChange={(value) => onUpdate(transition.id, { buyerPackageId: value === '__none__' ? null : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a Property Brief share" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None selected</SelectItem>
            {buyerShares.map((share: BuyerPackageShareOption) => (
              <SelectItem key={share.shareId} value={share.shareId}>
                {share.briefTitle}{share.recipientName ? ` — ${share.recipientName}` : ''}
                {share.invitationStatus === 'ACCEPTED' ? ' (accepted)' : ' (not yet accepted)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {buyerShares.length === 0 ? (
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            No active buyer-purpose Property Brief share yet — create one from Property Brief first.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Seller retention decision</Label>
        <Select
          value={transition.sellerRetentionDecision ?? undefined}
          onValueChange={(value) => onUpdate(transition.id, { sellerRetentionDecision: value as SaleTransitionRetentionDecision })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a decision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RETAIN_PRIVATE_ONLY">{RETENTION_DECISION_LABELS.RETAIN_PRIVATE_ONLY}</SelectItem>
            <SelectItem value="SHARE_SELECTED_HISTORY">{RETENTION_DECISION_LABELS.SHARE_SELECTED_HISTORY}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes !== (transition.sellerRetentionNotes ?? '')) {
              onUpdate(transition.id, { sellerRetentionNotes: notes || null });
            }
          }}
          placeholder="Anything specific about what's being retained or shared"
          rows={2}
        />
      </div>

      {revocableShares.length > 0 ? (
        <div className="space-y-1.5">
          <Label>Revoke access on completion</Label>
          {revocableShares.map((share: RevocableShareOption) => (
            <div key={share.shareId} className="flex items-center gap-2">
              <Checkbox
                id={`revoke-${share.shareId}`}
                checked={revokeIds.includes(share.shareId)}
                onCheckedChange={(checked) => {
                  setRevokeIds((prev) => (checked ? [...prev, share.shareId] : prev.filter((id) => id !== share.shareId)));
                }}
              />
              <label htmlFor={`revoke-${share.shareId}`} className={cn('text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.caption)}>
                {share.briefTitle} ({share.purpose.replaceAll('_', ' ').toLowerCase()})
              </label>
            </div>
          ))}
        </div>
      ) : null}

      {updatePending ? <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Saving…</p> : null}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => onComplete(transition.id, revokeIds)}
          disabled={!canComplete || completePending}
        >
          {completePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Complete transition
        </Button>
      </div>
    </MobileCard>
  );
}
