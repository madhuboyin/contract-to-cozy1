// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx

'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import NarrativeRevealOverlay from '@/components/narrative/NarrativeRevealOverlay';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { track } from '@/lib/analytics/events';
import { api } from '@/lib/api/client';
import type {
  PropertyDashboardBootstrap,
} from '@/types';
import PropertyRecordOverview, {
  calculatePropertyRecordCompleteness,
  calculatePropertyRecordOverviewCompleteness,
} from './components/PropertyRecordOverview';
import PropertyRecordTemplate from './components/PropertyRecordTemplate';

function formatEnum(value: string | null | undefined, fallback = 'Home'): string {
  if (!value) return fallback;
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function propertyDisplayName(name: string | null, address: string): string {
  const normalized = name?.trim().toLowerCase();
  if (!normalized || ['main', 'primary', 'rental', 'home', 'my home', 'primary home'].includes(normalized)) {
    return address || 'Property';
  }
  return name!.trim();
}

function resolvePrimaryRecordAction(
  bootstrap: PropertyDashboardBootstrap,
): { label: string; href: string } {
  const { property, recordOverview } = bootstrap;
  const editHref = `/dashboard/properties/${property.id}/edit`;
  if (property.bedrooms == null || property.bathrooms == null) {
    return { label: 'Add layout', href: `${editHref}#field-bedrooms` };
  }
  if (!property.yearBuilt) return { label: 'Add year built', href: editHref };
  if (!property.propertySize) return { label: 'Add living area', href: editHref };
  if ((recordOverview.sections.inventory.data?.totalCount ?? 0) === 0) {
    return { label: 'Add first system', href: `/dashboard/properties/${property.id}/inventory` };
  }
  if ((recordOverview.sections.rooms.data?.count ?? 0) === 0) {
    return { label: 'Add first room', href: `/dashboard/properties/${property.id}/rooms` };
  }
  if ((recordOverview.sections.documents.data?.totalCount ?? 0) === 0) {
    return { label: 'Upload first document', href: `/dashboard/documents?propertyId=${encodeURIComponent(property.id)}` };
  }
  // The header CTA is deliberately curated. Property Context also contains
  // operational and derived facts (for example timezone and geocoding) that
  // should never surface as an unexplained primary action merely because they
  // are the first unknown fact in an object.
  return { label: 'Add to record', href: editHref };
}

function appendQueryParam(href: string, key: string, value: string): string {
  const [pathAndQuery, hash] = href.split('#', 2);
  const separator = pathAndQuery.includes('?') ? '&' : '?';
  return `${pathAndQuery}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash ? `#${hash}` : ''}`;
}

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const trackedViewKey = useRef<string | null>(null);
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;

  const bootstrapQuery = useQuery({
    queryKey: ['property-bootstrap', propertyId],
    queryFn: async () => {
      const response = await api.getPropertyDashboardBootstrap(propertyId);
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to load the property record.');
      }
      return response.data as PropertyDashboardBootstrap;
    },
    enabled: Boolean(propertyId),
    staleTime: 60 * 1000,
    refetchOnMount: 'always',
  });

  const property = bootstrapQuery.data?.property ?? null;
  const onboarding = bootstrapQuery.data?.onboarding ?? null;
  const narrativeRun = bootstrapQuery.data?.narrativeRun ?? null;
  const recordOverview = bootstrapQuery.data?.recordOverview ?? null;

  const recordCompleteness = useMemo(
    () => property && recordOverview
      ? calculatePropertyRecordOverviewCompleteness(property, recordOverview)
      : property ? calculatePropertyRecordCompleteness(property, onboarding) : 0,
    [onboarding, property, recordOverview],
  );

  useEffect(() => {
    if (!property) return;
    const contextVersion = recordOverview?.context.completeness?.contextVersion ?? null;
    const viewKey = `${property.id}:${contextVersion ?? 'fallback'}`;
    if (trackedViewKey.current === viewKey) return;
    trackedViewKey.current = viewKey;
    track('property_record_viewed', {
      propertyId: property.id,
      completenessPercent: recordCompleteness,
      contextVersion,
      completenessSource: contextVersion ? 'PROPERTY_CONTEXT' : 'PROFILE_FALLBACK',
      completenessBand: recordCompleteness >= 85 ? 'HIGH' : recordCompleteness >= 50 ? 'MEDIUM' : 'LOW',
      viewport: window.innerWidth < 768 ? 'MOBILE' : window.innerWidth < 1200 ? 'TABLET' : 'DESKTOP',
      registryVersion: recordOverview?.registryVersion ?? null,
    });
  }, [property, recordCompleteness, recordOverview?.context.completeness?.contextVersion, recordOverview?.registryVersion]);

  if (bootstrapQuery.isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading property record" role="status" className="w-full space-y-4">
        <span className="sr-only">Loading property record</span>
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 motion-reduce:animate-none" />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!property || bootstrapQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 mb-0 text-xl font-semibold text-slate-950">Property record unavailable</h1>
          <p className="mt-2 mb-0 text-sm text-slate-600">
            {bootstrapQuery.error instanceof Error
              ? bootstrapQuery.error.message
              : 'The requested property could not be loaded.'}
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline" asChild>
              <Link href="/dashboard/properties">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                All properties
              </Link>
            </Button>
            <Button type="button" onClick={() => void bootstrapQuery.refetch()}>
              Try again
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const propertyPath = `/dashboard/properties/${property.id}`;
  const fullAddress = [
    property.address,
    [property.city, property.state].filter(Boolean).join(', '),
    property.zipCode,
  ]
    .filter(Boolean)
    .join(' · ');
  const title = propertyDisplayName(property.name, property.address);
  const contextAddress = title === property.address
    ? [[property.city, property.state].filter(Boolean).join(', '), property.zipCode].filter(Boolean).join(' · ')
    : fullAddress;
  const metadata = [
    property.isPrimary ? 'Primary home' : formatEnum(property.dwellingType),
    property.yearBuilt ? `Built ${property.yearBuilt}` : 'Year not recorded',
    property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : 'Size not recorded',
    formatEnum(property.occupancyStatus, 'Occupancy not recorded'),
  ];
  const backTo = encodeURIComponent(propertyPath);
  const navigation = [
    { label: 'Overview', href: propertyPath, active: true },
    { label: 'Details', href: `/dashboard/properties/${property.id}/edit` },
    { label: 'Systems & Inventory', href: `/dashboard/properties/${property.id}/inventory?backTo=${backTo}` },
    { label: 'Rooms & Household', href: `/dashboard/properties/${property.id}/rooms?backTo=${backTo}` },
    { label: 'Documents', href: `/dashboard/documents?propertyId=${encodeURIComponent(property.id)}&backTo=${backTo}` },
    { label: 'History', href: `/dashboard/properties/${property.id}/timeline?backTo=${backTo}` },
  ];
  const primaryRecordAction = resolvePrimaryRecordAction(bootstrapQuery.data!);

  return (
    <div className="w-full">
      {FEATURE_FLAGS.PROPERTY_NARRATIVE_ENGINE && narrativeRun?.status === 'ACTIVE' ? (
        <NarrativeRevealOverlay
          run={narrativeRun}
          propertyId={property.id}
          onComplete={() => {
            void queryClient.invalidateQueries({ queryKey: ['property-bootstrap', property.id] });
          }}
          onDismiss={() => {
            void queryClient.invalidateQueries({ queryKey: ['property-bootstrap', property.id] });
          }}
          onNudgeClick={(fieldKey) => {
            router.push(`/dashboard/properties/${property.id}/edit?focus=${encodeURIComponent(fieldKey)}`);
          }}
        />
      ) : null}

      <PropertyRecordTemplate
        propertyId={property.id}
        title={title}
        address={contextAddress || property.address}
        metadata={metadata}
        completeness={recordCompleteness}
        lastUpdated={formatUpdatedAt(property.updatedAt)}
        editHref={`/dashboard/properties/${property.id}/edit`}
        addHref={appendQueryParam(primaryRecordAction.href, 'recordAction', 'add')}
        addLabel={primaryRecordAction.label}
        navigation={navigation}
      >
        {FEATURE_FLAGS.PROPERTY_RECORD_EXPERIENCE && recordOverview ? (
          <PropertyRecordOverview
            property={property}
            overview={recordOverview}
            enableConnectedTools={FEATURE_FLAGS.PROPERTY_RECORD_CONNECTED_TOOLS}
          />
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-0 text-lg font-semibold text-slate-950">Property details</h2>
            <p className="mt-2 mb-0 text-sm text-slate-600">
              The enhanced Property Record is temporarily unavailable. Your saved details remain accessible.
            </p>
            <Button asChild className="mt-4"><Link href={`/dashboard/properties/${property.id}/edit`}>View and edit details</Link></Button>
          </section>
        )}
      </PropertyRecordTemplate>
    </div>
  );
}
