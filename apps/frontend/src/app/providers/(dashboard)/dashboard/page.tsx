// apps/frontend/src/app/providers/(dashboard)/dashboard/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { resolveIconByConcept, resolveIconByToken } from '@/lib/icons';
import {
  BottomSafeAreaReserve,
  CompactEntityRow,
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

export default function ProviderDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    pendingBookings: 0,
    todayBookings: 0,
    monthlyRevenue: 0,
    avgRating: 0,
  });

  useEffect(() => {
    setStats({
      pendingBookings: 3,
      todayBookings: 2,
      monthlyRevenue: 4250,
      avgRating: 4.8,
    });
  }, []);

  const ManageServicesIcon = resolveIconByConcept('maintenance');
  const UpdateCalendarIcon = resolveIconByConcept('calendar');
  const ReviewBookingsIcon = resolveIconByToken('clipboard-list');
  const PortfolioIcon = resolveIconByToken('file-check');

  return (
    <ProviderShellTemplate
      title={`Welcome back${user?.firstName ? `, ${user.firstName}` : ''}`}
      subtitle="Today’s bookings, priorities, and business pulse at a glance."
      eyebrow="Provider Command Center"
      primaryAction={{
        eyebrow: 'Priority Lead Brief',
        title: 'Highest-converting lead is waiting now.',
        description: 'A home inspection request nearby is still unclaimed and best aligned with your current calendar.',
        primaryAction: (
          <Link
            href="/providers/bookings"
            className="no-brand-style inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            Respond to priority lead
            <ArrowRight className="h-4 w-4" />
          </Link>
        ),
        impactLabel: 'Expected value $340',
        confidenceLabel: 'Lead fit 92% • ETA 1 min',
      }}
      trust={{
        confidenceLabel: 'Lead prioritization blends request urgency, service fit, distance, and current calendar availability.',
        freshnessLabel: 'Lead and queue signals update when requests arrive or schedule state changes.',
        sourceLabel: 'Homeowner booking requests, provider service catalog, and calendar availability.',
        rationale: 'Showing one next-best lead first keeps response time low and protects conversion quality.',
      }}
      summary={
        <MobileKpiStrip className="sm:grid-cols-4">
          <MobileKpiTile label="Pending" value={stats.pendingBookings} hint="Awaiting response" tone={stats.pendingBookings > 0 ? 'warning' : 'neutral'} />
          <MobileKpiTile label="Today" value={stats.todayBookings} hint="Jobs scheduled" tone={stats.todayBookings > 0 ? 'positive' : 'neutral'} />
          <MobileKpiTile label="Month" value={`$${stats.monthlyRevenue.toLocaleString()}`} hint="Revenue" />
          <MobileKpiTile label="Rating" value={stats.avgRating.toFixed(1)} hint="Average score" tone={stats.avgRating >= 4.5 ? 'positive' : 'neutral'} />
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
            badgeLabel={null}
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

        <div className="space-y-2.5">
          <CompactEntityRow
            title="Home Inspection Request"
            subtitle="123 Main St, Princeton, NJ"
            meta="Requested 2 hours ago"
            status={<StatusChip tone="needsAction">Pending</StatusChip>}
            href="/providers/bookings"
          />
          <CompactEntityRow
            title="Minor Repairs"
            subtitle="456 Oak Ave, Trenton, NJ"
            meta="Scheduled for Nov 12, 2025"
            status={<StatusChip tone="info">Confirmed</StatusChip>}
            href="/providers/bookings"
          />
          <CompactEntityRow
            title="Pest Inspection"
            subtitle="789 Elm St, Hamilton, NJ"
            meta="Completed Nov 7, 2025"
            status={<StatusChip tone="good">Completed</StatusChip>}
            href="/providers/bookings"
          />
        </div>
      </MobileSection>

      <MobileCard variant="compact" className="bg-[linear-gradient(145deg,#ecfeff,#eef2ff)]">
        <p className="mb-0 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Performance tip</p>
        <p className="mb-0 mt-1 text-sm font-semibold text-slate-900">Responding within 2 hours drives repeat bookings.</p>
        <p className="mb-0 mt-1 text-xs text-slate-600">Fast responses consistently improve conversion and review quality.</p>
      </MobileCard>

      <BottomSafeAreaReserve size="chatAware" />
    </ProviderShellTemplate>
  );
}
