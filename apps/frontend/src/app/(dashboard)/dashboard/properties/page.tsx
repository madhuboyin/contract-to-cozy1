// apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Building2, ChevronRight, Home, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import {
  BottomSafeAreaReserve,
  MobileCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Button } from '@/components/ui/button';
import { MOBILE_HOME_TOOL_LINKS } from '@/components/mobile/dashboard/mobileToolCatalog';
import { cn } from '@/lib/utils';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import PortfolioListTemplate from './components/PortfolioListTemplate';
import ConfirmDestructiveActionDialog from '@/components/system/ConfirmDestructiveActionDialog';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  SINGLE_FAMILY: 'Single Family',
  TOWNHOME: 'Townhome',
  CONDO: 'Condo',
  APARTMENT: 'Apartment',
  MULTI_UNIT: 'Multi-Unit',
  INVESTMENT_PROPERTY: 'Investment Property',
};

const MAX_PROPERTIES = 10;
const HOME_TOOL_NAV_LABELS = Object.fromEntries(
  MOBILE_HOME_TOOL_LINKS.map((tool) => [tool.navTarget, `Home Tools > ${tool.name}`])
);

function openCozyChat() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('cozy-chat-open'));
}

function formatPropertyMetadata(property: Property): string {
  const pieces = [
    property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : null,
    property.bedrooms != null ? `${property.bedrooms} bd` : null,
    property.bathrooms != null ? `${property.bathrooms} ba` : null,
    property.yearBuilt != null ? `Built ${property.yearBuilt}` : null,
  ].filter(Boolean);

  return pieces.join(' • ');
}

function getPropertyAddressLines(property: Property): { lineOne: string; lineTwo: string } {
  const lineOne = property.address;
  const lineTwo = [property.city, property.state].filter(Boolean).join(', ');
  return { lineOne, lineTwo };
}

