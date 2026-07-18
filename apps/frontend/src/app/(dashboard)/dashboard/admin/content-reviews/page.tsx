'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/content-reviews/page.tsx
//
// Admin-only Pending Reviews workspace (ADMIN_MODULE_FRD.md §10.6).
// Two editorial queues — articles awaiting a review decision, and approved
// articles awaiting publication — with capability-separated lifecycle
// actions. Author/reviewer/publisher capabilities are enforced server-side;
// an action a user lacks the capability for fails with 403.

import React, { useState } from 'react';
import { BookCheck, Loader2 } from 'lucide-react';
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
import { useEditorialQueues, useTransitionKnowledgeArticle } from '@/hooks/useAdminContentGovernance';
import type { EditorialQueueItem, LifecycleAction } from '@/lib/api/adminContentGovernance';

const ACTION_COPY: Record<string, { label: string; description: string; destructive: boolean }> = {
  APPROVE: {
    label: 'Approve',
    description: 'Marks this article as approved. Publication is a separate action.',
    destructive: false,
  },
  RETURN_TO_DRAFT: {
    label: 'Return to draft',
    description: 'Sends this article back to the author with your reason.',
    destructive: true,
  },
  PUBLISH: {
    label: 'Publish',
    description: 'Makes this article publicly visible immediately.',
    destructive: false,
  },
  UNPUBLISH: {
    label: 'Unpublish',
    description: 'Removes this article from public view; it returns to the approved queue.',
    destructive: true,
  },
  ARCHIVE: {
    label: 'Archive',
    description: 'Retires this article. An author can later revive it to draft.',
    destructive: true,
  },
};

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function ReasonConfirmDialog({
  target,
  onOpenChange,
  pending,
  onConfirm,
}: {
  target: { item: EditorialQueueItem; action: LifecycleAction } | null;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const copy = target ? ACTION_COPY[target.action] : null;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {copy?.label}: {target?.item.title}
          </DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required) — this is recorded in the audit log"
          className="min-h-[80px]"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={copy?.destructive ? 'destructive' : 'default'}
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QueueSection({
  title,
  emptyText,
  items,
  actions,
  onAction,
}: {
  title: string;
  emptyText: string;
  items: EditorialQueueItem[];
  actions: LifecycleAction[];
  onAction: (item: EditorialQueueItem, action: LifecycleAction) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">
        {title} ({items.length})
      </h3>
      {items.length === 0 ? <p className="mt-2 text-xs text-slate-400">{emptyText}</p> : null}
      <ul className="mt-2 divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{item.title}</p>
              <p className="text-[11px] text-slate-400">
                {item.articleType} · /{item.slug} · updated {fmtDate(item.updatedAt)}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {item.status}
            </Badge>
            <span className="flex gap-1">
              {actions.map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={ACTION_COPY[action].destructive ? 'destructive' : 'outline'}
                  className="h-7 text-[11px]"
                  onClick={() => onAction(item, action)}
                >
                  {ACTION_COPY[action].label}
                </Button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminContentReviewsPage() {
  const { toast } = useToast();
  const guard = useAdminGuard({
    title: 'Pending Reviews',
    subtitle: 'Editorial queues for knowledge content.',
  });

  const queuesQ = useEditorialQueues();
  const transition = useTransitionKnowledgeArticle();
  const [target, setTarget] = useState<{ item: EditorialQueueItem; action: LifecycleAction } | null>(null);

  if (guard.status !== 'ready') return guard.node;

  return (
    <AdminConsoleShell
      title="Pending Reviews"
      subtitle="Knowledge articles awaiting a review decision or publication. Approve/return needs CONTENT_REVIEW; publish/unpublish/archive needs CONTENT_PUBLISH."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <BookCheck className="h-3 w-3" />
          {queuesQ.data
            ? `${queuesQ.data.reviewQueue.length} in review · ${queuesQ.data.approvedQueue.length} awaiting publish`
            : 'Loading…'}
        </span>
      }
    >
      {queuesQ.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading editorial queues…
        </div>
      ) : null}

      {queuesQ.isError ? (
        <AdminRouteState
          state="error"
          title="Failed to load queues"
          description="The request failed. Refresh to try again."
        />
      ) : null}

      {queuesQ.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <QueueSection
            title="Awaiting review"
            emptyText="No articles are waiting for a review decision."
            items={queuesQ.data.reviewQueue}
            actions={['APPROVE', 'RETURN_TO_DRAFT']}
            onAction={(item, action) => setTarget({ item, action })}
          />
          <QueueSection
            title="Approved — awaiting publish"
            emptyText="No approved articles are waiting to be published."
            items={queuesQ.data.approvedQueue}
            actions={['PUBLISH', 'ARCHIVE']}
            onAction={(item, action) => setTarget({ item, action })}
          />
        </div>
      ) : null}

      <ReasonConfirmDialog
        target={target}
        onOpenChange={(next) => !next && setTarget(null)}
        pending={transition.isPending}
        onConfirm={(reason) => {
          if (!target) return;
          transition.mutate(
            { articleId: target.item.id, action: target.action, reason },
            {
              onSuccess: (result) => {
                setTarget(null);
                toast({ title: 'Lifecycle updated', description: `Article moved to ${result.status}.` });
              },
              onError: (err: any) => {
                toast({ title: 'Action failed', description: err?.message, variant: 'destructive' });
              },
            },
          );
        }}
      />
    </AdminConsoleShell>
  );
}
