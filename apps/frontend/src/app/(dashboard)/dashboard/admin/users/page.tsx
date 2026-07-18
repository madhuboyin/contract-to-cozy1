'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/users/page.tsx
//
// Admin-only User & Account Support workspace (ADMIN_MODULE_FRD.md §10.1).
// Search a user, view a support-safe summary, revoke sessions, or change
// account status through a governed transition with a required reason.

import React, { useState } from 'react';
import { Loader2, Search, ShieldAlert, UserCog } from 'lucide-react';
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
  useAdminUserSearch,
  useAdminUserSummary,
  useChangeAdminUserStatus,
  useRevokeAdminUserSessions,
} from '@/hooks/useAdminUserSupport';
import type { GovernedUserStatus, UserSearchResult } from '@/lib/api/adminUserSupport';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  SUSPENDED: 'bg-rose-50 text-rose-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  PENDING_VERIFICATION: 'bg-amber-50 text-amber-700',
};

const GOVERNED_STATUSES: GovernedUserStatus[] = ['ACTIVE', 'SUSPENDED', 'INACTIVE'];

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
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

// ─── Summary panel ──────────────────────────────────────────────────────────────

function UserSummaryPanel({ userId }: { userId: string }) {
  const { toast } = useToast();
  const summaryQ = useAdminUserSummary(userId);
  const revoke = useRevokeAdminUserSessions(userId);
  const changeStatus = useChangeAdminUserStatus(userId);

  const [revokeOpen, setRevokeOpen] = useState(false);
  const [statusDialog, setStatusDialog] = useState<GovernedUserStatus | null>(null);

  if (summaryQ.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading account summary…
      </div>
    );
  }

  if (summaryQ.isError || !summaryQ.data) {
    return (
      <AdminRouteState
        state="error"
        title="Failed to load account summary"
        description="The user may no longer exist, or the request failed. Try searching again."
      />
    );
  }

  const user = summaryQ.data;
  const otherGovernedStatuses = GOVERNED_STATUSES.filter((s) => s !== user.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {user.firstName} {user.lastName}
          </h3>
          <p className="text-xs text-slate-500">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            {user.role}
          </Badge>
          <Badge className={`text-[11px] ${STATUS_BADGE[user.status] ?? ''}`}>{user.status}</Badge>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12px] sm:grid-cols-3">
        <div>
          <dt className="text-slate-400">Email verified</dt>
          <dd className="font-medium text-slate-700">{user.emailVerified ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt className="text-slate-400">MFA enabled</dt>
          <dd className="font-medium text-slate-700">{user.mfaEnabled ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Active sessions</dt>
          <dd className="font-medium text-slate-700">{user.activeSessionCount}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Last login</dt>
          <dd className="font-medium text-slate-700">{fmtDate(user.lastLoginAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Account created</dt>
          <dd className="font-medium text-slate-700">{fmtDate(user.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Terms accepted</dt>
          <dd className="font-medium text-slate-700">
            {user.tosAcceptedAt ? `${fmtDate(user.tosAcceptedAt)} (v${user.tosVersion ?? '—'})` : 'Not recorded'}
          </dd>
        </div>
      </dl>

      {user.homeownerProfile ? (
        <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
          <p className="font-semibold text-slate-600">Homeowner profile</p>
          <p className="text-slate-500">
            {user.homeownerProfile.propertyCount}{' '}
            propert{user.homeownerProfile.propertyCount === 1 ? 'y' : 'ies'}
          </p>
        </div>
      ) : null}

      {user.providerProfile ? (
        <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
          <p className="font-semibold text-slate-600">Provider profile</p>
          <p className="text-slate-500">
            {user.providerProfile.businessName} ({user.providerProfile.businessType ?? '—'}) ·{' '}
            {user.providerProfile.status} · {user.providerProfile.averageRating.toFixed(1)}★ /{' '}
            {user.providerProfile.totalReviews} reviews
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <Button variant="outline" size="sm" onClick={() => setRevokeOpen(true)}>
          <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
          Revoke sessions{user.activeSessionCount > 0 ? ` (${user.activeSessionCount})` : ''}
        </Button>

        <Select onValueChange={(value) => setStatusDialog(value as GovernedUserStatus)}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="Change account status…" />
          </SelectTrigger>
          <SelectContent>
            {otherGovernedStatuses.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                Set status to {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReasonConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="Revoke all sessions"
        description={`This immediately signs ${user.email} out everywhere and invalidates their current access token.`}
        confirmLabel="Revoke sessions"
        destructive
        pending={revoke.isPending}
        onConfirm={(reason) => {
          revoke.mutate(reason, {
            onSuccess: (result) => {
              setRevokeOpen(false);
              toast({ title: 'Sessions revoked', description: `${result.revokedSessionCount} session(s) revoked.` });
            },
            onError: (err: any) => {
              toast({ title: 'Failed to revoke sessions', description: err?.message, variant: 'destructive' });
            },
          });
        }}
      />

      <ReasonConfirmDialog
        open={statusDialog !== null}
        onOpenChange={(next) => !next && setStatusDialog(null)}
        title={`Set status to ${statusDialog ?? ''}`}
        description={
          statusDialog === 'ACTIVE'
            ? 'Reactivates the account. Provider listings are not automatically re-enabled.'
            : 'This immediately revokes all active sessions and, for a provider, deactivates their listed services.'
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
                toast({ title: 'Status updated', description: `Account status set to ${statusDialog}.` });
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

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function AdminUserSupportPage() {
  const guard = useAdminGuard({
    title: 'User & Account Support',
    subtitle: 'Search accounts, review support-safe details, and take governed actions.',
  });

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const searchQ = useAdminUserSearch(searchTerm);

  if (guard.status !== 'ready') return guard.node;

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSelectedUserId(null);
    setSearchTerm(query);
  }

  return (
    <AdminConsoleShell
      title="User & Account Support"
      subtitle="Search accounts, review support-safe details, and take governed actions with a required reason."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <UserCog className="h-3 w-3" />
          Session revoke &amp; status change
        </span>
      }
    >
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="h-9 max-w-sm text-sm"
        />
        <Button type="submit" size="sm" className="h-9" disabled={!query.trim()}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          Search
        </Button>
      </form>

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {searchQ.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : null}

          {searchQ.isError ? (
            <p className="p-3 text-xs text-rose-600">Search failed. Try again.</p>
          ) : null}

          {!searchQ.isLoading && searchTerm && searchQ.data?.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">No users matched &ldquo;{searchTerm}&rdquo;.</p>
          ) : null}

          {!searchTerm ? (
            <p className="p-3 text-xs text-slate-400">Search by name or email to find an account.</p>
          ) : null}

          <ul className="space-y-1">
            {(searchQ.data ?? []).map((u: UserSearchResult) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedUserId(u.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selectedUserId === u.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold">
                    {u.firstName} {u.lastName}
                  </div>
                  <div className={selectedUserId === u.id ? 'text-slate-300' : 'text-slate-400'}>{u.email}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {selectedUserId ? (
            <UserSummaryPanel userId={selectedUserId} />
          ) : (
            <AdminRouteState
              state="empty"
              title="No account selected"
              description="Search for a user and select a result to view their support-safe account summary."
            />
          )}
        </div>
      </div>
    </AdminConsoleShell>
  );
}
