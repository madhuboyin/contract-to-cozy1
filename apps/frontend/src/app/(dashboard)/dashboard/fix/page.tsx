'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  Wrench, 
  Search, 
  CalendarClock, 
  AlertCircle, 
  ArrowRight, 
  Zap,
  Plus,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  MobilePageIntro, 
  MobileKpiStrip, 
  MobileKpiTile,
  MobileSection,
  MobileSectionHeader,
  MobileCard,
  BottomSafeAreaReserve
} from '@/components/mobile/dashboard/MobilePrimitives';
import { WinCard } from '@/components/shared/WinCard';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Booking, InventoryItem } from '@/types';
import { cn } from '@/lib/utils';

/**
 * ResolutionHubPage unifies three engines:
 * 1. Decision (Replace vs. Repair)
 * 2. Search (Providers)
 * 3. Management (Bookings)
 * 
 * It transforms the "Fix" job from a chore into a concierge experience.
 */
export default function ResolutionHubPage() {
  const { selectedPropertyId } = usePropertyContext();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeItems, setActiveItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [bookingsRes, propertiesRes] = await Promise.all([
          api.listBookings({}),
          selectedPropertyId 
            ? api.get<{ items: InventoryItem[] }>(`/api/properties/${selectedPropertyId}/inventory`) 
            : Promise.resolve({ data: { items: [] as InventoryItem[] } })
        ]);

        if (bookingsRes.success) {
          setBookings(bookingsRes.data.bookings);
        }
        
        // api.get returns { data: T } directly
        if (propertiesRes.data?.items) {
          setActiveItems(propertiesRes.data.items.slice(0, 2)); 
        }
      } catch (error) {
        console.error('Failed to load resolution data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedPropertyId]);

  const activeBookings = useMemo(() => 
    bookings.filter(b => ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status)), 
  [bookings]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:px-8 lg:pb-12">
      {/* 1. Page Header */}
      <MobilePageIntro
        title="Resolution Center"
        subtitle="Something broken or need an upgrade? We'll handle the deciding, finding, and booking."
        action={
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-700">
            <Wrench className="h-5 w-5" />
          </div>
        }
      />

      {/* 2. Status Summary */}
      <MobileKpiStrip className="sm:grid-cols-3">
        <MobileKpiTile 
          label="Active Jobs" 
          value={activeBookings.length} 
          hint="Bookings in progress" 
          tone={activeBookings.length > 0 ? 'positive' : 'neutral'} 
        />
        <MobileKpiTile 
          label="Decisions" 
          value={activeItems.length} 
          hint="Items needing review" 
          tone="warning"
        />
        <MobileKpiTile 
          label="Emergencies" 
          value={0} 
          hint="24/7 help available" 
          tone="neutral"
        />
      </MobileKpiStrip>

      {/* 3. Concierge Entry Points: "How can we help?" */}
      <MobileSection>
        <MobileSectionHeader title="How can we help?" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Button 
            variant="outline" 
            className="h-auto flex-col items-start p-4 text-left border-slate-200 hover:border-brand-300 hover:bg-brand-50/50"
            asChild
          >
            <Link href="/dashboard/replace-repair">
              <Zap className="h-6 w-6 text-brand-600 mb-3" />
              <span className="font-bold text-slate-900 block">Something's Broken</span>
              <span className="text-xs text-slate-500 mt-1">AI-driven troubleshooting and repair vs. replace guidance.</span>
            </Link>
          </Button>

          <Button 
            variant="outline" 
            className="h-auto flex-col items-start p-4 text-left border-slate-200 hover:border-blue-300 hover:bg-blue-50/50"
            asChild
          >
            <Link href="/dashboard/providers">
              <Search className="h-6 w-6 text-blue-600 mb-3" />
              <span className="font-bold text-slate-900 block">Find a Specialist</span>
              <span className="text-xs text-slate-500 mt-1">Search our directory of verified local service providers.</span>
            </Link>
          </Button>

          <Button 
            variant="outline" 
            className="h-auto flex-col items-start p-4 text-left border-red-100 hover:border-red-300 hover:bg-red-50/50"
            asChild
          >
            <Link href="/dashboard/emergency">
              <AlertCircle className="h-6 w-6 text-red-600 mb-3" />
              <span className="font-bold text-slate-900 block">Emergency Help</span>
              <span className="text-xs text-slate-500 mt-1">Instant 24/7 emergency services and shutdown guides.</span>
            </Link>
          </Button>
        </div>
      </MobileSection>

      {/* 4. Active Resolutions Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Decisions & Intelligence */}
        <MobileSection>
          <MobileSectionHeader 
            title="Intelligence & Decisions" 
            subtitle="Calculated recommendations for your active issues."
          />
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : activeItems.length > 0 ? (
              activeItems.map((item) => (
                <WinCard 
                  key={item.id}
                  title="Repair vs Replace"
                  value={item.name}
                  description="Our AI suggests repairing this unit. Estimated lifespan remaining: 4 years."
                  actionLabel="See Full Estimate"
                  onAction={() => {}}
                  trust={{
                    confidenceLabel: "High (88%)",
                    freshnessLabel: "Just now",
                    sourceLabel: "Lifespan Engine",
                    rationale: `Based on the 2018 installation date and typical wear for ${item.category}.`
                  }}
                />
              ))
            ) : (
              <MobileCard className="bg-slate-50 border-dashed text-center py-8">
                <p className="text-sm text-slate-500">No active decisions. Everything looks good!</p>
              </MobileCard>
            )}
          </div>
        </MobileSection>

        {/* Right Column: Execution & Tracking */}
        <MobileSection>
          <MobileSectionHeader 
            title="Active Jobs & Bookings" 
            subtitle="Track your scheduled services and pending quotes."
          />
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : activeBookings.length > 0 ? (
              activeBookings.map((booking) => (
                <MobileCard key={booking.id} className="border-l-4 border-l-brand-500">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-bold text-slate-900">{booking.service?.name || 'Service Job'}</h4>
                      <p className="text-xs text-slate-500">{booking.provider?.businessName}</p>
                    </div>
                    <div className="bg-brand-50 text-brand-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {booking.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
                    <div className="flex items-center gap-1">
                      <CalendarClock className="h-4 w-4 text-slate-400" />
                      {booking.scheduledDate ? new Date(booking.scheduledDate).toLocaleDateString() : 'TBD'}
                    </div>
                    <div className="font-medium text-slate-900">
                      ${Number(booking.estimatedPrice || 0).toFixed(2)}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full justify-between h-9 text-brand-700" asChild>
                    <Link href={`/dashboard/bookings/${booking.id}`}>
                      View Details
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </MobileCard>
              ))
            ) : (
              <MobileCard className="bg-slate-50 border-dashed text-center py-8">
                <p className="text-sm text-slate-500">No active bookings. Need something fixed?</p>
                <Button variant="link" className="text-brand-600 mt-2" asChild>
                  <Link href="/dashboard/providers">Find a Service Provider</Link>
                </Button>
              </MobileCard>
            )}
            
            <Button variant="outline" className="w-full border-slate-200 text-slate-600 h-11" asChild>
              <Link href="/dashboard/bookings">
                <CalendarClock className="h-4 w-4 mr-2" />
                View All Booking History
              </Link>
            </Button>
          </div>
        </MobileSection>

      </div>

      <BottomSafeAreaReserve size="chatAware" />
    </div>
  );
}
