'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/payments/page.tsx
//
// Admin-only Payment Operations workspace (ADMIN_MODULE_FRD.md §10.4).
// Search the local payment ledger, inspect a payment with its refund
// history, open refund requests, and decide the pending refund queue.
// Record-and-govern only — approving a request moves no money; execution
// ships with a payment-provider integration.

import React, { useState } from 'react';
import { CreditCard, Loader2, Search } from 'lucide-react';
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
  useAdminPaymentDetail,
  useAdminPaymentSearch,
  useAdminRefundQueue,
  useCreateAdminRefundRequest,
  useDecideAdminRefundRequest,
} from '@/hooks/useAdminPaymentOps';
import type { PaymentStatus, RefundQueueRow } from '@/lib/api/adminPaymentOps';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  AUTHORIZED: 'bg-sky-50 text-sky-700',
  CAPTURED: 'bg-emerald-50 text-emerald-700',
  REFUNDED: 'bg-indigo-50 text-indigo-700',
  FAILED: 'bg-rose-50 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-rose-50 text-rose-700',
};

const ALL_STATUSES: PaymentStatus[] = ['PENDING', 'AUTHORIZED', 'CAPTURED', 'REFUNDED', 'FAILED', 'CANCELLED'];

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtAmount(value: string | null, currency = 'USD'): string {
  if (value === null) return '—';
  return `${Number(value).toFixed(2)} ${currency}`;
}

// ─── Refund request dialog ─────────────────────────────────────────────────────

