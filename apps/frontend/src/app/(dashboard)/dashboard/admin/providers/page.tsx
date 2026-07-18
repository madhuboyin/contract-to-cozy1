'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/providers/page.tsx
//
// Admin-only Provider Operations directory (ADMIN_MODULE_FRD.md §10.2).
// Search the provider directory, inspect one provider's operational context
// (credentials, compliance alerts, bookings, reviews, listings), and take a
// governed marketplace-status action with a required reason.

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Briefcase, Loader2, Search } from 'lucide-react';
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
  useAdminProviderDetail,
  useAdminProviderSearch,
  useChangeAdminProviderStatus,
} from '@/hooks/useAdminProviderOps';
import type { GovernedProviderStatus, ProviderStatus } from '@/lib/api/adminProviderOps';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  SUSPENDED: 'bg-rose-50 text-rose-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700',
};

const GOVERNED_STATUSES: GovernedProviderStatus[] = ['ACTIVE', 'SUSPENDED', 'INACTIVE'];
const ALL_STATUSES: ProviderStatus[] = ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'SUSPENDED'];

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

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

function ProviderDetailPanel({ providerProfileId }: { providerProfileId: string }) {
  const { toast } = useToast();
  const detailQ = useAdminProviderDetail(providerProfileId);
  const changeStatus = useChangeAdminProviderStatus(providerProfileId);
  const [statusDialog, setStatusDialog] = useState<GovernedProviderStatus | null>(null);

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading provider…
      </div>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <AdminRouteState
        state="error"
        title="Failed to load provider"
        description="The provider may no longer exist, or the request failed. Try searching again."
      />
    );
  }

  const p = detailQ.data;
  const otherStatuses = GOVERNED_STATUSES.filter((s) => s !== p.status);
  const activeServiceCount = p.services.filter((s) => s.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{p.businessName}</h3>
          <p className="text-xs text-slate-500">
            {p.user.firstName} {p.user.lastName} · {p.user.email} · account {p.user.status}
          </p>
        </div>
        <Badge className={`text-[11px] ${STATUS_BADGE[p.status] ?? ''}`}>{p.status}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12px] sm:grid-cols-3">
        <div>
          <dt className="text-slate-400">Rating</dt>
          <dd className="font-medium text-slate-700">
            {p.averageRating.toFixed(1)}★ / {p.totalReviews} reviews
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Completed jobs</dt>
          <dd className="font-medium text-slate-700">{p.totalCompletedJobs}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Active listings</dt>
          <dd className="font-medium text-slate-700">
            {activeServiceCount} of {p.services.length}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Insurance / License</dt>
          <dd className="font-medium text-slate-700">
            {p.insuranceVerified ? 'Verified' : 'Unverified'} / {p.licenseVerified ? 'Verified' : 'Unverified'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Background check</dt>
          <dd className="font-medium text-slate-700">{fmtDate(p.backgroundCheckDate)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Last login</dt>
          <dd className="font-medium text-slate-700">{fmtDate(p.user.lastLoginAt)}</dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
          <p className="font-semibold text-slate-600">Bookings</p>
          <p className="text-slate-500">
            {Object.entries(p.bookingCounts).length === 0
              ? 'No bookings yet'
              : Object.entries(p.bookingCounts)
                  .map(([status, count]) => `${count} ${status.toLowerCase()}`)
                  .join(' · ')}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
          <p className="font-semibold text-slate-600">Reviews</p>
          <p className="text-slate-500">
            {Object.entries(p.reviewCounts).length === 0
              ? 'No reviews yet'
              : Object.entries(p.reviewCounts)
                  .map(([status, count]) => `${count} ${status.toLowerCase()}`)
                  .join(' · ')}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
        <p className="font-semibold text-slate-600">Credentials ({p.credentials.length})</p>
        {p.credentials.length === 0 ? (
          <p className="text-slate-400">No credentials on file.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {p.credentials.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-slate-500">
                <Badge variant="outline" className="text-[10px]">
                  {c.status}
                </Badge>
                <span>
                  {c.type} · {c.issuingAuthority} · expires {fmtDate(c.expiryDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {p.complianceAlerts.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-[12px]">
          <p className="font-semibold text-amber-700">Open compliance alerts ({p.complianceAlerts.length})</p>
          <ul className="mt-1 space-y-1">
            {p.complianceAlerts.map((a) => (
              <li key={a.id} className="text-amber-800">
                [{a.severity}] {a.title}
                {a.summary ? ` — ${a.summary}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <Select onValueChange={(value) => setStatusDialog(value as GovernedProviderStatus)}>
          <SelectTrigger className="h-8 w-[240px] text-xs">
            <SelectValue placeholder="Change marketplace status…" />
          </SelectTrigger>
          <SelectContent>
            {otherStatuses.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                Set status to {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReasonConfirmDialog
        open={statusDialog !== null}
        onOpenChange={(next) => !next && setStatusDialog(null)}
        title={`Set provider status to ${statusDialog ?? ''}`}
        description={
          statusDialog === 'ACTIVE'
            ? 'Reinstates the provider. Their service listings are not automatically re-enabled — the provider must relist.'
            : 'This removes the provider from the marketplace and deactivates all of their service listings.'
        }
        confirmLabel={`Confirm: set to ${statusDialog ?? ''}`}
        destructive={statusDialog !== 'ACTIVE'}
        pending={changeStatus.isPending}
        onConfirm={(reason) => {
          if (!statusDialog) return;
          changeStatus.mutate(
            { status: statusDialog, reason },
            {
              onSuccess: () => {
                setStatusDialog(null);
                toast({ title: 'Status updated', description: `Provider status set to ${statusDialog}.` });
              },
              onError: (err: any) => {
                toast({ title: 'Failed to change status', description: err?.message, variant: 'destructive' });
              },
            },
          );
        }}
      />
    </div>
  );
}

function AdminProviderOpsPageInner() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status');

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProviderStatus | undefined>(
    initialStatus && (ALL_STATUSES as string[]).includes(initialStatus)
      ? (initialStatus as ProviderStatus)
      : undefined,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchQ = useAdminProviderSearch(searchTerm, statusFilter);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSelectedId(null);
    setSearchTerm(query);
  }

  return (
    <AdminConsoleShell
      title="Provider Operations"
      subtitle="Search the provider directory, review operational context, and take governed marketplace actions."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <Briefcase className="h-3 w-3" />
          {searchQ.data ? `${searchQ.data.total} providers in view` : 'Loading…'}
        </span>
      }
    >
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by business, name, or email…"
          className="h-9 max-w-sm text-sm"
        />
        <Select
          value={statusFilter ?? 'ALL'}
          onValueChange={(value) => {
            setSelectedId(null);
            setStatusFilter(value === 'ALL' ? undefined : (value as ProviderStatus));
          }}
        >
          <SelectTrigger className="h-9 w-[190px] text-xs">
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

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {searchQ.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading directory…
            </div>
          ) : null}

          {searchQ.isError ? <p className="p-3 text-xs text-rose-600">Failed to load providers. Try again.</p> : null}

          {!searchQ.isLoading && searchQ.data?.providers.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">No providers matched.</p>
          ) : null}

          <ul className="space-y-1">
            {(searchQ.data?.providers ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selectedId === p.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{p.businessName}</span>
                    <Badge
                      className={`text-[10px] ${selectedId === p.id ? 'bg-white/10 text-white' : STATUS_BADGE[p.status] ?? ''}`}
                    >
                      {p.status}
                    </Badge>
                  </div>
                  <div className={selectedId === p.id ? 'text-slate-300' : 'text-slate-400'}>
                    {p.user.firstName} {p.user.lastName} · {p.averageRating.toFixed(1)}★
                    {p.pendingCredentialCount > 0 ? ` · ${p.pendingCredentialCount} pending credential(s)` : ''}
                    {p.openComplianceAlertCount > 0 ? ` · ${p.openComplianceAlertCount} alert(s)` : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {selectedId ? (
            <ProviderDetailPanel providerProfileId={selectedId} />
          ) : (
            <AdminRouteState
              state="empty"
              title="No provider selected"
              description="Select a provider from the directory to see their operational context."
            />
          )}
        </div>
      </div>
    </AdminConsoleShell>
  );
}

export default function AdminProviderOpsPage() {
  const guard = useAdminGuard({
    title: 'Provider Operations',
    subtitle: 'Directory, credentials, compliance, and governed marketplace actions.',
  });

  if (guard.status !== 'ready') return guard.node;

  return (
    <Suspense fallback={null}>
      <AdminProviderOpsPageInner />
    </Suspense>
  );
}
