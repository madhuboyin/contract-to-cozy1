// apps/frontend/src/app/(dashboard)/dashboard/bookings/[id]/page.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { Booking } from '@/types';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/bookings/StatusBadge';
import { BookingTimeline } from '@/components/bookings/BookingTimeline';
import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  MobilePageIntro,
  MobileToolWorkspace,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'Not scheduled';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (dateString: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getBookingTone = (status: Booking['status']) => {
  if (status === 'COMPLETED') return 'good';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'DRAFT') return 'elevated';
  if (status === 'DISPUTED') return 'danger';
  return 'info';
};

export default function BookingDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{
    kind: 'NOT_FOUND' | 'REQUEST_FAILED';
    message?: string;
  } | null>(null);

  const fetchBooking = useCallback(async () => {
    try {
      setLoading(true);
      setErrorState(null);
      const response = await api.getBooking(params.id as string);
      if (response.success) {
        setBooking(response.data);
      }
    } catch (error: unknown) {
      console.error('Error fetching booking:', error);
      setBooking(null);
      const status = (error as { status?: number })?.status;
      if (status === 404) {
        setErrorState({ kind: 'NOT_FOUND' });
      } else {
        const message = error instanceof Error ? error.message : undefined;
        setErrorState({
          kind: 'REQUEST_FAILED',
          message,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  if (loading) {
    return (
      <MobileToolWorkspace
        intro={<MobilePageIntro title="Booking Details" subtitle="Loading booking details..." />}
      >
        <div className="flex items-center justify-center rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand-primary" />
        </div>
      </MobileToolWorkspace>
    );
  }

  if (!booking) {
    const isRequestFailure = errorState?.kind === 'REQUEST_FAILED';
    return (
      <MobileToolWorkspace
        intro={<MobilePageIntro title="Booking Details" subtitle="Unable to load this booking." />}
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
          <p className="text-sm text-rose-700">
            {isRequestFailure ? 'Unable to load booking details right now.' : 'Booking not found'}
          </p>
          {isRequestFailure && errorState?.message ? (
            <p className="mt-1 text-xs text-rose-600">{errorState.message}</p>
          ) : null}
          <ActionPriorityRow
            className="mt-3"
            primaryAction={
              isRequestFailure ? (
                <Button onClick={fetchBooking} className="w-full">
                  Retry
                </Button>
              ) : undefined
            }
            secondaryActions={
              <Button
                onClick={() => router.push('/dashboard/bookings')}
                variant={isRequestFailure ? 'outline' : 'default'}
              >
                Back to bookings
              </Button>
            }
          />
        </div>
        <BottomSafeAreaReserve size="chatAware" />
      </MobileToolWorkspace>
    );
  }

  const displayPrice = Number(booking.finalPrice || booking.estimatedPrice || 0);
  const statusLabel = formatEnumLabel(booking.status);
  const statusTone = getBookingTone(booking.status);
  const scheduledDateLabel = formatDate(booking.scheduledDate);
  const scheduledTimeLabel = formatTime(booking.scheduledDate) || 'Time TBD';

  return (
    <MobileToolWorkspace
      intro={
        <div className="space-y-3">
          <button
            onClick={() => router.back()}
            className="flex min-h-[44px] items-center text-sm text-[hsl(var(--mobile-text-secondary))] transition-colors hover:text-[hsl(var(--mobile-text-primary))]"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to bookings
          </button>
          <MobilePageIntro
            title="Booking Details"
            subtitle="Service, provider, and pricing details in a compact view."
          />
        </div>
      }
      summary={
        <ResultHeroCard
          eyebrow={booking.bookingNumber}
          title={booking.service.name}
          value={`$${displayPrice.toFixed(2)}`}
          status={<StatusChip tone={statusTone}>{statusLabel}</StatusChip>}
          summary={`${booking.provider.businessName} • ${scheduledDateLabel}`}
          highlights={[
            `${formatEnumLabel(booking.category)} service`,
            `Scheduled at ${scheduledTimeLabel}`,
            booking.finalPrice ? 'Final price posted' : 'Estimated price shown',
          ]}
        />
      }
    >
      <ScenarioInputCard
        title="Service Summary"
        subtitle="Core booking details and timeline."
        badge={<StatusBadge status={booking.status} />}
      >
        <ReadOnlySummaryBlock
          columns={2}
          items={[
            { label: 'Service', value: booking.service.name, emphasize: true },
            { label: 'Category', value: formatEnumLabel(booking.category) },
            { label: 'Date', value: scheduledDateLabel },
            { label: 'Time', value: scheduledTimeLabel },
          ]}
        />
      </ScenarioInputCard>

      <ScenarioInputCard title="Provider & Property" subtitle="Who is performing this work and where.">
        <ReadOnlySummaryBlock
          title="Provider"
          columns={2}
          items={[
            { label: 'Business', value: booking.provider.businessName, emphasize: true },
            { label: 'Contact', value: `${booking.provider.firstName} ${booking.provider.lastName}` },
            { label: 'Email', value: booking.provider.email || 'Unavailable' },
            { label: 'Phone', value: booking.provider.phone || 'Unavailable' },
          ]}
        />
        <ReadOnlySummaryBlock
          title="Property"
          columns={2}
          items={[
            { label: 'Name', value: booking.property.name || 'Primary property', emphasize: true },
            { label: 'Address', value: booking.property.address },
            { label: 'City/State', value: `${booking.property.city}, ${booking.property.state}` },
            { label: 'ZIP', value: booking.property.zipCode },
          ]}
        />
      </ScenarioInputCard>

      <ScenarioInputCard title="Pricing" subtitle="Booking amount breakdown.">
        <ReadOnlySummaryBlock
          columns={2}
          items={[
            {
              label: 'Estimated Price',
              value: `$${Number(booking.estimatedPrice || 0).toFixed(2)}`,
              emphasize: true,
            },
            {
              label: 'Final Price',
              value: booking.finalPrice ? `$${Number(booking.finalPrice).toFixed(2)}` : 'Not set',
            },
            {
              label: 'Deposit Paid',
              value: booking.depositAmount ? `$${Number(booking.depositAmount).toFixed(2)}` : 'None',
            },
            { label: 'Status', value: statusLabel },
          ]}
        />
      </ScenarioInputCard>

      {(booking.description || booking.specialRequests) && (
        <ScenarioInputCard title="Additional Details" subtitle="Service notes and requests.">
          {booking.description ? (
            <ReadOnlySummaryBlock
              items={[{ label: 'Description', value: booking.description }]}
            />
          ) : null}
          {booking.specialRequests ? (
            <ReadOnlySummaryBlock
              items={[{ label: 'Special Requests', value: booking.specialRequests }]}
            />
          ) : null}
        </ScenarioInputCard>
      )}

      {booking.timeline && booking.timeline.length > 0 ? (
        <ScenarioInputCard title="Booking Timeline" subtitle="Progress updates from request to completion.">
          <BookingTimeline currentStatus={booking.status} timeline={booking.timeline} />
        </ScenarioInputCard>
      ) : null}

      {booking.cancelledAt ? (
        <ScenarioInputCard
          title="Cancellation"
          subtitle="This booking was cancelled."
          className="border-rose-200/80 bg-rose-50/70"
        >
          <ReadOnlySummaryBlock
            className="border-rose-200/90 bg-white"
            items={[
              { label: 'Cancelled At', value: formatDateTime(booking.cancelledAt), emphasize: true },
              { label: 'Reason', value: booking.cancellationReason || 'No reason provided' },
            ]}
          />
        </ScenarioInputCard>
      ) : null}

      <ActionPriorityRow
        primaryAction={
          <Button className="w-full" onClick={() => router.push('/dashboard/bookings')}>
            Back to bookings
          </Button>
        }
      />
      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}