function RefundRequestDialog({
  open,
  onOpenChange,
  maxAmount,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maxAmount: number;
  pending: boolean;
  onConfirm: (amount: number, reason: string, policyBasis?: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [policyBasis, setPolicyBasis] = useState('');

  const parsed = Number(amount);
  const amountValid = Number.isFinite(parsed) && parsed > 0 && parsed <= maxAmount;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setAmount('');
          setReason('');
          setPolicyBasis('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a refund request</DialogTitle>
          <DialogDescription>
            Requires separate approval by another administrator. Maximum refundable: {maxAmount.toFixed(2)}.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Amount (up to ${maxAmount.toFixed(2)})`}
          inputMode="decimal"
          className="h-9 text-sm"
        />
        <Input
          value={policyBasis}
          onChange={(e) => setPolicyBasis(e.target.value)}
          placeholder="Policy basis (optional, e.g. refund-policy §3.2)"
          className="h-9 text-sm"
        />
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
            disabled={pending || !amountValid || !reason.trim()}
            onClick={() => onConfirm(parsed, reason.trim(), policyBasis.trim() || undefined)}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Decision dialog ───────────────────────────────────────────────────────────

function DecideDialog({
  target,
  onOpenChange,
  pending,
  onConfirm,
}: {
  target: { request: RefundQueueRow; decision: 'APPROVE' | 'REJECT' } | null;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

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
            {target?.decision === 'APPROVE' ? 'Approve' : 'Reject'} refund of {target ? fmtAmount(target.request.amount) : ''}
          </DialogTitle>
          <DialogDescription>
            {target?.decision === 'APPROVE'
              ? 'Approval is a governed decision record — no money moves until refund execution ships.'
              : 'The requester will see the rejection reason.'}
          </DialogDescription>
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
            variant={target?.decision === 'REJECT' ? 'destructive' : 'default'}
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Confirm {target?.decision.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Payment detail panel ──────────────────────────────────────────────────────

function PaymentDetailPanel({ paymentId }: { paymentId: string }) {
  const { toast } = useToast();
  const detailQ = useAdminPaymentDetail(paymentId);
  const createRefund = useCreateAdminRefundRequest(paymentId);
  const [refundOpen, setRefundOpen] = useState(false);

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payment…
      </div>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <AdminRouteState
        state="error"
        title="Failed to load payment"
        description="The payment may no longer exist, or the request failed."
      />
    );
  }

  const p = detailQ.data;
  const remaining = Number(p.amount) - Number(p.refundedAmount ?? 0);
  const canRequestRefund =
    (p.status === 'CAPTURED' || p.status === 'REFUNDED') &&
    remaining > 0 &&
    !p.refundRequests.some((r) => r.status === 'PENDING_APPROVAL');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {fmtAmount(p.amount, p.currency)} · {p.booking.bookingNumber}
          </h3>
          <p className="text-xs text-slate-500">
            {p.booking.homeowner.firstName} {p.booking.homeowner.lastName} →{' '}
            {p.booking.providerProfile.businessName} · created {fmtDate(p.createdAt)}
          </p>
        </div>
        <Badge className={`text-[11px] ${STATUS_BADGE[p.status] ?? ''}`}>{p.status}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12px] sm:grid-cols-3">
        <div>
          <dt className="text-slate-400">Deposit</dt>
          <dd className="font-medium text-slate-700">{p.isDeposit ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Refunded</dt>
          <dd className="font-medium text-slate-700">
            {fmtAmount(p.refundedAmount, p.currency)}
            {p.refundedAt ? ` (${fmtDate(p.refundedAt)})` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Payment intent</dt>
          <dd className="break-all font-medium text-slate-700">{p.stripePaymentIntentId ?? '—'}</dd>
        </div>
        {p.failureReason ? (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-slate-400">Failure reason</dt>
            <dd className="font-medium text-rose-700">{p.failureReason}</dd>
          </div>
        ) : null}
      </dl>

      <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
        <p className="font-semibold text-slate-600">Refund requests ({p.refundRequests.length})</p>
        {p.refundRequests.length === 0 ? <p className="text-slate-400">No refund requests.</p> : null}
        <ul className="mt-1 space-y-2">
          {p.refundRequests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-2">
              <Badge className={`text-[10px] ${STATUS_BADGE[r.status] ?? ''}`}>{r.status}</Badge>
              <span className="font-medium text-slate-700">{fmtAmount(r.amount, p.currency)}</span>
              <span className="text-slate-500">{r.reason}</span>
              {r.decisionReason ? <span className="text-slate-400">Decision: {r.decisionReason}</span> : null}
            </li>
          ))}
        </ul>
      </div>

      {canRequestRefund ? (
        <div className="border-t border-slate-100 pt-3">
          <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>
            Request refund (up to {remaining.toFixed(2)})
          </Button>
        </div>
      ) : null}

      <RefundRequestDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        maxAmount={remaining}
        pending={createRefund.isPending}
        onConfirm={(amount, reason, policyBasis) => {
          createRefund.mutate(
            { amount, reason, policyBasis },
            {
              onSuccess: () => {
                setRefundOpen(false);
                toast({ title: 'Refund requested', description: 'Awaiting approval by another administrator.' });
              },
              onError: (err: any) => {
                toast({ title: 'Failed to request refund', description: err?.message, variant: 'destructive' });
              },
            },
          );
        }}
      />
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function AdminPaymentOpsPage() {
  const { toast } = useToast();
  const guard = useAdminGuard({
    title: 'Payment Operations',
    subtitle: 'Local payment ledger, refund requests, and two-person refund decisions.',
  });

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decideTarget, setDecideTarget] = useState<{ request: RefundQueueRow; decision: 'APPROVE' | 'REJECT' } | null>(null);

  const searchQ = useAdminPaymentSearch(searchTerm, statusFilter);
  const refundQueueQ = useAdminRefundQueue();
  const decide = useDecideAdminRefundRequest();

  if (guard.status !== 'ready') return guard.node;

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSelectedId(null);
    setSearchTerm(query);
  }

  return (
    <AdminConsoleShell
      title="Payment Operations"
      subtitle="Search the local ledger and govern refunds. Approving a refund records the decision — execution ships with the payment integration."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <CreditCard className="h-3 w-3" />
          {refundQueueQ.data ? `${refundQueueQ.data.total} refund request(s) pending` : 'Loading…'}
        </span>
      }
    >
      {refundQueueQ.data && refundQueueQ.data.requests.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-xs font-semibold text-amber-800">Refund requests pending approval</p>
          <ul className="mt-2 space-y-1">
            {refundQueueQ.data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-amber-900">
                <span className="font-semibold">{fmtAmount(r.amount, r.payment.currency)}</span>
                <span>· {r.payment.booking.bookingNumber}</span>
                <span className="text-amber-700">· {r.reason}</span>
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDecideTarget({ request: r, decision: 'APPROVE' })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDecideTarget({ request: r, decision: 'REJECT' })}>
                    Reject
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by booking number or payment-intent id…"
          className="h-9 max-w-sm text-sm"
        />
        <Select
          value={statusFilter ?? 'ALL'}
          onValueChange={(value) => {
            setSelectedId(null);
            setStatusFilter(value === 'ALL' ? undefined : (value as PaymentStatus));
          }}
        >
          <SelectTrigger className="h-9 w-[170px] text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">
              All statuses
            </SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" className="h-9">
          <Search className="mr-1.5 h-3.5 w-3.5" />
          Search
        </Button>
      </form>

      {searchQ.data ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {searchQ.data.ledgerSummary.map((row) => (
            <span key={row.status} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {row.status}: {row.count} · {fmtAmount(row.totalAmount)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {searchQ.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading payments…
            </div>
          ) : null}

          {searchQ.isError ? <p className="p-3 text-xs text-rose-600">Failed to load payments. Try again.</p> : null}

          {!searchQ.isLoading && searchQ.data?.payments.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">No payments matched.</p>
          ) : null}

          <ul className="space-y-1">
            {(searchQ.data?.payments ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selectedId === p.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{fmtAmount(p.amount, p.currency)}</span>
                    <Badge className={`text-[10px] ${selectedId === p.id ? 'bg-white/10 text-white' : STATUS_BADGE[p.status] ?? ''}`}>
                      {p.status}
                    </Badge>
                  </div>
                  <div className={selectedId === p.id ? 'text-slate-300' : 'text-slate-400'}>
                    {p.booking.bookingNumber} · {p.booking.providerProfile.businessName}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {selectedId ? (
            <PaymentDetailPanel paymentId={selectedId} />
          ) : (
            <AdminRouteState
              state="empty"
              title="No payment selected"
              description="Select a payment to see its detail and refund history."
            />
          )}
        </div>
      </div>

      <DecideDialog
        target={decideTarget}
        onOpenChange={(next) => !next && setDecideTarget(null)}
        pending={decide.isPending}
        onConfirm={(reason) => {
          if (!decideTarget) return;
          decide.mutate(
            { requestId: decideTarget.request.id, decision: decideTarget.decision, reason },
            {
              onSuccess: (result) => {
                setDecideTarget(null);
                toast({ title: 'Decision recorded', description: `Refund request ${result.status}.` });
              },
              onError: (err: any) => {
                toast({ title: 'Failed to decide', description: err?.message, variant: 'destructive' });
              },
            },
          );
        }}
      />
    </AdminConsoleShell>
  );
}
