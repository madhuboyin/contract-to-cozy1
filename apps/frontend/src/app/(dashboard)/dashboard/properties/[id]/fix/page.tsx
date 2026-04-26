'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { 
  Wrench, 
  Search, 
  CalendarClock, 
  AlertCircle, 
  ArrowRight, 
  Zap,
  Scale,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  MobilePageIntro, 
  MobileKpiTile,
  MobileSection,
  MobileSectionHeader,
  MobileCard,
  BottomSafeAreaReserve
} from '@/components/mobile/dashboard/MobilePrimitives';
import { WinCard } from '@/components/shared/WinCard';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Booking, ScoredProperty } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { listIncidents } from '../incidents/incidentsApi';
import {
  consolidateUrgentActions,
  getChecklistEntries,
  resolveUrgentActionHref,
  UrgentActionItem,
} from '@/lib/dashboard/urgentActions';

function priorityActionTone(action: UrgentActionItem): {
  confidenceLabel: string;
  sourceLabel: string;
  rationale: string;
} {
  if (action.type === 'INCIDENT') {
    return {
      confidenceLabel: action.severity || 'WARNING',
      sourceLabel: 'Incident monitoring',
      rationale: 'Triggered by a live property signal that needs attention.',
    };
  }
  if (action.type === 'HEALTH_INSIGHT') {
    return {
      confidenceLabel: 'High confidence',
      sourceLabel: 'Health score engine',
      rationale: 'This action directly affects your property health score.',
    };
  }
  if (action.type === 'RENEWAL_EXPIRED' || action.type === 'RENEWAL_UPCOMING') {
    return {
      confidenceLabel: 'Time-sensitive',
      sourceLabel: 'Coverage tracking',
      rationale: 'Coverage timing can create avoidable exposure if missed.',
    };
  }
  return {
    confidenceLabel: 'Needs action',
    sourceLabel: 'Maintenance tracking',
    rationale: 'This item is overdue and should be resolved soon.',
  };
}

/**
 * ResolutionHubPage unifies three engines:
 * 1. Decision (Replace vs. Repair)
 * 2. Search (Providers)
 * 3. Management (Bookings)
 * 
 * It transforms the "Fix" job from a chore into a concierge experience.
 */
