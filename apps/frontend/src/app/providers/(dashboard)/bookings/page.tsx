// apps/frontend/src/app/providers/(dashboard)/bookings/page.tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, addHours } from 'date-fns';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  ReadOnlySummaryBlock,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderBookingQueueTemplate from '@/components/providers/ProviderBookingQueueTemplate';
import { MilestoneCelebration } from '@/components/ui/MilestoneCelebration';
import { useToast } from '@/components/ui/use-toast';
import { useCelebration } from '@/hooks/useCelebration';
import { api } from '@/lib/api/client';
import type { Booking } from '@/types';

type ActiveTab = 'pending' | 'confirmed' | 'completed';

const TAB_META = [
  { key: 'pending' as ActiveTab, label: 'Pending requests' },
  { key: 'confirmed' as ActiveTab, label: 'Confirmed jobs' },
  { key: 'completed' as ActiveTab, label: 'History' },
] as const;

function statusTone(status: string): 'good' | 'info' | 'needsAction' | 'danger' {
  if (status === 'COMPLETED') return 'good';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'PENDING') return 'needsAction';
  return 'info';
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'EEE, MMM d · h:mm a'); } catch { return d; }
}

export default function ProviderBookingsPage() {
  const { toast } = useToast();
  const { celebration, celebrate, dismiss } = useCelebration('provider-bookings-complete');
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['provider-bookings'],
    queryFn: async () => {
      const res = await api.listBookings({ limit: 50 });
      return res.success ? res.data.bookings : ([] as Booking[]);
    },
    staleTime: 60 * 1000,
  });

  const bookings = data ?? [];

  const filteredBookings = useMemo(() => {
    if (activeTab === 'pending') return bookings.filter((b) => b.status === 'PENDING');
    if (activeTab === 'confirmed')
      return bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS');
    return bookings.filter((b) => b.status === 'COMPLETED' || b.status === 'CANCELLED');
  }, [activeTab, bookings]);

  const counts = useMemo(() => ({
    pending: bookings.filter((b) => b.status === 'PENDING').length,
    confirmed: bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS').length,
    completed: bookings.filter((b) => b.status === 'COMPLETED' || b.status === 'CANCELLED').length,
  }), [bookings]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['provider-bookings'] });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.confirmBooking(id),
    onSuccess: (_, id) => {
      toast({ title: 'Booking accepted', description: `Booking moved to confirmed queue.` });
      invalidate();
    },
    onError: () => toast({ title: 'Could not accept booking', variant: 'destructive' }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelBooking(id, 'Provider declined'),
    onSuccess: () => {
      toast({ title: 'Booking declined', variant: 'destructive' });
      invalidate();
    },
    onError: () => toast({ title: 'Could not decline booking', variant: 'destructive' }),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.startBooking(id),
    onSuccess: () => {
      toast({ title: 'Job started', description: 'Status updated to In Progress.' });
      invalidate();
    },
    onError: () => toast({ title: 'Could not start job', variant: 'destructive' }),
  });

  const completeMutation = useMutation({
    mutationFn: (booking: Booking) => {
      const now = new Date().toISOString();
      const startTime = booking.actualStartTime || booking.startTime || booking.scheduledDate || now;
      return api.completeBooking(booking.id, {
        actualStartTime: startTime || now,
        actualEndTime: now,
        finalPrice: parseFloat(booking.estimatedPrice || '0'),
        internalNotes: 'Marked complete by provider',
      });
    },
    onSuccess: () => {
      celebrate('success');
      toast({ title: 'Job completed', description: 'Record saved to booking history.' });
      invalidate();
    },
    onError: () => toast({ title: 'Could not complete job', variant: 'destructive' }),
  });

  return (
    <ProviderBookingQueueTemplate
      activeTab={activeTab}
      tabs={TAB_META.map((t) => ({ key: t.key, label: t.label }))}
      onTabChange={(t) => setActiveTab(t as ActiveTab)}
      pendingCount={counts.pending}
      confirmedCount={counts.confirmed}
      historyCount={counts.completed}
      primaryAction={{
        eyebrow: 'Next Best Action',
        title: counts.pending > 0
          ? `Respond to ${counts.pending} pending request${counts.pending > 1 ? 's' : ''}`
          : 'Keep your queue response-ready',
        description: counts.pending > 0
          ? 'Fast acceptance or decline decisions improve homeowner trust and increase conversion.'
          : 'No pending requests right now. Confirm upcoming jobs and keep history accurate for trust.',
        primaryAction: (
          <button
            type="button"
            onClick={() => setActiveTab(counts.pending > 0 ? 'pending' : 'confirmed')}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            {counts.pending > 0 ? 'Open pending queue' : 'Review confirmed jobs'}
          </button>
        ),
        supportingAction: (
          <Link
            href="/providers/calendar"
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Update availability
          </Link>
        ),
        impactLabel: counts.pending > 0 ? 'High conversion impact' : 'Queue healthy',
        confidenceLabel: 'Confidence: based on live queue status and response-time patterns',
      }}
      trust={{
        confidenceLabel: 'Queue priority uses booking urgency, homeowner timing windows, and your current availability.',
        freshnessLabel: 'Bookings refresh after every homeowner request, acceptance, cancellation, or completion event.',
        sourceLabel: 'Booking requests, provider availability settings, and service scheduling records.',
        rationale: 'A transparent queue helps providers move quickly while giving homeowners clear expectations.',
      }}
    >
      {isLoading ? (
        <MobileCard variant="compact" className="py-10 text-center text-sm text-slate-400">
          Loading bookings…
        </MobileCard>
      ) : filteredBookings.length === 0 ? (
        <EmptyStateCard
          title="No bookings in this queue"
          description={
            activeTab === 'pending'
              ? "You don't have any pending booking requests."
              : activeTab === 'confirmed'
              ? "You don't have any confirmed jobs right now."
              : "You don't have completed or cancelled bookings yet."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filteredBookings.map((booking) => {
            const customerName = `${booking.homeowner.firstName} ${booking.homeowner.lastName}`;
            const address = `${booking.property.address}, ${booking.property.city}, ${booking.property.state}`;
            const price = booking.finalPrice || booking.estimatedPrice;

            return (
              <MobileCard key={booking.id} variant="compact" className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="mb-0 truncate text-sm font-semibold text-slate-900">{booking.service.name}</p>
                    <p className="mb-0 mt-0.5 text-xs text-slate-500">{address}</p>
                  </div>
                  <StatusChip tone={statusTone(booking.status)}>
                    {booking.status.replace('_', ' ')}
                  </StatusChip>
                </div>

                <ReadOnlySummaryBlock
                  items={[
                    { label: 'Scheduled', value: fmtDate(booking.scheduledDate), emphasize: true },
                    { label: 'Customer', value: customerName, hint: booking.homeowner.email },
                    { label: 'Price', value: price ? `$${parseFloat(price).toLocaleString()}` : '—', emphasize: true },
                    { label: 'Booking #', value: booking.bookingNumber },
                  ]}
                  columns={2}
                />

                {booking.specialRequests ? (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    <span className="font-semibold">Note:</span> {booking.specialRequests}
                  </div>
                ) : null}

                <ActionPriorityRow
                  primaryAction={
                    booking.status === 'PENDING' ? (
                      <button
                        type="button"
                        disabled={confirmMutation.isPending}
                        onClick={() => confirmMutation.mutate(booking.id)}
                        className="min-h-[40px] w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
                      >
                        Accept booking
                      </button>
                    ) : booking.status === 'CONFIRMED' ? (
                      <button
                        type="button"
                        disabled={startMutation.isPending}
                        onClick={() => startMutation.mutate(booking.id)}
                        className="min-h-[40px] w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
                      >
                        Start job
                      </button>
                    ) : booking.status === 'IN_PROGRESS' ? (
                      <button
                        type="button"
                        disabled={completeMutation.isPending}
                        onClick={() => completeMutation.mutate(booking)}
                        className="min-h-[40px] w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
                      >
                        Complete job
                      </button>
                    ) : (
                      <Link
                        href={`/providers/bookings/${booking.id}`}
                        className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                      >
                        View details
                      </Link>
                    )
                  }
                  secondaryActions={
                    booking.status === 'PENDING' || booking.status === 'CONFIRMED' ? (
                      <button
                        type="button"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(booking.id)}
                        className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {booking.status === 'PENDING' ? 'Decline' : 'Cancel'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        Created {fmtDate(booking.createdAt)}
                      </span>
                    )
                  }
                />
              </MobileCard>
            );
          })}
        </div>
      )}

      <BottomSafeAreaReserve size="chatAware" />
      <MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} />
    </ProviderBookingQueueTemplate>
  );
}
