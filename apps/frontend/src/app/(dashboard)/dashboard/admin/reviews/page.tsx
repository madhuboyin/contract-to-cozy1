'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/reviews/page.tsx
//
// Admin-only Review Moderation Queue (ADMIN_MODULE_FRD.md §10.5).
// Work the pending/flagged queue (or browse by status), inspect a review with
// its booking context and author/provider history, and record a governed
// moderation decision with a required reason.

import React, { useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useAdminReviewDetail,
  useAdminReviewQueue,
  useModerateAdminReview,
} from '@/hooks/useAdminReviewModeration';
import { useRequestReviewInvestigation } from '@/hooks/useAdminCases';
import type {
  ModerationAction,
  ReviewQueueItem,
  ReviewStatus,
} from '@/lib/api/adminReviewModeration';

const STATUS_BADGE: Record<ReviewStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-rose-50 text-rose-700',
  FLAGGED: 'bg-orange-50 text-orange-700',
};

// Client-side mirror of the service's governed transitions — controls which
// action buttons render for the review's current status.
const ACTIONS_FOR_STATUS: Record<ReviewStatus, ModerationAction[]> = {
  PENDING: ['APPROVE', 'REJECT', 'FLAG'],
  FLAGGED: ['APPROVE', 'REJECT', 'RESTORE'],
  APPROVED: ['FLAG'],
  REJECTED: ['RESTORE'],
};

const ACTION_COPY: Record<ModerationAction, { label: string; description: string; destructive: boolean }> = {
  APPROVE: {
    label: 'Approve',
    description: 'Publishes this review — it becomes visible on the provider profile.',
    destructive: false,
  },
  REJECT: {
    label: 'Reject',
    description: 'Rejects this review — it will not appear publicly.',
    destructive: true,
  },
  FLAG: {
    label: 'Flag',
    description: 'Flags this review for escalation and removes it from public view while under review.',
    destructive: true,
  },
  RESTORE: {
    label: 'Restore to queue',
    description: 'Returns this review to the pending queue for a fresh decision. It is not published.',
    destructive: false,
  },
};

type QueueFilter = 'QUEUE' | ReviewStatus;

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'QUEUE', label: 'Queue (pending + flagged)' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
];

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function partyName(party: ReviewQueueItem['author']): string {
  return `${party.firstName} ${party.lastName}`;
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
        />
      ))}
    </span>
  );
}

// ─── Reason-gated confirm dialog ───────────────────────────────────────────────

function ReasonConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required) — this is recorded in the audit log"
          className="min-h-[90px]"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail panel ──────────────────────────────────────────────────────────────

