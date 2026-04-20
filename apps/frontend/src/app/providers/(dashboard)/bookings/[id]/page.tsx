'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  MobileCard,
  ReadOnlySummaryBlock,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api/client';
import { formatEnumLabel } from '@/lib/utils/formatters';
import type { Booking } from '@/types';

function statusTone(status: string): 'good' | 'info' | 'needsAction' | 'danger' {
  if (status === 'COMPLETED') return 'good';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'PENDING') return 'needsAction';
  return 'info';
}

function fmtDate(date: string | null) {
  if (!date) return '—';
  try {
    return format(parseISO(date), 'EEE, MMM d · h:mm a');
  } catch {
    return date;
  }
}

function timelineLabel(status: Booking['status']) {
  if (status === 'PENDING') return 'Request received';
  if (status === 'CONFIRMED') return 'Booking confirmed';
  if (status === 'IN_PROGRESS') return 'Job in progress';
  if (status === 'COMPLETED') return 'Job completed';
  if (status === 'CANCELLED') return 'Booking cancelled';
  return formatEnumLabel(status);
}

export default function ProviderBookingDetailPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const bookingId = params?.id;

  const bookingQuery = useQuery({
    queryKey: ['provider-booking-detail', bookingId],
    queryFn: async () => {
      if (!bookingId) return null;
      const res = await api.getBooking(bookingId);
      return res.success ? res.data : null;
    },
    enabled: Boolean(bookingId),
  });

  const invalidateBookingQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['provider-bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['provider-bookings-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['provider-booking-detail', bookingId] }),
    ]);
  };

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.confirmBooking(id),
    onSuccess: async () => {
      toast({ title: 'Booking accepted', description: 'Booking moved to confirmed queue.' });
      await invalidateBookingQueries();
    },
    onError: () => toast({ title: 'Could not accept booking', variant: 'destructive' }),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.startBooking(id),
    onSuccess: async () => {
      toast({ title: 'Job started', description: 'Status updated to In Progress.' });
      await invalidateBookingQueries();
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
        finalPrice: parseFloat(booking.finalPrice || booking.estimatedPrice || '0'),
        internalNotes: booking.internalNotes || 'Marked complete by provider',
      });
    },
    onSuccess: async () => {
      toast({ title: 'Job completed', description: 'Record saved to booking history.' });
      await invalidateBookingQueries();
    },
    onError: () => toast({ title: 'Could not complete job', variant: 'destructive' }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelBooking(id, 'Provider cancelled via booking detail'),
    onSuccess: async () => {
      toast({ title: 'Booking cancelled', variant: 'destructive' });
      await invalidateBookingQueries();
    },
    onError: () => toast({ title: 'Could not cancel booking', variant: 'destructive' }),
  });

  const booking = bookingQuery.data;

  return (
    <ProviderShellTemplate
      title="Booking Details"
      subtitle="Review homeowner context, scheduling details, and update status without leaving the queue."
      eyebrow="Provider Booking"
      primaryAction={{
        title: booking ? `${booking.service.name} · ${booking.bookingNumber}` : 'Load booking details',
        description: booking
          ? 'Use this page to keep homeowners informed and keep your workflow moving.'
          : 'Fetch booking details and verify the next action.',
        primaryAction: (
          <button
            type="button"
            onClick={() => router.push('/providers/bookings')}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            Back to booking queue
          </button>
        ),
        supportingAction: (
          <Link
            href="/providers/calendar"
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Review calendar
          </Link>
        ),
        impactLabel: booking ? `Status: ${formatEnumLabel(booking.status)}` : 'Pending fetch',
        confidenceLabel: 'Live booking records and timeline updates',
      }}
      routeState={
        bookingQuery.isLoading
          ? {
              state: 'loading',
              title: 'Loading booking details',
              description: 'Fetching the latest booking information.',
            }
          : bookingQuery.isError
          ? {
              state: 'error',
              title: 'Unable to load this booking',
              description: 'Try refreshing or return to your booking queue.',
              action: (
                <button
                  type="button"
                  onClick={() => bookingQuery.refetch()}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                >
                  Retry
                </button>
              ),
              secondaryAction: (
                <button
                  type="button"
                  onClick={() => router.push('/providers/bookings')}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back to queue
                </button>
              ),
            }
          : !booking
          ? {
              state: 'empty',
              title: 'Booking not found',
              description: 'This booking may have been removed or is no longer available to your account.',
              action: (
                <button
                  type="button"
                  onClick={() => router.push('/providers/bookings')}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                >
                  Back to queue
                </button>
              ),
            }
          : null
      }
      hideContentWhenState={!booking}
    >
      {booking ? (
        <div className="space-y-3">
          <MobileCard variant="compact" className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="mb-0 truncate text-sm font-semibold text-slate-900">{booking.service.name}</p>
                <p className="mb-0 mt-0.5 text-xs text-slate-500">
                  {booking.property.address}, {booking.property.city}, {booking.property.state}
                </p>
              </div>
              <StatusChip tone={statusTone(booking.status)}>
                {formatEnumLabel(booking.status)}
              </StatusChip>
            </div>

            <ReadOnlySummaryBlock
              columns={2}
              items={[
                { label: 'Booking #', value: booking.bookingNumber, emphasize: true },
                { label: 'Scheduled', value: fmtDate(booking.scheduledDate) },
                {
                  label: 'Price',
                  value: `$${parseFloat(booking.finalPrice || booking.estimatedPrice || '0').toLocaleString()}`,
                  emphasize: true,
                },
                {
                  label: 'Customer',
                  value: `${booking.homeowner.firstName} ${booking.homeowner.lastName}`,
                  hint: booking.homeowner.email,
                },
              ]}
            />

            {booking.specialRequests ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <span className="font-semibold">Customer note:</span> {booking.specialRequests}
              </div>
            ) : null}
          </MobileCard>

          {booking.timeline && booking.timeline.length > 0 ? (
            <MobileCard variant="compact" className="space-y-2.5">
              <p className="mb-0 text-sm font-semibold text-slate-900">Timeline</p>
              <div className="space-y-2">
                {booking.timeline.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="mb-0 text-xs font-semibold text-slate-800">{timelineLabel(entry.status)}</p>
                      <p className="mb-0 text-[11px] text-slate-500">{fmtDate(entry.createdAt)}</p>
                    </div>
                    {entry.note ? <p className="mb-0 mt-1 text-xs text-slate-600">{entry.note}</p> : null}
                  </div>
                ))}
              </div>
            </MobileCard>
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
                <button
                  type="button"
                  onClick={() => router.push('/providers/bookings')}
                  className="min-h-[40px] w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                >
                  Back to queue
                </button>
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
              ) : null
            }
          />
        </div>
      ) : null}

      <BottomSafeAreaReserve size="chatAware" />
    </ProviderShellTemplate>
  );
}