export default function ResolutionHubPage() {
  const params = useParams<{ id: string | string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolutions, setResolutions] = useState<any[]>([]);
  const [priorityActions, setPriorityActions] = useState<UrgentActionItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const focusSection = searchParams.get('focus');
  const priorityActionCount = priorityActions.slice(0, 3).length;
  const activeIncidentsCount = priorityActions.filter((action) => action.type === 'INCIDENT').length;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [
        bookingsRes,
        resolutionsRes,
        propertiesRes,
        checklistRes,
        warrantiesRes,
        policiesRes,
        incidentsRes,
      ] = await Promise.all([
        api.listBookings({ propertyId: propertyId || undefined }),
        propertyId
          ? api.getPropertyResolutions(propertyId)
          : Promise.resolve({ success: true, data: [] }),
        api.getProperties().catch(() => ({ success: false, data: { properties: [] } })),
        api.getHomeBuyerChecklist().catch(() => ({ success: false, data: null })),
        api.listWarranties(propertyId || undefined).catch(() => ({ success: false, data: { warranties: [] } })),
        api.listInsurancePolicies(propertyId || undefined).catch(() => ({ success: false, data: { policies: [] } })),
        propertyId
          ? listIncidents({ propertyId, limit: 10 }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ]);

      let bookingsFailed = false;
      let resolutionsFailed = false;

      if (bookingsRes.success) {
        setBookings(bookingsRes.data.bookings);
      } else {
        setBookings([]);
        bookingsFailed = true;
      }

      if (resolutionsRes.success) {
        setResolutions(resolutionsRes.data);
      } else {
        setResolutions([]);
        resolutionsFailed = true;
      }

      const scoredProperties = propertiesRes.success
        ? (propertiesRes.data.properties
            .filter((property) => !propertyId || property.id === propertyId)
            .map((property) => ({
              ...property,
              healthScore: (property as unknown as ScoredProperty).healthScore || {
                totalScore: 0,
                baseScore: 0,
                unlockedScore: 0,
                maxPotentialScore: 0,
                maxBaseScore: 0,
                maxExtraScore: 0,
                insights: [],
                ctaNeeded: false,
              },
            })) as ScoredProperty[])
        : [];
      const checklist = checklistRes.success ? checklistRes.data : null;
      const warranties = warrantiesRes.success ? warrantiesRes.data.warranties : [];
      const policies = policiesRes.success ? policiesRes.data.policies : [];
      const activeIncidents = (incidentsRes as { items?: any[] }).items ?? [];

      setPriorityActions(
        consolidateUrgentActions(
          scoredProperties,
          getChecklistEntries(checklist),
          warranties,
          policies,
          activeIncidents,
        ),
      );

      if (bookingsFailed && resolutionsFailed) {
        setLoadError('We could not load Fix data right now. Please try again.');
      } else {
        setLoadError(null);
      }
    } catch (error) {
      console.error('Failed to load resolution data:', error);
      setLoadError('We could not load Fix data right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const activeBookings = useMemo(() => 
    bookings.filter(b => ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status)), 
  [bookings]);

  return (
    <ErrorBoundary 
      fallback={
        <div className="mx-auto max-w-7xl p-6 text-center py-20">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Wrench className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Resolution Hub Standby</h1>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto">
            We&apos;re reconnecting with our service provider network. Please refresh in a few moments.
          </p>
          <Button className="mt-8 rounded-xl h-11 px-8 bg-brand-600" onClick={() => window.location.reload()}>
            Refresh Hub
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-7xl space-y-12 p-4 sm:p-6 lg:px-8 lg:pb-12">
        {/* 1. Page Header */}
        <MobilePageIntro
          title="Resolution Center"
          subtitle="Something broken or need an upgrade? We'll handle the deciding, finding, and booking."
          action={
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-700 hidden sm:block">
              <Wrench className="h-6 w-6" />
            </div>
          }
        />

        {/* 2. Status Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MobileKpiTile 
            label="Active Jobs" 
            value={activeBookings.length} 
            hint="Bookings in progress" 
            tone={activeBookings.length > 0 ? 'positive' : 'neutral'} 
          />
          <MobileKpiTile 
            label="Priority actions" 
            value={priorityActionCount} 
            hint="Top moves from Today" 
            tone="warning"
          />
          <MobileKpiTile 
            label="Live incidents" 
            value={activeIncidentsCount} 
            hint={activeIncidentsCount > 0 ? 'Signal-driven issues' : 'No active incident'} 
            tone={activeIncidentsCount > 0 ? 'warning' : 'neutral'}
          />
        </div>

        <MobileSection className={focusSection === 'priority-actions' ? 'scroll-mt-24' : undefined}>
          <MobileSectionHeader
            title="Priority Actions"
            subtitle="These are the exact ranked items behind the dashboard count."
            className="mb-6"
          />
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : priorityActions.length > 0 ? (
              priorityActions.slice(0, 3).map((action) => {
                const trust = priorityActionTone(action);
                return (
                  <WinCard
                    key={action.id}
                    title={action.title}
                    value={action.type.replace(/_/g, ' ')}
                    description={action.description}
                    actionLabel="Open action details"
                    onAction={() => router.push(resolveUrgentActionHref(action, propertyId || selectedPropertyId || undefined))}
                    isUrgent={action.type === 'INCIDENT' || action.type === 'RENEWAL_EXPIRED'}
                    trust={{
                      confidenceLabel: trust.confidenceLabel,
                      freshnessLabel: action.dueDate ? `Due ${action.dueDate.toLocaleDateString()}` : 'Ranked today',
                      sourceLabel: trust.sourceLabel,
                      rationale: trust.rationale,
                    }}
                    className={focusSection === 'priority-actions' ? 'border-brand-200 ring-2 ring-brand-100' : undefined}
                  />
                );
              })
            ) : (
              <MobileCard className="bg-slate-50 border-dashed border-slate-200 text-center py-12 px-6">
                <div className="mx-auto w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <h4 className="text-lg font-bold text-slate-900">No Priority Actions Right Now</h4>
                <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2 leading-relaxed">
                  Your dashboard count is at zero because we didn&apos;t find incidents, overdue maintenance, or urgent renewals for this property.
                </p>
              </MobileCard>
            )}
          </div>
        </MobileSection>

        {/* 3. Concierge Entry Points: "How can we help?" */}
        <MobileSection className="pt-4">
          <MobileSectionHeader title="How can we help?" className="mb-6" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Button 
              variant="outline" 
              className="h-auto min-h-[184px] whitespace-normal p-0 text-left border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 rounded-2xl group transition-all"
              asChild
            >
              <Link
                href={propertyId ? `/dashboard/properties/${propertyId}/inventory?intent=replace-repair` : '/dashboard/replace-repair'}
                className="flex h-full w-full min-w-0 flex-col items-start p-6 text-left"
              >
                <Zap className="mb-4 h-8 w-8 shrink-0 text-brand-600 transition-transform group-hover:scale-110" />
                <span className="block w-full text-lg font-bold leading-tight text-slate-900">Something&apos;s Broken</span>
                <span className="mt-2 block w-full whitespace-normal text-sm leading-6 text-slate-500">
                  AI-driven troubleshooting and repair vs. replace guidance.
                </span>
              </Link>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto min-h-[184px] whitespace-normal p-0 text-left border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-2xl group transition-all"
              asChild
            >
              <Link
                href={propertyId ? `/dashboard/providers?propertyId=${propertyId}` : '/dashboard/providers'}
                className="flex h-full w-full min-w-0 flex-col items-start p-6 text-left"
              >
                <Search className="mb-4 h-8 w-8 shrink-0 text-blue-600 transition-transform group-hover:scale-110" />
                <span className="block w-full text-lg font-bold leading-tight text-slate-900">Find a Specialist</span>
                <span className="mt-2 block w-full whitespace-normal text-sm leading-6 text-slate-500">
                  Search our directory of verified local service providers.
                </span>
              </Link>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto min-h-[184px] whitespace-normal p-0 text-left border-red-100 hover:border-red-300 hover:bg-red-50/50 rounded-2xl group transition-all"
              asChild
            >
              <Link
                href={propertyId ? `/dashboard/emergency?propertyId=${propertyId}` : '/dashboard/emergency'}
                className="flex h-full w-full min-w-0 flex-col items-start p-6 text-left"
              >
                <AlertCircle className="mb-4 h-8 w-8 shrink-0 text-red-600 transition-transform group-hover:rotate-12" />
                <span className="block w-full text-lg font-bold leading-tight text-slate-900">Emergency Help</span>
                <span className="mt-2 block w-full whitespace-normal text-sm leading-6 text-slate-500">
                  Instant 24/7 emergency services and shutdown guides.
                </span>
              </Link>
            </Button>

            <Button
              variant="outline"
              className="h-auto min-h-[184px] whitespace-normal p-0 text-left border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/50 rounded-2xl group transition-all"
              asChild
            >
              <Link
                href={
                  propertyId
                    ? `/dashboard/properties/${propertyId}/tools/quote-comparison?from=fix-hub`
                    : '/dashboard/quote-comparison'
                }
                className="flex h-full w-full min-w-0 flex-col items-start p-6 text-left"
              >
                <Scale className="mb-4 h-8 w-8 shrink-0 text-emerald-600 transition-transform group-hover:scale-110" />
                <span className="block w-full text-lg font-bold leading-tight text-slate-900">Compare Quotes</span>
                <span className="mt-2 block w-full whitespace-normal text-sm leading-6 text-slate-500">
                  Review pricing side-by-side before you book.
                </span>
              </Link>
            </Button>
          </div>
        </MobileSection>

        {loadError && (
          <MobileCard className="border border-red-200 bg-red-50/70 p-4">
            <p className="text-sm font-semibold text-red-700">Some Fix data is unavailable.</p>
            <p className="mt-1 text-sm text-red-700/90">{loadError}</p>
            <Button
              variant="outline"
              className="mt-3 border-red-200 bg-white text-red-700 hover:bg-red-50"
              onClick={() => void fetchData()}
            >
              Retry loading
            </Button>
          </MobileCard>
        )}

        {/* 4. Active Resolutions Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-4">
          
          {/* Left Column: Decisions & Intelligence */}
          <MobileSection>
            <MobileSectionHeader 
              title="Intelligence & Decisions" 
              subtitle="Calculated recommendations for your active issues."
            />
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : resolutions.length > 0 ? (
                resolutions.map((analysis) => (
                  <WinCard 
                    key={analysis.id}
                    title="Repair vs Replace"
                    value={analysis.inventoryItem?.name || 'Inventory Item'}
                    description={analysis.summary || 'Our AI has a recommendation for this item.'}
                    actionLabel="See Full Estimate"
                    onAction={() => {
                      router.push(`/dashboard/properties/${propertyId}/inventory/items/${analysis.inventoryItemId}/replace-repair`);
                    }}
                    trust={{
                      confidenceLabel: `${analysis.confidence} Confidence`,
                      freshnessLabel: `Calculated ${formatDistanceToNowStrict(new Date(analysis.computedAt))} ago`,
                      sourceLabel: "Lifespan Engine",
                      rationale: `Verdict: ${analysis.verdict.replace('_', ' ')}`
                    }}
                  />
                ))
              ) : (
                <MobileCard className="bg-slate-50 border-dashed border-slate-200 text-center py-12 px-6">
                  <div className="mx-auto w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">Your Home is Healthy</h4>
                  <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2 leading-relaxed">
                    No active issues detected. Use the troubleshooter if something feels off, or run a seasonal scan.
                  </p>
                  <div className="pt-6">
                    <Button variant="outline" className="rounded-xl border-slate-200 h-11 px-6" asChild>
                      <Link href={propertyId ? `/dashboard/properties/${propertyId}/inventory?intent=replace-repair` : '/dashboard/replace-repair'}>
                        <Zap className="mr-2 h-4 w-4 text-brand-600" />
                        Start Troubleshooter
                      </Link>
                    </Button>
                  </div>
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
                  <MobileCard key={booking.id} className="border-l-4 border-l-brand-500 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-slate-900">{booking.service?.name || 'Service Job'}</h4>
                        <p className="text-xs text-slate-500">{booking.provider?.businessName}</p>
                      </div>
                      <div className="bg-brand-50 text-brand-700 text-[10px] font-bold px-2 py-0.5 rounded-full tracking-normal">
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
                    <Button variant="ghost" size="sm" className="w-full justify-between h-9 text-brand-700 hover:bg-brand-50/50 rounded-lg" asChild>
                      <Link href={`/dashboard/bookings/${booking.id}`}>
                        View Resolution Details
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </MobileCard>
                ))
              ) : (
                <MobileCard className="bg-slate-50 border-dashed border-slate-200 text-center py-12 px-6">
                  <div className="mx-auto w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                    <Search className="h-8 w-8 text-slate-300" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">No Active Jobs</h4>
                  <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2 leading-relaxed">
                    Need a specialist for a project? Browse our directory of verified pros to get started.
                  </p>
                  <div className="pt-6">
                    <Button className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold h-11 px-6" asChild>
                      <Link href={propertyId ? `/dashboard/providers?propertyId=${propertyId}` : '/dashboard/providers'}>
                        Find a Service Provider
                      </Link>
                    </Button>
                  </div>
                </MobileCard>
                )}

                <Button variant="outline" className="w-full border-slate-200 text-slate-600 h-11" asChild>
                <Link href={propertyId ? `/dashboard/bookings?propertyId=${propertyId}` : '/dashboard/bookings'}>
                  <CalendarClock className="h-4 w-4 mr-2" />
                  View All Booking History
                </Link>
                </Button>

            </div>
          </MobileSection>

        </div>

        <BottomSafeAreaReserve size="chatAware" />
      </div>
    </ErrorBoundary>
  );
}
