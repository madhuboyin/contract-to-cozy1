// apps/frontend/src/app/providers/(dashboard)/dashboard/page.tsx
'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { resolveIconByConcept, resolveIconByToken } from '@/lib/icons';
import {
  BottomSafeAreaReserve,
  CompactEntityRow,
  EmptyStateCard,
  MobileCard,
  MobileKpiStrip,
  MobileKpiTile,
  MobileSection,
  MobileSectionHeader,
  QuickActionGrid,
  QuickActionTile,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';
import { format, parseISO } from 'date-fns';
import type { Booking } from '@/types';

function statusTone(status: string): 'needsAction' | 'info' | 'good' | 'danger' {
  if (status === 'PENDING') return 'needsAction';
  if (status === 'CONFIRMED' || status === 'IN_PROGRESS') return 'info';
  if (status === 'COMPLETED') return 'good';
  return 'danger';
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'MMM d, h:mm a'); } catch { return d; }
}

export default function ProviderDashboardPage() {
  const { user } = useAuth();

  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['provider-bookings-summary'],
    queryFn: async () => {
      const res = await api.listBookings({ limit: 50 });
      return res.success ? res.data.bookings : ([] as Booking[]);
    },
    staleTime: 2 * 60 * 1000,
  });

  const bookings = bookingsData ?? [];
  const pending = bookings.filter((b) => b.status === 'PENDING');
  const todayJobs = bookings.filter((b) => {
    if (!b.scheduledDate) return false;
    try {
      const d = parseISO(b.scheduledDate);
      const today = new Date();
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    } catch { return false; }
  });
  const completed = bookings.filter((b) => b.status === 'COMPLETED');
  const totalRevenue = completed.reduce((sum, b) => sum + parseFloat(b.finalPrice || b.estimatedPrice || '0'), 0);

  const recentBookings = bookings
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const ManageServicesIcon = resolveIconByConcept('maintenance');
  const UpdateCalendarIcon = resolveIconByConcept('calendar');
  const ReviewBookingsIcon = resolveIconByToken('clipboard-list');
  const PortfolioIcon = resolveIconByToken('file-check');

  return (
    <ProviderShellTemplate
      title={`Welcome back${user?.firstName ? `, ${user.firstName}` : ''}`}
      subtitle="Today's bookings, priorities, and business pulse at a glance."
      eyebrow="Provider Command Center"
      primaryAction={{
        eyebrow: 'Priority Lead Brief',
        title: pending.length > 0
          ? `${pending.length} booking request${pending.length > 1 ? 's' : ''} awaiting your response.`
          : 'Your queue is clear — great response time.',
        description: pending.length > 0
          ? 'Fast acceptance improves homeowner trust and conversion rate.'
          : 'No pending requests right now. Keep your calendar updated to attract more leads.',
        primaryAction: (
          <Link
            href="/providers/bookings"
            className="no-brand-style inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            {pending.length > 0 ? 'Respond to pending requests' : 'View booking queue'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ),
        impactLabel: pending.length > 0 ? `${pending.length} pending` : 'Queue clear',
        confidenceLabel: 'Live from your booking queue',
      }}
      trust={{
        confidenceLabel: 'Lead prioritization blends request urgency, service fit, distance, and current calendar availability.',
        freshnessLabel: 'Bookings refresh when requests arrive or change.',
        sourceLabel: 'Homeowner booking requests, provider service catalog, and calendar availability.',
        rationale: 'Showing one next-best lead first keeps response time low and protects conversion quality.',
      }}
      summary={
        <MobileKpiStrip className="sm:grid-cols-4">
          <MobileKpiTile
            label="Pending"
            value={isLoading ? '…' : pending.length}
            hint="Awaiting response"
            tone={pending.length > 0 ? 'warning' : 'neutral'}
          />
          <MobileKpiTile
            label="Today"
            value={isLoading ? '…' : todayJobs.length}
            hint="Jobs scheduled"
            tone={todayJobs.length > 0 ? 'positive' : 'neutral'}
          />
          <MobileKpiTile
            label="Revenue"
            value={isLoading ? '…' : `$${Math.round(totalRevenue).toLocaleString()}`}
            hint="All-time completed"
          />
          <MobileKpiTile
            label="Completed"
            value={isLoading ? '…' : completed.length}
            hint="Total jobs done"
            tone={completed.length > 0 ? 'positive' : 'neutral'}
          />
        </MobileKpiStrip>
      }
    >
      <MobileSection>
        <MobileSectionHeader title="Quick Actions" subtitle="Jump to the most common provider workflows." />
        <QuickActionGrid>
          <QuickActionTile
            title="Manage Services"
            subtitle="Update pricing and active offerings"
            icon={<ManageServicesIcon className="h-6 w-6" />}
            href="/providers/services"
            badgeLabel={null}
          />
          <QuickActionTile
            title="Update Calendar"
            subtitle="Set schedule and availability"
            icon={<UpdateCalendarIcon className="h-6 w-6" />}
            href="/providers/calendar"
            badgeLabel={null}
          />
          <QuickActionTile
            title="Review Bookings"
            subtitle="Handle new requests quickly"
            icon={<ReviewBookingsIcon className="h-6 w-6" />}
            href="/providers/bookings"
            badgeLabel={pending.length > 0 ? String(pending.length) : null}
          />
          <QuickActionTile
            title="Portfolio"
            subtitle="Showcase recent projects"
            icon={<PortfolioIcon className="h-6 w-6" />}
            href="/providers/portfolio"
            badgeLabel={null}
          />
        </QuickActionGrid>
      </MobileSection>

      <MobileSection>
        <MobileSectionHeader
          title="Recent Bookings"
          subtitle="Latest requests and completed jobs."
          action={
            <Link href="/providers/bookings" className="text-xs font-semibold text-brand-primary hover:underline">
              View all
            </Link>
          }
        />

        {isLoading ? (
          <MobileCard variant="compact" className="py-8 text-center text-sm text-slate-400">
            Loading bookings…
          </MobileCard>
        ) : recentBookings.length === 0 ? (
          <EmptyStateCard
            title="No bookings yet"
            description="Once homeowners book your services, they'll appear here."
          />
        ) : (
          <div className="space-y-2.5">
            {recentBookings.map((b) => (
              <CompactEntityRow
                key={b.id}
                title={b.service.name}
                subtitle={`${b.property.address}, ${b.property.city}, ${b.property.state}`}
                meta={`${b.homeowner.firstName} ${b.homeowner.lastName} · ${fmtDate(b.scheduledDate)}`}
                status={<StatusChip tone={statusTone(b.status)}>{b.status.replace('_', ' ')}</StatusChip>}
                href="/providers/bookings"
              />
            ))}
          </div>
        )}
      </MobileSection>

      {!isLoading && pending.length === 0 && (
        <MobileCard variant="compact" className="bg-[linear-gradient(145deg,#ecfeff,#eef2ff)]">
          <p className="mb-0 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Performance tip</p>
          <p className="mb-0 mt-1 text-sm font-semibold text-slate-900">Responding within 2 hours drives repeat bookings.</p>
          <p className="mb-0 mt-1 text-xs text-slate-600">Fast responses consistently improve conversion and review quality.</p>
        </MobileCard>
      )}

      <BottomSafeAreaReserve size="chatAware" />
    </ProviderShellTemplate>
  );
}
