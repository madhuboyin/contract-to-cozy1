'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/bookings/page.tsx
//
// Admin-only Booking Operations workspace (ADMIN_MODULE_FRD.md §10.3).
// Search bookings and inspect one booking's merged operational timeline.
// Read-only v1 — governed booking mutations are a later slice.

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, Loader2, Search } from 'lucide-react';
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
  useAdminBookingDetail,
  useAdminBookingSearch,
  useOpenBookingDisputeCase,
} from '@/hooks/useAdminBookingOps';
import type { BookingStatus } from '@/lib/api/adminBookingOps';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-sky-50 text-sky-700',
  IN_PROGRESS: 'bg-indigo-50 text-indigo-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  DISPUTED: 'bg-rose-50 text-rose-700',
};

const ALL_STATUSES: BookingStatus[] = [
  'DRAFT',
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
];

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function BookingDetailPanel({ bookingId }: { bookingId: string }) {
  const { toast } = useToast();
  const detailQ = useAdminBookingDetail(bookingId);
  const openDispute = useOpenBookingDisputeCase(bookingId);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading booking…
      </div>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <AdminRouteState
        state="error"
        title="Failed to load booking"
        description="The booking may no longer exist, or the request failed. Try selecting it again."
      />
    );
  }

  const b = detailQ.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {b.bookingNumber} · {b.service.name}
          </h3>
          <p className="text-xs text-slate-500">
            {b.homeowner.firstName} {b.homeowner.lastName} → {b.providerProfile.businessName} ·{' '}
            {b.property.city}, {b.property.state}
          </p>
        </div>
        <Badge className={`text-[11px] ${STATUS_BADGE[b.status] ?? ''}`}>{b.status}</Badge>
      </div>

      <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[13px] text-slate-700">
        {b.description}
      </p>

      {b.specialRequests ? (
        <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
          <p className="font-semibold text-slate-600">Special requests</p>
          <p className="whitespace-pre-wrap text-slate-500">{b.specialRequests}</p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
        <p className="font-semibold text-slate-600">Timeline</p>
        <ol className="mt-2 space-y-2">
          {b.events.map((e, i) => (
            <li key={`${e.kind}-${i}`} className="relative pl-4">
              <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-slate-700">{e.label}</span>
                <span className="text-slate-400">{fmtDate(e.at)}</span>
              </div>
              {e.note ? <p className="text-slate-500">{e.note}</p> : null}
            </li>
          ))}
        </ol>
      </div>

      {b.review ? (
        <p className="text-[11px] text-slate-400">
          Review on file: {b.review.rating}★ ({b.review.status}), submitted {fmtDate(b.review.createdAt)}
        </p>
      ) : null}

      <div className="border-t border-slate-100 pt-3">
        <Button size="sm" variant="outline" onClick={() => setDisputeOpen(true)}>
          Open dispute case
        </Button>
      </div>

      <Dialog
        open={disputeOpen}
        onOpenChange={(next) => {
          if (!next) setDisputeReason('');
          setDisputeOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open a dispute case for {b.bookingNumber}</DialogTitle>
            <DialogDescription>
              Creates a DISPUTE case linked to this booking (one open dispute case per booking). The booking&apos;s
              status is not changed.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="What is disputed? (required) — recorded as the case description"
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDisputeOpen(false)} disabled={openDispute.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={openDispute.isPending || !disputeReason.trim()}
              onClick={() =>
                openDispute.mutate(disputeReason.trim(), {
                  onSuccess: (created) => {
                    setDisputeOpen(false);
                    setDisputeReason('');
                    toast({ title: 'Dispute case opened', description: `${created.caseNumber} created.` });
                  },
                  onError: (err: any) => {
                    toast({ title: 'Failed to open dispute case', description: err?.message, variant: 'destructive' });
                  },
                })
              }
            >
              {openDispute.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Open dispute case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminBookingOpsPageInner() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status');

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | undefined>(
    initialStatus && (ALL_STATUSES as string[]).includes(initialStatus)
      ? (initialStatus as BookingStatus)
      : undefined,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchQ = useAdminBookingSearch(searchTerm, statusFilter);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSelectedId(null);
    setSearchTerm(query);
  }

  return (
    <AdminConsoleShell
      title="Booking Operations"
      subtitle="Search bookings and trace each booking's operational timeline."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <CalendarClock className="h-3 w-3" />
          {searchQ.data ? `${searchQ.data.total} bookings in view` : 'Loading…'}
        </span>
      }
    >
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by booking number…"
          className="h-9 max-w-sm text-sm"
        />
        <Select
          value={statusFilter ?? 'ALL'}
          onValueChange={(value) => {
            setSelectedId(null);
            setStatusFilter(value === 'ALL' ? undefined : (value as BookingStatus));
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

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {searchQ.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading bookings…
            </div>
          ) : null}

          {searchQ.isError ? <p className="p-3 text-xs text-rose-600">Failed to load bookings. Try again.</p> : null}

          {!searchQ.isLoading && searchQ.data?.bookings.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">No bookings matched.</p>
          ) : null}

          <ul className="space-y-1">
            {(searchQ.data?.bookings ?? []).map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(b.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selectedId === b.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{b.bookingNumber}</span>
                    <Badge
                      className={`text-[10px] ${selectedId === b.id ? 'bg-white/10 text-white' : STATUS_BADGE[b.status] ?? ''}`}
                    >
                      {b.status}
                    </Badge>
                  </div>
                  <div className={selectedId === b.id ? 'text-slate-300' : 'text-slate-400'}>
                    {b.service.name} · {b.homeowner.firstName} {b.homeowner.lastName} →{' '}
                    {b.providerProfile.businessName}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {selectedId ? (
            <BookingDetailPanel bookingId={selectedId} />
          ) : (
            <AdminRouteState
              state="empty"
              title="No booking selected"
              description="Select a booking to see its details and operational timeline."
            />
          )}
        </div>
      </div>
    </AdminConsoleShell>
  );
}

export default function AdminBookingOpsPage() {
  const guard = useAdminGuard({
    title: 'Booking Operations',
    subtitle: 'Search bookings and trace operational timelines.',
  });

  if (guard.status !== 'ready') return guard.node;

  return (
    <Suspense fallback={null}>
      <AdminBookingOpsPageInner />
    </Suspense>
  );
}
