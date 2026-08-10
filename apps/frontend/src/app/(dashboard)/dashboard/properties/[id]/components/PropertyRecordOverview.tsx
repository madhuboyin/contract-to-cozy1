'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderKanban,
  History,
  Home,
  Leaf,
  ListChecks,
  PackageSearch,
  PiggyBank,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';

import { api } from '@/lib/api/client';
import type { Property, PropertyOnboardingNarrativeState } from '@/types';
import { cn } from '@/lib/utils';
import { listInventoryItems, listInventoryRooms } from '../../../inventory/inventoryApi';
import { getLatestTimeline } from '../tools/capital-timeline/capitalTimelineApi';
import { getDigitalWill } from '../tools/home-digital-will/homeDigitalWillApi';
import { listEligiblePlantAdvisorRooms } from '../tools/plant-advisor/plantAdvisorApi';

type RecordCategoryTone = 'complete' | 'progress' | 'missing';

interface RecordCategory {
  label: string;
  detail: string;
  percent: number;
  href: string;
  tone: RecordCategoryTone;
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function percent(values: unknown[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.filter(present).length / values.length) * 100);
}

function formatEnum(value: string | null | undefined, fallback = 'Not recorded'): string {
  if (!value) return fallback;
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function categoryTone(value: number): RecordCategoryTone {
  if (value >= 85) return 'complete';
  if (value >= 40) return 'progress';
  return 'missing';
}

export function calculatePropertyRecordCompleteness(
  property: Property,
  onboarding?: PropertyOnboardingNarrativeState | null,
): number {
  const coreFacts = [
    property.address,
    property.city,
    property.state,
    property.zipCode,
    property.dwellingType,
    property.ownershipForm,
    property.propertyUse,
    property.occupancyStatus,
    property.propertySize,
    property.yearBuilt,
    property.bedrooms,
    property.bathrooms,
    property.heatingType,
    property.coolingType,
    property.waterHeaterType,
    property.roofType,
    property.foundationType,
    property.occupantsCount,
  ];
  const factScore = percent(coreFacts);
  if (!onboarding?.steps?.length) return factScore;
  const onboardingScore = Math.round(
    (onboarding.steps.filter((step) => step.complete).length / onboarding.steps.length) * 100,
  );
  return Math.round(factScore * 0.7 + onboardingScore * 0.3);
}

function RecordPanel({
  title,
  description,
  href,
  actionLabel,
  icon,
  children,
  className,
}: {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="mb-0 text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">{description}</p>
          </div>
        </div>
        <Link
          href={href}
          className="no-brand-style inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FactRow({ label, value, missing = false }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="flex min-h-[38px] items-center justify-between gap-4 border-t border-slate-100 py-2 first:border-t-0 first:pt-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={cn('mb-0 text-right text-sm font-semibold', missing ? 'text-amber-700' : 'text-slate-900')}>
        {value}
      </dd>
    </div>
  );
}

function RecordCompleteness({ categories }: { categories: RecordCategory[] }) {
  const nextCategory = [...categories].sort((a, b) => a.percent - b.percent)[0];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Record quality</p>
        <h2 className="mb-0 text-base font-semibold text-slate-950">Completeness by category</h2>
        <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">
          Add missing facts where they belong. Each improvement makes connected tools more useful.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {categories.map((category) => (
          <Link
            key={category.label}
            href={category.href}
            className="no-brand-style group block rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/30"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-0 truncate text-sm font-semibold text-slate-900">{category.label}</p>
                <p className="mt-0.5 mb-0 truncate text-xs text-slate-500">{category.detail}</p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-xs font-semibold',
                  category.tone === 'complete'
                    ? 'text-emerald-700'
                    : category.tone === 'progress'
                      ? 'text-amber-700'
                      : 'text-slate-500',
                )}
              >
                {category.percent}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" aria-hidden="true">
              <div
                className={cn(
                  'h-full rounded-full',
                  category.tone === 'complete'
                    ? 'bg-emerald-600'
                    : category.tone === 'progress'
                      ? 'bg-amber-500'
                      : 'bg-slate-300',
                )}
                style={{ width: `${category.percent}%` }}
              />
            </div>
          </Link>
        ))}
      </div>

      {nextCategory ? (
        <Link
          href={nextCategory.href}
          className="no-brand-style mt-4 flex min-h-[44px] items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-900"
        >
          <span>Improve {nextCategory.label.toLowerCase()}</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

interface RelatedTool {
  id: string;
  name: string;
  relationship: string;
  state: string;
  href: string;
  action: string;
  icon: React.ReactNode;
  hasSavedState: boolean;
}

function RelatedPropertyTools({ tools, allToolsHref }: { tools: RelatedTool[]; allToolsHref: string }) {
  const visible = tools.slice(0, 4);
  const additional = tools.slice(4);

  const renderTool = (tool: RelatedTool) => (
    <Link
      key={tool.id}
      href={tool.href}
      className="no-brand-style group flex min-h-[132px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          {tool.icon}
        </span>
        <span className={cn('text-[11px] font-semibold', tool.hasSavedState ? 'text-emerald-700' : 'text-slate-500')}>
          {tool.state}
        </span>
      </div>
      <p className="mt-3 mb-0 text-sm font-semibold text-slate-950">{tool.name}</p>
      <p className="mt-1 mb-0 line-clamp-2 text-xs leading-5 text-slate-500">{tool.relationship}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-emerald-700">
        {tool.action}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );

  return (
    <section aria-labelledby="related-property-tools" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700">Connected to this record</p>
          <h2 id="related-property-tools" className="mb-0 text-lg font-semibold text-slate-950">Related property tools</h2>
          <p className="mt-1 mb-0 max-w-2xl text-sm text-slate-500">
            Use this property&apos;s systems, spaces, documents, and history to plan or create durable home artifacts.
          </p>
        </div>
        <Link href={allToolsHref} className="no-brand-style inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-emerald-700">
          View all property tools
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{visible.map(renderTool)}</div>

      {additional.length > 0 ? (
        <details className="group rounded-xl border border-slate-200 bg-white">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-center text-sm font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show {additional.length} more connected tools</span>
            <span className="hidden group-open:inline">Show fewer tools</span>
          </summary>
          <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">{additional.map(renderTool)}</div>
        </details>
      ) : null}
    </section>
  );
}

function RelatedWorkspaces({ propertyId, backTo }: { propertyId: string; backTo: string }) {
  const links = [
    {
      label: 'Maintenance',
      description: 'Scheduled and completed care',
      href: `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}&backTo=${encodeURIComponent(backTo)}`,
      icon: <Wrench className="h-4 w-4" />,
    },
    {
      label: 'Projects',
      description: 'Plans, work, and closeout',
      href: `/dashboard/properties/${propertyId}/projects?backTo=${encodeURIComponent(backTo)}`,
      icon: <FolderKanban className="h-4 w-4" />,
    },
    {
      label: 'Protection',
      description: 'Coverage and property protection',
      href: `/dashboard/protect?propertyId=${encodeURIComponent(propertyId)}&backTo=${encodeURIComponent(backTo)}`,
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      label: 'Claims',
      description: 'Insurance and warranty claims',
      href: `/dashboard/properties/${propertyId}/claims?backTo=${encodeURIComponent(backTo)}`,
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      label: 'Reports',
      description: 'Property report packages',
      href: `/dashboard/properties/${propertyId}/reports?backTo=${encodeURIComponent(backTo)}`,
      icon: <FileText className="h-4 w-4" />,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Continue working</p>
      <h2 className="mb-0 text-base font-semibold text-slate-950">Related workspaces</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {links.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="no-brand-style flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-emerald-200"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
              <span className="block truncate text-[11px] text-slate-500">{item.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function PropertyRecordOverview({
  property,
  onboarding,
}: {
  property: Property;
  onboarding?: PropertyOnboardingNarrativeState | null;
}) {
  const propertyId = property.id;
  const propertyPath = `/dashboard/properties/${propertyId}`;
  const withBackTo = (href: string) => `${href}${href.includes('?') ? '&' : '?'}backTo=${encodeURIComponent(propertyPath)}`;
  const documentsHref = withBackTo(`/dashboard/documents?propertyId=${encodeURIComponent(propertyId)}`);

  const roomsQuery = useQuery({
    queryKey: ['property-record', propertyId, 'rooms'],
    queryFn: () => listInventoryRooms(propertyId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const inventoryQuery = useQuery({
    queryKey: ['property-record', propertyId, 'inventory'],
    queryFn: () => listInventoryItems(propertyId, {}),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const documentsQuery = useQuery({
    queryKey: ['property-record', propertyId, 'documents'],
    queryFn: async () => {
      const response = await api.listDocuments(propertyId);
      return response.success ? response.data.documents : [];
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const householdQuery = useQuery({
    queryKey: ['property-record', propertyId, 'household'],
    queryFn: () => api.listHouseholdMembers(propertyId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const capitalTimelineQuery = useQuery({
    queryKey: ['property-record', propertyId, 'capital-timeline'],
    queryFn: () => getLatestTimeline(propertyId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const continuityQuery = useQuery({
    queryKey: ['property-record', propertyId, 'continuity-plan'],
    queryFn: () => getDigitalWill(propertyId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const plantAdvisorQuery = useQuery({
    queryKey: ['property-record', propertyId, 'plant-advisor-rooms'],
    queryFn: () => listEligiblePlantAdvisorRooms(propertyId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const rooms = roomsQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const household = householdQuery.data ?? [];
  const timeline = capitalTimelineQuery.data?.analysis ?? null;
  const continuityPlan = continuityQuery.data?.will ?? null;
  const plantRooms = plantAdvisorQuery.data ?? [];
  const configuredPlantRooms = plantRooms.filter((room) => room.hasProfile).length;
  const savedPlants = plantRooms.reduce((sum, room) => sum + room.recommendationCounts.saved, 0);
  const plantHasState = configuredPlantRooms > 0 || savedPlants > 0;
  const systemItems = inventory.filter((item) =>
    ['HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'STRUCTURAL', 'SAFETY'].includes(item.category),
  );
  const inventoryWithDocuments = inventory.filter((item) => item.documents && item.documents.length > 0).length;

  const profilePercent = percent([
    property.address,
    property.city,
    property.state,
    property.zipCode,
    property.dwellingType,
    property.ownershipForm,
    property.propertyUse,
    property.occupancyStatus,
    property.propertySize,
    property.yearBuilt,
    property.bedrooms,
    property.bathrooms,
  ]);
  const systemsPercent = percent([
    property.heatingType,
    property.coolingType,
    property.waterHeaterType,
    property.roofType,
    property.hvacInstallYear,
    property.waterHeaterInstallYear,
    property.roofReplacementYear,
    property.foundationType,
    property.sidingType,
  ]);
  const spacesPercent = percent([
    property.bedrooms,
    property.bathrooms,
    property.occupantsCount,
    rooms.length > 0 ? rooms.length : null,
    household.length > 0 ? household.length : null,
  ]);
  const documentsPercent = Math.min(100, documents.length * 20);

  const categories: RecordCategory[] = [
    {
      label: 'Property details',
      detail: profilePercent >= 85 ? 'Core identity is well documented' : 'Add structure and ownership details',
      percent: profilePercent,
      href: `/dashboard/properties/${propertyId}/edit`,
      tone: categoryTone(profilePercent),
    },
    {
      label: 'Systems & inventory',
      detail: systemItems.length > 0 ? `${systemItems.length} major systems tracked` : 'Add major systems and equipment',
      percent: systemsPercent,
      href: withBackTo(`/dashboard/properties/${propertyId}/inventory`),
      tone: categoryTone(systemsPercent),
    },
    {
      label: 'Rooms & household',
      detail: `${rooms.length} rooms · ${household.length} household members`,
      percent: spacesPercent,
      href: withBackTo(`/dashboard/properties/${propertyId}/rooms`),
      tone: categoryTone(spacesPercent),
    },
    {
      label: 'Documents',
      detail: documents.length > 0 ? `${documents.length} records attached` : 'Add inspections, warranties, and receipts',
      percent: documentsPercent,
      href: documentsHref,
      tone: categoryTone(documentsPercent),
    },
  ];

  const tools: RelatedTool[] = (() => {
    const timelineCount = timeline?.items.length ?? 0;
    const continuityHasState = Boolean(continuityPlan);
    return [
      {
        id: 'capital-timeline',
        name: 'Home Capital Timeline',
        relationship: 'Turn system ages and condition into a long-range replacement and capital plan.',
        state: timelineCount > 0 ? `${timelineCount} events modeled` : `${systemItems.length} systems available`,
        href: withBackTo(`/dashboard/properties/${propertyId}/tools/capital-timeline`),
        action: timelineCount > 0 ? 'Review timeline' : 'Build timeline',
        icon: <CalendarClock className="h-4 w-4" />,
        hasSavedState: timelineCount > 0,
      },
      {
        id: 'home-digital-will',
        name: 'Home Continuity Plan',
        relationship: 'Prepare selected home knowledge and instructions for trusted recipients.',
        state: continuityPlan ? `${continuityPlan.completionPercent}% complete` : 'Not started',
        href: withBackTo(`/dashboard/properties/${propertyId}/tools/home-digital-will`),
        action: continuityPlan ? 'Review plan' : 'Set up plan',
        icon: <FileCheck2 className="h-4 w-4" />,
        hasSavedState: continuityHasState,
      },
      {
        id: 'plant-advisor',
        name: 'Plant Advisor',
        relationship: 'Use room light, care preferences, and household context for better plant choices.',
        state: plantHasState ? `${configuredPlantRooms} rooms · ${savedPlants} saved` : `${rooms.length} rooms available`,
        href: withBackTo(`/dashboard/properties/${propertyId}/tools/plant-advisor`),
        action: plantHasState ? 'Open advisor' : 'Set up a room',
        icon: <Leaf className="h-4 w-4" />,
        hasSavedState: plantHasState,
      },
      {
        id: 'property-brief',
        name: 'Property Brief',
        relationship: 'Create a governed, shareable summary from selected property records.',
        state: `${documents.length} documents available`,
        href: withBackTo(`/dashboard/properties/${propertyId}/property-brief`),
        action: 'Create or review brief',
        icon: <FileText className="h-4 w-4" />,
        hasSavedState: documents.length > 0,
      },
      {
        id: 'home-timeline',
        name: 'Home Timeline',
        relationship: 'Review confirmed milestones, completed work, and durable property history.',
        state: 'Property history',
        href: withBackTo(`/dashboard/properties/${propertyId}/timeline`),
        action: 'Open timeline',
        icon: <History className="h-4 w-4" />,
        hasSavedState: false,
      },
      {
        id: 'status-board',
        name: 'Status Board',
        relationship: 'See the current condition and evidence available for tracked home systems.',
        state: `${systemItems.length} systems represented`,
        href: withBackTo(`/dashboard/properties/${propertyId}/status-board`),
        action: 'Open status board',
        icon: <ListChecks className="h-4 w-4" />,
        hasSavedState: systemItems.length > 0,
      },
    ];
  })();

  const latestDocument = [...documents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
        <div className="space-y-4">
          <RecordPanel
            title="Property profile"
            description="The essential identity and structure facts for this home."
            href={`/dashboard/properties/${propertyId}/edit`}
            actionLabel="Edit details"
            icon={<Home className="h-4 w-4" aria-hidden="true" />}
          >
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <FactRow label="Property type" value={formatEnum(property.dwellingType)} />
              <FactRow label="Ownership" value={formatEnum(property.ownershipForm)} />
              <FactRow label="Built" value={property.yearBuilt ? String(property.yearBuilt) : 'Add year'} missing={!property.yearBuilt} />
              <FactRow label="Living area" value={property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : 'Add size'} missing={!property.propertySize} />
              <FactRow label="Layout" value={property.bedrooms != null || property.bathrooms != null ? `${property.bedrooms ?? '—'} bd · ${property.bathrooms ?? '—'} ba` : 'Add layout'} missing={property.bedrooms == null && property.bathrooms == null} />
              <FactRow label="Occupancy" value={formatEnum(property.occupancyStatus)} />
            </dl>
          </RecordPanel>

          <div className="grid items-start gap-4 md:grid-cols-2">
            <RecordPanel
              title="Systems & inventory"
              description="Major systems, appliances, equipment, warranties, and supporting records."
              href={withBackTo(`/dashboard/properties/${propertyId}/inventory`)}
              actionLabel="View inventory"
              icon={<PackageSearch className="h-4 w-4" aria-hidden="true" />}
            >
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{systemItems.length}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">Major systems</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{inventory.length}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">Total items</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{inventoryWithDocuments}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">With records</p></div>
              </div>
            </RecordPanel>

            <RecordPanel
              title="Rooms & household"
              description="Spaces, room context, occupants, and household access."
              href={withBackTo(`/dashboard/properties/${propertyId}/rooms`)}
              actionLabel="View rooms"
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{rooms.length}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">Rooms recorded</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{household.length}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">Household members</p></div>
              </div>
              <Link href={withBackTo(`/dashboard/properties/${propertyId}/household`)} className="no-brand-style mt-3 inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-emerald-700">
                Manage household
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </RecordPanel>
          </div>

          <RecordPanel
            title="Documents"
            description="Inspections, warranties, policies, receipts, and other evidence attached to this property."
            href={documentsHref}
            actionLabel="View documents"
            icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          >
            <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mb-0 text-2xl font-semibold text-slate-950">{documents.length}</p>
                <p className="mt-0.5 mb-0 text-xs text-slate-500">Documents attached to this property</p>
              </div>
              <Link href={documentsHref} className="no-brand-style inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
                Upload document
              </Link>
            </div>
          </RecordPanel>
        </div>

        <div className="space-y-4">
          <RecordCompleteness categories={categories} />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Record history</p>
                <h2 className="mb-0 text-base font-semibold text-slate-950">Recent updates</h2>
              </div>
              <Link href={withBackTo(`/dashboard/properties/${propertyId}/timeline`)} className="no-brand-style text-xs font-semibold text-emerald-700">View history</Link>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex gap-3 rounded-xl bg-slate-50 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <div><p className="mb-0 text-sm font-medium text-slate-900">Property profile updated</p><p className="mt-0.5 mb-0 text-xs text-slate-500">{formatDate(property.updatedAt)}</p></div>
              </div>
              {latestDocument ? (
                <div className="flex gap-3 rounded-xl bg-slate-50 p-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                  <div className="min-w-0"><p className="mb-0 truncate text-sm font-medium text-slate-900">{latestDocument.name}</p><p className="mt-0.5 mb-0 text-xs text-slate-500">Document added {formatDate(latestDocument.createdAt)}</p></div>
                </div>
              ) : (
                <p className="mb-0 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Document and system updates will appear here as the record grows.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <RelatedPropertyTools
        tools={tools}
        allToolsHref={`/dashboard/home-tools?propertyId=${encodeURIComponent(propertyId)}&backTo=${encodeURIComponent(propertyPath)}`}
      />
      <RelatedWorkspaces propertyId={propertyId} backTo={propertyPath} />
    </div>
  );
}