export default function PropertiesPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { setSelectedPropertyId } = usePropertyContext();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navTarget = searchParams.get('navTarget');

  const navTargetLabelMap: Record<string, string> = {
    rooms: 'Rooms',
    incidents: 'Incidents',
    claims: 'Claims',
    recalls: 'Recalls',
    'seller-prep': 'Home Tools > Seller Prep',
    'home-timeline': 'Home Tools > Home Timeline',
    'status-board': 'Home Tools > Status Board',
    'home-score': 'Reports > Home Score Report',
    reports: 'Home Admin > Reports',
    ...HOME_TOOL_NAV_LABELS,
  };

  const navTargetLabel = navTarget ? navTargetLabelMap[navTarget] || 'selected section' : null;

  const resolvePropertyHref = (propertyId: string): string => {
    if (!navTarget) return `/dashboard/properties/${propertyId}`;
    if (navTarget === 'rooms') return `/dashboard/properties/${propertyId}/rooms`;
    if (navTarget === 'incidents') return `/dashboard/properties/${propertyId}/incidents`;
    if (navTarget === 'claims') return `/dashboard/properties/${propertyId}/claims`;
    if (navTarget === 'recalls') return `/dashboard/properties/${propertyId}/recalls`;
    if (navTarget === 'seller-prep') return `/dashboard/properties/${propertyId}/seller-prep`;
    if (navTarget === 'home-timeline') return `/dashboard/properties/${propertyId}/timeline`;
    if (navTarget === 'status-board') return `/dashboard/properties/${propertyId}/status-board`;
    if (navTarget === 'home-score') return `/dashboard/properties/${propertyId}/home-score`;
    if (navTarget === 'reports') return `/dashboard/properties/${propertyId}/reports`;
    if (navTarget.startsWith('tool:')) {
      const matchedTool = MOBILE_HOME_TOOL_LINKS.find((tool) => tool.navTarget === navTarget);
      if (matchedTool) {
        return `/dashboard/properties/${propertyId}/${matchedTool.hrefSuffix}`;
      }
      const toolSlug = navTarget.replace('tool:', '');
      return `/dashboard/properties/${propertyId}/tools/${toolSlug}`;
    }
    return `/dashboard/properties/${propertyId}`;
  };

  const handlePropertySelect = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    setLoading(true);
    try {
      const response = await api.getProperties();
      if (response.success) {
        setProperties(response.data.properties);
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestDelete = (id: string, name: string) => {
    setMenuOpenId(null);
    setDeleteTarget({ id, name: name || 'this property' });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleting(id);
    try {
      const response = await api.deleteProperty(id);
      if (response.success) {
        setProperties((current) => current.filter((property) => property.id !== id));
        toast({ title: 'Property deleted successfully' });
        setDeleteTarget(null);
      } else {
        toast({ title: response.message || 'Failed to delete property', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to delete property. It may have active bookings.', variant: 'destructive' });
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map(i => (
              <div key={i} className="h-52 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const canAddMore = properties.length < MAX_PROPERTIES;
  const primaryHomesCount = properties.filter((property) => property.isPrimary).length;
  const slotsAvailable = Math.max(MAX_PROPERTIES - properties.length, 0);
  const askCozyDockVisible = !menuOpenId && !deleteTarget;
  const handoffCtaLabel = navTargetLabel ? `Continue to ${navTargetLabel}` : 'Open property hub';

  return (
    <div className="space-y-5 px-4 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <PortfolioListTemplate
        title="Properties"
        subtitle={`${properties.length} of ${MAX_PROPERTIES} properties added`}
        contextLabel={navTargetLabel}
        metrics={[
          { label: 'Properties', value: `${properties.length} / ${MAX_PROPERTIES}` },
          { label: 'Primary', value: `${primaryHomesCount}` },
          { label: 'Available', value: `${slotsAvailable}` },
        ]}
        action={
          canAddMore ? (
            <Link
              href="/dashboard/properties/new"
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#0D9488] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0F766E]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Property
            </Link>
          ) : null
        }
      >

      <div className="md:hidden">
        {properties.length === 0 ? (
          <MobileCard className="border-dashed border-slate-300/90 bg-white py-10 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
              <Building2 className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-900">No properties yet</h3>
            <p className="mt-1 text-sm text-slate-600">Add your first property to track systems, warranties, and maintenance.</p>
            <div className="mt-5">
              <Link
                href="/dashboard/properties/new"
                className="inline-flex min-h-[44px] items-center rounded-xl bg-[#0D9488] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0F766E]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Property
              </Link>
            </div>
          </MobileCard>
        ) : (
          <div className="space-y-3">
            <div className="space-y-3">
              {properties.map((property) => {
                const isMenuOpen = menuOpenId === property.id;
                const isDeleting = deleting === property.id;
                const typeLabel = property.propertyType ? PROPERTY_TYPE_LABELS[property.propertyType] : null;
                const metadata = formatPropertyMetadata(property);
                const { lineOne, lineTwo } = getPropertyAddressLines(property);
                const coverPhotoUrl = property.coverPhoto?.fileUrl || null;

                return (
                  <article key={property.id} className="relative">
                    <Link
                      href={resolvePropertyHref(property.id)}
                      onClick={() => handlePropertySelect(property.id)}
                      className="group no-brand-style block rounded-[22px] border border-slate-200/90 bg-white p-3.5 pr-14 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.45)]"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border text-slate-600',
                            property.isPrimary
                              ? 'border-emerald-200 bg-emerald-50'
                              : 'border-slate-200 bg-slate-50'
                          )}
                        >
                          {coverPhotoUrl ? (
                            <img
                              src={coverPhotoUrl}
                              alt={property.name || lineOne}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Home className="h-7 w-7" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2 pr-2">
                            <p className="line-clamp-1 text-[1.1rem] font-semibold leading-tight text-slate-900">
                              {property.name || lineOne}
                            </p>
                            {property.isPrimary ? (
                              <StatusChip tone="good" className="shrink-0">Primary</StatusChip>
                            ) : typeLabel ? (
                              <StatusChip tone="info" className="shrink-0">{typeLabel}</StatusChip>
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-1 text-sm text-slate-700">{lineOne}</p>
                          <p className="line-clamp-1 text-sm text-slate-500">{lineTwo} {property.zipCode}</p>
                          {metadata ? (
                            <p className="mt-1.5 line-clamp-1 text-[0.95rem] font-medium text-slate-600">
                              {metadata}
                            </p>
                          ) : null}
                          <p className="mt-1.5 text-xs font-semibold text-[#0D9488]">
                            {handoffCtaLabel}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="pointer-events-none absolute bottom-4 right-4 h-5 w-5 text-slate-400 transition-colors group-hover:text-slate-600" />
                    </Link>

                    <div className="absolute right-3 top-3" ref={isMenuOpen ? menuRef : undefined}>
                      <button
                        aria-label="More options"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(isMenuOpen ? null : property.id);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 top-9 z-20 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                          <Link
                            href={`/dashboard/properties/${property.id}/edit`}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                            onClick={() => setMenuOpenId(null)}
                          >
                            <Pencil className="h-4 w-4 text-slate-400" />
                            Edit
                          </Link>
                          <button
                            onClick={() => requestDelete(property.id, property.name || property.address)}
                            disabled={isDeleting}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            {isDeleting ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {canAddMore ? (
              <Link href="/dashboard/properties/new" className="group no-brand-style block">
                <div className="flex items-center gap-3 rounded-[22px] border border-slate-200/90 bg-white p-3.5 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.45)]">
                  <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 text-teal-700">
                    <Plus className="h-8 w-8" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[1.1rem] font-semibold leading-tight text-slate-900">Add Property</p>
                    <p className="mt-1 text-sm text-slate-600">Track systems, warranties, and maintenance.</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 transition-colors group-hover:text-slate-600" />
                </div>
              </Link>
            ) : null}
          </div>
        )}
      </div>

      <div className="hidden md:block">
        {properties.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <h3 className="mt-3 text-sm font-medium text-gray-900">No properties yet</h3>
            <p className="mt-1 text-sm text-gray-500">Add your first property to get started.</p>
            <div className="mt-6">
              <Link
                href="/dashboard/properties/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Property
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => {
              const isMenuOpen = menuOpenId === property.id;
              const isDeleting = deleting === property.id;
              const typeLabel = property.propertyType ? PROPERTY_TYPE_LABELS[property.propertyType] : null;
              const hasMeta = property.bedrooms || property.bathrooms || property.yearBuilt;
              const coverPhotoUrl = property.coverPhoto?.fileUrl || null;

              return (
                <div
                  key={property.id}
                  className={`relative bg-white rounded-xl border transition-all duration-150 group
                    ${property.isPrimary
                      ? 'border-blue-200 border-l-4 border-l-blue-500 shadow-sm hover:shadow-md'
                      : 'border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md'
                    }`}
                >
                  {/* Clickable main area */}
                  <Link
                    href={resolvePropertyHref(property.id)}
                    onClick={() => handlePropertySelect(property.id)}
                    className="block p-6 pb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset rounded-t-xl"
                  >
                    {coverPhotoUrl ? (
                      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200">
                        <img
                          src={coverPhotoUrl}
                          alt={property.name || property.address}
                          className="h-36 w-full object-cover"
                        />
                      </div>
                    ) : null}
                    {/* Top row: badge + property type */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {property.isPrimary && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-700">
                            Primary
                          </span>
                        )}
                        {typeLabel && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600">
                            {typeLabel}
                          </span>
                        )}
                      </div>
                      {/* Spacer so overflow button doesn't overlap */}
                      <div className="w-8" />
                    </div>

                    {/* Property name */}
                    <h3 className="text-base font-semibold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">
                      {property.name || property.address}
                    </h3>

                    {/* Address */}
                    <div className="flex items-start gap-1.5 text-sm text-gray-500">
                      <svg className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd"
                          d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                          clipRule="evenodd" />
                      </svg>
                      <span>
                        {property.name ? property.address + ', ' : ''}{property.city}, {property.state} {property.zipCode}
                      </span>
                    </div>

                    {/* Meta row: beds · baths · year built */}
                    {hasMeta && (
                      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                        {property.bedrooms != null && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M3 12h18M3 6h18M3 18h18" />
                            </svg>
                            {property.bedrooms} bed
                          </span>
                        )}
                        {property.bathrooms != null && (
                          <span>{property.bathrooms} bath</span>
                        )}
                        {property.yearBuilt != null && (
                          <span>Built {property.yearBuilt}</span>
                        )}
                      </div>
                    )}
                  </Link>

                  {/* Footer: View Details CTA */}
                  <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
                    <Link
                      href={resolvePropertyHref(property.id)}
                      onClick={() => handlePropertySelect(property.id)}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                      tabIndex={-1}
                    >
                      {handoffCtaLabel}
                      <svg className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>

                    {/* ··· overflow menu */}
                    <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                      <button
                        aria-label="More options"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(isMenuOpen ? null : property.id);
                        }}
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 bottom-8 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                          <Link
                            href={`/dashboard/properties/${property.id}/edit`}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            onClick={() => setMenuOpenId(null)}
                          >
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </Link>
                          <button
                            onClick={() => requestDelete(property.id, property.name || property.address)}
                            disabled={isDeleting}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {isDeleting ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Inline Add Property card */}
            {canAddMore && (
              <Link
                href="/dashboard/properties/new"
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center hover:border-blue-400 hover:bg-blue-50 transition-all duration-150 group min-h-[180px]"
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-500 group-hover:text-blue-700 transition-colors">
                  Add a property
                </span>
              </Link>
            )}
          </div>
        )}
      </div>
      </PortfolioListTemplate>

      <ConfirmDestructiveActionDialog
        open={Boolean(deleteTarget)}
        title="Delete property?"
        description={
          <>
            This removes <span className="font-semibold text-slate-900">{deleteTarget?.name || 'this property'}</span>{' '}
            from your portfolio. This action cannot be undone.
          </>
        }
        confirmLabel="Delete property"
        confirming={Boolean(deleting)}
        confirmDisabled={!deleteTarget}
        onConfirm={() => void handleDeleteConfirm()}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />

      {askCozyDockVisible && (
        <div
          data-chat-collision-zone="true"
          className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 md:hidden"
        >
          <button
            type="button"
            onClick={openCozyChat}
            className="flex w-full items-center justify-between rounded-2xl border border-white/15 bg-[radial-gradient(circle_at_20%_0%,rgba(20,184,166,0.22),transparent_45%),linear-gradient(120deg,#0f172a,#111827)] px-4 py-3 text-left text-white shadow-[0_22px_48px_-30px_rgba(15,23,42,0.95)]"
            aria-label="Ask Cozy about your properties"
          >
            <span className="inline-flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-base font-medium">Ask Cozy about your homes</span>
            </span>
            <ChevronRight className="h-5 w-5 text-white/80" />
          </button>
        </div>
      )}

      <div className="md:hidden">
        <BottomSafeAreaReserve size="floatingAction" />
      </div>
    </div>
  );
}
