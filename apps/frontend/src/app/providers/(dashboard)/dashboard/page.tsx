// apps/frontend/src/app/providers/(dashboard)/dashboard/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  BottomSafeAreaReserve,
  CompactEntityRow,
  MobileCard,
  MobileKpiStrip,
  MobileKpiTile,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  MobileToolWorkspace,
  QuickActionGrid,
  QuickActionTile,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

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

  return (
    <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <MobilePageIntro
          title={`Welcome back${user?.firstName ? `, ${user.firstName}` : ''}`}
          subtitle="Today’s bookings, priorities, and business pulse at a glance."
        />
      }
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
          <QuickActionTile title="Manage Services" subtitle="Update pricing and active offerings" icon="🔧" href="/providers/services" badgeLabel={null} />
          <QuickActionTile
            title="Update Calendar"
            subtitle="Set schedule and availability"
            icon={<CalendarDays className="h-6 w-6" />}
            href="/providers/calendar"
            badgeLabel={null}
          />
          <QuickActionTile title="Review Bookings" subtitle="Handle new requests quickly" icon="📅" href="/providers/bookings" badgeLabel={null} />
          <QuickActionTile title="Portfolio" subtitle="Showcase recent projects" icon="📸" href="/providers/portfolio" badgeLabel={null} />
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
    </MobileToolWorkspace>
  );
}
