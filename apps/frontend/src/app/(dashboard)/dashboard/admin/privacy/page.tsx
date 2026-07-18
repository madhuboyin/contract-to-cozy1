'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/privacy/page.tsx
//
// Admin-only Privacy Requests workspace (ADMIN_MODULE_FRD.md §11.4).
// Intake and track subject-rights requests through a governed lifecycle
// with identity verification, due dates, and legal holds. Tracking only —
// exports, corrections, and deletions are executed in their authoritative
// flows and recorded here in the resolution summary.

import React, { useState } from 'react';
import { Loader2, Plus, ShieldQuestion } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdminPrivacyRequestDetail,
  useAdminPrivacyRequestList,
  useChangeAdminPrivacyRequestStatus,
  useCreateAdminPrivacyRequest,
  useSetAdminPrivacyLegalHold,
} from '@/hooks/useAdminPrivacyRequests';
import type { PrivacyRequestStatus, PrivacyRequestType } from '@/lib/api/adminPrivacyRequests';

const STATUS_BADGE: Record<PrivacyRequestStatus, string> = {
  RECEIVED: 'bg-sky-50 text-sky-700',
  VERIFYING: 'bg-amber-50 text-amber-700',
  VERIFIED: 'bg-indigo-50 text-indigo-700',
  IN_PROGRESS: 'bg-violet-50 text-violet-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-rose-50 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

const TYPES: PrivacyRequestType[] = ['ACCESS_EXPORT', 'CORRECTION', 'DELETION', 'RESTRICTION'];
const ALL_STATUSES: PrivacyRequestStatus[] = [
  'RECEIVED',
  'VERIFYING',
  'VERIFIED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
];

// Client-side mirror of the service's governed lifecycle.
const NEXT_STATUSES: Record<PrivacyRequestStatus, PrivacyRequestStatus[]> = {
  RECEIVED: ['VERIFYING', 'REJECTED', 'CANCELLED'],
  VERIFYING: ['VERIFIED', 'REJECTED', 'CANCELLED'],
  VERIFIED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function isOverdue(dueAt: string | null, status: PrivacyRequestStatus): boolean {
  return !!dueAt && NEXT_STATUSES[status].length > 0 && new Date(dueAt) < new Date();
}

// ─── Intake dialog ─────────────────────────────────────────────────────────────

function IntakeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const create = useCreateAdminPrivacyRequest();
  const [userEmail, setUserEmail] = useState('');
  const [type, setType] = useState<PrivacyRequestType>('ACCESS_EXPORT');
  const [jurisdiction, setJurisdiction] = useState('');

  function reset() {
    setUserEmail('');
    setType('ACCESS_EXPORT');
    setJurisdiction('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Intake a privacy request</DialogTitle>
          <DialogDescription>
            The subject&apos;s email is snapshotted so the record survives account deletion. Due date defaults to 30
            days.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
          placeholder="Subject email"
          type="email"
          className="h-9 text-sm"
        />
        <div className="flex gap-2">
          <Select value={type} onValueChange={(v) => setType(v as PrivacyRequestType)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            placeholder="Jurisdiction (optional)"
            className="h-9 text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={create.isPending || !userEmail.trim()}
            onClick={() =>
              create.mutate(
                { userEmail: userEmail.trim(), type, jurisdiction: jurisdiction.trim() || undefined },
                {
                  onSuccess: (created) => {
                    onOpenChange(false);
                    reset();
                    toast({ title: 'Request recorded', description: `${created.requestNumber} created.` });
                  },
                  onError: (err: any) => {
                    toast({ title: 'Failed to record request', description: err?.message, variant: 'destructive' });
                  },
                },
              )
            }
          >
            {create.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Record request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transition dialog ─────────────────────────────────────────────────────────

function TransitionDialog({
  target,
  onOpenChange,
  pending,
  onConfirm,
}: {
  target: PrivacyRequestStatus | null;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (reason: string, resolutionSummary?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');
  const needsResolution = target === 'COMPLETED';

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) {
          setReason('');
          setResolution('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move request to {target ?? ''}</DialogTitle>
          <DialogDescription>
            {needsResolution
              ? 'Completion requires a resolution summary describing what was done in the authoritative flow (export delivered, deletion executed via the account-deletion cascade, ...).'
              : 'The reason is recorded in the audit log.'}
          </DialogDescription>
        </DialogHeader>
        {needsResolution ? (
          <Textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Resolution summary (required)"
            className="min-h-[70px]"
          />
        ) : null}
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required) — this is recorded in the audit log"
          className="min-h-[70px]"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={pending || !reason.trim() || (needsResolution && !resolution.trim())}
            onClick={() => onConfirm(reason.trim(), needsResolution ? resolution.trim() : undefined)}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail panel ──────────────────────────────────────────────────────────────

function PrivacyDetailPanel({ requestId }: { requestId: string }) {
  const { toast } = useToast();
  const detailQ = useAdminPrivacyRequestDetail(requestId);
  const changeStatus = useChangeAdminPrivacyRequestStatus(requestId);
  const setHold = useSetAdminPrivacyLegalHold(requestId);
  const [transitionTarget, setTransitionTarget] = useState<PrivacyRequestStatus | null>(null);
  const [holdDialog, setHoldDialog] = useState<boolean | null>(null);
  const [holdReason, setHoldReason] = useState('');

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading request…
      </div>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <AdminRouteState
        state="error"
        title="Failed to load request"
        description="The request may no longer exist, or the request failed."
      />
    );
  }

  const r = detailQ.data;
  const nextStatuses = NEXT_STATUSES[r.status];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {r.requestNumber} · {r.type}
          </h3>
          <p className="text-xs text-slate-500">
            {r.userEmail} {r.userId === 'UNMATCHED' ? '(no matching account at intake)' : ''} · recorded{' '}
            {fmtDate(r.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {r.legalHold ? <Badge className="bg-rose-50 text-[11px] text-rose-700">LEGAL HOLD</Badge> : null}
          <Badge className={`text-[11px] ${STATUS_BADGE[r.status]}`}>{r.status}</Badge>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12px] sm:grid-cols-3">
        <div>
          <dt className="text-slate-400">Due</dt>
          <dd className={`font-medium ${isOverdue(r.dueAt, r.status) ? 'text-rose-700' : 'text-slate-700'}`}>
            {fmtDate(r.dueAt)}
            {isOverdue(r.dueAt, r.status) ? ' (overdue)' : ''}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Jurisdiction</dt>
          <dd className="font-medium text-slate-700">{r.jurisdiction ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Identity verified</dt>
          <dd className="font-medium text-slate-700">
            {r.identityVerifiedAt ? fmtDate(r.identityVerifiedAt) : 'Not yet'}
          </dd>
        </div>
      </dl>

      {r.resolutionSummary ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-[12px]">
          <p className="font-semibold text-emerald-700">Resolution ({fmtDate(r.completedAt)})</p>
          <p className="whitespace-pre-wrap text-emerald-800">{r.resolutionSummary}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {nextStatuses.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === 'REJECTED' || s === 'CANCELLED' ? 'destructive' : 'outline'}
            onClick={() => setTransitionTarget(s)}
          >
            Move to {s}
          </Button>
        ))}
        {nextStatuses.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setHoldDialog(!r.legalHold)}>
            {r.legalHold ? 'Clear legal hold' : 'Set legal hold'}
          </Button>
        ) : null}
      </div>

      <TransitionDialog
        target={transitionTarget}
        onOpenChange={(next) => !next && setTransitionTarget(null)}
        pending={changeStatus.isPending}
        onConfirm={(reason, resolutionSummary) => {
          if (!transitionTarget) return;
          changeStatus.mutate(
            { status: transitionTarget, reason, resolutionSummary },
            {
              onSuccess: (result) => {
                setTransitionTarget(null);
                toast({ title: 'Request updated', description: `Moved to ${result.status}.` });
              },
              onError: (err: any) => {
                toast({ title: 'Failed to update request', description: err?.message, variant: 'destructive' });
              },
            },
          );
        }}
      />

      <Dialog
        open={holdDialog !== null}
        onOpenChange={(next) => {
          if (!next) {
            setHoldDialog(null);
            setHoldReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{holdDialog ? 'Set legal hold' : 'Clear legal hold'}</DialogTitle>
            <DialogDescription>
              {holdDialog
                ? 'A DELETION request cannot be completed while a legal hold is active.'
                : 'Clearing the hold allows the request to proceed.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            placeholder="Reason (required) — this is recorded in the audit log"
            className="min-h-[70px]"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHoldDialog(null)} disabled={setHold.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={setHold.isPending || !holdReason.trim()}
              onClick={() => {
                if (holdDialog === null) return;
                setHold.mutate(
                  { legalHold: holdDialog, reason: holdReason.trim() },
                  {
                    onSuccess: () => {
                      setHoldDialog(null);
                      setHoldReason('');
                      toast({ title: 'Legal hold updated' });
                    },
                    onError: (err: any) => {
                      toast({ title: 'Failed to update legal hold', description: err?.message, variant: 'destructive' });
                    },
                  },
                );
              }}
            >
              {setHold.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function AdminPrivacyRequestsPage() {
  const guard = useAdminGuard({
    title: 'Privacy Requests',
    subtitle: 'Subject-rights request intake and governed tracking.',
  });

  const [statusFilter, setStatusFilter] = useState<PrivacyRequestStatus | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);

  const listQ = useAdminPrivacyRequestList(statusFilter);

  if (guard.status !== 'ready') return guard.node;

  return (
    <AdminConsoleShell
      title="Privacy Requests"
      subtitle="Intake, verify, and track access/correction/deletion/restriction requests. Data operations happen in their authoritative flows."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <ShieldQuestion className="h-3 w-3" />
          {listQ.data ? `${listQ.data.total} in view` : 'Loading…'}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter ?? 'WORKING'}
          onValueChange={(v) => {
            setSelectedId(null);
            setStatusFilter(v === 'WORKING' ? undefined : (v as PrivacyRequestStatus));
          }}
        >
          <SelectTrigger className="h-9 w-[210px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WORKING" className="text-xs">
              Working set (not terminal)
            </SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9" onClick={() => setIntakeOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Record request
        </Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {listQ.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading requests…
            </div>
          ) : null}

          {listQ.isError ? <p className="p-3 text-xs text-rose-600">Failed to load requests. Try again.</p> : null}

          {!listQ.isLoading && listQ.data?.requests.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">No privacy requests in this view.</p>
          ) : null}

          <ul className="space-y-1">
            {(listQ.data?.requests ?? []).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selectedId === r.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{r.requestNumber}</span>
                    <span className="flex items-center gap-1">
                      {r.legalHold ? (
                        <Badge className={`text-[10px] ${selectedId === r.id ? 'bg-white/10 text-white' : 'bg-rose-50 text-rose-700'}`}>
                          HOLD
                        </Badge>
                      ) : null}
                      <Badge className={`text-[10px] ${selectedId === r.id ? 'bg-white/10 text-white' : STATUS_BADGE[r.status]}`}>
                        {r.status}
                      </Badge>
                    </span>
                  </div>
                  <div className={selectedId === r.id ? 'text-slate-300' : 'text-slate-400'}>
                    [{r.type}] {r.userEmail} · due {fmtDate(r.dueAt)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {selectedId ? (
            <PrivacyDetailPanel requestId={selectedId} />
          ) : (
            <AdminRouteState
              state="empty"
              title="No request selected"
              description="Select a privacy request to see its lifecycle and actions."
            />
          )}
        </div>
      </div>

      <IntakeDialog open={intakeOpen} onOpenChange={setIntakeOpen} />
    </AdminConsoleShell>
  );
}
