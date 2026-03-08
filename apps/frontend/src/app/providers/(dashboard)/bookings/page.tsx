// apps/frontend/src/app/providers/(dashboard)/bookings/page.tsx

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobileFilterSurface,
  MobileKpiStrip,
  MobileKpiTile,
  MobilePageIntro,
  MobileToolWorkspace,
  ReadOnlySummaryBlock,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

interface Booking {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  serviceType: string;
  propertyAddress: string;
  scheduledDate: string;
  customerName: string;
  customerEmail: string;
  price: number;
  notes?: string;
  createdAt: string;
}

const TAB_META = [
  { key: 'pending', label: 'Pending requests' },
  { key: 'confirmed', label: 'Confirmed jobs' },
  { key: 'completed', label: 'History' },
] as const;

function mapStatusTone(status: BookingStatus): 'good' | 'info' | 'needsAction' | 'danger' {
  if (status === 'COMPLETED') return 'good';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'PENDING') return 'needsAction';
  return 'info';
}

export default function ProviderBookingsPage() {
  const [activeTab, setActiveTab] = useState<(typeof TAB_META)[number]['key']>('pending');
  const [bookings] = useState<Booking[]>([
    {
      id: '1',
      bookingNumber: 'B-2025-000123',
      status: 'PENDING',
      serviceType: 'Home Inspection',
      propertyAddress: '123 Main St, Princeton, NJ 08540',
      scheduledDate: '2025-11-15T10:00:00',
      customerName: 'John Smith',
      customerEmail: 'john@example.com',
      price: 450,
      notes: 'Please call before arrival',
      createdAt: '2025-11-10T08:30:00',
    },
    {
      id: '2',
      bookingNumber: 'B-2025-000122',
      status: 'CONFIRMED',
      serviceType: 'Minor Repairs',
      propertyAddress: '456 Oak Ave, Trenton, NJ 08608',
      scheduledDate: '2025-11-12T14:00:00',
      customerName: 'Sarah Johnson',
      customerEmail: 'sarah@example.com',
      price: 250,
      createdAt: '2025-11-09T15:20:00',
    },
    {
      id: '3',
      bookingNumber: 'B-2025-000121',
      status: 'COMPLETED',
      serviceType: 'Pest Inspection',
      propertyAddress: '789 Elm St, Hamilton, NJ 08610',
      scheduledDate: '2025-11-07T09:00:00',
      customerName: 'Mike Davis',
      customerEmail: 'mike@example.com',
      price: 350,
      createdAt: '2025-11-05T11:45:00',
    },
  ]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      if (activeTab === 'pending') return booking.status === 'PENDING';
      if (activeTab === 'confirmed') return booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS';
      return booking.status === 'COMPLETED' || booking.status === 'CANCELLED';
    });
  }, [activeTab, bookings]);

  const counts = useMemo(
    () => ({
      pending: bookings.filter((b) => b.status === 'PENDING').length,
      confirmed: bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS').length,
      completed: bookings.filter((b) => b.status === 'COMPLETED' || b.status === 'CANCELLED').length,
    }),
    [bookings]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleConfirm = (bookingId: string) => {
    alert(`Confirming booking ${bookingId}`);
  };

  const handleCancel = (bookingId: string) => {
    if (confirm('Are you sure you want to cancel this booking?')) {
      alert(`Cancelling booking ${bookingId}`);
    }
  };

  const handleStart = (bookingId: string) => {
    alert(`Starting job ${bookingId}`);
  };

  const handleComplete = (bookingId: string) => {
    alert(`Completing job ${bookingId}`);
  };

  return (
    <MobileToolWorkspace
      intro={<MobilePageIntro title="Bookings" subtitle="Manage incoming requests and scheduled jobs." />}
      summary={
        <MobileKpiStrip className="sm:grid-cols-3">
          <MobileKpiTile label="Pending" value={counts.pending} hint="Needs response" tone={counts.pending > 0 ? 'warning' : 'neutral'} />
          <MobileKpiTile label="Confirmed" value={counts.confirmed} hint="Upcoming jobs" tone={counts.confirmed > 0 ? 'positive' : 'neutral'} />
          <MobileKpiTile label="History" value={counts.completed} hint="Closed jobs" />
        </MobileKpiStrip>
      }
      filters={
        <MobileFilterSurface className="space-y-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Queue</p>
          <div className="inline-flex w-full gap-1 rounded-xl bg-slate-100 p-1">
            {TAB_META.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-[36px] flex-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </MobileFilterSurface>
      }
    >
      {filteredBookings.length === 0 ? (
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
          {filteredBookings.map((booking) => (
            <MobileCard key={booking.id} variant="compact" className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="mb-0 truncate text-sm font-semibold text-slate-900">{booking.serviceType}</p>
                  <p className="mb-0 mt-0.5 text-xs text-slate-500">{booking.propertyAddress}</p>
                </div>
                <StatusChip tone={mapStatusTone(booking.status)}>{booking.status.replace('_', ' ')}</StatusChip>
              </div>

              <ReadOnlySummaryBlock
                items={[
                  { label: 'Scheduled', value: formatDate(booking.scheduledDate), emphasize: true },
                  { label: 'Customer', value: booking.customerName, hint: booking.customerEmail },
                  { label: 'Price', value: `$${booking.price}`, emphasize: true },
                  { label: 'Booking #', value: booking.bookingNumber },
                ]}
                columns={2}
              />

              {booking.notes ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  <span className="font-semibold">Note:</span> {booking.notes}
                </div>
              ) : null}

              <ActionPriorityRow
                primaryAction={
                  booking.status === 'PENDING' ? (
                    <button
                      type="button"
                      onClick={() => handleConfirm(booking.id)}
                      className="min-h-[40px] w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                    >
                      Accept booking
                    </button>
                  ) : booking.status === 'CONFIRMED' ? (
                    <button
                      type="button"
                      onClick={() => handleStart(booking.id)}
                      className="min-h-[40px] w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                    >
                      Start job
                    </button>
                  ) : booking.status === 'IN_PROGRESS' ? (
                    <button
                      type="button"
                      onClick={() => handleComplete(booking.id)}
                      className="min-h-[40px] w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
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
                      onClick={() => handleCancel(booking.id)}
                      className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {booking.status === 'PENDING' ? 'Decline' : 'Cancel'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500">Created {formatDate(booking.createdAt)}</span>
                  )
                }
              />
            </MobileCard>
          ))}
        </div>
      )}

      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}