function ReviewDetailPanel({ reviewId }: { reviewId: string }) {
  const { toast } = useToast();
  const detailQ = useAdminReviewDetail(reviewId);
  const moderate = useModerateAdminReview(reviewId);
  const investigate = useRequestReviewInvestigation(reviewId);
  const [actionDialog, setActionDialog] = useState<ModerationAction | null>(null);
  const [investigateOpen, setInvestigateOpen] = useState(false);

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading review…
      </div>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <AdminRouteState
        state="error"
        title="Failed to load review"
        description="The review may no longer exist, or the request failed. Try selecting it again."
      />
    );
  }

  const review = detailQ.data;
  const actions = ACTIONS_FOR_STATUS[review.status] ?? [];
  const providerLabel =
    review.provider.providerProfile?.businessName ?? partyName(review.provider);

  const categoryRatings = [
    { label: 'Quality', value: review.qualityRating },
    { label: 'Communication', value: review.communicationRating },
    { label: 'Value', value: review.valueRating },
    { label: 'Professionalism', value: review.professionalismRating },
  ].filter((r) => r.value !== null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <RatingStars rating={review.rating} />
            <h3 className="text-sm font-semibold text-slate-900">{review.title ?? 'Untitled review'}</h3>
          </div>
          <p className="text-xs text-slate-500">
            {partyName(review.author)} on {providerLabel} · {fmtDate(review.createdAt)}
          </p>
        </div>
        <Badge className={`text-[11px] ${STATUS_BADGE[review.status]}`}>{review.status}</Badge>
      </div>

      <blockquote className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[13px] text-slate-700">
        {review.content}
      </blockquote>

      {categoryRatings.length > 0 ? (
        <dl className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          {categoryRatings.map((r) => (
            <div key={r.label}>
              <dt className="text-slate-400">{r.label}</dt>
              <dd className="font-medium text-slate-700">{r.value}/5</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {review.response ? (
        <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
          <p className="font-semibold text-slate-600">Provider response ({fmtDate(review.respondedAt)})</p>
          <p className="whitespace-pre-wrap text-slate-500">{review.response}</p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
        <p className="font-semibold text-slate-600">Booking context</p>
        <p className="text-slate-500">
          {review.booking.bookingNumber} · {review.booking.service.name} ({review.booking.category}) ·{' '}
          {review.booking.status} · scheduled {fmtDate(review.booking.scheduledDate)} · completed{' '}
          {fmtDate(review.booking.completedAt)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
          <p className="font-semibold text-slate-600">Author history</p>
          <p className="text-slate-500">
            {review.authorHistory.reviewCounts.APPROVED} approved ·{' '}
            {review.authorHistory.reviewCounts.REJECTED} rejected ·{' '}
            {review.authorHistory.reviewCounts.FLAGGED} flagged ·{' '}
            {review.authorHistory.reviewCounts.PENDING} pending
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
          <p className="font-semibold text-slate-600">Provider history</p>
          <p className="text-slate-500">
            {review.providerHistory.reviewCounts.APPROVED} approved ·{' '}
            {review.providerHistory.reviewCounts.REJECTED} rejected ·{' '}
            {review.providerHistory.approvedAverageRating != null
              ? `${review.providerHistory.approvedAverageRating.toFixed(1)}★ approved average`
              : 'no approved average yet'}
          </p>
        </div>
      </div>

      {review.moderatedAt ? (
        <p className="text-[11px] text-slate-400">
          Last moderated {fmtDate(review.moderatedAt)}
          {review.moderatedBy ? ` by ${review.moderatedBy}` : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {actions.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={ACTION_COPY[action].destructive ? 'destructive' : 'default'}
            onClick={() => setActionDialog(action)}
          >
            {ACTION_COPY[action].label}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => setInvestigateOpen(true)}>
          Request investigation
        </Button>
      </div>

      <ReasonConfirmDialog
        open={investigateOpen}
        onOpenChange={setInvestigateOpen}
        title="Request investigation"
        description="Opens a REVIEW_INVESTIGATION case linked to this review. The review's moderation status is not changed."
        confirmLabel="Open investigation case"
        pending={investigate.isPending}
        onConfirm={(reason) => {
          investigate.mutate(
            { reason },
            {
              onSuccess: (created) => {
                setInvestigateOpen(false);
                toast({ title: 'Investigation requested', description: `${created.caseNumber} opened.` });
              },
              onError: (err: any) => {
                toast({ title: 'Failed to request investigation', description: err?.message, variant: 'destructive' });
              },
            },
          );
        }}
      />

      <ReasonConfirmDialog
        open={actionDialog !== null}
        onOpenChange={(next) => !next && setActionDialog(null)}
        title={actionDialog ? `${ACTION_COPY[actionDialog].label} this review` : ''}
        description={actionDialog ? ACTION_COPY[actionDialog].description : ''}
        confirmLabel={actionDialog ? `Confirm: ${ACTION_COPY[actionDialog].label.toLowerCase()}` : ''}
        destructive={actionDialog ? ACTION_COPY[actionDialog].destructive : false}
        pending={moderate.isPending}
        onConfirm={(reason) => {
          if (!actionDialog) return;
          moderate.mutate(
            { action: actionDialog, reason },
            {
              onSuccess: (result) => {
                setActionDialog(null);
                toast({
                  title: 'Decision recorded',
                  description: `Review moved from ${result.previousStatus} to ${result.status}.`,
                });
              },
              onError: (err: any) => {
                toast({ title: 'Failed to moderate review', description: err?.message, variant: 'destructive' });
              },
            },
          );
        }}
      />
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function AdminReviewModerationPage() {
  const guard = useAdminGuard({
    title: 'Review Moderation',
    subtitle: 'Work the pending and flagged review queue with governed decisions.',
  });

  const [filter, setFilter] = useState<QueueFilter>('QUEUE');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  const queueQ = useAdminReviewQueue(filter === 'QUEUE' ? undefined : filter);

  if (guard.status !== 'ready') return guard.node;

  return (
    <AdminConsoleShell
      title="Review Moderation"
      subtitle="Approve, reject, flag, or restore provider reviews. Every decision requires a reason and is audited."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <Star className="h-3 w-3" />
          {queueQ.data ? `${queueQ.data.total} in view` : 'Loading…'}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setSelectedReviewId(null);
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {queueQ.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading queue…
            </div>
          ) : null}

          {queueQ.isError ? <p className="p-3 text-xs text-rose-600">Failed to load the queue. Try again.</p> : null}

          {!queueQ.isLoading && queueQ.data?.reviews.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">
              {filter === 'QUEUE' ? 'The moderation queue is empty. Nothing needs a decision.' : 'No reviews with this status.'}
            </p>
          ) : null}

          <ul className="space-y-1">
            {(queueQ.data?.reviews ?? []).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedReviewId(r.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selectedReviewId === r.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {r.rating}★ {r.title ?? 'Untitled review'}
                    </span>
                    <Badge className={`text-[10px] ${selectedReviewId === r.id ? 'bg-white/10 text-white' : STATUS_BADGE[r.status]}`}>
                      {r.status}
                    </Badge>
                  </div>
                  <div className={selectedReviewId === r.id ? 'text-slate-300' : 'text-slate-400'}>
                    {partyName(r.author)} → {r.provider.providerProfile?.businessName ?? partyName(r.provider)} ·{' '}
                    {fmtDate(r.createdAt)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {selectedReviewId ? (
            <ReviewDetailPanel reviewId={selectedReviewId} />
          ) : (
            <AdminRouteState
              state="empty"
              title="No review selected"
              description="Select a review from the queue to see its content, booking context, and history."
            />
          )}
        </div>
      </div>
    </AdminConsoleShell>
  );
}
